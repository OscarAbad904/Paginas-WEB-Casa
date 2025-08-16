// Compone escena + bloom y aplica tonemapping ACES (texture_2d<f32>).

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var scene : texture_2d<f32>;
@group(0) @binding(2) var bloom : texture_2d<f32>;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp( (x*(a*x+b))/(x*(c*x+d)+e), vec3<f32>(0.0), vec3<f32>(1.0) );
}

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
  let size = vec2<f32>(textureDimensions(scene));
  let uv = frag.xy / size;
  let col = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let glow = textureSampleLevel(bloom, samp, uv, 0.0).rgb;
  let outc = aces(col + glow);
  return vec4<f32>(outc, 1.0);
}
