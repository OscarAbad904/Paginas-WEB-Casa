// Blur gaussiano separable (dir.x=1 horizontal, dir.y=1 vertical).

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var src  : texture_2d<f32>;
struct Blur {
  dir: vec2<f32>,
};
@group(0) @binding(2) var<uniform> u : Blur;

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
  let texSize = vec2<f32>(textureDimensions(src));
  let uv = frag.xy / texSize;
  let px = 1.0 / texSize;
  let offsets = array<f32,5>(-2.0, -1.0, 0.0, 1.0, 2.0);
  let weights = array<f32,5>(0.06136, 0.24477, 0.38774, 0.24477, 0.06136);

  var col = vec3<f32>(0.0);
  for (var i = 0u; i < 5u; i++) {
    let o = offsets[i] * (u.dir * px);
    col += weights[i] * textureSampleLevel(src, samp, uv + o, 0.0).rgb;
  }
  return vec4<f32>(col, 1.0);
}
