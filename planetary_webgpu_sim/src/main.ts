/// <reference types="@webgpu/types" />

/** ========================= Utilidades DOM ========================= **/
const qs = <T extends Element>(sel: string) => document.querySelector(sel) as T | null;
const $  = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function getNum(id: string, def: number): number {
  const el = $<HTMLInputElement>(id); if (!el) return def;
  const v = parseFloat(el.value); return Number.isFinite(v) ? v : def;
}
function setNum(id: string, v: number) { const el = $<HTMLInputElement>(id); if (el) el.value = String(v); }
function setSel(id: string, v: string) { const el = $<HTMLSelectElement>(id); if (el) el.value = v; }
function getSelNum(id: string, def: number): number {
  const el = $<HTMLSelectElement>(id); if (!el) return def;
  const v = parseFloat(el.value); return Number.isFinite(v) ? v : def;
}

/** ========================= Canvas seguro ========================= **/
let canvasRef: HTMLCanvasElement | null = null;
function getCanvas(): HTMLCanvasElement {
  if (canvasRef) return canvasRef;
  const el = qs<HTMLCanvasElement>("canvas");
  if (!(el instanceof HTMLCanvasElement)) throw new Error("No se encontró <canvas> en el DOM");
  canvasRef = el; return canvasRef;
}

/** ========================= Configuración ========================= **/
const GRID_W = 128;
const GRID_H = 128;
const MASS_FP = 1e6;          // masa en punto fijo para atomics (u32)
const BASE_PX = 5.0;          // tamaño base partícula (antes de masa/densidad)
const ACC_RATE = 0.35;        // acreción (masa/seg * densidad_norm=1)
const DENSITY_NORM = 10.0;    // normalizador densidad (si lo usas por grid)
const MAX_CLUSTERS = 256;     // máximo de cúmulos pintados

// parámetros del overlay (ajustables)
const CLUSTER_SOLID_THRESH = 2.0; // masa sólida mínima por celda (unidades arbitrarias)
const KSOLID = 8.0;               // px por masa sólida
const KGAS = 10.0;                // px por masa gas (extra sobre sólido)
const RHO_SOLID = 1.0;            // densidad ref (arbitraria)
const RHO_GAS = 0.5;

/** ========================= WebGPU handles ========================= **/
let device!: GPUDevice;
let context!: GPUCanvasContext;
let format!: GPUTextureFormat;

let clearGridPipeline!: GPUComputePipeline;
let scatterGridPipeline!: GPUComputePipeline;
let simPipeline!: GPUComputePipeline;
let renderParticlesPipeline!: GPURenderPipeline;

let findClustersPipeline!: GPUComputePipeline;
let renderClustersPipeline!: GPURenderPipeline;

let bindGroupClear!: GPUBindGroup;
let bindGroupScatter!: GPUBindGroup;
let bindGroupSim!: GPUBindGroup;
let bindGroupRenderParticles!: GPUBindGroup;

let bindGroupFindClusters!: GPUBindGroup;
let bindGroupRenderClusters!: GPUBindGroup;

/** Buffers principales **/
let particlesBuf: GPUBuffer | null = null;   // vec4(x,y, mass, type)
let velBuf:       GPUBuffer | null = null;   // vec4(vx,vy, sizePx, _)
let uniformBuf:   GPUBuffer | null = null;   // Uniforms (ver WGSL)
let gridSolidBuf: GPUBuffer | null = null;   // atomic<u32> masa sólida por celda (punto fijo)
let gridGasBuf:   GPUBuffer | null = null;   // atomic<u32> masa gas por celda (punto fijo)

/** Buffers de cúmulos **/
let clustersBuf: GPUBuffer | null = null;      // array<vec4> * 2 por cluster (data0, data1)
                                               // data0 = (cx,cy, rSolidPx, rGasPx)
                                               // data1 = (mGas, mSolid, _, _)
let clustersCountBuf: GPUBuffer | null = null; // atomic<u32> contador de clusters
let clustersZeroBuf: GPUBuffer | null = null;  // staging para limpiar clustersBuf

/** Estado runtime **/
let nParticles = 0, buffersN = 0, running = true;
let lastFrame = 0, frameHandle = 0, fpsAvg = 0;

/** ========================= RNG simple ========================= **/
function rand(seed:{v:number}) { seed.v = (seed.v * 1664525 + 1013904223) >>> 0; return seed.v / 0xffffffff; }

/** ========================= UI ========================= **/
function initUI() {
  const btnPP = $<HTMLButtonElement>("btnPlayPause");
  if (btnPP) {
    btnPP.textContent = running ? "Pausar" : "Reanudar";
    btnPP.addEventListener("click", () => { running = !running; btnPP.textContent = running ? "Pausar" : "Reanudar"; });
  }
  $<HTMLButtonElement>("btnReset")?.addEventListener("click", () => resetSim());
  $<HTMLButtonElement>("btnLoadPreset")?.addEventListener("click", () => {
    const sel = $<HTMLSelectElement>("preset"); applyPreset(sel?.value ?? "");
  });
  $<HTMLButtonElement>("btnExport")?.addEventListener("click", exportState);
}
function applyPreset(name: string) {
  switch (name) {
    case "disco_estable": setNum("nParticles", 4000); setNum("gasFrac", 0.6); setSel("gravMode","n2"); break;
    case "nube_rotacion": setNum("nParticles", 2500); setNum("gasFrac", 0.5); setSel("gravMode","n2"); break;
    case "disco_kepler":  setNum("nParticles", 4000); setNum("gasFrac", 0.4); setSel("gravMode","n2"); break;
    case "polvo_alto":    setNum("nParticles", 3000); setNum("gasFrac", 0.1); setSel("gravMode","n2"); break;
    case "gtx1050":       setNum("nParticles", 1500); setNum("gasFrac", 0.5); setSel("gravMode","n2"); break;
  }
}

/** ========================= WebGPU init ========================= **/
async function initWebGPU() {
  if (!("gpu" in navigator)) throw new Error("Tu navegador no soporta WebGPU");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No se pudo obtener adapter WebGPU");
  device = await adapter.requestDevice();
  const cnv = getCanvas();
  context = cnv.getContext("webgpu") as GPUCanvasContext;
  format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
}

/** ========================= WGSL ========================= **/

/** Uniforms compartidos por todos los shaders.
 *  16 floats (64 bytes) para alineación.
 */
const UNIFORMS_LAYOUT = `
struct Uniforms {
  dt: f32, eps: f32, grav: f32, _pad0: f32,
  viewport: vec2<f32>, grid: vec2<f32>,
  accRate: f32, basePx: f32, solidThresh: f32, _pad1: f32,
  kSolid: f32, kGas: f32, rhoSolid: f32, rhoGas: f32,
};
`;

/** Limpia los dos grids (masa sólida / gas) y el contador de clusters */
const CLEAR_GRID_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
@group(0) @binding(0) var<storage, read_write> gridSolid : array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> gridGas   : array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> clustersCount : atomic<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let total = arrayLength(&gridSolid);
  if (gid.x == 0u) { atomicStore(&clustersCount, 0u); }
  if (gid.x < total) {
    atomicStore(&gridSolid[gid.x], 0u);
    atomicStore(&gridGas[gid.x],   0u);
  }
}
`;

/** Scatter de masa a los grids (punto fijo) */
const SCATTER_GRID_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
const MASS_FP: f32 = ${MASS_FP}.0;

@group(0) @binding(0) var<storage, read>  posType : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> gridSolid : array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> gridGas   : array<atomic<u32>>;
@group(0) @binding(3) var<uniform> uni : Uniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&posType)) { return; }
  let p = posType[i].xy;
  let m = max(1e-6, posType[i].z);
  let t = posType[i].w;

  let gx = i32(clamp((p.x * 0.5 + 0.5) * uni.grid.x, 0.0, uni.grid.x - 1.0));
  let gy = i32(clamp((p.y * 0.5 + 0.5) * uni.grid.y, 0.0, uni.grid.y - 1.0));
  let idx = u32(gy) * u32(uni.grid.x) + u32(gx);

  let mfp = u32(clamp(round(m * MASS_FP), 1.0, 4294967295.0));
  if (t < 0.5) {
    atomicAdd(&gridGas[idx], mfp);
  } else {
    atomicAdd(&gridSolid[idx], mfp);
  }
}
`;

/** Simulación (gravedad central + acreción + tamaño por masa/densidad proxy) */
const SIM_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
@group(0) @binding(0) var<storage, read_write> posType : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> vel     : array<vec4<f32>>;
@group(0) @binding(2) var<uniform> uni : Uniforms;

fn density_proxy(p: vec2<f32>) -> f32 {
  let r = length(p);
  return clamp(1.0 - r, 0.0, 1.0);
}

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&posType)) { return; }

  var p = posType[i].xy;
  var v = vel[i].xy;
  var m = posType[i].z;

  let dens = density_proxy(p);
  m = m + uni.accRate * dens * uni.dt;
  posType[i].z = m;

  let r2 = max(dot(p,p), 1e-6);
  let invr = inverseSqrt(r2 + uni.eps*uni.eps);
  let a = -uni.grav * p * invr * invr;
  v += a * uni.dt;
  p += v * uni.dt;
  v *= 0.999;

  if (abs(p.x) > 1.05) { v.x = -v.x * 0.95; p.x = clamp(p.x, -1.05, 1.05); }
  if (abs(p.y) > 1.05) { v.y = -v.y * 0.95; p.y = clamp(p.y, -1.05, 1.05); }

  let massScale = pow(m, 0.3333333);
  let densScale = (0.7 + 0.3 * log(1.0 + 5.0 * dens));
  let sizePx = clamp(uni.basePx * massScale * densScale, 2.0, 16.0);

  posType[i].x = p.x; posType[i].y = p.y;
  vel[i].x = v.x;     vel[i].y = v.y;
  vel[i].z = sizePx;
}
`;

/** Detección de cúmulos (máximos locales de masa sólida) y radios sólido+gas */
const FIND_CLUSTERS_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
const MASS_FP: f32 = ${MASS_FP}.0;

@group(0) @binding(0) var<storage, read_write> gridSolid : array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> gridGas   : array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> clustersCount : atomic<u32>;
@group(0) @binding(3) var<storage, read_write> clustersData  : array<vec4<f32>>; // 2 vec4 por cluster
@group(0) @binding(4) var<uniform> uni : Uniforms;

fn idxOf(x:i32, y:i32) -> u32 {
  let w = i32(uni.grid.x);
  let h = i32(uni.grid.y);
  let ix = clamp(x, 0, w - 1);
  let iy = clamp(y, 0, h - 1);
  return u32(iy) * u32(w) + u32(ix);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = i32(uni.grid.x);
  let h = i32(uni.grid.y);
  let total = u32(w) * u32(h);
  let flat = gid.x;
  if (flat >= total) { return; }

  let x = i32(flat % u32(w));
  let y = i32(flat / u32(w));
  let me = atomicLoad(&gridSolid[idxOf(x, y)]);

  // umbral de masa sólida por celda (en FP)
  let thr = u32(max(1.0, round(uni.solidThresh * MASS_FP)));
  if (me < thr) { return; }

  // máximo local 3x3 en sólidos
  var isMax = true;
  for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      if (atomicLoad(&gridSolid[idxOf(x + dx, y + dy)]) > me) { isMax = false; }
    }
  }
  if (!isMax) { return; }

  // masa sólida 3x3 y gas 5x5 (en float reales)
  var mSolid: f32 = 0.0;
  for (var dy2:i32 = -1; dy2 <= 1; dy2 = dy2 + 1) {
    for (var dx2:i32 = -1; dx2 <= 1; dx2 = dx2 + 1) {
      mSolid = mSolid + f32(atomicLoad(&gridSolid[idxOf(x + dx2, y + dy2)])) / MASS_FP;
    }
  }
  var mGas: f32 = 0.0;
  for (var gy:i32 = -2; gy <= 2; gy = gy + 1) {
    for (var gx:i32 = -2; gx <= 2; gx = gx + 1) {
      mGas = mGas + f32(atomicLoad(&gridGas[idxOf(x + gx, y + gy)])) / MASS_FP;
    }
  }

  // centro (clip) y radios (px)
  let cx = (f32(x) + 0.5) / uni.grid.x * 2.0 - 1.0;
  let cy = (f32(y) + 0.5) / uni.grid.y * 2.0 - 1.0;

  let rSolidPx = uni.kSolid * sqrt(max(1e-9, mSolid) / (3.14159 * max(1e-6, uni.rhoSolid)));
  let rGasPx   = rSolidPx + uni.kGas * sqrt(max(0.0, mGas) / (3.14159 * max(1e-6, uni.rhoGas)));

  let idx = atomicAdd(&clustersCount, 1u);
  if (idx >= ${MAX_CLUSTERS}u) { return; }

  let base = idx * 2u;
  clustersData[base + 0u] = vec4<f32>(cx, cy, rSolidPx, rGasPx);
  clustersData[base + 1u] = vec4<f32>(mGas, mSolid, 0.0, 0.0);
}
`;

/** Render de partículas (quads circulares con color por tipo) */
const RENDER_PARTICLES_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
@group(0) @binding(0) var<storage, read> posType : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> vel     : array<vec4<f32>>;
@group(0) @binding(2) var<uniform> uni : Uniforms;

struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) vUV: vec2<f32>, @location(1) t: f32 };

fn color_for_type(t: f32) -> vec3<f32> {
  if (t < 0.5)      { return vec3<f32>(0.55, 0.80, 1.00); }
  else if (t < 1.5) { return vec3<f32>(1.00, 0.72, 0.38); }
  else if (t < 2.5) { return vec3<f32>(1.00, 0.92, 0.40); }
  else              { return vec3<f32>(0.80, 0.85, 0.90); }
}

@vertex
fn vs(@builtin(vertex_index) vi:u32, @builtin(instance_index) ii:u32) -> VSOut {
  let p = posType[ii].xy;
  let sizePx = max(vel[ii].z, 2.0);

  let px = 2.0 / uni.viewport.x;
  let py = 2.0 / uni.viewport.y;
  let rx = sizePx * px;
  let ry = sizePx * py;

  var local = array<vec2<f32>,6>(
    vec2<f32>(-rx,-ry), vec2<f32>(rx,-ry), vec2<f32>(-rx,ry),
    vec2<f32>(-rx,ry),  vec2<f32>(rx,-ry), vec2<f32>(rx,ry)
  );
  var uv = array<vec2<f32>,6>(
    vec2<f32>(0.0,0.0), vec2<f32>(1.0,0.0), vec2<f32>(0.0,1.0),
    vec2<f32>(0.0,1.0), vec2<f32>(1.0,0.0), vec2<f32>(1.0,1.0)
  );

  var out: VSOut;
  out.pos = vec4<f32>(p + local[vi], 0.0, 1.0);
  out.vUV = uv[vi];
  out.t   = posType[ii].w;
  return out;
}

@fragment
fn fs(in:VSOut) -> @location(0) vec4<f32> {
  let d = distance(in.vUV, vec2<f32>(0.5,0.5));
  let a = 1.0 - smoothstep(0.48, 0.5, d);
  let base = color_for_type(in.t);
  let alpha = select(a, a * 0.85, in.t < 0.5);
  return vec4<f32>(base, alpha);
}
`;

/** Render de cúmulos: quad grande, FS pinta disco sólido + halo gas */
const RENDER_CLUSTERS_WGSL = /* wgsl */`
${UNIFORMS_LAYOUT}
@group(0) @binding(0) var<storage, read> clustersData  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform> uni : Uniforms;  // ← ¡faltaba!

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) center: vec2<f32>,
  @location(1) radii: vec2<f32>,
  @location(2) vPos: vec2<f32>
};

@vertex
fn vs(@builtin(vertex_index) vi:u32, @builtin(instance_index) ii:u32) -> VSOut {
  let base = ii * 2u;
  let data0 = clustersData[base];
  let cx = data0.x;
  let cy = data0.y;
  let rS = data0.z;
  let rG = data0.w;

  let px = 2.0 / uni.viewport.x;
  let py = 2.0 / uni.viewport.y;
  let rx = max(rG, 0.0) * px;
  let ry = max(rG, 0.0) * py;

  var local = array<vec2<f32>,6>(
    vec2<f32>(-rx,-ry), vec2<f32>(rx,-ry), vec2<f32>(-rx,ry),
    vec2<f32>(-rx,ry),  vec2<f32>(rx,-ry), vec2<f32>(rx,ry)
  );

  var out: VSOut;
  out.pos = vec4<f32>(vec2<f32>(cx,cy) + local[vi], 0.0, 1.0);
  out.center = vec2<f32>(cx,cy);
  out.radii = vec2<f32>(rS, rG);
  out.vPos = local[vi] / vec2<f32>(px, py);
  return out;
}

@fragment
fn fs(in:VSOut) -> @location(0) vec4<f32> {
  let r = length(in.vPos);
  let rS = in.radii.x;
  let rG = max(in.radii.y, rS);

  let colSolid = vec3<f32>(1.0, 0.75, 0.45);
  let aSolid = 1.0 - smoothstep(rS - 2.0, rS, r);

  let halo = clamp((r - rS) / max(1.0, (rG - rS)), 0.0, 1.0);
  let colGas = vec3<f32>(0.60, 0.82, 1.0);
  let aGas = (1.0 - halo) * 0.35;

  let outCol = colSolid * aSolid + colGas * aGas;
  let outA   = clamp(aSolid + aGas * 0.6, 0.0, 1.0);
  return vec4<f32>(outCol, outA);
}
`;

/** ========================= Construcción de pipelines ========================= **/
async function buildPipelines() {
  clearGridPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: CLEAR_GRID_WGSL }), entryPoint: "main" }
  });
  scatterGridPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: SCATTER_GRID_WGSL }), entryPoint: "main" }
  });
  simPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: SIM_WGSL }), entryPoint: "step" }
  });
  renderParticlesPipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex:   { module: device.createShaderModule({ code: RENDER_PARTICLES_WGSL }), entryPoint: "vs" },
    fragment: { 
      module: device.createShaderModule({ code: RENDER_PARTICLES_WGSL }), entryPoint: "fs",
      targets: [{ format,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" }
        }
      }]
    },
    primitive:{ topology: "triangle-list" }
  });

  findClustersPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: FIND_CLUSTERS_WGSL }), entryPoint: "main" }
  });
  renderClustersPipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex:   { module: device.createShaderModule({ code: RENDER_CLUSTERS_WGSL }), entryPoint: "vs" },
    fragment: { 
      module: device.createShaderModule({ code: RENDER_CLUSTERS_WGSL }), entryPoint: "fs",
      targets: [{ format,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" }
        }
      }]
    },
    primitive:{ topology: "triangle-list" }
  });
}

/** ========================= Buffers ========================= **/
function allocBuffers(N:number) {
  buffersN = N;
  const bytes = Math.max(1, N) * 4 * 4;

  particlesBuf?.destroy(); velBuf?.destroy(); uniformBuf?.destroy();
  gridSolidBuf?.destroy(); gridGasBuf?.destroy();
  clustersBuf?.destroy(); clustersCountBuf?.destroy(); clustersZeroBuf?.destroy();

  particlesBuf = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  velBuf       = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  uniformBuf   = device.createBuffer({ size: 64,   usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  gridSolidBuf = device.createBuffer({ size: GRID_W*GRID_H*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  gridGasBuf   = device.createBuffer({ size: GRID_W*GRID_H*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  // clusters: 2 vec4 por cluster = 32 bytes * MAX
  clustersBuf = device.createBuffer({ size: MAX_CLUSTERS * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  clustersCountBuf = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  clustersZeroBuf = device.createBuffer({ size: MAX_CLUSTERS * 32, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
  new Uint8Array(clustersZeroBuf.getMappedRange()).fill(0); clustersZeroBuf.unmap();
}

/** ========================= BindGroups ========================= **/
function makeBindGroups() {
  // clear_grid: gridSolid + gridGas + clustersCount
  bindGroupClear = device.createBindGroup({
    layout: clearGridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridSolidBuf! } },
      { binding: 1, resource: { buffer: gridGasBuf! } },
      { binding: 2, resource: { buffer: clustersCountBuf! } },
    ],
  });

  // scatter_grid: posType + gridSolid + gridGas + uniforms
  bindGroupScatter = device.createBindGroup({
    layout: scatterGridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particlesBuf! } },
      { binding: 1, resource: { buffer: gridSolidBuf! } },
      { binding: 2, resource: { buffer: gridGasBuf! } },
      { binding: 3, resource: { buffer: uniformBuf! } },
    ],
  });

  // sim: posType + vel + uniforms
  bindGroupSim = device.createBindGroup({
    layout: simPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particlesBuf! } },
      { binding: 1, resource: { buffer: velBuf! } },
      { binding: 2, resource: { buffer: uniformBuf! } },
    ],
  });

  // render partículas: posType + vel + uniforms
  bindGroupRenderParticles = device.createBindGroup({
    layout: renderParticlesPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particlesBuf! } },
      { binding: 1, resource: { buffer: velBuf! } },
      { binding: 2, resource: { buffer: uniformBuf! } },
    ],
  });

  // find_clusters: gridSolid + gridGas + clustersCount + clustersData + uniforms
  bindGroupFindClusters = device.createBindGroup({
    layout: findClustersPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridSolidBuf! } },
      { binding: 1, resource: { buffer: gridGasBuf! } },
      { binding: 2, resource: { buffer: clustersCountBuf! } },
      { binding: 3, resource: { buffer: clustersBuf! } },
      { binding: 4, resource: { buffer: uniformBuf! } },
    ],
  });

  // render cúmulos: clustersData + uniforms   ← ¡ojo, aquí añadimos el uniform!
  bindGroupRenderClusters = device.createBindGroup({
    layout: renderClustersPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: clustersBuf! } },
      { binding: 1, resource: { buffer: uniformBuf! } },
    ],
  });
}

/** ========================= Estado inicial ========================= **/
function initStateFromUI(realloc=true) {
  const seed = Math.max(0, (getNum("seed", 123456789) >>> 0));
  const gasFrac = Math.max(0, Math.min(1, getNum("gasFrac", 0.5)));
  nParticles = Math.max(1, Math.floor(getNum("nParticles", 2000)));
  const preset = ($<HTMLSelectElement>("preset")?.value) ?? "disco_estable";

  if (realloc || buffersN !== nParticles) { allocBuffers(nParticles); makeBindGroups(); }

  const seedObj = { v: seed };
  const pos = new Float32Array(nParticles * 4);
  const vel = new Float32Array(nParticles * 4);

  if (preset === "nube_rotacion") {
    for (let i=0;i<nParticles;i++) {
      const r = Math.sqrt(rand(seedObj)) * 0.8;
      const a = rand(seedObj) * Math.PI * 2;
      pos[i*4+0] = r*Math.cos(a); pos[i*4+1] = r*Math.sin(a);
      pos[i*4+2] = 1.0; pos[i*4+3] = (i < nParticles*gasFrac) ? 0 : 1;
      vel[i*4+0] = -pos[i*4+1]*0.2; vel[i*4+1] =  pos[i*4+0]*0.2;
      vel[i*4+2] = BASE_PX;
    }
  } else {
    for (let i=0;i<nParticles;i++) {
      const r = 0.2 + Math.sqrt(rand(seedObj)) * 0.8;
      const a = rand(seedObj) * Math.PI * 2;
      pos[i*4+0] = r*Math.cos(a); pos[i*4+1] = r*Math.sin(a);
      pos[i*4+2] = 1.0; pos[i*4+3] = (i < nParticles*gasFrac) ? 0 : 1;
      const v0 = Math.sqrt(0.3 / r);
      vel[i*4+0] = -Math.sin(a)*v0; vel[i*4+1] = Math.cos(a)*v0;
      vel[i*4+2] = BASE_PX;
    }
  }
  device.queue.writeBuffer(particlesBuf!, 0, pos);
  device.queue.writeBuffer(velBuf!, 0, vel);
}

/** ========================= HUD / Export ========================= **/
function resetSim() {
  const wasRunning = running;
  initStateFromUI(true);
  running = wasRunning;
  const btnPP = $<HTMLButtonElement>("btnPlayPause");
  if (btnPP) btnPP.textContent = running ? "Pausar" : "Reanudar";
  updateHUD(0);
}
function updateHUD(dt:number) {
  const hudN = $("hudN"); if (hudN) hudN.textContent = String(nParticles);
  if (dt > 0) {
    const fps = 1/dt; fpsAvg = fpsAvg ? (fpsAvg*0.9 + fps*0.1) : fps;
    const fpsEl = $("fps"); if (fpsEl) fpsEl.textContent = fpsAvg.toFixed(0);
  }
}
function exportState() {
  const bytes = nParticles * 4 * 4;
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(particlesBuf!, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  staging.mapAsync(GPUMapMode.READ).then(() => {
    const ab = staging.getMappedRange().slice(0); staging.unmap();
    const data = Array.from(new Float32Array(ab));
    const blob = new Blob([JSON.stringify({ n: nParticles, data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "particles.json"; a.click(); URL.revokeObjectURL(url);
  });
}

/** ========================= Frame ========================= **/
function resizeCanvasToDisplaySize() {
  const cnv = getCanvas();
  const w = (cnv.clientWidth | 0) || 800, h = (cnv.clientHeight | 0) || 600;
  if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
  return { w, h };
}

function frame(t:number) {
  const now = t * 0.001;
  const dt = lastFrame ? Math.min(0.05, now - lastFrame) : 0;
  lastFrame = now;

  const { w, h } = resizeCanvasToDisplaySize();

  const grav = getNum("G", 0.3);
  const eps  = getNum("eps", 0.01);
  const warp = getSelNum("warp", 1.0);
  const simDt = dt * warp;

  // Uniforms
  const uni = new Float32Array([
    simDt, eps, grav, 0,
    w, h, GRID_W, GRID_H,
    ACC_RATE, BASE_PX, CLUSTER_SOLID_THRESH, 0,
    KSOLID, KGAS, RHO_SOLID, RHO_GAS
  ]);
  device.queue.writeBuffer(uniformBuf!, 0, uni);

  const encoder = device.createCommandEncoder();

  // 1) Sim particles
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(simPipeline);
    pass.setBindGroup(0, bindGroupSim);
    pass.dispatchWorkgroups(Math.ceil(nParticles / 256));
    pass.end();
  }

  // 2) Clear grids + reset clusters count
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(clearGridPipeline);
    pass.setBindGroup(0, bindGroupClear);
    pass.dispatchWorkgroups(Math.ceil((GRID_W*GRID_H) / 256));
    pass.end();
  }

  // 3) Scatter mass (gas/roca) al grid
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(scatterGridPipeline);
    pass.setBindGroup(0, bindGroupScatter);
    pass.dispatchWorkgroups(Math.ceil(nParticles / 256));
    pass.end();
  }

  // 4) Limpiar clustersBuf a cero (por si se dibujan menos de MAX)
  encoder.copyBufferToBuffer(clustersZeroBuf!, 0, clustersBuf!, 0, MAX_CLUSTERS*32);

  // 5) Encontrar cúmulos y calcular radios
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(findClustersPipeline);
    pass.setBindGroup(0, bindGroupFindClusters);
    pass.dispatchWorkgroups(Math.ceil((GRID_W*GRID_H) / 256));
    pass.end();
  }

  // 6) Render
  const colorView = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: colorView, loadOp: "clear", storeOp: "store",
      clearValue: { r: 0.05, g: 0.09, b: 0.14, a: 1 }
    }]
  });
  // Partículas
  renderPass.setPipeline(renderParticlesPipeline);
  renderPass.setBindGroup(0, bindGroupRenderParticles);
  renderPass.draw(6, nParticles);

  // Overlay de cúmulos
  renderPass.setPipeline(renderClustersPipeline);
  renderPass.setBindGroup(0, bindGroupRenderClusters);
  renderPass.draw(6, MAX_CLUSTERS);

  renderPass.end();

  device.queue.submit([encoder.finish()]);
  updateHUD(dt);

  if (running) frameHandle = requestAnimationFrame(frame);
  else cancelAnimationFrame(frameHandle);
}

/** ========================= Boot ========================= **/
async function boot() {
  initUI();
  await initWebGPU();
  await buildPipelines();
  initStateFromUI(true);
  const btnPP = $<HTMLButtonElement>("btnPlayPause");
  if (btnPP) btnPP.textContent = running ? "Pausar" : "Reanudar";
  cancelAnimationFrame(frameHandle);
  frameHandle = requestAnimationFrame(frame);
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => { boot().catch(err => { console.error(err); alert(String(err?.message ?? err)); }); });
} else {
  boot().catch(err => { console.error(err); alert(String(err?.message ?? err)); });
}
