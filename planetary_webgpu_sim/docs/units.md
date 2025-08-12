# Unidades

Para simplicidad, esta primera versión usa **unidades adimensionales** (no SI/AU). Se escalan de forma que:

- Distancias típicas ~ 1 corresponde a radios del disco inicial (0.5–2.0).
- Masas: suma de masas ≈ 1–2.
- Tiempos: controlados por `dtMax` y warp.

La constante gravitatoria `G` se expone como parámetro para poder calibrar la dinámica. En presets se usa `G≈6.674e-3` para estabilidad con `dt≈0.005–0.01`.

> **Mejora futura**: Añadir selector de unidades SI/AU y factores de conversión explícitos.
