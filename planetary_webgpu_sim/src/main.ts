import { initWebGPU } from './initWebGPU';
import { Renderer } from './render';
import { Simulation } from './sim';
import { OrbitCamera } from './orbitcam';
import { exportCSV } from './export';
import { gatherParams, hookUI, readBasicControls, setHUD } from './ui';
import { initNubeEsferica, initDiscoKepler, initPolvoAlto } from './initStates';
import { SimParams, PresetName } from './types';

let device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat;
let renderer: Renderer;
let sim: Simulation;
let camera = new OrbitCamera();
let running = true;
let warp = 1;

let N = 0;
let lastTime = performance.now();
let fpsAcc = 0, fpsCnt = 0, fpsOut = 0;

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
  const { seed, nParticles, gasFrac } = readBasicControls();
  const p: SimParams = gatherParams();
  warp = p.warp;

  // init state by preset choice heuristics
  const presetSel = (document.getElementById('preset') as HTMLSelectElement).value as PresetName;
  let init;
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

async function fitCameraToParticles() {
  if (!sim || !device) return;
  const buf = new Float32Array(N * 4);
  await device.queue.readBuffer(sim.posType, 0, buf);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = buf[4 * i + 0];
    const y = buf[4 * i + 1];
    const z = buf[4 * i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  camera.target = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  ];
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const radius = Math.max(dx, dy, dz) * 0.5;
  camera.distance = Math.max(radius * 2.5, 0.1);
}

setInterval(() => { fitCameraToParticles(); }, 1000);

function frame() {
  const now = performance.now();
  const dtReal = Math.min(0.05, (now - lastTime)/1000);
  lastTime = now;

  const p = gatherParams();
  warp = p.warp;

  // dt adaptativo básico: limitar por dtMax y CFL ~ h / vmax (muy grosero)
  const dt = Math.min(p.dtMax, 0.5 * p.hKernel / 1.0) * warp;
  sim.updateUniform(p, dt);

  if (running) {
    const encoder = device.createCommandEncoder();
    sim.dispatch(encoder);
    const view = context.getCurrentTexture().createView();
    const vp = camera.viewProj((document.getElementById('gfx') as HTMLCanvasElement).width / (document.getElementById('gfx') as HTMLCanvasElement).height);
    renderer.frame(encoder, view, N, vp, 5.0);
    device.queue.submit([encoder.finish()]);
  }

  // FPS
  fpsAcc += 1/dtReal; fpsCnt++;
  if (fpsCnt > 10) { fpsOut = fpsAcc/fpsCnt; fpsAcc=0; fpsCnt=0; }
  setHUD({ fps: fpsOut, N });

  requestAnimationFrame(frame);
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
      const posR = new Float32Array(N*4);
      const velR = new Float32Array(N*4);
      await device.queue.readBuffer(sim.posType, 0, posR.buffer);
      await device.queue.readBuffer(sim.velMass, 0, velR.buffer);
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
  requestAnimationFrame(frame);
}

main();
