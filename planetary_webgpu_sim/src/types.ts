export type SimParams = {
  G: number;
  eps: number;      // softening
  gamma: number;    // gas
  kpress: number;   // gas equation constant
  hKernel: number;  // SPH smoothing length
  nu: number;       // artificial viscosity magnitude
  tau: number;      // stopping time for drag
  dtMax: number;
  warp: number;
  enableGas: boolean;
  enableDrag: boolean;
  enableCollisions: boolean;
};

export type PresetName = "nube_rotacion" | "disco_kepler" | "polvo_alto";

export interface ParticleInit {
  pos: [number, number, number];
  vel: [number, number, number];
  mass: number;
  type: number; // 0 gas, 1 polvo/solido, 2 planetesimal/estrella
}
