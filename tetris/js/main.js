// main.js — arranque, loop, UI y wiring
import { Engine } from './engine.js';
import { Renderer } from './renderer.js';
import { SFX } from './audio.js';
import { getHighScores, addHighScore, clearHighScores, getMuted, setMuted } from './storage.js';

const $ = sel => document.querySelector(sel);
const canvas = $('#game-canvas');
const holdCanvas = $('#hold-canvas');
const nextList = $('#next-list');
const scoreEl = $('#score');
const levelEl = $('#level');
const linesEl = $('#lines');
const overlay = $('#overlay');
const overlayTitle = $('#overlay-title');
const overlaySub = $('#overlay-sub');
const btnResume = $('#btn-resume');
const btnRestart = $('#btn-restart');
const btnResetScores = $('#btn-reset-scores');
const scoresOl = $('#highscores');
const live = $('#live');
const btnMute = $('#btn-mute');

import { Input } from './input.js';

const sfx = new SFX();
sfx.setMuted(getMuted());
btnMute.setAttribute('aria-pressed', sfx.muted ? 'true' : 'false');
btnMute.textContent = sfx.muted ? '🔇' : '🔊';

const engine = new Engine((ev)=>{
  if (ev.type === 'lines'){
    announce(`${ev.count} línea${ev.count>1?'s':''} limpiada${ev.count>1?'s':''}${ev.b2b?' · Back-to-Back':''}`);
    if (ev.count === 4) sfx.tetris(); else sfx.line();
  }
  if (ev.type === 'level'){
    levelEl.textContent = engine.level;
    announce(`Nivel ${engine.level}`);
  }
  if (ev.type === 'gameover'){
    showOverlay('Game Over', 'Pulsa R para reiniciar');
    sfx.over();
    // guardar score
    const list = addHighScore(engine.score);
    renderScores(list);
  }
});
const renderer = new Renderer(canvas, holdCanvas, nextList);
const input = new Input(engine, sfx);
input.onPauseChanged = (p)=> p ? showOverlay('Pausa', 'Pulsa P para continuar') : hideOverlay();
input.onRestart = ()=>{ restart(); };

let last = performance.now();

function loop(ts){
  const dt = Math.min(33.33, ts - last); // limitar delta (ms)
  last = ts;

  if (!engine.paused && !engine.gameOver){
    engine.tick(dt);
  }
  engine.update(dt);
  renderer.tickFlash(dt);

  // UI
  const st = engine.getState();
  scoreEl.textContent = engine.score;
  levelEl.textContent = engine.level;
  linesEl.textContent = engine.lines;

  // Flash filas
  if (st.lineFlash && st.lineFlash.length) {
    renderer.setFlash(st.lineFlash);
  }
  renderer.draw({
    board: st.board,
    active: st.active,
    ghost: st.ghost,
    holdKind: st.holdKind,
    nextKinds: st.nextKinds,
    visible: st.visible
  });

  requestAnimationFrame(loop);
}

function showOverlay(title, sub){
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;
  btnResume.focus();
}
function hideOverlay(){
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
  canvas.focus();
}

function restart(){
  engine.reset();
  hideOverlay();
  updateSide();
}

function updateSide(){
  renderScores(getHighScores());
  levelEl.textContent = engine.level;
  linesEl.textContent = engine.lines;
  scoreEl.textContent = engine.score;
}

function renderScores(list){
  scoresOl.innerHTML = '';
  list.forEach((it,i)=>{
    const li = document.createElement('li');
    const date = new Date(it.ts);
    li.textContent = `${i+1}. ${it.score}  · ${date.toLocaleDateString()}`;
    scoresOl.appendChild(li);
  });
}

function announce(text){
  // Región en vivo accesible
  live.textContent = text;
}

btnResume.addEventListener('click', ()=> input.togglePause());
btnRestart.addEventListener('click', ()=> restart());
btnResetScores.addEventListener('click', ()=> { clearHighScores(); renderScores([]); announce('Mejores puntuaciones borradas'); });
btnMute.addEventListener('click', ()=>{
  sfx.setMuted(!sfx.muted);
  setMuted(sfx.muted);
  btnMute.setAttribute('aria-pressed', sfx.muted ? 'true' : 'false');
  btnMute.textContent = sfx.muted ? '🔇' : '🔊';
  announce(sfx.muted ? 'Sonido desactivado' : 'Sonido activado');
});

// TÁCTIL
setupTouch();

// Focus inicial en el canvas para teclado
canvas.addEventListener('pointerdown', ()=> canvas.focus(), {passive:true});
canvas.tabIndex = 0;
// Escalar la interfaz para ajustarla a la ventana

const appEl = document.getElementById('app');
const gameSection = document.querySelector('.game');
const aspect = 10 / 20; // ancho/alto
const maxGameWidth = 480; // px, máximo deseado
const maxGameHeight = 960; // px, máximo deseado
const minMargin = 24; // px, margen inferior mínimo

function resizeGame() {
  // Calcular el área disponible (restando margen inferior)
  const availWidth = Math.min(window.innerWidth, maxGameWidth);
  const availHeight = Math.min(window.innerHeight - minMargin, maxGameHeight);
  // Mantener relación de aspecto
  let width = availWidth;
  let height = width / aspect;
  if (height > availHeight) {
    height = availHeight;
    width = height * aspect;
  }
  // Ajustar el tamaño real del canvas
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  // Centrar el área de juego
  gameSection.style.width = width + 'px';
  gameSection.style.height = height + 'px';
  gameSection.style.margin = '0 auto';
  // Ajustar el contenedor principal
  appEl.style.position = 'static';
  appEl.style.transform = 'none';
}

window.addEventListener('resize', resizeGame);
resizeGame();

canvas.focus();

// Iniciar
updateSide();
requestAnimationFrame(loop);

// ---------- táctil ----------
function setupTouch(){
  const T = id => document.getElementById(id);
  const el = document.getElementById('touch');

  // Evitar scroll/zoom accidental
  el.style.touchAction = 'none';

  pressHold(T('t-left'), on=> input.holdLeft(on));
  pressHold(T('t-right'), on=> input.holdRight(on));
  pressHold(T('t-down'), on=> input.softDown(on));

  tap(T('t-rot-l'), ()=> input.rotateL());
  tap(T('t-rot-r'), ()=> input.rotateR());
  tap(T('t-hard'),  ()=> input.hard());
  tap(T('t-hold'),  ()=> input.hold());
  tap(T('t-pause'), ()=> input.togglePause());

  function pressHold(btn, cb){
    let active=false;
    const onDown = (e)=>{ e.preventDefault(); if (engine.paused||engine.gameOver) return; active=true; cb(true); };
    const onUp = (e)=>{ e.preventDefault(); if (!active) return; active=false; cb(false); };
    btn.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    btn.addEventListener('pointercancel', onUp);
    btn.addEventListener('contextmenu', e=> e.preventDefault());
  }
  function tap(btn, cb){
    btn.addEventListener('pointerdown', e=>{ e.preventDefault(); if (engine.paused||engine.gameOver) return; cb(); });
    btn.addEventListener('contextmenu', e=> e.preventDefault());
  }
}
