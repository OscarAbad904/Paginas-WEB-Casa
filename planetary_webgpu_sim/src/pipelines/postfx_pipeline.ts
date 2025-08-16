
// pipelines/postfx_pipeline.ts
export function createFullscreenPipeline(device: GPUDevice, format: GPUTextureFormat, code: string, fragEntry: string = 'fs_main') {
  const module = device.createShaderModule({ code });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: fragEntry, targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }
  });
  return { pipeline, module };
}
export function createSampler(device: GPUDevice) {
  return device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
}
export function createUniform(device: GPUDevice, size: number, data?: ArrayBufferView) {
  const buf = device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  if (data) device.queue.writeBuffer(buf, 0, data.buffer);
  return buf;
}
