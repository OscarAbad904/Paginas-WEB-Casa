import { ParticleInit } from './types';
import { rand, gaussian } from './utils';

export function initNubeEsferica(n: number, gasFrac: number, seedNum: number): ParticleInit[] {
  const seed = { v: seedNum >>> 0 };
  const out: ParticleInit[] = [];
  for (let i=0; i<n; i++) {
    // distribución ~ esférica con leve rotación
    const r = Math.abs(gaussian(seed)) * 1.0;
    const theta = 2*Math.PI * rand(seed);
    const phi = Math.acos(1 - 2*rand(seed));
    const x = r * Math.sin(phi)*Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi)*Math.sin(theta);
    // velocidad: ligera rotación alrededor de Y
    const vphi = 0.2 * r;
    const vx = -vphi * Math.sin(theta);
    const vz =  vphi * Math.cos(theta);
    const vy = 0.0;
    const type = (i < n*gasFrac) ? 0 : 1;
    const mass = (type === 0) ? 1.0/n : 2.0/n;
    out.push({ pos: [x,y,z], vel: [vx,vy,vz], mass, type });
  }
  return out;
}

export function initDiscoKepler(n: number, gasFrac: number, seedNum: number): ParticleInit[] {
  const seed = { v: seedNum >>> 0 };
  const out: ParticleInit[] = [];
  for (let i=0; i<n; i++) {
    // anillo [0.5, 2.0] con ruido
    const r = 0.5 + 1.5*rand(seed);
    const ang = 2*Math.PI * rand(seed);
    const x = r * Math.cos(ang) + 0.02*gaussian(seed);
    const y = 0.02*gaussian(seed);
    const z = r * Math.sin(ang) + 0.02*gaussian(seed);
    // velocidad kepleriana v ~ r^{-1/2}
    const v = 0.5 / Math.sqrt(r);
    const vx = -v * Math.sin(ang);
    const vz =  v * Math.cos(ang);
    const vy = 0.00;
    const type = (i < n*gasFrac) ? 0 : 1;
    const mass = (type === 0) ? 1.0/n : 2.0/n;
    out.push({ pos: [x,y,z], vel: [vx,vy,vz], mass, type });
  }
  return out;
}

export function initPolvoAlto(n: number, gasFrac: number, seedNum: number): ParticleInit[] {
  // similar al disco pero con menos gas
  return initDiscoKepler(n, gasFrac, seedNum);
}


export function initDiscoEstable(n: number, gasFrac: number, seedNum: number): ParticleInit[] {
  // Basado en initDiscoKepler pero disco más fino (menor dispersión en Y)
  // y radios más concentrados en 0.4–1.2 (UA relativas del sistema).
  const seed = { v: seedNum >>> 0 };
  const out: ParticleInit[] = [];
  for (let i=0; i<n; i++) {
    const r = 0.4 + 0.8 * Math.abs(gaussian(seed)); // concentrado
    const ang = 2*Math.PI * rand(seed);
    const x = r * Math.cos(ang);
    const z = r * Math.sin(ang);
    const y = (gaussian(seed) * 0.02); // disco MUY fino
    const v = Math.sqrt(1.0 / Math.max(0.1, r)); // kepleriano
    const vx = -v * Math.sin(ang) * (1.0 + 0.02*gaussian(seed));
    const vz =  v * Math.cos(ang) * (1.0 + 0.02*gaussian(seed));
    const vy = 0.0 + 0.01*gaussian(seed);
    const type = (i < n*gasFrac) ? 0 : 1;
    const mass = (type === 0) ? 1.0/n : 2.0/n;
    out.push({ pos: [x,y,z], vel: [vx,vy,vz], mass, type });
  }
  return out;
}
