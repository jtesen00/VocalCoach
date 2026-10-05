# Estado actual

_Última actualización: 2026-10-05 · versión 0.2.0_

## Hecho
- Fase 2 (motor de pitch) y Fase 3 (ejercicios) implementadas y probadas con señales sintéticas y E2E en Chromium.
- 91 tests unitarios, 6 E2E y CI en verde (`.github/workflows/web.yml`).
- PR abierto: https://github.com/jtesen00/VocalCoach/pull/1 (rama `claude/quirky-noether-3parij`).

## Siguiente
1. Medir en dispositivos reales (checklist en `docs/benchmarks/README.md`).
2. Grabar intentos reales con consentimiento; validar el detector y el scoring frente al juicio de un profesor; ajustar umbrales.
3. Fase 4: profesor virtual (ampliar `core/exercises/feedback.ts` → `core/teacher/`).
4. Fase 5: progreso local en IndexedDB, learning path y mejor resultado por ejercicio.

## Preguntas abiertas
- ¿Confirmar que Dapper se quiere para las consultas del backend? Se interpretó que sí.
- ¿Cuánto debe durar cada "día" del learning path y qué ejercicios incluye cada uno? (Fase 5)

## Dónde está cada cosa
- Núcleo puro: `web/src/core/` (music, pitch, scoring, range, exercises).
- Audio: `web/src/audio/` (engine, pitch-worklet, guide, devices).
- Pantallas: `web/src/features/` (tuner, range, exercises).
- Planes: `docs/planning/` · ADRs: `docs/adr/` · Benchmarks: `docs/benchmarks/`.
