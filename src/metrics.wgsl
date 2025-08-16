
struct SimParams {
  G: f32; eps: f32; gamma: f32; kpress: f32;
  hKernel: f32; nu: f32; tau: f32; dt: f32;
  rhoThresh: f32; vMax: f32; enableGas: u32; enableDrag: u32;
  enableCollisions: u32; pad: u32;
};
@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> pos_type: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> vel_mass: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> aux: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> accel: array<vec4<f32>>; // w = phi_i
// output: 8 int slots -> we store floats scaled by 1e6 for K,U,Lx,Ly,Lz; integers raw for counts
@group(0) @binding(5) var<storage, read_write> metricsOut: array<atomic<i32>>;

fn f2i(x: f32) -> i32 { return i32(round(x * 1e6)); }

@compute @workgroup_size(256)
fn reduce_metrics(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; } // muerto no cuenta
  let m = vel_mass[i].w;
  let v = vel_mass[i].xyz;
  let r = pos_type[i].xyz;
  let K = 0.5 * m * dot(v, v);
  let phi = accel[i].w; // negativo
  let U = 0.5 * m * phi;

  let L = m * cross(r, v);

  // Acumular atómicamente
  atomicAdd(&metricsOut[0], f2i(K));
  atomicAdd(&metricsOut[1], f2i(U));
  atomicAdd(&metricsOut[2], f2i(L.x));
  atomicAdd(&metricsOut[3], f2i(L.y));
  atomicAdd(&metricsOut[4], f2i(L.z));
  // metricsOut[5] se usa para contar planetesimales en classify pass
  atomicAdd(&metricsOut[6], 1); // alive count
  atomicAdd(&metricsOut[7], f2i(m)); // total mass
}
