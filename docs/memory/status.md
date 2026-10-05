# Estado actual

_Última actualización: 2026-10-05 · versión 0.2.0 + interfaz sencilla + Fase 4 + Fase 8a (sin publicar, en `dev`)_

## Ramas
- `main`: tiene la Fase 2 (PR #1 fusionado). **La Fase 3 no llegó a `main`**: se fusionó antes del último push.
- `dev`: Fase 3 + reorganización de `docs/` + interfaz sencilla + Fase 4 (profesor virtual) + Fase 8a (entrenamiento por canción e importación desde audio). PR abierto a `main`: https://github.com/jtesen00/VocalCoach/pull/2
- `changes`: creada desde `main`, sin cambios.

## Hecho
- Fase 2 (motor de pitch) y Fase 3 (ejercicios), probadas con señales sintéticas y E2E en Chromium.
- Interfaz sencilla por defecto, con detalles técnicos opcionales en Ajustes.
- Fase 4: profesor virtual (diagnóstico, consejos, demostraciones sonoras, siguiente paso y coach en vivo).
- Fase 8a: canciones, perfil vocal dinámico, tono recomendado, dificultad personal, frases, entrenamiento generado e importación local desde MP3.
- 187 tests unitarios, 12 E2E y CI.

## Siguiente
1. Medir en dispositivos reales (checklist en `docs/benchmarks/README.md`).
2. Grabar intentos reales con consentimiento; validar el detector y el scoring frente al juicio de un profesor; ajustar umbrales.
3. Revisar los textos del profesor con un profesor de canto y validar con alumnos el bucle de canciones.
3b. Mejoras de importación: editar frases o letra; separación de voz (8c).
4. Fase 5: progreso local en IndexedDB (incluye el historial que usa el profesor), learning path y mejor resultado por ejercicio.

## Preguntas abiertas
- ¿Confirmar que Dapper se quiere para las consultas del backend? Se interpretó que sí.
- ¿Cuánto debe durar cada "día" del learning path y qué ejercicios incluye cada uno? (Fase 5)

## Dónde está cada cosa
- Núcleo puro: `web/src/core/` (music, pitch, scoring, range, exercises, teacher, profile, songs).
- Audio: `web/src/audio/` (engine, pitch-worklet, guide, devices).
- Pantallas: `web/src/features/` (tuner, range, exercises, teacher, settings, songs).
- Datos locales (`localStorage`): `vocalcoach.settings.v1`, `vocalcoach.profile.v1`, `vocalcoach.songs.v1`, `vocalcoach.imported.v1`.
- Planes: `docs/planning/` · ADRs: `docs/adr/` · Benchmarks: `docs/benchmarks/`.
