
export class Renderer {
  device: GPUDevice;
  format: GPUTextureFormat;
  pipeline!: GPURenderPipeline;
  cameraBuf!: GPUBuffer;
  bindGroup!: GPUBindGroup;
  vertexBuf!: GPUBuffer;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
  }

  async init(particlesBuf: GPUBuffer, auxBuf: GPUBuffer, velMassBuf: GPUBuffer) {
    const module = this.device.createShaderModule({ code: await (await fetch('/src/render.wgsl')).text() });

    const quad = new Float32Array([
      -1,-1,  1,-1,  -1, 1,
      -1, 1,  1,-1,   1, 1
    ]);
    this.vertexBuf = this.device.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.vertexBuf, 0, quad);

    this.cameraBuf = this.device.createBuffer({ size: 64+64+16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' }},
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' }},
        { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' }},
      ]
    });

    this.bindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuf }},
        { binding: 1, resource: { buffer: particlesBuf }},
        { binding: 2, resource: { buffer: auxBuf }},
        { binding: 3, resource: { buffer: velMassBuf }},
      ]
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: 'vs_main', buffers: [{ arrayStride: 2*4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]}] },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }]},
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
  }

  writeCamera(view: Float32Array, proj: Float32Array, pointSizePx: number, maxPointPx: number, viewport: [number, number]) {
    const buf = new Float32Array(16 + 16 + 4);
    buf.set(view, 0);
    buf.set(proj, 16);
    buf[32] = pointSizePx;
    buf[33] = maxPointPx;
    buf[34] = viewport[0];
    buf[35] = viewport[1];
    this.device.queue.writeBuffer(this.cameraBuf, 0, buf.buffer, 0, buf.byteLength);
  }

  frame(encoder: GPUCommandEncoder, colorView: GPUTextureView, nInstances: number) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: colorView, clearValue: { r: 0.05, g: 0.07, b: 0.11, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuf);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, nInstances);
    pass.end();
  }

    resize(width: number, height: number) {
      // Método vacío para compatibilidad. Implementar si es necesario.
    }
}
