# ADR-004 — Backend

**Estado:** Aceptado (revisado) · **Fecha:** 2026-10-05

## Contexto
El backend no está en el bucle de audio. Gestiona usuarios, perfil, catálogo de ejercicios y canciones, sincronización de progreso, learning path, logros y trabajos de IA. Vivirá años y crecerá por módulos, así que el equipo quiere una estructura sólida desde el principio.

## Decisión
**ASP.NET Core .NET 10 (LTS)** organizado como:

- **Monolito modular:** un único despliegue y una base de datos, con módulos aislados (`Identity`, `Catalog`, `Practice`, `Progress` y más adelante `DemoGeneration`). Cada módulo tiene su **esquema de PostgreSQL** y su `DbContext`. No hay claves foráneas entre esquemas: se referencian por id.
- **Clean Architecture por módulo:** `Domain` (agregados, value objects, domain events; sin dependencias) → `Application` (casos de uso) → `Infrastructure` (EF Core, Dapper, outbox) y `Presentation` (endpoints minimal API). Las dependencias apuntan hacia el dominio.
- **Vertical slices** dentro de `Application`: cada caso de uso es una carpeta con su comando o consulta, handler y validador (`Features/RecordAttempt/`, `Features/GetProgress/`…).
- **CQRS ligero:** **EF Core** para comandos (agregados, transacciones) y **Dapper** para consultas (SQL directo sobre tablas o vistas, DTOs planos).
- **Domain events** despachados al guardar (interceptor de EF Core), dentro del mismo módulo y transacción. **Integration events** entre módulos mediante una **tabla outbox** en PostgreSQL procesada por un `BackgroundService`. Sin broker de mensajes.
- Mediador: interfaces propias `ICommandHandler`/`IQueryHandler` con decoradores (validación, logging, transacción), o la librería `Mediator` (source generator, MIT). **MediatR y AutoMapper no**, porque desde 2025 tienen licencia comercial. FluentValidation para validar y mapeo manual.
- REST, sin SignalR/WebSockets. Se introduce en la **Fase 6**.

```
api/
├─ src/
│  ├─ VocalCoach.Api/                       # host: Program.cs, auth, middlewares, registro de módulos
│  ├─ BuildingBlocks/
│  │  ├─ VocalCoach.SharedKernel/           # Entity, AggregateRoot, IDomainEvent, ValueObject, Result
│  │  ├─ VocalCoach.BuildingBlocks.Application/     # ICommand/IQuery, handlers, decoradores
│  │  └─ VocalCoach.BuildingBlocks.Infrastructure/  # outbox, interceptor de domain events, conexión Dapper
│  └─ Modules/
│     └─ Practice/                          # igual para Identity, Catalog, Progress…
│        ├─ VocalCoach.Modules.Practice.Domain/
│        ├─ VocalCoach.Modules.Practice.Application/      # Features/<CasoDeUso>/
│        ├─ VocalCoach.Modules.Practice.Infrastructure/   # PracticeDbContext (esquema "practice"), consultas Dapper, migraciones
│        ├─ VocalCoach.Modules.Practice.Presentation/     # endpoints
│        └─ VocalCoach.Modules.Practice.IntegrationEvents/ # contratos públicos para otros módulos
└─ tests/
   ├─ VocalCoach.ArchitectureTests/         # reglas de dependencia y aislamiento entre módulos (NetArchTest)
   └─ Modules/Practice/…UnitTests, …IntegrationTests (Testcontainers + PostgreSQL)
```

Ejemplo de flujo: `POST /api/practice/attempts` → `RecordAttempt` (EF Core) → domain event `AttemptRecorded` → outbox → el módulo `Progress` consume `AttemptRecordedIntegrationEvent` → actualiza la racha y desbloquea el día si accuracy ≥ 80 %.

## Implementación (Fase 6, 2026-10-06)
Implementado en `api/` (ver `api/README.md`). Ajustes respecto a lo previsto:
- **Domain events:** se despachan en `ModuleDbContext.SaveChangesAsync`, antes de guardar y en la misma transacción. Es equivalente al interceptor, pero explícito y fácil de seguir.
- **Consultas Dapper dentro del slice** (`Application/Features/<Consulta>`), con `IDbConnectionFactory`. Así el caso de uso queda entero en una carpeta. Los comandos sí pasan por repositorios con EF Core en `Infrastructure`.
- **Mediador propio:** `ICommandHandler`/`IQueryHandler` con decoradores de validación (FluentValidation) y registro. Sin librerías comerciales.
- **Módulo Coach** (intermediario de IA): no tiene dominio ni base de datos. Solo tiene `Application`, `Infrastructure` y `Presentation`.
- **Catalog** queda para cuando el catálogo deba editarse sin publicar la app. Hoy los ejercicios y canciones son datos del cliente.
- **Bloque `BuildingBlocks.Presentation`:** traduce `Result` a ProblemDetails, para no repetirlo en cada módulo.

## Reglas verificadas por tests de arquitectura
- `Domain` no depende de ningún otro proyecto ni de EF Core o ASP.NET.
- `Application` no depende de `Infrastructure` ni de `Presentation`.
- Un módulo solo puede referenciar los `IntegrationEvents` de otro módulo, nunca sus proyectos internos.

## Alternativas
- **Capas sin módulos:** más simple al principio, pero se acopla al crecer.
- **Microservicios:** descartado. Coste operativo sin necesidad de escalar por separado.
- **Node/TS, Go, Python:** válidos, pero no superan a .NET para esta estructura con un equipo que ya lo domina.

## Consecuencias
- Más proyectos desde el inicio (≈5 por módulo). Se compensa con una plantilla de módulo y con los tests de arquitectura.
- Un módulo podría extraerse a servicio en el futuro sin reescribir, porque ya se comunica por integration events.
