// src/main.ts

// NOTA: evita tipar rígidamente "SimParams" aquí para no chocar con tu interfaz previa.
// Si lo necesitas, crea una interfaz local o usa "as const".

type Mat4 = number[]; // tu tipo actual; lo convertimos a Float32Array al escribir

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("No se encontró un <canvas> en el documento.");

let device: GPUDevice;
let context: GPUCanvasContext;
let format: GPUTextureFormat;

let renderPipeline: GPURenderPipeline;
let computePipeline: GPUComputePipeline;

// ==== Buffers / Texturas / Sampler ====
let computeUniform: GPUBuffer;     // 64 bytes (uniform) - esperado por compute @binding(0)
let storageA: GPUBuffer;           // storage - @binding(1)
let storageB: GPUBuffer;           // storage - @binding(2)
let storageC: GPUBuffer;           // storage - @binding(3)

let drawSampler: GPUSampler;       // fragment @binding(0)
let drawTexture: GPUTexture;       // fragment @binding(1)
let drawTextureView: GPUTextureView;
let drawUniform: GPUBuffer;        // 8 bytes (uniform) - fragment @binding(2)

let computeBindGroup: GPUBindGroup;
let fragmentBindGroup: GPUBindGroup;

let isRunning = false;
let frameHandle = 0;

// ====== Shaders embebidos (ajusta si prefieres .wgsl externos) ======
const DRAW_WGSL = /* wgsl */`
struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var out: VSOut;
  out.pos = vec4<f32>(pos[vi], 0.0, 1.0);
  out.uv = uv[vi];
  return out;
}

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex  : texture_2d<f32>;

struct DrawUniforms {
  pointSize : f32,   // no usado aquí, pero reservado
  aspect    : f32,
};

@group(0) @binding(2) var<uniform> draw : DrawUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(tex, samp, in.uv);
  return vec4<f32>(color.rgb, 1.0);
}
`;

const COMPUTE_WGSL = /* wgsl */`
struct ComputeUniforms {
  mvp : mat4x4<f32>,   // 64 bytes
};

@group(0) @binding(0) var<uniform> U : ComputeUniforms;
@group(0) @binding(1) var<storage, read_write> A : array<f32>;
@group(0) @binding(2) var<storage, read_write> B : array<f32>;
@group(0) @binding(3) var<storage, read_write> C : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i < arrayLength(&A)) {
    let f = f32(i) * 0.001;
    A[i] = f;
    B[i] = f * 2.0;
    C[i] = A[i] + B[i];
  }
}
`;

// ====== Init WebGPU ======
async function init() {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU no soportado por el navegador.");
  }
  const adapter = await (navigator as any).gpu.requestAdapter();
  if (!adapter) throw new Error("No se pudo obtener un adapter WebGPU.");
  device = await adapter.requestDevice();

  context = canvas.getContext("webgpu") as unknown as GPUCanvasContext;
  format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: "opaque"
  });

  // ===== Recursos de compute =====
  // Uniform de 64 bytes (mat4x4<f32>)
  computeUniform = device.createBuffer({
    label: "compute-ubo-64B",
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // Tres storage buffers (mín 16B según tus errores): creamos N floats
  const N = 1024;
  const byteLen = N * 4;
  storageA = device.createBuffer({
    label: "storageA",
    size: byteLen,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  storageB = device.createBuffer({
    label: "storageB",
    size: byteLen,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  storageC = device.createBuffer({
    label: "storageC",
    size: byteLen,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });

  // ===== Recursos de fragmento =====
  drawSampler = device.createSampler({
    label: "draw-sampler",
    magFilter: "linear",
    minFilter: "linear"
  });

  drawTexture = device.createTexture({
    label: "draw-texture",
    size: { width: 256, height: 256 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  drawTextureView = drawTexture.createView();

  // Rellenar la textura con un degradado simple
  {
    const w = 256, h = 256;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i + 0] = x;         // R
        data[i + 1] = y;         // G
        data[i + 2] = 255 - x;   // B
        data[i + 3] = 255;       // A
      }
    }
    device.queue.writeTexture(
      { texture: drawTexture },
      data,
      { bytesPerRow: w * 4 },
      { width: w, height: h }
    );
  }

  drawUniform = device.createBuffer({
    label: "draw-ubo-8B",
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // ===== Pipelines =====
  // Compute
  {
    const module = device.createShaderModule({ code: COMPUTE_WGSL });

    const computeBGL = device.createBindGroupLayout({
      label: "compute-bgl",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE,  buffer: { type: "uniform", minBindingSize: 64 } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE,  buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE,  buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE,  buffer: { type: "storage" } }
      ]
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "compute-pipeline-layout",
      bindGroupLayouts: [computeBGL]
    });

    computePipeline = device.createComputePipeline({
      label: "compute-pipeline",
      layout: pipelineLayout,
      compute: { module, entryPoint: "main" }
    });

    computeBindGroup = device.createBindGroup({
      label: "compute-bg",
      layout: computeBGL,
      entries: [
        { binding: 0, resource: { buffer: computeUniform } },
        { binding: 1, resource: { buffer: storageA } },
        { binding: 2, resource: { buffer: storageB } },
        { binding: 3, resource: { buffer: storageC } }
      ]
    });
  }

  // Render (fragment con sampler + texture + uniform 8B)
  {
    const module = device.createShaderModule({ code: DRAW_WGSL });

    const fragBGL = device.createBindGroupLayout({
      label: "frag-bgl",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 8 } }
      ]
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "render-pipeline-layout",
      bindGroupLayouts: [fragBGL]
    });

    renderPipeline = device.createRenderPipeline({
      label: "render-pipeline",
      layout: pipelineLayout,
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-list" }
    });

    fragmentBindGroup = device.createBindGroup({
      label: "frag-bg",
      layout: fragBGL,
      entries: [
        { binding: 0, resource: drawSampler },
        { binding: 1, resource: drawTextureView },
        { binding: 2, resource: { buffer: drawUniform } }
      ]
    });
  }

  // ===== Escribir uniformes iniciales =====
  // Convertir Mat4 (number[]) a Float32Array antes de escribir:
  const mvp: Mat4 = [
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ];
  device.queue.writeBuffer(computeUniform, 0, new Float32Array(mvp));

  const aspect = canvas.width > 0 ? canvas.width / canvas.height : 1;
  const drawData = new Float32Array([1.0, aspect]); // pointSize, aspect
  device.queue.writeBuffer(drawUniform, 0, drawData);

  // ===== Botones (opcionales) =====
  document.getElementById("btnStart")?.addEventListener("click", start);
  document.getElementById("btnStop")?.addEventListener("click", stop);
  document.getElementById("btnReset")?.addEventListener("click", resetSim);
}

function encodeFrame(commandEncoder: GPUCommandEncoder) {
  // Pass de compute
  const cpass = commandEncoder.beginComputePass({ label: "compute-pass" });
  cpass.setPipeline(computePipeline);
  cpass.setBindGroup(0, computeBindGroup);
  const N = 1024;
  const workgroupSize = 64;
  const groups = Math.ceil(N / workgroupSize);
  cpass.dispatchWorkgroups(groups);
  cpass.end();

  // Pass de render
  const textureView = context.getCurrentTexture().createView();
  const rpass = commandEncoder.beginRenderPass({
    label: "render-pass",
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });
  rpass.setPipeline(renderPipeline);
  rpass.setBindGroup(0, fragmentBindGroup);
  rpass.draw(6, 1, 0, 0);
  rpass.end();
}

function frame() {
  if (!isRunning) return;
  const encoder = device.createCommandEncoder({ label: "main-encoder" });
  encodeFrame(encoder);
  device.queue.submit([encoder.finish()]);
  frameHandle = requestAnimationFrame(frame);
}

function start() {
  if (isRunning) return;
  isRunning = true;
  frame();
}

function stop() {
  isRunning = false;
  if (frameHandle) cancelAnimationFrame(frameHandle);
}

function resetSim() {
  stop();
  // Reinicializa buffers si quieres; aquí vaciamos storageC:
  const zeroes = new Float32Array(1024);
  device.queue.writeBuffer(storageC, 0, zeroes);
}

init().catch(err => {
  console.error(err);
  alert(err?.message ?? err);
});
