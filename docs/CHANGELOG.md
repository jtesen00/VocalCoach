# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico; mientras la versión sea 0.x, cada fase es una versión menor.

## [Sin publicar]

## [0.2.0] — 2026-10-05 · Fase 3: ejercicios

### Añadido
- Catálogo de 9 ejercicios originales definidos como datos: notas sostenidas, secuencia do-re-mi, intervalos (tercera mayor y quinta justa), escalas (5 notas y mayor completa) y sirenas (ascendente y de ida y vuelta).
- Transposición automática al rango vocal calibrado, con ajuste manual de la tónica (±1 semitono).
- Flujo de llamada y respuesta: guía de referencia (notas y deslizamientos), cuenta atrás con claqueta y canto con línea de tiempo.
- Evaluación pura (`core/exercises/evaluate.ts`):
  - Por nota: estado, puntuación, accuracy, mediana de cents, estabilidad, vibrato y caída al final.
  - Intervalos medidos en cents.
  - Sirenas evaluadas como trayectoria: cobertura, dirección y cortes.
  - Compensación de latencia.
- Análisis de estabilidad y detección de vibrato, que no penaliza (`core/exercises/stability.ts`).
- Feedback básico con reglas declarativas y lenguaje acústico (`core/exercises/feedback.ts`).
- Pantalla de ejercicios: lista, ejecución, línea de tiempo en canvas y resultado con tabla por nota.
- Motor de audio: `playGuide` (notas y deslizamientos), `countdown`, `now()` y `latencyS()`.
- 29 tests unitarios nuevos (incluida una integración audio sintético → detector → evaluación) y 3 E2E de ejercicios.
- Documentación: `docs/planning/` (roadmap y planes de fase), `docs/memory/` (contexto para retomar el trabajo), este changelog y `CLAUDE.md`.

### Cambiado
- `docs/PLAN.md` se mueve a `docs/planning/PLAN.md`.
- La nota de referencia del afinador usa la nueva guía (`audio/guide.ts`, que sustituye a `reference-tone.ts`).

### Corregido
- La supresión del micrófono tras la guía ya no se queda bloqueada si el temporizador se adelanta al reloj de audio.
- La supresión se reinicia al volver a activar el micrófono (cada AudioContext empieza en t = 0).

## [0.1.0] — 2026-10-05 · Fase 2: motor de pitch

### Añadido
- Plan técnico afinado y ADR-001 a ADR-009 (backend con monolito modular y Clean Architecture; importación de canciones tipo karaoke).
- Prototipo web (React + Vite + TypeScript) sin backend:
  - Detectores McLeod (MPM) y YIN con FFT, dentro de un AudioWorklet.
  - `PitchTracker`: ruido de fondo adaptativo, detección de voz con histéresis y mediana.
  - Afinador con nota, cents, Hz, confianza, aguja y trayectoria en canvas.
  - Nota objetivo con llamada y respuesta; modo de octava configurable; precisión del intento (≥ 80 %, sin los primeros 250 ms).
  - Calibración del rango vocal y aviso de micrófono Bluetooth.
  - Panel de diagnóstico: latencias, estimaciones por segundo y estado de EC/NS/AGC.
- 62 tests unitarios, 3 E2E con micrófono falso, benchmark sintético y de WAV, y CI en GitHub Actions.
