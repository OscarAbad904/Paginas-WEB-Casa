/// <reference types="@webgpu/types" />
import type { SimParams } from './types';
import computeWGSL from './compute.wgsl?raw';

function isGPUBuffer(x: any): x is GPUBuffer {
  return x && typeof x === 'object' && typeof (x as GPUBuffer).destroy === 'function';
}

function ensureGPUBuffer(
  device: GPUDevice,
  src: GPUBuffer | Float32Array,
  usage: GPUBufferUsageFlags,
  label: string
): GPUBuffer {
  if (isGPUBuffer(src)) return src;
  const buf = device.createBuffer({ size: src.byteLength, usage, label });
  device.queue.writeBuffer(buf, 0, src.buffer, src.byteOffset, src.byteLength);
  return buf;
}

export class Simulation {
  device: GPUDevice;
  n = 0;

  // buffers
  posType!: GPUBuffer;
  velMass!: GPUBuffer;
  aux!: GPUBuffer;
  accel!: GPUBuffer;
  metrics!: GPUBuffer;

  // uniforms
  paramsUBO: GPUBuffer;

  // (opcional) Barnes–Hut dummies
  bhNodesA!: GPUBuffer;
  bhNodesB!: GPUBuffer;
  bhChildren!: GPUBuffer;
  bhInfoUBO!: GPUBuffer;

  // pipelines + bind groups
  pDensity?: GPUComputePipeline;
  pForce?: GPUComputePipeline;
  pIntegrate?: GPUComputePipeline;
  pCollide?: GPUComputePipeline;

  bg0?: GPUBindGroup; // group(0)
  bg1?: GPUBindGroup; // group(1) BH/dummy

  constructor(device: GPUDevice) {
    this.device = device;
    this.paramsUBO = device.createBuffer({
      size: 16 * 4, // 64 bytes (coincide con struct usado en WGSL)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Sim.paramsUBO'
    });
  }

  async init(
    posType: Float32Array | GPUBuffer,
    velMass: Float32Array | GPUBuffer,
    aux: Float32Array | GPUBuffer,
    params: Partial<SimParams>
  ) {
    // deducir N si vienen como arrays
    if (!isGPUBuffer(posType)) this.n = Math.floor((posType as Float32Array).length / 4);
    else if (!isGPUBuffer(velMass)) this.n = Math.floor((velMass as Float32Array).length / 4);
    else if (!isGPUBuffer(aux)) this.n = Math.floor((aux as Float32Array).length / 4);

    // convertir a GPUBuffer con usos correctos
    const STORAGE_RW = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.posType = ensureGPUBuffer(this.device, posType, STORAGE_RW, 'posType');
    this.velMass = ensureGPUBuffer(this.device, velMass, STORAGE_RW, 'velMass');
    this.aux     = ensureGPUBuffer(this.device, aux,     STORAGE_RW, 'aux');

    // buffers auxiliares
    const n = Math.max(1, this.n);
    this.accel = this.device.createBuffer({
      size: n * 16, usage: STORAGE_RW, label: 'accel'
    });
    this.metrics = this.device.createBuffer({
      size: 8 * 4, usage: STORAGE_RW, label: 'metrics'
    });
    // limpiar métricas
    this.device.queue.writeBuffer(this.metrics, 0, new Int32Array(8));

    // escribir parámetros (dt = 0 inicialmente)
    this.writeParams(params, 0);

    // === Pipelines y bind groups ===
    const module = this.device.createShaderModule({ code: computeWGSL });

    this.pDensity = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'compute_density' }
    });
    this.pForce = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'compute_forces' }
    });
    this.pIntegrate = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'integrate' }
    });
    this.pCollide = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'collisions' }
    });

    // group(0): params + buffers
    const layout0 = this.pDensity.getBindGroupLayout(0);
    this.bg0 = this.device.createBindGroup({
      layout: layout0,
      entries: [
        { binding: 0, resource: { buffer: this.paramsUBO } },
        { binding: 1, resource: { buffer: this.posType } },
        { binding: 2, resource: { buffer: this.velMass } },
        { binding: 3, resource: { buffer: this.aux } },
        { binding: 4, resource: { buffer: this.accel } },
        { binding: 5, resource: { buffer: this.metrics } },
      ]
    });

    // group(1): BH (dummy, useBH=0)
    const layout1 = this.pDensity.getBindGroupLayout(1);
    this.bhNodesA = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_nodesA' });
    this.bhNodesB = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_nodesB' });
    this.bhChildren = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_children' });
    this.bhInfoUBO = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'bh_info' });
    // nodeCount=0, useBH=0
    this.device.queue.writeBuffer(this.bhInfoUBO, 0, new Uint32Array([0, 0, 0, 0]));

    this.bg1 = this.device.createBindGroup({
      layout: layout1,
      entries: [
        { binding: 0, resource: { buffer: this.bhNodesA } },
        { binding: 1, resource: { buffer: this.bhNodesB } },
        { binding: 2, resource: { buffer: this.bhChildren } },
        { binding: 3, resource: { buffer: this.bhInfoUBO } },
      ]
    });
  }

  // Acepta Partial<SimParams> porque solo usamos un subconjunto en el UBO
  public writeParams(params: Partial<SimParams> & Record<string, any>, dt: number) {
    // Empaqueta según struct SimParams del WGSL
    // Floats: G, eps, gamma, kpress, hKernel, nu, tau, dt,
    //         rhoThresh, vMax, theta, Mstar
    // U32:    enableGas, enableDrag, enableCollisions, pad
    const buf = new ArrayBuffer(16 * 4);
    const dv = new DataView(buf);
    let o = 0;
    dv.setFloat32(o, params.G ?? 0.006674, true); o += 4;
    dv.setFloat32(o, params.eps ?? 0.01, true);    o += 4;
    dv.setFloat32(o, params.gamma ?? 1.4, true);   o += 4;
    dv.setFloat32(o, params.kpress ?? 1.0, true);  o += 4;
    dv.setFloat32(o, params.hKernel ?? 0.08, true);o += 4;
    dv.setFloat32(o, params.nu ?? 0.05, true);     o += 4;
    dv.setFloat32(o, params.tau ?? 0.5, true);     o += 4;
    dv.setFloat32(o, dt ?? 0, true);               o += 4;
    dv.setFloat32(o, params.rhoThresh ?? 4.0, true);o += 4;
    dv.setFloat32(o, params.vMax ?? 8.0, true);     o += 4;
    dv.setFloat32(o, params.theta ?? 0.6, true);    o += 4;
    dv.setFloat32(o, params.Mstar ?? 1.0, true);    o += 4;
    dv.setUint32(o, params.enableGas ? 1 : 0, true);        o += 4;
    dv.setUint32(o, params.enableDrag ? 1 : 0, true);       o += 4;
    dv.setUint32(o, params.enableCollisions ? 1 : 0, true); o += 4;
    dv.setUint32(o, 0, true); o += 4;
    this.device.queue.writeBuffer(this.paramsUBO, 0, buf);
  }

  dispatch(encoder: GPUCommandEncoder) {
    if (!this.pDensity || !this.bg0) return; // no init aún
    const pass = encoder.beginComputePass();
    const groups = Math.max(1, Math.ceil(this.n / 256));

    pass.setBindGroup(0, this.bg0);
    if (this.bg1) pass.setBindGroup(1, this.bg1);

    pass.setPipeline(this.pDensity);   pass.dispatchWorkgroups(groups);
    pass.setPipeline(this.pForce);     pass.dispatchWorkgroups(groups);
    pass.setPipeline(this.pIntegrate); pass.dispatchWorkgroups(groups);
    // Colisiones (opcional): el WGSL respeta enableCollisions
    if (this.pCollide) { pass.setPipeline(this.pCollide); pass.dispatchWorkgroups(groups); }

    pass.end();
  }
}
