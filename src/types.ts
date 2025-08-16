export type SimParams = {
G: number;
  eps: number;      // softening
  theta: number;     // BH opening angle
  gamma: number;    // gas
  kpress: number;   // gas equation constant
  hKernel: number;  // SPH smoothing length
  nu: number;       // artificial viscosity magnitude
  tau: number;      // stopping time for drag
  rhoThresh: number; // density threshold for planetesimal
  vMax: number;      // velocity clamp
  gravMode: GravMode;
  quality: Quality;
  autoReduceN: boolean;
  dtMax: number;
  warp: number;
  enableGas: boolean;
  enableDrag: boolean;
  enableCollisions: boolean;
  Mstar: number;
  collisionsEvery: number;
  volumeScale: number;
  useAdaptiveDt: boolean;
  cfl: number;
  eta: number;
};

export type GravMode = 'auto'|'bh'|'n2';
export type Quality = 'low'|'med'|'high';

export type PresetName = "nube_rotacion" | "disco_kepler" | "polvo_alto" | "disco_estable";

export interface ParticleInit {
  pos: [number, number, number];
  vel: [number, number, number];
  mass: number;
  type: number; // 0 gas, 1 polvo/solido, 2 planetesimal/estrella
}
