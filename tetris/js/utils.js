// utils.js — helpers pequeños y sin GC en cada frame
export const RAND = {
  _seed: Date.now() & 0xffff,
  next() { // LCG sencillo (suficiente para barajar)
    this._seed = (1664525 * this._seed + 1013904223) >>> 0;
    return this._seed / 0xffffffff;
  }
};

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (RAND.next() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export function now() {
  return performance.now();
}
