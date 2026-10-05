# ADR-003 — Detección de pitch

**Estado:** Aceptado (sujeto al benchmark de Fase 2) · **Fecha:** 2026-10-05

## Decisión
- Detector por defecto: **McLeod Pitch Method (MPM)**; su *clarity* es la confianza. Se puede partir de `pitchy` (MIT).
- **YIN** implementado tras la misma interfaz para comparar en el benchmark.
- Rango 70–1100 Hz. Mediana de 3–5 frames. Voicing por nivel sobre ruido de fondo + clarity, con histéresis.
- El motor emite **MIDI continuo**; los cents respecto al objetivo los calcula el scoring.

## Descartado para MVP
- Zero-crossing, AMDF, autocorrelación simple: errores de octava con voz.
- **CREPE / modelos neuronales (ONNX/TF.js):** más robustos con ruido, pero coste de descarga, CPU y batería en móvil. **Plan B** si el DSP no cumple los criterios con ruido; candidatos ligeros (p. ej. PESTO) primero.

## Criterios de éxito
Ver `docs/planning/PLAN.md` §9.
