# ADR-008 — Audio con IA

**Estado:** Propuesto (Fase 9) · **Fecha:** 2026-10-05

## Decisión
Escalera de menor a mayor riesgo; cada peldaño solo si el anterior demuestra valor:
1. **Sin IA:** melodía sintetizada + guías vocales propias grabadas.
2. **SVS** (letra + melodía → canto) con voces de licencia comercial verificada, en servicio **Python aislado** sobre GPU serverless por uso, alimentado por la cola de Postgres.
3. **Conversión de voz** al timbre del propio usuario: consentimiento explícito, verificación de que la voz es suya, borrado real de muestras y modelo, sin otros usos.

Texto → canto directo con la voz del usuario: **descartado** (inmaduro, caro, riesgo legal).

## Ampliación (spec incremental §17)
La entrada de una demostración puede ser también **frase de canción + melodía objetivo (ADR-010) + características vocales del usuario**. Mismo orden y mismas salvaguardas; no se implementa antes de que el entrenamiento por canción funcione.

## Consecuencias
El producto no depende de la IA. La funcionalidad exige **texto + melodía**, nunca solo texto.
