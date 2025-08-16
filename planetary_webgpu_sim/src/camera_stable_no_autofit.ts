
// camera_stable_no_autofit.ts
// Cámara estable para WebGPU: sigue el centro del cúmulo SIN cambiar el zoom automáticamente.
// Solo cambia el zoom si llamas explícitamente a fitOnce() o el usuario usa rueda/teclas.
// Controles sugeridos (opcional): Z bloquea/desbloquea auto-zoom (por defecto bloqueado = true).

export type Vec2 = { x: number; y: number };

export interface StableCameraOptions {
  minZoom?: number;
  maxZoom?: number;
  followCOM?: boolean;        // seguir centro de masa
  centerSmooth?: number;      // 0..1 suavizado de centro
  zoomSmooth?: number;        // 0..1 suavizado de zoom
  padding?: number;           // padding al hacer fitOnce (1.0 sin padding)
  startZoom?: number;
}

export class StableCamera {
  public center: Vec2 = { x: 0, y: 0 };
  public zoom: number;
  public lockAutoZoom = true;         // <<< No tocar zoom automáticamente
  public followCOM = true;

  private targetCenter: Vec2 = { x: 0, y: 0 };
  private targetZoom: number;
  private minZoom: number;
  private maxZoom: number;
  private centerSmooth: number;
  private zoomSmooth: number;
  private padding: number;

  constructor(opts: StableCameraOptions = {}) {
    this.minZoom = opts.minZoom ?? 0.05;
    this.maxZoom = opts.maxZoom ?? 50;
    this.centerSmooth = opts.centerSmooth ?? 0.12;
    this.zoomSmooth = opts.zoomSmooth ?? 0.15;
    this.padding = opts.padding ?? 1.1;
    this.followCOM = opts.followCOM ?? true;
    this.zoom = opts.startZoom ?? 1.0;
    this.targetZoom = this.zoom;
  }

  // Actualiza el objetivo de cámara usando el centro de masa calculado externamente
  setTargetCenter(c: Vec2) {
    this.targetCenter = c;
  }

  setZoomManual(z: number) {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
  }

  zoomBy(factor: number) {
    this.setZoomManual(this.targetZoom * factor);
  }

  // Encadre único (sólo si lockAutoZoom == false o forzar=true)
  fitOnce(bounds: {minX:number;minY:number;maxX:number;maxY:number}, canvas: HTMLCanvasElement, forzar=false) {
    // Ajusta centro siempre
    const cx = 0.5 * (bounds.minX + bounds.maxX);
    const cy = 0.5 * (bounds.minY + bounds.maxY);
    this.targetCenter = { x: cx, y: cy };

    if (this.lockAutoZoom && !forzar) return;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const zw = canvas.width  / (w * this.padding);
    const zh = canvas.height / (h * this.padding);
    const z = Math.min(zw, zh);
    this.setZoomManual(z);
  }

  // Suavizado por frame
  tick() {
    this.center.x += (this.targetCenter.x - this.center.x) * this.centerSmooth;
    this.center.y += (this.targetCenter.y - this.center.y) * this.centerSmooth;
    // OJO: si lockAutoZoom es true, el targetZoom no se cambia en ninguna parte salvo input del usuario
    this.zoom += (this.targetZoom - this.zoom) * this.zoomSmooth;
  }

  // Construye y escribe matriz 2D mundo->clip (-1..1)
  writeViewToBuffer(device: GPUDevice, viewBuffer: GPUBuffer, canvas: HTMLCanvasElement) {
    const sx =  2 * this.zoom / canvas.width;
    const sy = -2 * this.zoom / canvas.height;
    const tx = -this.center.x * sx;
    const ty = -this.center.y * sy;
    const view = new Float32Array([
      sx, 0,  0,
      0,  sy, 0,
      tx,  ty, 1,
    ]);
    device.queue.writeBuffer(viewBuffer, 0, view);
  }
}

// --------- Utilidades sugeridas (opcionales) ---------
export function centerOfMass2D(pos: Float32Array, mass?: Float32Array): Vec2 {
  const n = (pos.length / 2) | 0;
  let cx = 0, cy = 0, m = 0;
  if (mass && mass.length >= n) {
    for (let i = 0; i < n; i++) { const mi = mass[i] || 1; cx += pos[2*i]*mi; cy += pos[2*i+1]*mi; m += mi; }
  } else {
    for (let i = 0; i < n; i++) { cx += pos[2*i]; cy += pos[2*i+1]; }
    m = n || 1;
  }
  return { x: cx / m, y: cy / m };
}

export function robustBounds2D(pos: Float32Array, keepPct=0.95) {
  const n = (pos.length / 2) | 0;
  if (n === 0) return {minX:0,minY:0,maxX:1,maxY:1};
  const d2 = new Float32Array(n);
  // Centro simple (puedes pasar COM si lo prefieres)
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pos[2*i]; cy += pos[2*i+1]; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const dx = pos[2*i] - cx, dy = pos[2*i+1] - cy;
    d2[i] = dx*dx + dy*dy;
  }
  // índice hasta percentil
  const idx = [...Array(n).keys()].sort((a,b)=>d2[a]-d2[b]).slice(0, Math.max(1, Math.floor(n*keepPct)));
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const i of idx) {
    const x = pos[2*i], y = pos[2*i+1];
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
  }
  return {minX,minY,maxX,maxY};
}

// Ejemplo de integración (pseudocódigo en tu main.ts):
/*
import { StableCamera, centerOfMass2D, robustBounds2D } from './camera_stable_no_autofit';

const cam = new StableCamera({ startZoom: 1.2, followCOM: true });
cam.lockAutoZoom = true; // <<< bloquea auto-zoom (no se reajustará solo)

// input manual
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.pow(1.1, -e.deltaY * 0.01);
  cam.zoomBy(factor);
});

window.addEventListener('keydown', (e) => {
  if (e.key === '+') cam.zoomBy(1.1);
  if (e.key === '-') cam.zoomBy(1/1.1);
  if (e.key === 'f') { // encuadre único
    const b = robustBounds2D(positions, 0.95);
    cam.fitOnce(b, canvas); // respeta lockAutoZoom
  }
});

function frame() {
  // actualizar COM si quieres seguirlo
  if (cam.followCOM) {
    const com = centerOfMass2D(positions, masses);
    cam.setTargetCenter(com); // sólo centra, NO toca zoom
  }
  cam.tick();
  cam.writeViewToBuffer(device, viewBuffer, canvas);
  // ... resto de tu render
  requestAnimationFrame(frame);
}
frame();
*/
