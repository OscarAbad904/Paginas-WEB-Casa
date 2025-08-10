// storage.js — mejores puntuaciones en localStorage
const KEY = 'tetris.highscores';
const MUTE = 'tetris.muted';

export function getHighScores(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || []; }catch{ return []; }
}
export function addHighScore(score){
  const arr = getHighScores();
  arr.push({ score, ts: Date.now() });
  arr.sort((a,b)=> b.score - a.score);
  localStorage.setItem(KEY, JSON.stringify(arr.slice(0,5)));
  return getHighScores();
}
export function clearHighScores(){
  localStorage.removeItem(KEY);
}
export function getMuted(){
  try{ return localStorage.getItem(MUTE) === '1'; }catch{ return false; }
}
export function setMuted(v){
  try{ localStorage.setItem(MUTE, v?'1':'0'); }catch{}
}
