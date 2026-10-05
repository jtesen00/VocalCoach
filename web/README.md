# Vocal Coach — web

Prototipo del motor de pitch (Fase 2): micrófono → AudioWorklet → detector MPM/YIN → nota, cents y confianza en tiempo real. No hay backend.

```bash
pnpm install
pnpm dev          # http://localhost:5173 (el micrófono requiere localhost o HTTPS)
pnpm test         # tests unitarios (Vitest)
pnpm test:e2e     # Playwright con micrófono falso (WAV sintético de C4)
pnpm bench        # benchmark sintético de los detectores
pnpm bench -- voz.wav [ref.csv]   # benchmark con una grabación real
pnpm build
```

Para probar en un móvil de la misma red: `pnpm dev --host` y abrir la URL por HTTPS (por ejemplo con un túnel), porque `getUserMedia` exige un contexto seguro.

Estructura y decisiones: [docs/PLAN.md](../docs/PLAN.md) y [docs/adr](../docs/adr/README.md). Resultados de medición: [docs/benchmarks](../docs/benchmarks/README.md).
