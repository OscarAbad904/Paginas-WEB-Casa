// Billboards con gauss, halos, trails y color-modes (compatible WGSL estricto).

// ===== Bindings grupo(0) =====
// 0: uniform VP { view, proj }
// 1: storage sPosType  : array<vec4<f32>>   // xyz pos, w = type (0 gas,1 polvo,2 denso)
// 2: storage sVelMass  : array<vec4<f32>>   // xyz vel, w = mass
// 3: storage sAux      : array<vec4<f32>>   // z = alive (>0.5), x=density opcional
// 4: uniform SizeU     { sizeScalePx, minPx, maxPx }
// 5: uniform ViewportU { width, height }
// 6: uniform Params    { colorMode,trails,halos,gasAddFactor,massPlanet,sigma,haloIntensity }

struct VP {
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uVP : VP;

@group(0) @binding(1) var<storage, read> sPosType : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> sVelMass : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> sAux     : array<vec4<f32>>;

struct SizeU {
  sizeScalePx: f32,
  minPx: f32,
  maxPx: f32,
  _pad: f32,
};
@group(0) @binding(4) var<uniform> uSize : SizeU;

struct ViewportU {
  width: f32,
  height: f32,
  _p0: f32,
  _p1: f32,
};
@group(0) @binding(5) var<uniform> uVPx : ViewportU;

struct Params {
  colorMode: u32,
  trails: u32,
  halos: u32,
  _pad0: u32,
  gasAddFactor: f32,
  massPlanet: f32,
  sigma: f32,
  haloIntensity: f32,
};
@group(0) @binding(6) var<uniform> uParams : Params;

// ========= utils =========
fn mass_to_px(mass: f32) -> f32 {
  let m = max(mass, 1e-6);
  let d = uSize.sizeScalePx * pow(m, 1.0/3.0);
  return clamp(d, uSize.minPx, uSize.maxPx);
}
fn px_to_clip(px: f32) -> vec2<f32> {
  return vec2<f32>( 2.0 * px / uVPx.width, 2.0 * px / uVPx.height );
}
fn world_to_clip(p: vec3<f32>) -> vec4<f32> {
  return uVP.proj * (uVP.view * vec4<f32>(p, 1.0));
}
fn type_to_color(t: u32) -> vec3<f32> {
  if (t == 0u) { return vec3<f32>(0.3, 0.9, 1.0); }
  if (t == 1u) { return vec3<f32>(1.0, 0.62, 0.25); }
  return vec3<f32>(1.0, 0.97, 0.85);
}
fn turbo_like(t: f32) -> vec3<f32> {
  let x = clamp(t, 0.0, 1.0);
  return mix(vec3<f32>(0.2,0.6,1.0), vec3<f32>(1.0,0.2,0.0), x);
}
fn aces(x: vec3<f32>) -> vec3<f32> {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp( (x*(a*x+b))/(x*(c*x+d)+e), vec3<f32>(0.0), vec3<f32>(1.0) );
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) sigma: f32,
  @location(2) haloW: f32,
  @location(3) alive: f32,
  @location(4) uv: vec2<f32>, // -0.5..0.5 billboard space (ya rotado/escala)
};

fn quadUV(vid: u32) -> vec2<f32> {
  switch (vid) {
    case 0u: { return vec2<f32>(-0.5, -0.5); }
    case 1u: { return vec2<f32>( 0.5, -0.5); }
    case 2u: { return vec2<f32>( 0.5,  0.5); }
    case 3u: { return vec2<f32>(-0.5, -0.5); }
    case 4u: { return vec2<f32>( 0.5,  0.5); }
    default:{ return vec2<f32>(-0.5,  0.5); }
  }
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32,
           @builtin(instance_index) iid: u32) -> VSOut {
  let P = sPosType[iid];
  let V = sVelMass[iid];
  let A = sAux[iid];

  let alive = select(0.0, 1.0, A.z > 0.5);

  let pos = P.xyz;
  let mass = V.w;
  let t: u32 = u32(max(0.0, P.w + 0.5));

  // Centro en clip
  let center = world_to_clip(pos);
  let centerNdc = center.xy / max(center.w, 1e-6);

  // Tamaños px
  let sizePx = mass_to_px(mass);
  var lenPx = sizePx;
  if (uParams.trails == 1u) {
    let speed = length(V.xyz);
    lenPx = sizePx * (1.0 + clamp(speed, 0.0, 3.0));
  }

  // Dirección en clip
  var dir = vec2<f32>(0.0, 1.0);
  if (uParams.trails == 1u) {
    let aheadWorld = pos + normalize(V.xyz + vec3<f32>(1e-6,0,0)) * 0.2;
    let ahead = world_to_clip(aheadWorld);
    let aheadNdc = ahead.xy / max(ahead.w, 1.0e-6);
    let d = aheadNdc - centerNdc;
    let l = length(d);
    dir = select(vec2<f32>(0.0,1.0), d / max(l, 1.0e-6), l > 1.0e-6);
  }

  let right = vec2<f32>(-dir.y, dir.x);
  let halfW = 0.5 * px_to_clip(sizePx);
  let halfH = 0.5 * px_to_clip(lenPx);

  let uv0 = quadUV(vid);
  let delta = uv0.x * halfW.x * right + uv0.y * halfH.y * dir;

  // Color por modo
  var col = type_to_color(t);
  switch (uParams.colorMode) {
    default { col = type_to_color(t); }
    case 1u {
      let s = clamp(length(V.xyz) / 3.0, 0.0, 1.0);
      col = turbo_like(s);
    }
    case 2u {
      let d = clamp(A.x / 5.0, 0.0, 1.0);
      col = turbo_like(d);
    }
    case 3u {
      let mm = clamp( (log(max(mass,1e-6)) + 10.0)/10.0, 0.0, 1.0 );
      col = mix(vec3<f32>(0.4,0.7,1.0), vec3<f32>(1.0,0.95,0.6), mm);
    }
  }
  if (t == 0u) {
    col = mix(col, col * (1.0 + uParams.gasAddFactor), 0.6);
  }

  var out: VSOut;
  out.uv = uv0;
  out.sigma = uParams.sigma;
  out.haloW = select(0.0, 1.0, uParams.halos == 1u && mass >= uParams.massPlanet);
  out.alive = alive;
  out.color = col;
  out.pos = vec4<f32>(centerNdc + delta, 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  if (in.alive < 0.5) { return vec4<f32>(0.0); }

  // r en espacio del quad (0 en centro, ~1.41 en esquinas)
  let r2 = dot(in.uv * 2.0, in.uv * 2.0);

  // Gauss + halo
  let lum = exp( - r2 / max(2.0 * in.sigma * in.sigma, 1.0e-4) );
  let halo = in.haloW * smoothstep(1.0, 0.5, sqrt(r2)) * 0.35;

  let c = aces(in.color * (lum + halo));
  let a = clamp(lum + halo, 0.0, 1.0);
  return vec4<f32>(c * a, a); // premultiplicado
}
