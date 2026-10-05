# ADR-005 — Base de datos

**Estado:** Aceptado (revisado) · **Fecha:** 2026-10-05

## Decisión
**PostgreSQL** gestionado, una sola base de datos con **un esquema por módulo** (`identity`, `catalog`, `practice`, `progress`…), migraciones de EF Core por módulo.

- Se guardan **agregados por intento** (mediana de cents, accuracy, estabilidad, duración, puntuación, distribución de errores), no frames de pitch ni audio.
- Intentos **inmutables, append-only**, con UUID generado en el cliente → sync idempotente sin conflictos.
- **Outbox** por módulo (`<esquema>.outbox_messages`) para integration events.
- Cola de trabajos de IA como **tabla** (`FOR UPDATE SKIP LOCKED`). Sin Redis/Kafka.
- Lecturas con Dapper sobre tablas o vistas del propio esquema del módulo.
- Binarios (audio generado, muestras de voz) en almacenamiento de objetos; en Postgres solo metadatos.
- Canciones importadas por el usuario: **no se guardan en el servidor** (ADR-009).
