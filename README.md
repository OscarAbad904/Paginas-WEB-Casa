# Juego de Cartas **Virus!** en el Navegador

Este repositorio contiene una implementación ligera de **Virus!**, el popular juego de cartas, pensada para ejecutarse directamente en el navegador. La interfaz está diseñada con Tailwind CSS y toda la lógica se desarrolla en JavaScript puro.

## ¿En qué consiste?

Se trata de una versión simplificada para un solo jugador donde te enfrentas a un bot. Tu objetivo es ser el primero en conseguir cuatro órganos sanos antes que tu oponente. El bot realiza acciones básicas para mantener la partida fluida y ponerte a prueba.

Entre las características principales se encuentran:

- Tablero interactivo con animaciones.
- Gestor de mazo, descarte y mano de cartas.
- Control de turnos y mensajes dinámicos.
- Elementos visuales originales inspirados en el juego físico.

## Ejecución local

1. Colócate en la carpeta del proyecto.
2. Inicia un servidor web local. Un ejemplo rápido con Python:
   ```bash
   python3 -m http.server 8000
   ```
3. Abre `http://localhost:8000/index.html` en tu navegador favorito.

Al tratarse de módulos ES, es necesario un servidor para cargar correctamente los scripts.

## Estructura del proyecto

- `index.html` — Entrada principal y plantillas HTML.
- `styles.css` — Hoja de estilos personalizada y configuración de Tailwind.
- `engine.js` — Lógica del juego: mazo, turno y reglas básicas.
- `ui.js` — Capa de interfaz: renderizado y manejo de eventos del usuario.
- `script.js` — Versión previa del motor conservada a modo de referencia.
- `images/` — Recursos gráficos para las cartas y los órganos.

## Contribución

Cualquier mejora o sugerencia es bienvenida. Puedes forkear el repositorio y enviar tus cambios mediante un Pull Request.

¡Disfruta desarrollando y jugando a **Virus!** desde tu navegador!
