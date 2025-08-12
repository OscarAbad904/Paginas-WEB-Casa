# Física implementada (resumen)

- **Gravedad**: Newton con *softening* `ε` (se usa `r^2 + ε^2`). Modo **O(N²)** en GPU.
- **Integración**: velocity-Verlet (leapfrog simplificado). `dt` adaptativo básico limitado por `dtMax`.
- **Gas (SPH)**: densidad con kernel Poly6 y fuerzas de presión con gradSpiky; viscosidad artificial estilo Monaghan.
- **Arrastre polvo-gas**: para `type=1` (polvo), se calcula velocidad de gas promedio en vecino `h` y se aplica `(v_gas - v)/τ`.
- **Colisiones/Acreción**: esfera pegajosa. Si `d < r_i + r_j`, fusiona j→i conservando masa y momento; el radio escala ∝ m^{1/3}.

## Limitaciones conocidas

- Vecindad y SPH/gravedad usan O(N²). Con N>8k bajará el rendimiento. La siguiente iteración añadirá **Barnes–Hut** para gravedad y **grid/hash en GPU** para SPH, cumpliendo el objetivo de 20k–50k @ 30 FPS.
- Conservación de energía y momento angular: con `dt` pequeño se mantiene razonable, pero aún no se reporta en HUD (pendiente de cálculo GPU→CPU eficiente).
