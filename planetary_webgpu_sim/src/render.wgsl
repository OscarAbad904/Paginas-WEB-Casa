
struct Camera {
view: mat4x4<f32>,
proj: mat4x4<f32>,
pointSize: f32,
maxPointPx: f32,
viewport: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> aux: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> vel_mass: array<vec4<f32>>;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) quad: vec2<f32>,
};

@vertex
fn vs_main(@builtin(instance_index) inst: u32, @location(0) quadPos: vec2<f32>) -> VSOut {
  let P = particles[inst];
  let A = aux[inst];
  var posWorld = P.xyz;
  if (A.z < 0.5) { posWorld = vec3<f32>(1e9,1e9,1e9); }

  var posView = (camera.view * vec4<f32>(posWorld, 1.0)).xyz;

  let r_px = clamp(camera.pointSize * max(0.6, A.w), 1.0, camera.maxPointPx);

  let f = camera.proj[1][1];
  let m00 = camera.proj[0][0];
  let aspect = f / m00;
  let z = -posView.z;
  let dx_view = (2.0 * r_px * quadPos.x / camera.viewport.x) * z * (aspect / f);
  let dy_view = (2.0 * r_px * quadPos.y / camera.viewport.y) * z * (1.0 / f);
  posView.x += dx_view;
  posView.y += dy_view;

  var out: VSOut;
  out.pos = camera.proj * vec4<f32>(posView, 1.0);

  let t = P.w;
  var col: vec3<f32>;
  if (t < 0.5) {
    let dens = clamp(A.x * 0.5, 0.0, 1.0);
    col = mix(vec3<f32>(0.2,0.5,1.0), vec3<f32>(0.9,0.2,1.0), dens);
  } else if (t < 1.5) {
    col = vec3<f32>(1.0, 0.8, 0.1);
  } else {
    col = vec3<f32>(1.0, 0.95, 0.6);
  }
  out.color = col;
  out.quad = quadPos;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.quad, in.quad);
  if (r2 > 1.0) { discard; }
  let alpha = smoothstep(1.0, 0.7, r2);
  return vec4<f32>(in.color, alpha);
}
