// Extrae altas luces (threshold suave). Usa texture_2d<f32> para compatibilidad.

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var src  : texture_2d<f32>;

struct Push {
  threshold: f32,
  knee: f32,
};
@group(0) @binding(2) var<uniform> u : Push;

@vertex
fn vs_main(@builtin(vertex_index) vid:u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  return vec4<f32>(p[vid], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(textureDimensions(src));
  let uv = frag.xy / size;
  let c = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let l = max(max(c.r, c.g), c.b);
  let t = u.threshold;
  let k = u.knee * t + 1e-4;
  let soft = clamp((l - t + k) / (2.0 * k), 0.0, 1.0);
  let bright = max(l - t, 0.0) + soft;
  return vec4<f32>(c * bright, 1.0);
}
