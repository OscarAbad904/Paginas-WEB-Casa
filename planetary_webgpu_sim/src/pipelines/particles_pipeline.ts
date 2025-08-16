// src/pipelines/particles_pipeline.ts

// Devuelve pipeline + bind group; el resto de buffers extra se conservan por compatibilidad
export function createParticlesPipeline(
  device: GPUDevice,
  paramsUBO: GPUBuffer,       // uniform 64B
  posBuffer: GPUBuffer,       // storage
  velMass: GPUBuffer,         // storage (ARGUMENTO QUE FALTABA)
  auxBuffer: GPUBuffer,       // storage
  _gridBuffer?: GPUBuffer,    // no usado en este layout
  _dtBuffer?: GPUBuffer,      // no usado en este layout
  _gridParamsUBO?: GPUBuffer, // no usado en este layout
  _rngStateBuffer?: GPUBuffer // no usado en este layout
) {
  const module = device.createShaderModule({
    code: /* wgsl */`
struct ComputeUniforms { mvp : mat4x4<f32>; };
@group(0) @binding(0) var<uniform> U : ComputeUniforms;
@group(0) @binding(1) var<storage, read_write> A : array<f32>;
@group(0) @binding(2) var<storage, read_write> B : array<f32>;
@group(0) @binding(3) var<storage, read_write> C : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i < arrayLength(&A)) {
    let f = f32(i) * 0.001;
    A[i] = f;
    B[i] = f * 2.0;
    C[i] = A[i] + B[i];
  }
}`
  });

  const bgl = device.createBindGroupLayout({
    label: "particles-compute-bgl",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", minBindingSize: 64 } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  });

  const layout = device.createPipelineLayout({
    label: "particles-compute-layout",
    bindGroupLayouts: [bgl]
  });

  const pipeline = device.createComputePipeline({
    label: "particles-compute-pipeline",
    layout,
    compute: { module, entryPoint: "main" }
  });

  const bindGroup = device.createBindGroup({
    label: "particles-compute-bg",
    layout: bgl,
    entries: [
      { binding: 0, resource: { buffer: paramsUBO } },
      { binding: 1, resource: { buffer: posBuffer } },
      { binding: 2, resource: { buffer: velMass } },  // <-- ahora sí se pasa velMass
      { binding: 3, resource: { buffer: auxBuffer } }
    ]
  });

  return { pipeline, bindGroup };
}
