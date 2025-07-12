# Virus Card Game

This directory contains a small browser implementation of the card game **Virus!**.

## Objetivo

El juego simula una partida básica de *Virus!* donde un jugador humano compite contra un bot. Gana quien logra tener cuatro órganos sanos e inmunes antes que su oponente.

## Ejecutar localmente

1. Sitúate en la carpeta del proyecto `virus_card_game`.
2. Inicia un servidor web local. Por ejemplo:
   ```bash
   # Con Python
   python3 -m http.server 8000
   ```
3. Abre en tu navegador `http://localhost:8000/index.html`.

Esto permitirá cargar los módulos JavaScript correctamente y jugar desde tu navegador.

## Estructura de archivos

- `index.html` – Página principal del juego.
- `styles.css` – Estilos base y diseño con Tailwind.
- `engine.js` – Lógica del motor de juego.
- `ui.js` – Manejo de la interfaz y eventos del usuario.
- `script.js` – Versión previa del motor con renderizado clásico.
- `images/` – Recursos gráficos para cartas y órganos.

