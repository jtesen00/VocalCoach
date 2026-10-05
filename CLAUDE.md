# VocalCoach

Antes de trabajar, lee `docs/memory/README.md` (estado, contexto, decisiones, convenciones y aprendizajes). Responde y documenta en español.

## Comandos (en `web/`, con pnpm)
- `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm bench` · `pnpm build`

## Reglas clave
- El audio nunca sale del dispositivo; el backend no participa en la detección de pitch.
- `web/src/core/` es TS puro (sin React ni APIs del navegador).
- Al terminar un cambio relevante, actualiza `docs/CHANGELOG.md` y `docs/memory/status.md`.
