import { initWebGPU } from './initWebGPU';
import { Renderer } from './render';
import { Simulation } from './sim';
import { OrbitCamera } from './orbitcam';
import { exportCSV } from './export';
import { gatherParams, hookUI, readBasicControls, setHUD, getAutoFrame } from './ui';
import { initNubeEsferica, initDiscoKepler, initPolvoAlto } from './initStates';
import { SimParams, PresetName } from './types';
import { buildQuadtreeXZ, uploadBH } from './bh';

let device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat;
let renderer: Renderer;
let sim: Simulation;
let camera = new OrbitCamera();
let running = true;
let autoFrame = true;
let warp = 1;

let N = 0;
let lastTime = performance.now();
let fpsAcc = 0, fpsCnt = 0, fpsOut = 0;
let baseline: any = null;
let bhCounter = 0;

async function loadPreset(name: PresetName) {
  const res = await fetch(`/presets/${name}.json`);
  const preset = await res.json();
  (document.getElementById('nParticles') as HTMLInputElement).value = preset.nParticles;
  (document.getElementById('gasFrac') as HTMLInputElement).value = preset.gasFrac;
  (document.getElementById('seed') as HTMLInputElement).value = preset.seed;
  // params
  (document.getElementById('G') as HTMLInputElement).value = preset.params.G;
  (document.getElementById('eps') as HTMLInputElement).value = preset.params.eps;
  (document.getElementById('gamma') as HTMLInputElement).value = preset.params.gamma;
  (document.getElementById('kpress') as HTMLInputElement).value = preset.params.kpress;
  (document.getElementById('hKernel') as HTMLInputElement).value = preset.params.hKernel;
  (document.getElementById('theta') as HTMLInputElement).value = preset.params.theta ?? 0.6;
  (document.getElementById('gravMode') as HTMLSelectElement).value = preset.params.gravMode ?? 'auto';
  (document.getElementById('quality') as HTMLSelectElement).value = preset.params.quality ?? 'med';
  (document.getElementById('autoReduceN') as HTMLInputElement).checked = (preset.params.autoReduceN ?? true);
  (document.getElementById('nu') as HTMLInputElement).value = preset.params.nu;
  (document.getElementById('tau') as HTMLInputElement).value = preset.params.tau;
  (document.getElementById('dtMax') as HTMLInputElement).value = preset.params.dtMax;
  (document.getElementById('warp') as HTMLSelectElement).value = preset.params.warp;
  (document.getElementById('toggleGas') as HTMLInputElement).checked = preset.params.enableGas;
  (document.getElementById('toggleDrag') as HTMLInputElement).checked = preset.params.enableDrag;
  (document.getElementById('toggleCollisions') as HTMLInputElement).checked = preset.params.enableCollisions;
  await resetSim();
}

function buildParticles(init: any[]) {
  N = init.length;
  const posType = new Float32Array(N*4);
  const velMass = new Float32Array(N*4);
  const aux = new Float32Array(N*4);
  for (let i=0;i<N;i++) {
    const p = init[i];
    posType[4*i+0] = p.pos[0];
    posType[4*i+1] = p.pos[1];
    posType[4*i+2] = p.pos[2];
    posType[4*i+3] = p.type; // w=type
    velMass[4*i+0] = p.vel[0];
    velMass[4*i+1] = p.vel[1];
    velMass[4*i+2] = p.vel[2];
    velMass[4*i+3] = p.mass; // w=mass
    aux[4*i+0] = 1.0; // density (init)
    aux[4*i+1] = 0.0; // pressure
    aux[4*i+2] = 1.0; // alive
    aux[4*i+3] = 0.03; // radius approx
  }
  return { posType, velMass, aux };
}

async function resetSim() {
  const canvas = document.getElementById('gfx') as HTMLCanvasElement;
  const { seed, nParticles: nBase, gasFrac } = readBasicControls();
  const p: SimParams = gatherParams();
  warp = p.warp;

  // init state by preset choice heuristics
  const presetSel = (document.getElementById('preset') as HTMLSelectElement).value as PresetName;
  let init;
  const q = p.quality;
  const nParticles = q==='high'? nBase : q==='med'? Math.floor(nBase*0.7) : Math.floor(nBase*0.5);
  if (presetSel === 'nube_rotacion') init = initNubeEsferica(nParticles, gasFrac, seed);
  else if (presetSel === 'disco_kepler') init = initDiscoKepler(nParticles, gasFrac, seed);
  else init = initPolvoAlto(nParticles, gasFrac, seed);

  const { posType, velMass, aux } = buildParticles(init);

  if (!device) {
    const initGPU = await initWebGPU(canvas);
    device = initGPU.device; context = initGPU.context; format = initGPU.canvasFormat;
    renderer = new Renderer(device, format);
    camera.attach(canvas);
  }
  const newSim = new Simulation(device);
  await newSim.init(posType, velMass, aux, p);
  sim = newSim;
  await renderer.init(sim.posType, sim.aux, sim.velMass);
  onResize();
  lastTime = performance.now();
  await fitCameraToParticles();
}

function onResize() {
  const canvas = document.getElementById('gfx') as HTMLCanvasElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  renderer.resizeDepth(canvas.width, canvas.height);
}

async function readBufferF32(src: GPUBuffer, floats: number) {
  const size = floats * 4;
  const dst = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(src, 0, dst, 0, size);
  device.queue.submit([encoder.finish()]);
  await dst.mapAsync(GPUMapMode.READ);
  const copy = dst.getMappedRange().slice(0);
  dst.unmap();
  dst.destroy();
  return new Float32Array(copy);
}

async function fitCameraToParticles() {
  if (!sim || !device) return;
  const buf = await readBufferF32(sim.posType, N * 4);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let activeParticles = 0;

  for (let i = 0; i < N; i++) {
    const x = buf[4 * i + 0];
    const y = buf[4 * i + 1];
    const z = buf[4 * i + 2];
    const type = buf[4 * i + 3]; // Tipo de partícula

    // Solo considerar partículas activas
    if (type >= 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      activeParticles++;
    }
  }

  if (activeParticles > 0) {
    const targetPos = [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    ];

    // Interpolación suave de la posición objetivo
    const smoothFactor = 0.1;
    camera.target = camera.target.map((current: number, i: number) => 
      current + (targetPos[i] - current) * smoothFactor
    ) as [number, number, number];

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const radius = Math.max(dx, dy, dz) * 0.5;
    
    // Calcular la distancia objetivo y aplicar interpolación suave
    const targetDistance = Math.max(radius * 2.5, 0.1);
    camera.distance += (targetDistance - camera.distance) * smoothFactor;
  }
}

let lastFitTime = 0;
const FIT_INTERVAL = 100; // Ajustar la cámara cada 100ms


let afCounter = 0;
async function autoFrameCamera() {
  if (!getAutoFrame()) return;
  afCounter++; if (afCounter % 20 !== 0) return;
  const posBytes = await readBuffer(device, sim.posType, N*4*4);
  const auxBytes = await readBuffer(device, sim.aux, N*4*4);
  const pos = new Float32Array(posBytes); const aux = new Float32Array(auxBytes);
  let minx=1e9,miny=1e9,minz=1e9,maxx=-1e9,maxy=-1e9,maxz=-1e9, count=0;
  for (let i=0;i<N;i++){ if (aux[4*i+2]<0.5) continue; const x=pos[4*i],y=pos[4*i+1],z=pos[4*i+2];
    if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; if(z<minz)minz=z; if(z>maxz)maxz=z; count++;}
  if (count<1) return;
  const cx=0.5*(minx+maxx), cy=0.5*(miny+maxy), cz=0.5*(minz+maxz);
  const rx=0.5*(maxx-minx), ry=0.5*(maxy-miny), rz=0.5*(maxz-minz);
  const r = Math.max(0.5, Math.max(rx, Math.max(ry, rz)));
  const desired = Math.max(2.0, r*3.0);
  camera.setTargetDistance([cx,cy,cz] as any, desired);
}
function frame() {

  const now = performance.now();
  const dtReal = Math.min(0.05, (now - lastTime)/1000);
  lastTime = now;

  // Ajustar la cámara periódicamente
  if (now - lastFitTime > FIT_INTERVAL) {
    fitCameraToParticles();
    lastFitTime = now;
  }

  const p = gatherParams();
  warp = p.warp;

  // dt adaptativo básico: limitar por dtMax y CFL ~ h / vmax (muy grosero)
  const dt = Math.min(p.dtMax, 0.5 * p.hKernel / 1.0) * warp;
  sim.updateUniform(p, dt);

  if (running) {
    const encoder = device.createCommandEncoder();
    sim.dispatch(encoder);
    const viewTex = context.getCurrentTexture().createView();
    const canvas = document.getElementById('gfx') as HTMLCanvasElement;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const eye = [
      camera.target[0] + camera.distance * Math.sin(camera.phi) * Math.cos(camera.theta),
      camera.target[1] + camera.distance * Math.cos(camera.phi),
      camera.target[2] + camera.distance * Math.sin(camera.phi) * Math.sin(camera.theta),
    ];
    const view = new Float32Array(lookAt(eye, camera.target as any, [0,1,0]));
    const proj = new Float32Array(perspective(60*Math.PI/180, aspect, 0.01, 100.0));
    renderer.writeCamera(view, proj, 6.0, 12.0, [canvas.width, canvas.height]);
    renderer.frame(encoder, viewTex, N);
    device.queue.submit([encoder.finish()]);
  }

  // FPS
  fpsAcc += 1/dtReal; fpsCnt++;
  if (fpsCnt > 10) { fpsOut = fpsAcc/fpsCnt; fpsAcc=0; fpsCnt=0; }
  setHUD({ fps: fpsOut, N });

  autoFrameCamera();
  readMetricsAndUpdateHUD();
  rebuildBHIfNeeded(gatherParams());
  // Auto reduce N if FPS low
  if (gatherParams().autoReduceN && fpsOut>0 && fpsOut < 25 && N>2000) { N = Math.floor(N*0.9); }
  requestAnimationFrame(frame);
}


async function readBuffer(device: GPUDevice, src: GPUBuffer, size: number): Promise<ArrayBuffer> {
  const dst = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(src, 0, dst, 0, size);
  device.queue.submit([encoder.finish()]);
  await dst.mapAsync(GPUMapMode.READ);
  const copy = dst.getMappedRange().slice(0);
  dst.unmap(); dst.destroy();
  return copy;
}

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fovy/2);
  const nf = 1 / (near - far);
  return [ f/aspect,0,0,0,  0,f,0,0,  0,0,(far+near)*nf,-1,  0,0,(2*far*near)*nf,0 ];
}
function normalize(v: number[]) { const l = Math.hypot(v[0],v[1],v[2]); return [v[0]/l,v[1]/l,v[2]/l]; }
function cross(a: number[], b: number[]) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function subtract(a: number[], b: number[]) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function lookAt(eye: number[], center: number[], up: number[]) {
  const z = normalize(subtract(eye, center)); const x = normalize(cross(up, z)); const y = cross(z, x);
  return [ x[0],y[0],z[0],0,  x[1],y[1],z[1],0,  x[2],y[2],z[2],0,  -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]), -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]), -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]), 1 ];
}


async function readMetricsAndUpdateHUD() {
  // metricsOut: [K, U, Lx, Ly, Lz, nPlanetesimals, nAlive, totalMass] scaled by 1e6 for floats
  const arr = new Int32Array(await readBuffer(device, (sim as any).metricsBuf, 4*8));
  const s = 1e-6;
  const K = arr[0]*s, U = arr[1]*s;
  const L = [arr[2]*s, arr[3]*s, arr[4]*s];
  const nPlan = arr[5], nAlive = arr[6];
  if (!baseline) baseline = { E: K+U, L: Math.hypot(L[0],L[1],L[2]) };
  const E = K+U;
  const dE = Math.abs((E - baseline.E) / (baseline.E || 1));
  const Lmag = Math.hypot(L[0],L[1],L[2]);
  const dL = Math.abs((Lmag - baseline.L) / (baseline.L || 1));
  setHUD({ dE, dL, planets: nPlan, N: nAlive });
}


async function rebuildBHIfNeeded(p: SimParams) {
  const needBH = (p.gravMode === 'bh') || (p.gravMode === 'auto' && N >= 3000);
  if (!needBH) { if ((sim as any).bhBindGroup) (sim as any).setBH((sim as any).bhNodesA!, (sim as any).bhNodesB!, (sim as any).bhChildren!, false, 0); return; }
  bhCounter++;
  if (bhCounter % 10 !== 0) return; // rebuild every ~10 frames
  // read GPU positions & aux & velMass (for mass)
  const posBytes = await readBuffer(device, sim.posType, N*4*4);
  const auxBytes = await readBuffer(device, sim.aux, N*4*4);
  const velBytes = await readBuffer(device, sim.velMass, N*4*4);
  const pos = new Float32Array(posBytes);
  const aux = new Float32Array(auxBytes);
  const vel = new Float32Array(velBytes);
  const nodes = buildQuadtreeXZ(pos, vel, aux, N, p.theta);
  const bh = uploadBH(device, nodes);
  (sim as any).setBH(bh.nodesA, bh.nodesB, bh.children, true, bh.count);
}

async function main() {

  hookUI({
    onLoadPreset: (name) => loadPreset(name),
    onPlayPause: () => {
      running = !running;
      (document.getElementById('btnPlayPause') as HTMLButtonElement).textContent = running ? 'Pausa' : 'Reanudar';
    },
    onReset: () => resetSim(),
    onExport: async () => {
      // leer buffers a CPU
      const posR = await readBufferF32(sim.posType, N * 4);
      const velR = await readBufferF32(sim.velMass, N * 4);
      const rows = [];
      for (let i=0;i<N;i++) {
        rows.push({ x: posR[4*i+0], y: posR[4*i+1], z: posR[4*i+2], vx: velR[4*i+0], vy: velR[4*i+1], vz: velR[4*i+2], m: velR[4*i+3], type: posR[4*i+3] });
      }
      const mod = await import('./export');
      mod.exportCSV(rows);
    }
  });
  window.addEventListener('resize', onResize);
  await loadPreset('nube_rotacion');
  autoFrameCamera();
  readMetricsAndUpdateHUD();
  rebuildBHIfNeeded(gatherParams());
  // Auto reduce N if FPS low
  if (gatherParams().autoReduceN && fpsOut>0 && fpsOut < 25 && N>2000) { N = Math.floor(N*0.9); }
  requestAnimationFrame(frame);
}

main();
