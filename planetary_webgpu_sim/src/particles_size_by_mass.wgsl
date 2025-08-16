
// particles_size_by_mass.wgsl
// Helper para mapear masa -> tamaño de sprite en píxeles.
// Úsalo en tu VS/FS donde calculas el tamaño visible del "billboard".
// Nota: WebGPU no soporta cambiar point size nativo en todos los navegadores.
// Para tamaños variables consistentes, renderiza partículas como QUADS instanciados (billboards)
// y usa esta función para escalar el quad en clip-space proporcional al tamaño en píxeles.

struct SizeUniforms {
  sizeScalePx: f32;   // escala base en px (p.ej. 3.5)
  minPx: f32;         // tamaño mínimo px (p.ej. 2.0)
  maxPx: f32;         // tamaño máximo px (p.ej. 28.0)
  _pad: f32;
};
@group(0) @binding(3) var<uniform> uSize : SizeUniforms;

// Convierte masa -> diámetro (px) aproximadamente proporcional al radio (masa^(1/3))
fn mass_to_px(mass: f32) -> f32 {
  // Protege contra masas 0
  let m = max(mass, 1e-6);
  // Radio ~ cbrt(m)
  let d = uSize.sizeScalePx * pow(m, 1.0/3.0);
  return clamp(d, uSize.minPx, uSize.maxPx);
}

// Si dibujas QUADS instanciados centrados en la posición, para transformar de mundo->clip
// y luego expandir a pantalla, necesitarás el tamaño en NDC (clip-space).
// Convierte px -> delta clip. Requiere viewport (ancho/alto) en uniform.
struct Viewport {
  width: f32;
  height: f32;
  _pad0: f32;
  _pad1: f32;
};
@group(0) @binding(4) var<uniform> uViewport : Viewport;

// px en clip: 2*px/width (x), 2*px/height (y)
fn px_to_clip(px: f32) -> vec2f {
  return vec2f( 2.0 * px / uViewport.width, 2.0 * px / uViewport.height );
}

// Ejemplo de uso en VS de quad billboard:
// - v_center_clip: centro de la partícula ya transformado a clip-space
// - quadUV: (-0.5..0.5) por vértice del quad
// let sizePx = mass_to_px(p.mass);
// let clipDelta = px_to_clip(sizePx);
// let pos = v_center_clip + vec4f(quadUV.x * clipDelta.x, quadUV.y * clipDelta.y, 0.0, 0.0);
