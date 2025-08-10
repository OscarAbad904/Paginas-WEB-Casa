# Tetris Vanilla (HTML/CSS/JS)

### Controles
- ←/→ mover · ↓ soft drop · **Espacio** hard drop  
- **Z** rotar antihorario · **X** (o ↑) rotar horario  
- **C** Hold (una vez por caída)  
- **P** Pausa · **R** Reiniciar  
- Controles táctiles en móvil/desktop (overlay).

### Mecánicas
- Tablero: 10×20 visibles + 2 filas ocultas de spawn.
- Piezas: I,O,T,S,Z,J,L. Generador **7-bag**.
- Rotación **SRS** con **wall kicks** (I y resto).
- **Gravedad** por nivel (tabla), **lock delay** ~500 ms (se reinicia al mover/rotar).
- **Limpieza** de 1–4 líneas con animación breve (120 ms) y compactación.
- **Puntuación**: 1L=100, 2L=300, 3L=500, 4L=800.  
  Soft drop = +1 por celda; Hard drop = +2 por celda.  
  **Back-to-Back** para Tetris: +50% extra.  
  > _T-Spin no implementado_ (omitido a propósito).
- **Nivel** +1 cada 10 líneas; acelera la caída.
- **Cola** (5 visibles) y **Hold** con limitación por caída.
- **Game Over** al bloquear en zona oculta.

### Persistencia
- Mejores puntuaciones (top 5) en `localStorage`. Botón para borrar.
- Preferencia de mute en `localStorage`.

### Accesibilidad
- `role="application"`, botones con `aria-label`, foco visible.
- `aria-live="polite"` para anunciar líneas, nivel y game over.
- Control completo por teclado.

### Rendimiento
- Un único `requestAnimationFrame`, lógica por `dt`.
- Sin asignaciones por frame en hot paths; reutilización de estructuras.
- Canvas con `image-rendering: pixelated`. Ghost piece y grid en la misma pasada.

### Estructura
