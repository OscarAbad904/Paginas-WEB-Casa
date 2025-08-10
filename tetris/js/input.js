// input.js — teclado + táctil con DAS/ARR básicos
const KEY = {
  LEFT: 'ArrowLeft', RIGHT:'ArrowRight', DOWN:'ArrowDown', UP:'ArrowUp',
  Z:'z', X:'x', C:'c', SPACE:' ', P:'p', R:'r'
};

export class Input {
  constructor(engine, sfx){
    this.e = engine; this.sfx = sfx;
    this.state = { left:false, right:false, down:false };
    this.timers = { lDas:0, rDas:0, lArr:0, rArr:0 };
    this.DAS = 140; // ms
    this.ARR = 30;  // ms

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown, {passive:false});
    window.addEventListener('keyup', this._onKeyUp, {passive:false});
  }

  destroy(){
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  onKeyDown(ev){
    const k = ev.key;
    if ([
      KEY.LEFT, KEY.RIGHT, KEY.DOWN, KEY.SPACE, KEY.Z, KEY.X, KEY.C, KEY.UP, KEY.P, KEY.R
    ].includes(k)){
      ev.preventDefault();
    }

    if (k === KEY.P){ this.togglePause(); return; }
    if (k === KEY.R){ this.restart(); return; }

    if (this.e.paused || this.e.gameOver || this.e.lineClear) return;

    if (k === KEY.LEFT){
      if (!this.state.left){ this.stepLeft(); this.state.left=true; this.timers.lDas=0; this.timers.lArr=0; }
    } else if (k === KEY.RIGHT){
      if (!this.state.right){ this.stepRight(); this.state.right=true; this.timers.rDas=0; this.timers.rArr=0; }
    } else if (k === KEY.DOWN){
      this.state.down = true; this.e.setSoftDrop(true);
    } else if (k === KEY.Z){
      if (this.e.tryRotate(-1)) this.sfx.rotate();
    } else if (k === KEY.X || k===KEY.UP){
      if (this.e.tryRotate(+1)) this.sfx.rotate();
    } else if (k === KEY.SPACE){
      const cells = this.e.hardDrop(); if (cells) this.sfx.hard();
    } else if (k === KEY.C){
      if (this.e.hold()) { /* sonido opcional */ }
    }
  }

  onKeyUp(ev){
    const k = ev.key;
    if (k === KEY.LEFT){ this.state.left=false; }
    if (k === KEY.RIGHT){ this.state.right=false; }
    if (k === KEY.DOWN){ this.state.down=false; this.e.setSoftDrop(false); }
  }

  update(dt){
    if (this.e.paused || this.e.gameOver || this.e.lineClear) return;

    // LEFT
    if (this.state.left && !this.state.right){
      this.timers.lDas += dt;
      if (this.timers.lDas >= this.DAS){
        this.timers.lArr += dt;
        while (this.timers.lArr >= this.ARR){
          this.timers.lArr -= this.ARR;
          this.stepLeft();
        }
      }
    } else { this.timers.lDas=0; this.timers.lArr=0; }

    // RIGHT
    if (this.state.right && !this.state.left){
      this.timers.rDas += dt;
      if (this.timers.rDas >= this.DAS){
        this.timers.rArr += dt;
        while (this.timers.rArr >= this.ARR){
          this.timers.rArr -= this.ARR;
          this.stepRight();
        }
      }
    } else { this.timers.rDas=0; this.timers.rArr=0; }
  }

  stepLeft(){ if (this.e.tryMove(-1,0)) this.sfx.move(); }
  stepRight(){ if (this.e.tryMove(+1,0)) this.sfx.move(); }

  // Expuestos para táctil:
  holdLeft(on){ this.state.left = !!on; if (on) this.stepLeft(); else { this.timers.lDas=0; this.timers.lArr=0; } }
  holdRight(on){ this.state.right= !!on; if (on) this.stepRight(); else { this.timers.rDas=0; this.timers.rArr=0; } }
  softDown(on){ this.state.down = !!on; this.e.setSoftDrop(on); }

  rotateL(){ if (this.e.tryRotate(-1)) this.sfx.rotate(); }
  rotateR(){ if (this.e.tryRotate(+1)) this.sfx.rotate(); }
  hard(){ const c=this.e.hardDrop(); if (c) this.sfx.hard(); }
  hold(){ this.e.hold(); }

  togglePause(){ this.e.paused = !this.e.paused; this.onPauseChanged?.(this.e.paused); }
  restart(){ this.onRestart?.(); }
}
