
// particles_instanced_billboard.wgsl
// Render de partículas como QUADS instanciados (billboards) con tamaño en píxeles por masa.
// Sustituye tu VS/FS actual de point-list por este pipeline. Mantiene color por tipo opcional.
//
// Bind group 0 (sugerido):
//  @binding(0) view mat3x3<f32>  (mundo->clip 2D)
//  @binding(1) positions: array<vec2f>    (storage)
//  @binding(2) masses: array<f32>         (storage)
//  @binding(3) size uniforms              (uniform)   -> sizeScalePx, minPx, maxPx
//  @binding(4) viewport                   (uniform)   -> width, height
//  @binding(5) types: array<u32> (OPCIONAL) (storage) -> 0 gas, 1 polvo, 2 denso
//
// Habilita blending alpha en el pipeline para bordes suaves del sprite.
// draw(6, particleCount): 6 vértices por instancia (dos triángulos).
//
// Si no tienes buffer de types, define USE_TYPES = false (const más abajo).

struct ViewMat {
  m00: f32; m01: f32; m02: f32;
  m10: f32; m11: f32; m12: f32;
  m20: f32; m21: f32; m22: f32;
};
@group(0) @binding(0) var<uniform> uView : ViewMat;

@group(0) @binding(1) var<storage, read>  sPos   : array<vec2f>;
@group(0) @binding(2) var<storage, read>  sMass  : array<f32>;

struct SizeUniforms {
  sizeScalePx: f32;
  minPx: f32;
  maxPx: f32;
  _pad: f32;
};
@group(0) @binding(3) var<uniform> uSize : SizeUniforms;

struct Viewport {
  width: f32;
  height: f32;
  _pad0: f32;
  _pad1: f32;
};
@group(0) @binding(4) var<uniform> uVp : Viewport;

// Opcional: tipos
var<private> USE_TYPES: bool = true;
@group(0) @binding(5) var<storage, read>  sType  : array<u32>;

fn world_to_clip(p: vec2f) -> vec4f {
  let x = uView.m00 * p.x + uView.m01 * p.y + uView.m02;
  let y = uView.m10 * p.x + uView.m11 * p.y + uView.m12;
  // m20,m21,m22 en 2D los dejamos para traslación/1
  let w = uView.m20 * p.x + uView.m21 * p.y + uView.m22;
  return vec4f(x, y, 0.0, w);
}

// Masa -> tamaño en píxeles (diámetro) ~ masa^(1/3)
fn mass_to_px(mass: f32) -> f32 {
  let m = max(mass, 1e-6);
  let d = uSize.sizeScalePx * pow(m, 1.0/3.0);
  return clamp(d, uSize.minPx, uSize.maxPx);
}

// px -> delta clip (ancho y alto en NDC)
fn px_to_clip(px: f32) -> vec2f {
  return vec2f( 2.0 * px / uVp.width, 2.0 * px / uVp.height );
}

// UV del quad por vertex_index (dos triángulos)
fn quadUV(vid: u32) -> vec2f {
  // orden: ( -0.5,-0.5 ), ( 0.5,-0.5 ), ( 0.5, 0.5 ), ( -0.5,-0.5 ), ( 0.5, 0.5 ), ( -0.5, 0.5 )
  switch (vid) {
    case 0u: { return vec2f(-0.5, -0.5); }
    case 1u: { return vec2f( 0.5, -0.5); }
    case 2u: { return vec2f( 0.5,  0.5); }
    case 3u: { return vec2f(-0.5, -0.5); }
    case 4u: { return vec2f( 0.5,  0.5); }
    default:{ return vec2f(-0.5,  0.5); }
  }
}

struct VSOut {
  @builtin(position) pos: vec4f;
  @location(0) centerClip: vec2f;   // para calcular borde suave
  @location(1) halfClip: vec2f;     // mitad del tamaño en clip
  @location(2) color: vec3f;        // color base
};

fn type_to_color(t: u32) -> vec3f {
  // 0 gas (cian), 1 polvo (naranja), 2 denso (crema)
  if (t == 0u) { return vec3f(0.3, 0.9, 1.0); }
  if (t == 1u) { return vec3f(1.0, 0.6, 0.2); }
  return vec3f(1.0, 0.97, 0.85);
}

fn mass_to_color(m: f32) -> vec3f {
  // gradiente simple por masa si no hay tipo: oscuro->claro
  let t = clamp((log(max(m,1e-6)) + 10.0) / 10.0, 0.0, 1.0);
  return mix(vec3f(0.4,0.7,1.0), vec3f(1.0,0.95,0.6), t);
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32,
           @builtin(instance_index) iid: u32) -> VSOut {
  let p = sPos[iid];
  let m = sMass[iid];
  let center = world_to_clip(p);
  let sizePx = mass_to_px(m);
  let clipDelta = px_to_clip(sizePx);
  let uv = quadUV(vid);

  var out: VSOut;
  out.centerClip = center.xy / max(center.w, 1e-6);
  out.halfClip = 0.5 * clipDelta;
  let posClip = center + vec4f(uv.x * clipDelta.x, uv.y * clipDelta.y, 0.0, 0.0);
  out.pos = posClip;

  if (USE_TYPES) {
    let t = sType[iid];
    out.color = type_to_color(t);
  } else {
    out.color = mass_to_color(m);
  }
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  // Borde circular suave para que no se note el quad
  // Reconstruimos UV local en clip: pos actual vs centro
  let d = abs((in.pos.xy / in.pos.w) - in.centerClip) / max(in.halfClip, vec2f(1e-6));
  // distancia al borde del cuadrado; aproximamos círculo
  // usamos longitud en L2 en espacio normalizado (-0.5..0.5) -> aquí d es 0..1
  let r = length(d);
  let alpha = smoothstep(1.0, 0.85, r); // 0 fuera, 1 dentro con soft edge
  return vec4f(in.color, alpha);
}
