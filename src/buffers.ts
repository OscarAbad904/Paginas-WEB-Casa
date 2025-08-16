export const BYTES = {
  f32: 4,
  u32: 4,
};

// Estructura alineada a 16 bytes por WGSL std430
// struct Particle {
//   pos: vec4<f32>; // xyz + type
//   vel: vec4<f32>; // xyz + mass
//   aux: vec4<f32>; // density, pressure, alive, radius
// }
export const PARTICLE_STRIDE = 16 * 3; // 48 bytes

export function createBuffer(device: GPUDevice, size: number, usage: GPUBufferUsageFlags, label?: string) {
  const buf = device.createBuffer({ size, usage, label });
  return buf;
}
