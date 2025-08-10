// audio.js — efectos simples con WebAudio (sin assets)
export class SFX {
  constructor(){
    this.ctx = null;
    this.muted = false;
  }
  ensure(){
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  setMuted(v){ this.muted = v; }
  beep(freq=440, dur=0.06, type='square', gain=0.03){
    if (this.muted) return;
    this.ensure();
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(); o.stop(t0 + dur);
  }
  line(){ this.beep(880, 0.08, 'triangle', 0.04); }
  tetris(){ this.beep(220, 0.16, 'sawtooth', 0.05); }
  hard(){ this.beep(660, 0.05, 'square', 0.04); }
  move(){ this.beep(520, 0.03, 'square', 0.025); }
  rotate(){ this.beep(740, 0.035, 'triangle', 0.03); }
  over(){ this.beep(140, 0.5, 'sine', 0.05); }
}
