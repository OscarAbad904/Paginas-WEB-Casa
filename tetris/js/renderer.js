// renderer.js — dibujo en canvas principal y mini canvases
import { COLS, ROWS, VISIBLE_ROWS, HIDDEN_ROWS } from './board.js';

const colorVar = {
  1:'--i', 2:'--o', 3:'--t', 4:'--s', 5:'--z', 6:'--j', 7:'--l'
};

export class Renderer {
  constructor(canvas, holdCanvas, nextContainer){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hCanvas = holdCanvas;
    this.hCtx = holdCanvas.getContext('2d');
    this.nextContainer = nextContainer;
    this.miniPool = [];
    this.scaleCache = { cell: 16, offY: 0 };
    this.flashRows = null; // {rows:Set, t:ms}
  }

  resize() {
    // Mantener ratio 10:20 (solo visible). El canvas ya tiene 320x640, escalado en CSS.
    // Ajustamos nada aquí; usamos tamaño lógico y escalado por CSS (pixelated).
  }

  setFlash(rows, duration=120){
    this.flashRows = { rows:new Set(rows), t:duration };
  }
  tickFlash(dt){
    if (!this.flashRows) return;
    this.flashRows.t -= dt;
    if (this.flashRows.t <= 0) this.flashRows = null;
  }

  draw(state){
    const { board, active, ghost, visible } = state;
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;

    // cell size (visible area)
    const cell = Math.floor(Math.min(w/COLS, h/VISIBLE_ROWS));
    const offX = Math.floor((w - cell*COLS)/2);
    const offY = Math.floor((h - cell*VISIBLE_ROWS)/2);
    this.scaleCache.cell = cell; this.scaleCache.offY = offY;

    ctx.clearRect(0,0,w,h);

    // Fondo y grid
    ctx.fillStyle = getCss('--panel');
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.translate(offX, offY);

    // Bloques fijos (solo visibles)
    for (let y=HIDDEN_ROWS; y<ROWS; y++){
      for (let x=0; x<COLS; x++){
        const v = board[y][x];
        const flash = this.flashRows && this.flashRows.rows.has(y);
        this.drawCell(x, y-HIDDEN_ROWS, v, cell, flash);
      }
    }

    // Ghost
    if (ghost) this.drawPiece(ghost, cell, 0.35);

    // Activa
    if (active) this.drawPiece(active, cell, 1);

    // Grid sutil
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = getCss('--grid');
    for (let x=0; x<=COLS; x++){
      ctx.beginPath(); ctx.moveTo(x*cell, 0); ctx.lineTo(x*cell, VISIBLE_ROWS*cell); ctx.stroke();
    }
    for (let y=0; y<=VISIBLE_ROWS; y++){
      ctx.beginPath(); ctx.moveTo(0, y*cell); ctx.lineTo(COLS*cell, y*cell); ctx.stroke();
    }
    ctx.restore();

    // Hold / Next
    this.drawMini(this.hCtx, state.holdKind || 0);
    this.drawNext(state.nextKinds);
  }

  drawPiece(p, cell, alpha=1){
    const ctx = this.ctx;
    const offX = Math.floor((this.canvas.width - cell*COLS)/2);
    const baseY = this.scaleCache.offY;
    ctx.save();
    ctx.globalAlpha = alpha;
    const m = p.matrix;
    for (let py=0; py<4; py++){
      for (let px=0; px<4; px++){
        if (!m[py*4+px]) continue;
        const x = p.x + px;
        const y = p.y + py;
        if (y < 0) continue; // no dibujar sobre filas ocultas
        this.drawRect(offX + x*cell, baseY + (y - HIDDEN_ROWS)*cell, cell, p.kind);
      }
    }
    ctx.restore();
  }

  drawCell(x, yVis, v, cell, flash){
    const ctx = this.ctx;
    const xpx = Math.floor((this.canvas.width - cell*COLS)/2) + x*cell;
    const ypx = this.scaleCache.offY + yVis*cell;

    if (v){
      this.drawRect(xpx, ypx, cell, v, flash);
    } else {
      // fondo
      ctx.fillStyle = getCss('--panel');
      ctx.fillRect(xpx, ypx, cell, cell);
    }
  }

  drawRect(x, y, size, kind, flash=false){
    const ctx = this.ctx;
    const c = getCss(colorVar[kind] || '--panel');
    ctx.save();
    // base
    ctx.fillStyle = c;
    ctx.fillRect(x, y, size, size);
    // borde sutil
    ctx.strokeStyle = flash ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.08)';
    ctx.strokeRect(x+0.5, y+0.5, size-1, size-1);
    // highlight leve
    ctx.globalAlpha = flash ? 0.5 : 0.12;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x+2, y+2, size-4, Math.max(2, size*0.18));
    ctx.restore();
  }

  // Mini canvases (hold y next)
  drawMini(ctx, kind){
    const w=ctx.canvas.width, h=ctx.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = getCss('--panel'); ctx.fillRect(0,0,w,h);
    if (!kind) return;
    const cell = Math.floor(Math.min(w,h)/6);
    const offsetX = Math.floor((w - cell*4)/2);
    const offsetY = Math.floor((h - cell*4)/2);
    // Dibujar una versión centrada (rot 0)
    const mat = this.sampleMatrix(kind);
    for (let py=0; py<4; py++){
      for (let px=0; px<4; px++){
        if (!mat[py*4+px]) continue;
        this.drawMiniRect(ctx, offsetX + px*cell, offsetY + py*cell, cell, kind);
      }
    }
  }

  drawNext(nextKinds){
    // crear/reciclar 5 minis
    while (this.miniPool.length < 5){
      const c = document.createElement('canvas');
      c.width=96; c.height=96; c.className='mini';
      this.nextContainer.appendChild(c);
      this.miniPool.push(c.getContext('2d'));
    }
    for (let i=0;i<5;i++){
      const ctx = this.miniPool[i];
      ctx.clearRect(0,0,96,96);
      ctx.fillStyle = getCss('--panel'); ctx.fillRect(0,0,96,96);
      const kind = nextKinds[i] || 0;
      if (!kind) continue;
      const cell = 16;
      const offX = Math.floor((96 - cell*4)/2);
      const offY = Math.floor((96 - cell*4)/2);
      const mat = this.sampleMatrix(kind);
      for (let py=0; py<4; py++){
        for (let px=0; px<4; px++){
          if (!mat[py*4+px]) continue;
          this.drawMiniRect(ctx, offX + px*cell, offY + py*cell, cell, kind);
        }
      }
    }
  }

  sampleMatrix(kind){
    // Matriz rot 0 básica para mini
    switch(kind){
      case 1: return [0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0];
      case 2: return [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0];
      case 3: return [0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0];
      case 4: return [0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0];
      case 5: return [1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0];
      case 6: return [1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0];
      case 7: return [0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0];
      default: return new Array(16).fill(0);
    }
  }

  drawMiniRect(ctx, x, y, s, kind){
    const c = getCss(colorVar[kind] || '--panel');
    ctx.fillStyle = c;
    ctx.fillRect(x,y,s,s);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.strokeRect(x+0.5,y+0.5,s-1,s-1);
    ctx.globalAlpha = 0.12; ctx.fillStyle='#fff';
    ctx.fillRect(x+2,y+2,s-4,Math.max(2,s*0.18)); ctx.globalAlpha=1;
  }
}

function getCss(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}
