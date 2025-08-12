struct Camera {
  viewProj: mat4x4<f32>,
  pointSize: f32,
  pad0: vec3<f32>,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>; // pos.xyz + type in w
@group(0) @binding(2) var<storage, read> aux: array<vec4<f32>>; // density, pressure, alive, radius
@group(0) @binding(3) var<storage, read> vel_mass: array<vec4<f32>>; // vel.xyz + mass in w

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) size: f32,
  // Forward quad position to the fragment shader for circular sprite rendering
  @location(2) quadPos: vec2<f32>,
};

@vertex
fn vs_main(@builtin(instance_index) inst: u32, @location(0) quadPos: vec2<f32>) -> VSOut {
  let P = particles[inst];
  let A = aux[inst];
  var out: VSOut;
  // Billboard quad around particle position
  // Build a small quad in view space: we use point size scaled by radius (A.w)
  let s = camera.pointSize * max(0.7, A.w);
  // Use quadPos in NDC-ish local quad and then multiply
  // We'll offset in clip space approx by using viewProj * (pos + offset)
  // Simpler: pass size to FS and compute circle in fragment.
  out.pos = camera.viewProj * vec4<f32>(P.xyz, 1.0);
  // Color by type and maybe density
  let t = P.w;
  var col: vec3<f32>;
  if (t < 0.5) {
    // gas
    let dens = clamp(A.x * 0.5, 0.0, 1.0);
    col = mix(vec3<f32>(0.2,0.5,1.0), vec3<f32>(0.9,0.2,1.0), dens);
  } else if (t < 1.5) {
    // polvo/solido
    col = vec3<f32>(1.0, 0.8, 0.1);
  } else {
    // planetesimal/estrella
    col = vec3<f32>(1.0, 0.95, 0.6);
  }
  out.color = col;
  out.size = s;
  out.quadPos = quadPos;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {

  // Render a smooth circle sprite using quadPos in [-1,1]^2 generated in vertex buffer
  let r2 = dot(in.quadPos, in.quadPos);
  if (r2 > 1.0) {
    discard;
  }
  let alpha = smoothstep(1.0, 0.8, r2);
  return vec4<f32>(in.color, alpha);
}
