
// main.ts — cámara estable, animación activa, UI de botones y HUD conectados
// -------------------------------------------------------------------------
// Este archivo restaura los botones (pausa, reset, carga) y los contadores (frames,
// partículas vivas y "planetesimales"=tipo 2). Incluye lectura periódica de stats
// desde GPU o CPU cada ~500 ms, y mantiene el zoom sin auto-ajustes.
//
// Ajusta los selectores de IDs en la constante UI_IDS según tu HTML.

import { Simulation } from './sim';
import { Renderer } from './render';
import { initNubeEsferica, initDiscoKepler, initPolvoAlto, initDiscoEstable } from './initStates';
import type { SimParams, ParticleInit, PresetName } from './types';
let params: SimParams;
import { setHUD } from './ui';

// ====== Config UI (ajusta si tus IDs son distintos) ======
const UI_IDS = {
  btnPause: '#btnPlayPause',
  btnReset: '#btnReset',
  btnLoad:  '#btnLoadPreset',
  inputFile:'#inputFile',      // (no existe en el HTML; se ignora si es null)
  hudFrames:'#fps',
  hudAlive: '#hudN',
  hudPlan:  '#hudPlan'
};

// ===== Empaquetado inicial =====
function packInitial(init: ParticleInit[]) {
  const n = init.length;
  const posType = new Float32Array(n * 4);
  const velMass = new Float32Array(n * 4);
  const aux = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = init[i];
    posType[4*i+0] = p.pos[0];
    posType[4*i+1] = p.pos[1];
    posType[4*i+2] = p.pos[2];
    posType[4*i+3] = p.type;     // 0 gas, 1 polvo, 2 denso
    velMass[4*i+0] = p.vel[0];
    velMass[4*i+1] = p.vel[1];
    velMass[4*i+2] = p.vel[2];
    velMass[4*i+3] = p.mass;
    aux[4*i+0] = 0.0;      // density
    aux[4*i+1] = 0.0;      // pressure
    aux[4*i+2] = 1.0;      // alive flag
    aux[4*i+3] = Math.cbrt(Math.max(1e-8, p.mass)); // radius factor ~ masa^(1/3)
  }
  return { posType, velMass, aux };
}

// ===== Cámara orbital estable (sin auto-zoom) =====
class StableOrbitCam {
  target: [number, number, number] = [0,0,0];
  distance = 8;
  phi = Math.PI/6;
  theta = Math.PI/4;
  minDist = 0.4;
  maxDist = 500;

  attach(canvas: HTMLCanvasElement) {
    let dragging = false;
    let lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - lastX) * 0.01;
      const dy = (e.clientY - lastY) * 0.01;
      this.theta += dx;
      this.phi   = Math.min(Math.max(0.05, this.phi + dy), Math.PI - 0.05);
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.pow(1.1, -e.deltaY * 0.01);
      this.distance = Math.min(this.maxDist, Math.max(this.minDist, this.distance * f));
    }, { passive:false });
  }

  view() {
    const eye = [
      this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.target[1] + this.distance * Math.cos(this.phi),
      this.target[2] + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
    ];
    return lookAt(eye, this.target, [0,1,0]);
  }
  proj(aspect: number) {
    return perspective(50 * Math.PI/180, aspect, 0.01, 2000);
  }
}

// Matrices
function lookAt(eye:[number,number,number], center:[number,number,number], up:[number,number,number]) {
  const [ex,ey,ez] = eye, [cx,cy,cz] = center;
  let zx = ex-cx, zy = ey-cy, zz = ez-cz;
  const zl = 1/Math.hypot(zx,zy,zz); zx*=zl; zy*=zl; zz*=zl;
  let xx = up[1]*zz - up[2]*zy;
  let xy = up[2]*zx - up[0]*zz;
  let xz = up[0]*zy - up[1]*zx;
  const xl = 1/Math.hypot(xx,xy,xz); xx*=xl; xy*=xl; xz*=xl;
  const yx = zy*xz - zz*xy;
  const yy = zz*xx - zx*xz;
  const yz = zx*xy - zy*xx;
  const tx = -(xx*ex + xy*ey + xz*ez);
  const ty = -(yx*ex + yy*ey + yz*ez);
  const tz = -(zx*ex + zy*ey + zz*ez);
  return new Float32Array([
    xx,yx,zx,0,
    xy,yy,zy,0,
    xz,yz,zz,0,
    tx,ty,tz,1,
  ]);
}
function perspective(fovy:number, aspect:number, near:number, far:number) {
  const f = 1/Math.tan(fovy/2);
  const nf = 1/(near - far);
  return new Float32Array([
    f/aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near)*nf, -1,
    0, 0, (2*far*near)*nf, 0,
  ]);
}

// ===== Presets =====
function buildPreset(name: PresetName): { init: ParticleInit[], params: SimParams } {
  const params: SimParams = {
    G: 0.006674, eps: 0.02, theta: 0.7, gamma: 1.4, kpress: 1.0, hKernel: 0.07,
    nu: 0.03, tau: 0.6, rhoThresh: 5.5, vMax: 6.0,
    gravMode: 'auto', quality: 'med', autoReduceN: false,
    dtMax: 0.004, warp: 1,
    enableGas: true, enableDrag: true, enableCollisions: true,
    // nuevos:
    Mstar: 1.0, collisionsEvery: 4, volumeScale: 1.8,
    useAdaptiveDt: false, cfl: 0.25, eta: 0.2,
  };
  const n = 6000, gasFrac = 0.7, seed = 42;
  let init: ParticleInit[];
  switch (name) {
    case 'disco_kepler': init = initDiscoKepler(n, gasFrac, seed); break;
    case 'polvo_alto':   init = initPolvoAlto(n, gasFrac, seed); break;
    case 'disco_estable': init = initDiscoEstable(n, gasFrac, seed); break;
    default:             init = initNubeEsferica(n, gasFrac, seed); break;
  }
  return { init, params };
}

// ===== Main =====
const canvas = document.getElementById('gfx') as HTMLCanvasElement;
if (!canvas) throw new Error('No se encontró <canvas id="gfx">');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU no soportado');
const device = await adapter.requestDevice();
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: 'premultiplied' });

const renderer = new Renderer(device, format);
const sim = new Simulation(device);

// Estado app
let currentPreset: PresetName = 'disco_estable' as any;
let paused = false;
let frameCount = 0;
let N = 0;

// Init preset
await resetToPreset(currentPreset);

// Cámara
const cam = new StableOrbitCam();
cam.attach(canvas);

// UI wiring
wireUI();

// Resize
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
window.addEventListener('resize', () => {
  resize();
});
resize();

// HUD sampling (cada 500 ms)
setInterval(sampleAndUpdateHUD, 500);

// Bucle
let last = performance.now();
function frame(now: number) {
  // const dt = Math.min(params.dtMax, (now - last) * 0.001 * params.warp);
  last = now;

  const encoder = device.createCommandEncoder();

  if (!paused) {
    // Rampa de gas/drag para estabilizar órbitas
    if (frameCount === 2000) params.tau = 3.0;
    if (frameCount === 3000) { params.enableGas = false; params.enableDrag = false; }
    sim.dispatch(encoder);      // *** avanzar simulación ***
    frameCount++;
  }

  // Render
  const colorView = context.getCurrentTexture().createView();
  const aspect = canvas.width / Math.max(1, canvas.height);
  const view = cam.view();
  const proj = cam.proj(aspect);
  renderer.writeCamera(view, proj, 8.0 * params.volumeScale, 40.0, [canvas.width, canvas.height]);
  renderer.frame(encoder, colorView, (sim as any).n ?? N);

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ========= helpers =========

async function resetToPreset(name: PresetName) {
  const preset = buildPreset(name);
  params = preset.params;
  const init = preset.init;
  const packed = packInitial(init);
  await sim.init(packed.posType, packed.velMass, packed.aux, params);
  await renderer.init(sim.posType, sim.aux, sim.velMass);
  N = init.length;
  frameCount = 0;
}

function qs<T extends Element>(sel: string) { return document.querySelector(sel) as T | null; }

function wireUI() {
  const btnPause = qs<HTMLButtonElement>(UI_IDS.btnPause);
  const btnReset = qs<HTMLButtonElement>(UI_IDS.btnReset);
  const btnLoad  = qs<HTMLButtonElement>(UI_IDS.btnLoad);
  const input    = qs<HTMLInputElement>(UI_IDS.inputFile);

  if (btnPause) btnPause.onclick = () => {
    paused = !paused;
    btnPause.textContent = paused ? 'Reanudar' : 'Pausa';
  
  // Selector de preset
  const selPreset = document.getElementById('preset') as HTMLSelectElement | null;
  if (selPreset) {
    selPreset.onchange = async () => {
      // Mapea valores del <select> al tipo PresetName
      const val = selPreset.value as any as PresetName;
      currentPreset = val;
      paused = false;
      const btnPauseEl = qs<HTMLButtonElement>(UI_IDS.btnPause);
      if (btnPauseEl) btnPauseEl.textContent = 'Pausa';
      await resetToPreset(currentPreset);
    };
  }
};

  if (btnReset) btnReset.onclick = async () => {
    paused = false;
    if (btnPause) btnPause.textContent = 'Pausa';
    await resetToPreset(currentPreset);
  };

  if (btnLoad && input) {
    btnLoad.onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const json = JSON.parse(text);
        // Soporta dos formatos:
        // 1) { init: ParticleInit[], params?: SimParams }
        // 2) ParticleInit[]
        let init: ParticleInit[];
        let params: SimParams | undefined;
        if (Array.isArray(json)) {
          init = json as ParticleInit[];
        } else {
          init = json.init as ParticleInit[];
          params = json.params as SimParams | undefined;
        }
        const packed = packInitial(init);
        await sim.init(packed.posType, packed.velMass, packed.aux, params ?? (buildPreset(currentPreset).params));
        await renderer.init(sim.posType, sim.aux, sim.velMass);
        N = init.length;
        frameCount = 0;
        paused = false;
        if (btnPause) btnPause.textContent = 'Pausa';
      } catch (e) {
        console.error('Error cargando archivo:', e);
        alert('Archivo no válido. Esperaba JSON con init[] o {init, params}.');
      } finally {
        input.value = '';
      }
    };
  }
}

let _hudLastTime = performance.now();
let _hudLastFrames = 0;

async function sampleAndUpdateHUD() {
  const now = performance.now();
  const dFrames = frameCount - _hudLastFrames;
  const dt = (now - _hudLastTime) / 1000;
  const fps = dt > 0 ? dFrames / dt : 0;
  _hudLastTime = now;
  _hudLastFrames = frameCount;

  let alive = 0, planets = 0;
  try {
    const stats = await readStats();
    alive = stats.alive;
    planets = stats.dense;
  } catch (_e) {
    // ignorar errores de lectura puntual
  }

  if (typeof setHUD === 'function') {
    setHUD({ fps, N: alive, planets });
  } else {
    const elF = document.getElementById('fps'); if (elF) elF.textContent = String(Math.round(fps));
    const elN = document.getElementById('hudN'); if (elN) elN.textContent = String(alive);
    const elP = document.getElementById('hudPlan'); if (elP) elP.textContent = String(planets);
  }
}

// Lee stats desde CPU o GPU (aux y posType)
async function readStats(): Promise<{ alive:number, dense:number }> {
  const anySim = sim as any;
  const n = (anySim.n as number) ?? N;
  if (n <= 0) return { alive: 0, dense: 0 };

  // Ramas: CPU arrays o GPU buffers
  const aux = anySim.aux;
  const posType = anySim.posType;

  if (aux instanceof Float32Array && posType instanceof Float32Array) {
    let alive = 0, dense = 0;
    for (let i = 0; i < n; i++) {
      const a = aux[4*i+2];
      const t = posType[4*i+3];
      if (a > 0.5) {
        alive++;
        if (t === 2) dense++;
      }
    }
    return { alive, dense };
  }

  // GPU readback
  const auxGPU = aux as GPUBuffer;
  const posGPU = posType as GPUBuffer;
  const auxSize = n * 16;  // 4 floats = 16 bytes
  const posSize = n * 16;

  const [auxArr, posArr] = await Promise.all([
    readbackBufferFloat32(device, auxGPU, auxSize),
    readbackBufferFloat32(device, posGPU, posSize),
  ]);

  let alive = 0, dense = 0;
  for (let i = 0; i < n; i++) {
    const a = auxArr[4*i+2];
    const t = posArr[4*i+3];
    if (a > 0.5) {
      alive++;
      if (t === 2) dense++;
    }
  }
  return { alive, dense };
}

async function readbackBufferFloat32(device: GPUDevice, src: GPUBuffer, sizeBytes: number): Promise<Float32Array> {
  const staging = device.createBuffer({
    size: sizeBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(src, 0, staging, 0, sizeBytes);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = staging.getMappedRange().slice(0);
  staging.unmap();
  return new Float32Array(copy);
}
