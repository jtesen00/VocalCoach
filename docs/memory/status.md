# Estado actual

_Última actualización: 2026-10-05 · versión 0.2.0 + interfaz sencilla (sin publicar)_

## Ramas
- `main`: tiene la Fase 2 (PR #1 fusionado). **La Fase 3 no llegó a `main`**: se fusionó antes del último push.
- `dev`: Fase 3 + reorganización de `docs/` + interfaz sencilla. Pendiente de PR a `main`.
- `changes`: creada desde `main`, sin cambios.

## Hecho
- Fase 2 (motor de pitch) y Fase 3 (ejercicios), probadas con señales sintéticas y E2E en Chromium.
- Interfaz sencilla por defecto, con detalles técnicos opcionales en Ajustes.
- 94 tests unitarios, 8 E2E y CI.

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
