# ADR-005 — Base de datos

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Decisión
**PostgreSQL** gestionado. Se guardan **agregados por intento** (mediana de cents, accuracy, estabilidad, duración, puntuación, distribución de errores), no frames de pitch ni audio.

- Intentos **inmutables, append-only**, con UUID generado en cliente → sync idempotente sin conflictos.
- Cola de trabajos de IA como **tabla** (`FOR UPDATE SKIP LOCKED`). Sin Redis/Kafka.
- Binarios (audio generado, muestras de voz) en almacenamiento de objetos; en Postgres solo metadatos.
