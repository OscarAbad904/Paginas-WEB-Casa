struct SimParams {
  G: f32,
  eps: f32,
  gamma: f32,
  kpress: f32,
  hKernel: f32,
  nu: f32,
  tau: f32,
  dt: f32,
  // extras that TS escribe en el uniform
  rhoThresh: f32,
  vMax: f32,
  theta: f32,
  Mstar: f32,
  // flags como u32 (cualquier valor != 0 cuenta como true)
  enableGas: u32,
  enableDrag: u32,
  enableCollisions: u32,
  // padding para alinear a 16 bytes
  pad: u32
};

@group(0) @binding(0) var<uniform> params: SimParams;

// Storage buffers
// pos.xyz + type in w
@group(0) @binding(1) var<storage, read_write> pos_type: array<vec4<f32>>;
// vel.xyz + mass in w
@group(0) @binding(2) var<storage, read_write> vel_mass: array<vec4<f32>>;
// half-step velocities for leapfrog (vel_x, vel_y, vel_z, mass)
@group(0) @binding(6) var<storage, read_write> velHalf: array<vec4<f32>>;
// aux.x = density, aux.y = pressure, aux.z = alive (1/0), aux.w = radius
@group(0) @binding(3) var<storage, read_write> aux: array<vec4<f32>>;
// acceleration temp
@group(0) @binding(4) var<storage, read_write> accel: array<vec4<f32>>;

// Barnes–Hut nodes (quadtree XZ), bound at group(1)
@group(1) @binding(0) var<storage, read> bh_nodesA: array<vec4<f32>>; // [cx, cz, half, mass]
@group(1) @binding(1) var<storage, read> bh_nodesB: array<vec4<f32>>; // [mx, mz, 0, 0]
@group(1) @binding(2) var<storage, read> bh_children: array<vec4<u32>>;
@group(1) @binding(3) var<uniform> bh_info: vec2<u32>; // [nodeCount, useBH]


// metrics buffers
// metricsOut: [K, U, Lx, Ly, Lz, countPlanetesimals, countAlive, totalMass]
@group(0) @binding(5) var<storage, read_write> metricsOut: array<atomic<i32>>;


fn W_poly6(r: f32, h: f32) -> f32 {
  if (r >= 0.0 && r <= h) {
    let x = (h*h - r*r);
    return 315.0 / (64.0 * 3.14159265 * pow(h, 9.0)) * x*x*x;
  }
  return 0.0;
}

fn gradW_spiky(rvec: vec3<f32>, r: f32, h: f32) -> vec3<f32> {
  if (r > 0.0 && r <= h) {
    let coeff = -45.0 / (3.14159265 * pow(h, 6.0)) * pow(h - r, 2.0);
    return coeff * (rvec / r);
  }
  return vec3<f32>(0.0);
}

// Pass 1: densidades (O(N^2) para simplicidad)
@compute @workgroup_size(256)
fn compute_density(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; } // dead
  let Pi = pos_type[i].xyz;
  var rho = 0.0;
  let h = params.hKernel;
  for (var j: u32 = 0u; j < arrayLength(&pos_type); j = j + 1u) {
    if (aux[j].z < 0.5) { continue; }
    let Pj = pos_type[j].xyz;
    let r = distance(Pi, Pj);
    rho += vel_mass[j].w * W_poly6(r, h); // m_j * W
  }
  var a = aux[i];
  a.x = rho;
  a.y = params.kpress * pow(max(rho, 1e-5), params.gamma);
  aux[i] = a;
}

// Pass 2: fuerzas (gravedad + presión + viscosidad + drag gas↔sólidos)
@compute @workgroup_size(256)
fn compute_forces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }
  let Pi = pos_type[i].xyz;
  let Vi = vel_mass[i].xyz;
  let mi = vel_mass[i].w;
  let ti = pos_type[i].w;

  var a = vec3<f32>(0.0);
  var phi = 0.0;
  let eps2 = params.eps * params.eps;
  // Gravedad O(N^2)
  for (var j: u32 = 0u; j < arrayLength(&pos_type); j = j + 1u) {
    if (i == j || aux[j].z < 0.5) { continue; }
    let rvec = pos_type[j].xyz - Pi;
    let r2 = dot(rvec, rvec) + eps2;
    let invr3 = inverseSqrt(r2*r2*r2);
    let mj = vel_mass[j].w;
    a += params.G * mj * rvec * invr3;
    phi += - params.G * mj / sqrt(r2);
  }

  // Estrella central en (0,0,0) con softening eps (UNA VEZ, fuera del bucle)
  let r2_star = dot(Pi, Pi) + eps2;
  let invr3_star = inverseSqrt(r2_star*r2_star*r2_star);
  a += - params.G * params.Mstar * Pi * invr3_star;

  if (params.enableGas != 0u) {
    // SPH presión/viscosidad (aprox: vecinos en radio h, O(N^2))
    let h = params.hKernel;
    let rhoi = max(aux[i].x, 1e-6);
    let Pi_press = aux[i].y;
    for (var j: u32 = 0u; j < arrayLength(&pos_type); j = j + 1u) {
      if (i == j || aux[j].z < 0.5) { continue; }
      let rvec = pos_type[j].xyz - Pi;
      let r = length(rvec);
      if (r > h) { continue; }
      let rhoj = max(aux[j].x, 1e-6);
      let Pj_press = aux[j].y;
      let mj = vel_mass[j].w;
      let gradW = gradW_spiky(rvec, r, h);
      // Término de presión simétrico
      a += - mj * (Pi_press / (rhoi*rhoi) + Pj_press / (rhoj*rhoj)) * gradW;
      // Viscosidad artificial (Monaghan simple)
      let Vj = vel_mass[j].xyz;
      let vij = Vi - Vj;
      let mu = (h * dot(vij, rvec)) / (r*r + 0.01*h*h);
      let pi_visc = (-params.nu) * mu / (0.5*(rhoi+rhoj));
      a += - mj * pi_visc * gradW;
    }
  }

  // Arrastre polvo-gas: si ti ~ 1 (polvo), aproximamos gas local con promedio de vecinos (muy simple)
  if (params.enableDrag != 0u && ti > 0.5 && ti < 1.5) {
    var vgas = vec3<f32>(0.0);
    var cnt = 0.0;
    let h = params.hKernel;
    for (var j: u32 = 0u; j < arrayLength(&pos_type); j = j + 1u) {
      if (aux[j].z < 0.5) { continue; }
      let tj = pos_type[j].w;
      if (tj < 0.5) { // gas neighbor
        let r = distance(Pi, pos_type[j].xyz);
        if (r <= h) {
          vgas += vel_mass[j].xyz;
          cnt += 1.0;
        }
      }
    }
    if (cnt > 0.5) {
      vgas = vgas / cnt;
      a += (vgas - Vi) / max(params.tau, 1e-4);
    }
  }
  accel[i] = vec4<f32>(a, phi);
}

// Pass 3a: kick-drift (half kick -> drift positions)
@compute @workgroup_size(256)
fn kickDrift(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }

  let dt = params.dt;
  let a = accel[i].xyz;
  // half-step velocity
  let v_half = vel_mass[i].xyz + a * (0.5 * dt);
  velHalf[i] = vec4<f32>(v_half, vel_mass[i].w);
  // drift
  let p_new = pos_type[i].xyz + v_half * dt;
  pos_type[i] = vec4<f32>(p_new, pos_type[i].w);
}

// Pass 3b: final kick (after recomputing accelerations with updated positions)
@compute @workgroup_size(256)
fn finalKick(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }

  let dt = params.dt;
  let a = accel[i].xyz;
  var v = velHalf[i].xyz + a * (0.5 * dt);
  // clamp velocidad para estabilidad
  let speed = length(v);
  if (speed > params.vMax) {
    let f = params.vMax / speed;
    v = v * f;
  }
  vel_mass[i].x = v.x;
  vel_mass[i].y = v.y;
  vel_mass[i].z = v.z;
}

// Pass 4: colisiones / acreción (naive O(N^2), aplicar muy ocasionalmente)
@compute @workgroup_size(256)
fn collisions(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }
  if (params.enableCollisions == 0u) { return; }
  let Pi = pos_type[i].xyz;
  let mi = vel_mass[i].w;
  var ri = aux[i].w;

  for (var j: u32 = i + 1u; j < arrayLength(&pos_type); j = j + 1u) {
    if (aux[j].z < 0.5) { continue; }
    let rj = aux[j].w;
    let d = distance(Pi, pos_type[j].xyz);
    if (d < (ri + rj)) {
      // fusionar j -> i (conservación masa y momento lineal)
      let mj = vel_mass[j].w;
      let newM = mi + mj;
      let vi = vel_mass[i].xyz;
      let vj = vel_mass[j].xyz;
      let newV = (vi*mi + vj*mj)/newM;
      vel_mass[i].w = newM;
      vel_mass[i].x = newV.x;
      vel_mass[i].y = newV.y;
      vel_mass[i].z = newV.z;
      // crecer radio proporcional a m^(1/3)
      aux[i].w = min(0.5, pow(newM, 1.0/3.0)*0.05);
      // marcar j como muerto
      aux[j].z = 0.0;
    }
  }
}


// Pass 5: clasifica sólidos densos como planetesimales
@compute @workgroup_size(256)
fn classify_planetesimals(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }
  let ti = pos_type[i].w;
  if (ti > 0.5 && ti < 1.5) { // sólido
    if (aux[i].x >= params.rhoThresh) {
      pos_type[i].w = 2.0; // planetesimal
      aux[i].w = max(aux[i].w, 0.08);
      // contar planetesimal
      atomicAdd(&metricsOut[5], 1);
    }
  }
}

fn bh_force(i: u32, theta: f32) -> vec4<f32> {
  // return vec4(acc.xyz, phi)
  let Pi = pos_type[i].xyz;
  var a = vec3<f32>(0.0);
  var phi = 0.0;
  var stack: array<i32, 64>;
  var sp: i32 = 0;
  stack[sp] = 0; sp += 1; // root
  let eps2 = params.eps * params.eps;

  loop {
    if (sp <= 0) { break; }
    sp -= 1;
    let ni = stack[sp];
    if (ni < 0) { continue; }
    let n = u32(ni);
    if (n >= bh_info.x) { continue; }

    let A = bh_nodesA[n];
    let B = bh_nodesB[n];
    let cx = A.x; let cz = A.y; let half = A.z; let m = A.w;
    if (m <= 0.0) { continue; }
    let com = vec3<f32>(B.x, 0.0, B.y);
    let rvec = com - Pi;
    let r2 = dot(rvec, rvec) + eps2;
    let d = sqrt(r2);

    // opening criterion: s/d < theta
    let s = half * 2.0;
    if (s / max(d, 1e-4) < theta || half < 1e-3) {
      let invr3 = inverseSqrt(r2*r2*r2);
      a += params.G * m * rvec * invr3;
      phi += - params.G * m / sqrt(r2);
      continue;
    } else {
      // push children
      let ch = bh_children[n];
      if (ch.x != 0xffffffffu) { stack[sp] = i32(ch.x); sp += 1; }
      if (ch.y != 0xffffffffu) { stack[sp] = i32(ch.y); sp += 1; }
      if (ch.z != 0xffffffffu) { stack[sp] = i32(ch.z); sp += 1; }
      if (ch.w != 0xffffffffu) { stack[sp] = i32(ch.w); sp += 1; }
    }
    if (sp >= 60) { /* overflow guard: treat node as mass */ 
      let invr3 = inverseSqrt(r2*r2*r2);
      a += params.G * m * rvec * invr3;
      phi += - params.G * m / sqrt(r2);
    }
  }
  return vec4<f32>(a, phi);
}
