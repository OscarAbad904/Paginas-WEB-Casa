import { SimParams, ParticleInit } from './types';
import { createBuffer, PARTICLE_STRIDE } from './buffers';

const U_SIZE = 4*12; // 12 floats (48B)

export class Simulation {
  device: GPUDevice;
  pipelineDensity: GPUComputePipeline;
  pipelineForces: GPUComputePipeline;
  pipelineIntegrate: GPUComputePipeline;
  pipelineCollisions: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniform: GPUBuffer;
  posType: GPUBuffer;
  velMass: GPUBuffer;
  aux: GPUBuffer;
  accel: GPUBuffer;
  n: number;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async init(particles: Float32Array, velMass: Float32Array, aux: Float32Array, params: SimParams) {
    this.n = particles.length / 4;
    const module = this.device.createShaderModule({ code: await (await fetch('/src/compute.wgsl')).text() });

    // Buffers
    this.posType = createBuffer(this.device, particles.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'posType');
    this.velMass = createBuffer(this.device, velMass.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'velMass');
    this.aux = createBuffer(this.device, aux.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'aux');
    this.accel = createBuffer(this.device, this.n*4*4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'accel');
    this.uniform = createBuffer(this.device, U_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'uniform');

    this.device.queue.writeBuffer(this.posType, 0, particles);
    this.device.queue.writeBuffer(this.velMass, 0, velMass);
    this.device.queue.writeBuffer(this.aux, 0, aux);

    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelineDensity = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'compute_density' }});
    this.pipelineForces = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'compute_forces' }});
    this.pipelineIntegrate = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'integrate' }});
    this.pipelineCollisions = this.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'collisions' }});

    this.bindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform }},
        { binding: 1, resource: { buffer: this.posType }},
        { binding: 2, resource: { buffer: this.velMass }},
        { binding: 3, resource: { buffer: this.aux }},
        { binding: 4, resource: { buffer: this.accel }},
      ]
    });

    this.updateUniform(params, 0.005);
  }

  updateUniform(p: SimParams, dt: number) {
    const tmp = new Float32Array([
      p.G, p.eps, p.gamma, p.kpress,
      p.hKernel, p.nu, p.tau, dt,
      p.enableGas ? 1 : 0,
      p.enableDrag ? 1 : 0,
      p.enableCollisions ? 1 : 0,
      0
    ]);
    this.device.queue.writeBuffer(this.uniform, 0, tmp.buffer, tmp.byteOffset, tmp.byteLength);
  }

  dispatch(encoder: GPUCommandEncoder) {
    const wg = 256;
    const nWg = Math.ceil(this.n / wg);
    const pass1 = encoder.beginComputePass();
    pass1.setPipeline(this.pipelineDensity);
    pass1.setBindGroup(0, this.bindGroup);
    pass1.dispatchWorkgroups(nWg);
    pass1.end();

    const pass2 = encoder.beginComputePass();
    pass2.setPipeline(this.pipelineForces);
    pass2.setBindGroup(0, this.bindGroup);
    pass2.dispatchWorkgroups(nWg);
    pass2.end();

    const pass3 = encoder.beginComputePass();
    pass3.setPipeline(this.pipelineIntegrate);
    pass3.setBindGroup(0, this.bindGroup);
    pass3.dispatchWorkgroups(nWg);
    pass3.end();

    const pass4 = encoder.beginComputePass();
    pass4.setPipeline(this.pipelineCollisions);
    pass4.setBindGroup(0, this.bindGroup);
    pass4.dispatchWorkgroups(nWg);
    pass4.end();
  }
}
