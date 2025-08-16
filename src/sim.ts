import { SimParams, ParticleInit } from './types';
import { createBuffer, PARTICLE_STRIDE } from './buffers';
import computeShader from './compute.wgsl?raw';

/// <reference types="@webgpu/types" />

const U_SIZE = 4*17; // added thetaBH

export class Simulation {
  device: GPUDevice;
  pipelineDensity!: GPUComputePipeline;
  pipelineForces!: GPUComputePipeline;
  pipelineIntegrate!: GPUComputePipeline;
  pipelineCollisions!: GPUComputePipeline;
  pipelineClassify!: GPUComputePipeline;
  bindGroup!: GPUBindGroup;
  metricsBuf!: GPUBuffer;
  uniform!: GPUBuffer;
  posType!: GPUBuffer;
  velMass!: GPUBuffer;
  aux!: GPUBuffer;
  accel!: GPUBuffer;
  bhInfo?: GPUBuffer;
  bhNodesA!: GPUBuffer;
  bhNodesB!: GPUBuffer;
  bhChildren!: GPUBuffer;
  bhBindGroup!: GPUBindGroup;
  n!: number;
  params!: SimParams;
  frameCount: number = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async init(particles: Float32Array, velMass: Float32Array, aux: Float32Array, params: SimParams) {
    this.n = particles.length / 4;
    const module = this.device.createShaderModule({ code: computeShader });

    // Buffers
    this.posType = createBuffer(this.device, particles.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'posType');
    this.velMass = createBuffer(this.device, velMass.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'velMass');
    this.aux = createBuffer(this.device, aux.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'aux');
    this.accel = createBuffer(this.device, this.n*4*4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'accel');
  this.metricsBuf = createBuffer(this.device, 4*8, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'metrics');
    this.uniform = createBuffer(this.device, U_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'uniform');

    this.device.queue.writeBuffer(this.posType, 0, particles.slice().buffer);
    this.device.queue.writeBuffer(this.velMass, 0, velMass.slice().buffer);
    this.device.queue.writeBuffer(this.aux, 0, aux.slice().buffer);

    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    });

    const bhLayout = this.device.createBindGroupLayout({ entries: [
      { binding:0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ]});
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout, bhLayout] });
    // Placeholder BH buffers and bind group (so group(1) is always set)
    if (!this.bhInfo) {
      this.bhInfo = createBuffer(this.device, 8, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'bh_info');
      this.device.queue.writeBuffer(this.bhInfo, 0, new Uint32Array([0, 0]).buffer);
    }
    const _bhNodesA = createBuffer(this.device, 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'bh_nodesA');
    this.bhNodesA = _bhNodesA;
    const _bhNodesB = createBuffer(this.device, 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'bh_nodesB');
    this.bhNodesB = _bhNodesB;
    const _bhChildren = createBuffer(this.device, 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'bh_children');
    this.bhChildren = _bhChildren;
    this.bhBindGroup = this.device.createBindGroup({
      layout: bhLayout,
      entries: [
        { binding:0, resource: { buffer: _bhNodesA } },
        { binding:1, resource: { buffer: _bhNodesB } },
        { binding:2, resource: { buffer: _bhChildren } },
        { binding:3, resource: { buffer: this.bhInfo } },
      ]
    });

  this.pipelineDensity = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'compute_density' }});
  this.pipelineForces = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'compute_forces' }});
  this.pipelineIntegrate = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'integrate' }});
  this.pipelineCollisions = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'collisions' }});
  this.pipelineClassify = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'classify_planetesimals' }});

    this.bindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform }},
        { binding: 1, resource: { buffer: this.posType }},
        { binding: 2, resource: { buffer: this.velMass }},
        { binding: 3, resource: { buffer: this.aux }},
        { binding: 4, resource: { buffer: this.accel }},
        { binding: 5, resource: { buffer: this.metricsBuf } },
      ]
    });

    this.updateUniform(params, 0.005);
  }

  updateUniform(p: SimParams, dt: number) {
    const tmp = new Float32Array([
      p.G, p.eps, p.gamma, p.kpress,
      p.hKernel, p.nu, p.tau, dt,
      p.rhoThresh, p.vMax, p.theta, p.Mstar,
      p.enableGas ? 1 : 0,
      p.enableDrag ? 1 : 0,
      p.enableCollisions ? 1 : 0,
      0 // pad
    ]);
    this.device.queue.writeBuffer(this.uniform, 0, tmp.buffer, tmp.byteOffset, tmp.byteLength);
    this.params = p;
  }


  setBH(nodesA: GPUBuffer, nodesB: GPUBuffer, children: GPUBuffer, useBH: boolean, nodeCount: number) {
    if (!this.bhInfo) {
      this.bhInfo = createBuffer(this.device, 8, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'bh_info');
    }
    this.device.queue.writeBuffer(this.bhInfo, 0, new Uint32Array([nodeCount, useBH?1:0]).buffer);
    this.bhNodesA = nodesA; this.bhNodesB = nodesB; this.bhChildren = children;
    const layout = this.device.createBindGroupLayout({ entries: [
      { binding:0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding:3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ]});
    this.bhBindGroup = this.device.createBindGroup({ layout, entries: [
      { binding:0, resource: { buffer: nodesA } },
      { binding:1, resource: { buffer: nodesB } },
      { binding:2, resource: { buffer: children } },
      { binding:3, resource: { buffer: this.bhInfo } },
    ]});
  }

  dispatch(encoder: GPUCommandEncoder) {

    const wg = 256;
    const nWg = Math.ceil(this.n / wg);
    // clear metrics buffer
    const zero = new Int32Array(8); this.device.queue.writeBuffer(this.metricsBuf, 0, zero);
    const pass1 = encoder.beginComputePass();
    pass1.setPipeline(this.pipelineDensity);
    pass1.setBindGroup(0, this.bindGroup);
    pass1.setBindGroup(1, this.bhBindGroup);
    pass1.dispatchWorkgroups(nWg);
    pass1.end();

    const pass2 = encoder.beginComputePass();
    pass2.setPipeline(this.pipelineForces);
    pass2.setBindGroup(0, this.bindGroup);
    pass2.setBindGroup(1, this.bhBindGroup);
    pass2.dispatchWorkgroups(nWg);
    pass2.end();

    const pass3 = encoder.beginComputePass();
    pass3.setPipeline(this.pipelineIntegrate);
    pass3.setBindGroup(0, this.bindGroup);
    pass3.setBindGroup(1, this.bhBindGroup);
    pass3.dispatchWorkgroups(nWg);
    pass3.end();

    if ((this.params.enableCollisions) && (this.frameCount % Math.max(1, this.params.collisionsEvery|0) === 0)) {
    const pass4 = encoder.beginComputePass();
    pass4.setPipeline(this.pipelineCollisions);
    pass4.setBindGroup(0, this.bindGroup);
    pass4.setBindGroup(1, this.bhBindGroup);
    pass4.dispatchWorkgroups(nWg);
    pass4.end();
  }

  const pass5 = encoder.beginComputePass();
  pass5.setPipeline(this.pipelineClassify);
  pass5.setBindGroup(0, this.bindGroup);
  pass5.setBindGroup(1, this.bhBindGroup);
  pass5.dispatchWorkgroups(nWg);
  pass5.end();
  this.frameCount++;
  }
}
