# Convenciones

## Código
- `web/src/core/` es **TypeScript puro**: sin React, sin APIs del navegador y sin imports de `audio/` o `features/`. Se ejecuta igual en el AudioWorklet, en Vitest y en el benchmark.
- `web/src/audio/` es lo único que toca Web Audio y `getUserMedia`. El motor es un singleton (`audioEngine`) independiente de React.
- Organización por funcionalidad en `features/`. React solo recibe estado de baja frecuencia (≈ 15 Hz); lo de alta frecuencia se dibuja en canvas con `requestAnimationFrame` leyendo de refs.
- Tiempos siempre en el **reloj del AudioContext** (`frame.t`, `audioEngine.now()`), nunca `Date.now()`, para alinear audio y evaluación.
- Lógica pedagógica como **datos o reglas** (`catalog.ts`, `feedback.ts`), no dentro de componentes.
- UI, comentarios y documentación en español. Los nombres de código, en inglés.
- Estados con texto e icono, además del color. Controles con `aria-label`, anuncios con `aria-live`.

## Tests
- Unitarios junto al código (`*.test.ts`), con señales sintéticas generadas en el propio test (`core/pitch/signals.ts`), sin WAVs en el repo.
- E2E en `web/e2e/` con micrófono falso: Chromium reproduce `e2e/.fixtures/c4-voice.wav` (C4 +5 c, 0,5 s de silencio cada 3 s, en bucle). Las aserciones deben tolerar que ese silencio caiga en cualquier punto.
- Antes de subir: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

## Proceso
- Cada cambio relevante actualiza `docs/CHANGELOG.md` y `docs/memory/status.md`; las decisiones nuevas van a `docs/memory/decisions.md` (y a un ADR si son de arquitectura).
- Commits con mensaje descriptivo en español: `tipo(ámbito): resumen`.
