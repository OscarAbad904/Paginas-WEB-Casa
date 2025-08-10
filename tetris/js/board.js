// board.js — tablero, colisiones, merge y limpieza de líneas
export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export function createBoard() {
  const b = new Array(ROWS);
  for (let y=0; y<ROWS; y++){
    const row = new Array(COLS);
    for(let x=0;x<COLS;x++) row[x]=0;
    b[y]=row;
  }
  return b;
}

export function cloneBoard(b){
  return b.map(r => r.slice());
}

export function cellAt(board, x, y) {
  if (y<0 || y>=ROWS || x<0 || x>=COLS) return -1; // fuera
  return board[y][x];
}

export function collides(board, piece, rotMatrix = null) {
  const m = rotMatrix || piece.matrix;
  for (let py=0; py<4; py++){
    for (let px=0; px<4; px++){
      const v = m[py*4+px];
      if (!v) continue;
      const x = piece.x + px;
      const y = piece.y + py;
      if (x<0 || x>=COLS || y>=ROWS) return true;
      if (y>=0 && board[y][x] !== 0) return true;
    }
  }
  return false;
}

export function merge(board, piece) {
  const kind = piece.kind;
  const m = piece.matrix;
  for (let py=0; py<4; py++){
    for (let px=0; px<4; px++){
      if (!m[py*4+px]) continue;
      const x = piece.x + px;
      const y = piece.y + py;
      if (y>=0) board[y][x] = kind;
    }
  }
}

export function fullRows(board) {
  const rows = [];
  for (let y=0; y<ROWS; y++){
    let full = true;
    for(let x=0; x<COLS; x++){
      if (board[y][x] === 0){ full=false; break; }
    }
    if (full) rows.push(y);
  }
  return rows;
}

// Compacta eliminando filas completas y añadiendo filas 0 arriba.
// Devuelve número de líneas eliminadas.
export function clearRows(board, rows) {
  const ordered = [...rows].sort((a, b) => b - a);
  for (const ry of ordered) {
    board.splice(ry, 1);
  }
  for (let i = 0; i < ordered.length; i++) {
    board.unshift(new Array(COLS).fill(0));
  }
  return ordered.length;
}
