struct SimParams {
  G: f32,
  eps: f32,
  gamma: f32,
  kpress: f32,
  hKernel: f32,
  nu: f32,
  tau: f32,
  dt: f32,
  enableGas: u32,
  enableDrag: u32,
  enableCollisions: u32,
  pad: u32
}

@group(0) @binding(0) var<uniform> params: SimParams;

// Storage buffers
// pos.xyz + type in w
@group(0) @binding(1) var<storage, read_write> pos_type: array<vec4<f32>>;
// vel.xyz + mass in w
@group(0) @binding(2) var<storage, read_write> vel_mass: array<vec4<f32>>;
// aux.x = density, aux.y = pressure, aux.z = alive (1/0), aux.w = radius
@group(0) @binding(3) var<storage, read_write> aux: array<vec4<f32>>;
// acceleration temp
@group(0) @binding(4) var<storage, read_write> accel: array<vec4<f32>>;

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
  let eps2 = params.eps * params.eps;
  // Gravedad O(N^2)
  for (var j: u32 = 0u; j < arrayLength(&pos_type); j = j + 1u) {
    if (i == j || aux[j].z < 0.5) { continue; }
    let rvec = pos_type[j].xyz - Pi;
    let r2 = dot(rvec, rvec) + eps2;
    let invr3 = inverseSqrt(r2*r2*r2);
    a += params.G * vel_mass[j].w * rvec * invr3;
  }

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

  accel[i] = vec4<f32>(a, 0.0);
}

// Pass 3: integración leapfrog/Verlet (semi-impl)
@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos_type)) { return; }
  if (aux[i].z < 0.5) { return; }

  let dt = params.dt;
  var v = vel_mass[i].xyz;
  var p = pos_type[i].xyz;
  let a = accel[i].xyz;

  // velocity Verlet (simplificado): v_{t+dt} = v + a*dt ; p_{t+dt} = p + v_{t+dt}*dt
  v = v + a * dt;
  p = p + v * dt;

  pos_type[i].x = p.x;
  pos_type[i].y = p.y;
  pos_type[i].z = p.z;
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
      aux[i].w = pow(newM, 1.0/3.0)*0.05;
      // marcar j como muerto
      aux[j].z = 0.0;
    }
  }
}
