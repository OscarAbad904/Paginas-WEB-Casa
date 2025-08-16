
// pipeline_particles_instanced.ts
// Helpers para crear pipeline y bind group del shader de billboards instanciados.
// Acomoda tus nombres de buffers y group/binding a los del WGSL adjunto.

export interface ParticlePipelineDeps {
  device: GPUDevice;
  format: GPUTextureFormat;
  shaderCode: string; // contenido de particles_instanced_billboard.wgsl
}

export function createParticlesPipeline(deps: ParticlePipelineDeps) {
  const { device, format, shaderCode } = deps;
  const module = device.createShaderModule({ code: shaderCode });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [], // no hace falta VB: usamos vertex_index para el quad y instance_index para partícula
    },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        }
      }]
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' }
  });

  return { pipeline, module };
}

// Crea buffers de uniformes para tamaños y viewport
export function createSizeUniformBuffer(device: GPUDevice, sizeScalePx=3.5, minPx=2.0, maxPx=28.0) {
  const buf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const data = new Float32Array([sizeScalePx, minPx, maxPx, 0]);
  device.queue.writeBuffer(buf, 0, data.buffer);
  return buf;
}

export function createViewportBuffer(device: GPUDevice, width: number, height: number) {
  const buf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const data = new Float32Array([width, height, 0, 0]);
  device.queue.writeBuffer(buf, 0, data.buffer);
  return buf;
}

// Actualiza el viewport en resize
export function writeViewport(device: GPUDevice, buf: GPUBuffer, width: number, height: number) {
  const data = new Float32Array([width, height, 0, 0]);
  device.queue.writeBuffer(buf, 0, data.buffer);
}

// Crea bind group. Ajusta bindings si cambiaste índices en WGSL.
export function createParticlesBindGroup(device: GPUDevice, pipeline: GPURenderPipeline, viewBuf: GPUBuffer, posSSBO: GPUBuffer, massSSBO: GPUBuffer, sizeUBO: GPUBuffer, vpUBO: GPUBuffer, typeSSBO?: GPUBuffer) {
  const layout = pipeline.getBindGroupLayout(0);
  const entries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer: viewBuf } },
    { binding: 1, resource: { buffer: posSSBO } },
    { binding: 2, resource: { buffer: massSSBO } },
    { binding: 3, resource: { buffer: sizeUBO } },
    { binding: 4, resource: { buffer: vpUBO } },
  ];
  if (typeSSBO) entries.push({ binding: 5, resource: { buffer: typeSSBO } });
  return device.createBindGroup({ layout, entries });
}

// Dibujo: draw(6, particleCount)
export function drawParticles(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline, bindGroup: GPUBindGroup, particleCount: number) {
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, particleCount, 0, 0);
}
