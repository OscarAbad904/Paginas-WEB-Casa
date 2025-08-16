# Física implementada (resumen)

- **Gravedad**: Newton con *softening* `ε` (se usa `r^2 + ε^2`). Modo **O(N²)** en GPU.
- **Integración**: velocity-Verlet (leapfrog simplificado). `dt` adaptativo básico limitado por `dtMax`.
- **Gas (SPH)**: densidad con kernel Poly6 y fuerzas de presión con gradSpiky; viscosidad artificial estilo Monaghan.
- **Arrastre polvo-gas**: para `type=1` (polvo), se calcula velocidad de gas promedio en vecino `h` y se aplica `(v_gas - v)/τ`.
- **Colisiones/Acreción**: esfera pegajosa. Si `d < r_i + r_j`, fusiona j→i conservando masa y momento; el radio escala ∝ m^{1/3}.

## Limitaciones conocidas

- Vecindad y SPH/gravedad usan O(N²). Con N>8k bajará el rendimiento. La siguiente iteración añadirá **Barnes–Hut** para gravedad y **grid/hash en GPU** para SPH, cumpliendo el objetivo de 20k–50k @ 30 FPS.
- Conservación de energía y momento angular: con `dt` pequeño se mantiene razonable, pero aún no se reporta en HUD (pendiente de cálculo GPU→CPU eficiente).


## Métricas (v0.2)
- Se calculan en GPU cada ~frame: energía cinética K, potencial U (a partir de φ_i), momento angular **L**.
- El HUD muestra |ΔE|/E y |ΔL|/L relativos a la medida inicial.
- Contador de planetesimales por umbral de densidad.


## v0.3 — Barnes–Hut optimizado (GTX 1050)
- **BH 2D (quadtree en XZ)**: el árbol se construye en CPU cada ~10 frames para minimizar coste y se recorre en GPU con WGSL.
- Selector de **modo de gravedad** (auto/BH/N²) y **θ** (apertura). Recomendado θ≈0.6 en GTX 1050.
- **Calidad** ajusta N automáticamente (Baja≈50%, Media≈70%, Alta=100%).
- **Auto-reducir N** si los FPS bajan por debajo de 25.
> Nota: SPH sigue usando vecindad O(N²) en v0.3. Próxima versión (v0.4) migrará SPH y colisiones a **grid hash en GPU** para escalar a 20k+ en GPUs modestas.
