export function rand(seed: {v:number}) {
  // LCG simple determinista
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return seed.v / 0xffffffff;
}

export function gaussian(seed: {v:number}) {
  // Box-Muller
  let u = Math.max(1e-6, rand(seed));
  let v = Math.max(1e-6, rand(seed));
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

export function formatFloat(n: number, digits = 3) {
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}
