# Vocal Coach — API (.NET 10)

Backend de la Fase 6: cuentas, sincronización del progreso entre dispositivos e intermediario del profe con IA. **No participa en la detección de pitch**: el audio nunca sale del dispositivo.

Arquitectura (ADR-004):
- monolito modular con Clean Architecture por módulo y vertical slices;
- domain events en la misma transacción e integration events por outbox;
- EF Core para comandos y Dapper para consultas;
- PostgreSQL con un esquema por módulo.

## Arrancar en local
```bash
cd api
docker compose up -d                      # PostgreSQL 16 en localhost:5432 (o usa uno propio)
dotnet run --project src/VocalCoach.Api   # http://localhost:5080 (aplica las migraciones al arrancar en Development)
```
La web (`cd web && pnpm dev`) reenvía `/api` a `http://localhost:5080`. En Ajustes → Tu cuenta, crea una cuenta y tu progreso se sincronizará.

### Profe con IA por el servidor (multi-IA)
Se pueden configurar **Groq, Google Gemini y xAI Grok**. Se prueban en el orden de `Coach:Order` (por defecto `groq, gemini, xai`) y, si uno falla (límite, red, modelo retirado), responde el siguiente. Sin `Model`, cada uno elige su mejor modelo de texto de la lista del proveedor.

Las claves **no van en el repositorio** ni en el navegador. Hay dos formas de darlas:
```bash
dotnet user-secrets set "Coach:Groq:ApiKey" "gsk_..." --project src/VocalCoach.Api
dotnet user-secrets set "Coach:Gemini:ApiKey" "AIza..." --project src/VocalCoach.Api
dotnet user-secrets set "Coach:Xai:ApiKey" "xai-..." --project src/VocalCoach.Api
# o por variables de entorno: Coach__Groq__ApiKey, Coach__Gemini__ApiKey, Coach__Xai__ApiKey
```
Sin ninguna clave, `/api/coach/teacher` responde 503 «no configurado».

### Producción
Por variables de entorno:
- `ConnectionStrings__Database`;
- `Jwt__SigningKey` (≥ 32 bytes, aleatoria);
- `Coach__Groq__ApiKey`, `Coach__Gemini__ApiKey` y/o `Coach__Xai__ApiKey` (al menos una para el profe con IA);
- `Cors__Origins__0=https://tu-dominio`.

Las migraciones se aplican con `Database__MigrateOnStartup=true` o con `dotnet ef database update` por módulo.

## Tests
```bash
dotnet test --solution VocalCoach.slnx
```
- **Unitarios:** dominio.
- **Arquitectura:** NetArchTest, con las reglas de ADR-004.
- **Integración:** la API completa contra PostgreSQL real.
  - Por defecto con Testcontainers (necesita Docker).
  - Con un PostgreSQL propio: `VOCALCOACH_TEST_PG="Host=localhost;Username=...;Password=...;Database=postgres"`. Se crea y se borra una base temporal.

## Módulos
| Módulo | Esquema | Qué hace | Endpoints |
|---|---|---|---|
| Identity | `identity` | Cuentas, contraseñas (PBKDF2 de ASP.NET Identity), JWT de 1 h y refresh tokens rotativos con detección de reutilización | `POST /api/identity/register` · `login` · `refresh` · `logout` · `GET /api/identity/me` |
| Practice | `practice` | Intentos inmutables con UUID del cliente; sincronización idempotente por lotes | `POST /api/practice/attempts/sync` · `GET /api/practice/attempts?since=&limit=` |
| Progress | `progress` | Consume `AttemptRecorded` (outbox): racha, días practicados y mejor resultado por ejercicio o frase | `GET /api/progress/summary?today=` |
| Coach | — | Intermediario del profe con IA: añade la clave en el servidor y limita las peticiones por usuario | `POST /api/coach/teacher` |

Flujo de ejemplo:
1. `POST /attempts/sync`.
2. `Attempt.Record()` lanza el domain event `AttemptRecorded`.
3. Su handler escribe `AttemptRecordedIntegrationEvent` en `practice.outbox_messages`, en la misma transacción.
4. `OutboxBackgroundService` lo entrega con `FOR UPDATE SKIP LOCKED`.
5. Progress lo procesa una sola vez (tabla `processed_attempts`).

## Añadir una migración
```bash
dotnet tool restore
dotnet ef migrations add <Nombre> -p src/Modules/<Módulo>/VocalCoach.Modules.<Módulo>.Infrastructure -s src/VocalCoach.Api -c <Módulo>DbContext -o Database/Migrations
```
