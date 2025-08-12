import { PARTICLE_STRIDE } from './buffers';

export class Renderer {
  device: GPUDevice;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  cameraBuf: GPUBuffer;
  bindGroup: GPUBindGroup;
  vertexBuf: GPUBuffer;
  depthTex: GPUTexture;
  depthView: GPUTextureView;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
  }

  async init(particlesBuf: GPUBuffer, auxBuf: GPUBuffer, velMassBuf: GPUBuffer) {
    const module = this.device.createShaderModule({ code: await (await fetch('/src/render.wgsl')).text() });

    // Fullscreen quad for billboard (we'll instance it per particle)
    const quad = new Float32Array([
      -1,-1,  1,-1,  -1, 1,
      -1, 1,  1,-1,   1, 1
    ]);
    this.vertexBuf = this.device.createBuffer({
      size: quad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.vertexBuf, 0, quad);

    // Camera buffer
    this.cameraBuf = this.device.createBuffer({
      size: 16*4*4 + 4*4, // mat4 + pointSize + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

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
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          { arrayStride: 2*4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]}
        ]
      },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' , operation: 'add'}, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'} } }]},
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.resizeDepth(1280, 720);
  }

  resizeDepth(w: number, h: number) {
    if (this.depthTex) this.depthTex.destroy();
    this.depthTex = this.device.createTexture({
      size: { width: w, height: h },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.depthView = this.depthTex.createView();
  }

  frame(encoder: GPUCommandEncoder, colorView: GPUTextureView, nInstances: number, viewProj: Float32Array, pointSize: number) {
    this.device.queue.writeBuffer(this.cameraBuf, 0, viewProj.buffer, viewProj.byteOffset, viewProj.byteLength);
    const tmp = new Float32Array(16+4);
    tmp.set(viewProj, 0);
    tmp[16] = pointSize;
    this.device.queue.writeBuffer(this.cameraBuf, 0, tmp.buffer, 0, (16+4)*4);

    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: 0.05, g: 0.07, b: 0.11, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuf);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, nInstances);
    pass.end();
  }
}
