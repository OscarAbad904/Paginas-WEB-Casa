// engine.js — estado del juego, gravedad, lock delay, scoring y cola/hold
import { createBoard, collides, merge, fullRows, clearRows, COLS, ROWS, VISIBLE_ROWS, HIDDEN_ROWS } from './board.js';
import { bagGenerator, spawn, rotationMatrix, kicks, Kinds } from './piece.js';

const LINE_POINTS = {1:100, 2:300, 3:500, 4:800};
const LOCK_DELAY_MS = 500;
const FLASH_MS = 120;
const SOFT_PER_CELL = 1;
const HARD_PER_CELL = 2;
// Velocidad por nivel (ms por paso de gravedad)
const DROP_TABLE = [1000, 800, 650, 500, 370, 290, 220, 170, 130, 100, 80, 65, 50, 40, 30];

export class Engine {
  constructor(onEvent){
    this.onEvent = onEvent || (()=>{});
    this.reset();
  }

  reset(){
    this.board = createBoard();
    this.gen = bagGenerator();
    this.queue = [];
    this.ensureQueue();
    this.active = null;
    this.ghost = null;
    this.holdKind = 0;
    this.canHold = true;

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropMs = DROP_TABLE[0];
    this.acc = 0;

    this.locking = false;
    this.lockMs = 0;

  this.lineClear = null; // {rows:[], t:ms, animIndex:int}
    this.b2b = false;

    this.softDrop = false;
    this.gameOver = false;
    this.paused = false;

    this.spawnNext();
  }

  ensureQueue(){
    while (this.queue.length < 8){
      this.queue.push(this.gen.next().value);
    }
  }

  spawnNext(){
    const kind = this.queue.shift();
    this.ensureQueue();
    this.active = spawn(kind);
    this.active.matrix = rotationMatrix(kind, 0);
    this.updateGhost();
    this.canHold = true;

    if (collides(this.board, this.active)){
      this.gameOver = true;
      this.onEvent({type:'gameover'});
    }
  }

  getState(){
    return {
      board:this.board,
      active:this.active,
      ghost:this.ghost,
      holdKind:this.holdKind,
      nextKinds:this.queue.slice(0,5),
      visible: { level:this.level, score:this.score, lines:this.lines },
      lineFlash: this.lineClear ? this.lineClear.rows : null,
      paused:this.paused, over:this.gameOver
    };
  }

  tick(dt){
    if (this.paused || this.gameOver) return;

    // animación de limpieza escalonada
    if (this.lineClear) {
      this.lineClear.t -= dt;
      if (this.lineClear.t <= 0) {
        // Eliminar una línea de las que quedan
        if (this.lineClear.rows.length > 0) {
          // Eliminar la más baja (mayor índice)
          const toRemove = this.lineClear.rows.pop();
          clearRows(this.board, [toRemove]);
          // Reiniciar el flash para la(s) que quedan
          if (this.lineClear.rows.length > 0) {
            this.lineClear.t = FLASH_MS;
          } else {
            // Terminar animación
            this.lineClear = null;
            this.spawnNext();
            this.updateGhost();
          }
        }
      }
      return; // pausa la lógica mientras se eliminan
    }

    // gravedad
    const speed = this.softDrop ? Math.max(20, this.dropMs * 0.08) : this.dropMs;
    this.acc += dt;
    while (this.acc >= speed){
      this.acc -= speed;
      this.stepDown();
      if (this.gameOver || this.paused) break;
    }
  }

  stepDown(){
    if (!this.active) return;
    this.active.y++;
    if (collides(this.board, this.active)){
      // revertir
      this.active.y--;
      // iniciar/continuar lock
      this.locking = true;
      // el lock delay se mide aparte, pero si veníamos de movimiento/rotación se habrá reseteado
      this.lockTick(0);
    } else {
      this.locking = false;
      this.lockMs = 0;
    }
    this.updateGhost();
  }

  lockTick(dt){
    if (!this.locking) return;
    this.lockMs += dt;
    if (this.lockMs >= LOCK_DELAY_MS){
      this.lockPiece();
    }
  }

  update(dt){
    // Llamar cada frame para lock delay
    if (!this.paused && !this.gameOver && !this.lineClear){
      this.lockTick(dt);
    }
  }

  tryMove(dx, dy){
    if (!this.active) return false;
    const x0 = this.active.x, y0 = this.active.y;
    this.active.x += dx; this.active.y += dy;
    if (collides(this.board, this.active)){
      this.active.x = x0; this.active.y = y0; return false;
    }
    // resetea lock si tocando suelo
    if (dy!==0 || dx!==0){
      if (this.isGrounded()) { this.lockMs = 0; this.locking = true; }
    }
    this.updateGhost();
    return true;
  }

  isGrounded(){
    if (!this.active) return false;
    this.active.y++;
    const hit = collides(this.board, this.active);
    this.active.y--;
    return hit;
  }

  tryRotate(dir){ // dir: +1 CW, -1 CCW
    if (!this.active) return false;
    const from = this.active.rot;
    const to = (from + (dir>0?1:3)) & 3;
    const mat = rotationMatrix(this.active.kind, to);
    // probar wall kicks
    const kset = kicks(this.active.kind, from, to);
    const x0 = this.active.x, y0 = this.active.y, m0 = this.active.matrix, r0 = this.active.rot;
    for (const [kx, ky] of kset){
      this.active.x = x0 + kx;
      this.active.y = y0 + ky;
      if (!collides(this.board, this.active, mat)){
        this.active.matrix = mat;
        this.active.rot = to;
        // reset lock si estamos apoyados
        if (this.isGrounded()){ this.lockMs = 0; this.locking = true; }
        this.updateGhost();
        return true;
      }
    }
    // revertir
    this.active.x = x0; this.active.y = y0; this.active.matrix = m0; this.active.rot = r0;
    return false;
  }

  hardDrop(){
    if (!this.active) return 0;
    let cells = 0;
    while (!this.isGrounded()){
      this.active.y++; cells++;
    }
    this.score += cells * HARD_PER_CELL;
    this.lockPiece(); // cae y bloquea
    return cells;
  }

  setSoftDrop(on){
    this.softDrop = !!on;
  }

  hold(){
    if (!this.canHold || !this.active) return false;
    const currentKind = this.active.kind;
    if (!this.holdKind){
      this.holdKind = currentKind;
      this.spawnNext();
    } else {
      const tmp = this.holdKind;
      this.holdKind = currentKind;
      // spawnear la pieza del hold
      this.active = spawn(tmp);
      this.active.matrix = rotationMatrix(tmp, 0);
      if (collides(this.board, this.active)) { this.gameOver=true; this.onEvent({type:'gameover'}); return false; }
    }
    this.canHold = false;
    this.updateGhost();
    return true;
  }

  lockPiece(){
    if (!this.active) return;

    merge(this.board, this.active);

    // ¿líneas?
    let rows = fullRows(this.board);
    if (rows.length) {
      // puntuación
      const base = LINE_POINTS[rows.length] || 0;
      const b2bBonus = (rows.length === 4 && this.b2b) ? Math.floor(base * 0.5) : 0;
      this.score += base + b2bBonus;
      if (rows.length === 4) this.b2b = true; else this.b2b = false;

      this.lines += rows.length;
      const newLevel = Math.floor(this.lines/10)+1;
      if (newLevel !== this.level){
        this.level = newLevel;
        this.dropMs = DROP_TABLE[Math.min(DROP_TABLE.length-1, this.level-1)];
        this.onEvent({type:'level', level:this.level});
      }
      // Ordenar de abajo a arriba
      rows = rows.sort((a, b) => b - a);
      this.lineClear = { rows, t: FLASH_MS };
      this.onEvent({type:'lines', count:rows.length, b2b:this.b2b});
    } else {
      this.b2b = false;
      // spawnear siguiente
      this.spawnNext();
    }

    this.active = this.lineClear ? null : this.active; // durante el flash no hay activa
    this.canHold = true;
    this.locking = false; this.lockMs = 0;
    this.updateGhost();
  }

  updateGhost(){
    if (!this.active){ this.ghost = null; return; }
    // clonar posición básica
    const g = { kind:this.active.kind, rot:this.active.rot, x:this.active.x, y:this.active.y, matrix:this.active.matrix };
    // bajar hasta colisión
    while (true){
      g.y++;
      if (collides(this.board, g)){
        g.y--; break;
      }
    }
    this.ghost = g;
  }

  getNextKinds(){ return this.queue.slice(0,5); }
}
