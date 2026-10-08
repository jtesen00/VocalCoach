# ADR-008 — Audio con IA

**Estado:** Aceptado; peldaño 1 implementado (Fase 9) · **Fecha:** 2026-10-05 · revisado 2026-10-07

## Decisión
Escalera de menor a mayor riesgo; cada peldaño solo si el anterior demuestra valor:
1. **Sin IA:** melodía sintetizada + guías vocales propias grabadas.
2. **SVS** (letra + melodía → canto) con voces de licencia comercial verificada, en servicio **Python aislado** sobre GPU serverless por uso, alimentado por la cola de Postgres.
3. **Conversión de voz** al timbre del propio usuario: consentimiento explícito, verificación de que la voz es suya, borrado real de muestras y modelo, sin otros usos.

Texto → canto directo con la voz del usuario: **descartado** (inmaduro, caro, riesgo legal).

## Ampliación (spec incremental §17)
La entrada de una demostración puede ser también **frase de canción + melodía objetivo (ADR-010) + características vocales del usuario**. Mismo orden y mismas salvaguardas; no se implementa antes de que el entrenamiento por canción funcione.

## Implementación (2026-10-07)
- **Peldaño 1 hecho**, ampliado: además de la melodía, una **voz sintética por formantes** canta la letra en el dispositivo (sin IA, sin descargas y sin voces de terceros). Detalle en [fase-09](../planning/fase-09-demostraciones-cantadas.md).
- La frase se convierte en una **partitura cantada** (`SungScore`: fonemas en el tiempo + alturas). Es la entrada que recibiría un proveedor de los peldaños 2 y 3, sin cambiar la interfaz.
- La IA de texto (multi-proveedor: Groq, Gemini, Grok) da **ideas de interpretación** a partir de la frase, la melodía y la zona cómoda del usuario. Solo texto.

## Consecuencias
El producto no depende de la IA. La funcionalidad exige **texto + melodía**, nunca solo texto.
