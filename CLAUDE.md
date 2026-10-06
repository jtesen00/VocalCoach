# VocalCoach

Antes de trabajar, lee `docs/memory/README.md` (estado, contexto, decisiones, convenciones y aprendizajes). Responde y documenta en español.

## Comandos (en `web/`, con pnpm)
- `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm bench` · `pnpm build`

## Comandos del backend (en `api/`, .NET 10)
- `docker compose up -d` (PostgreSQL) · `dotnet run --project src/VocalCoach.Api` · `dotnet test --solution VocalCoach.slnx`

## Ramas
- `main`: principal · `dev`: desarrollo · `changes`: ajustes y correcciones. Integrar en `main` mediante PR.

## Reglas clave
- **No firmar como Claude:** sin `Co-Authored-By`, sin enlaces de sesión en commits ni PRs, y sin pie "Generated with Claude Code".
- Interfaz sencilla por defecto; lo técnico solo con "Mostrar detalles técnicos".
- El audio nunca sale del dispositivo; el backend no participa en la detección de pitch.
- Backend: respetar ADR-004 (los tests de arquitectura lo comprueban). Secretos (JWT, claves de IA) solo por variables de entorno o user-secrets.
- `web/src/core/` es TS puro (sin React ni APIs del navegador).
- Al terminar un cambio relevante, actualiza `docs/CHANGELOG.md` y `docs/memory/status.md`.
