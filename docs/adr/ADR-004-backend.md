# ADR-004 — Backend

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Contexto
El backend no está en el bucle de audio: es auth, perfil, catálogo, sync de progreso y orquestación de trabajos de IA. Cualquier stack moderno sirve; manda la familiaridad del equipo.

## Decisión
**ASP.NET Core .NET 10 (LTS)** como **monolito modular**: un proyecto, carpetas por feature (vertical slices), endpoints minimal API. **EF Core** para todo; Dapper solo si una consulta medida lo justifica. REST. Sin SignalR/WebSockets.

Se introduce en la **Fase 6**, no antes.

## Alternativas
- **Node/TS:** la más productiva si el equipo fuera solo frontend (tipos compartidos). Elegir esta si no hay experiencia en .NET.
- **Go:** sin ventaja para CRUD.
- **Python:** solo para el servicio de IA (ADR-008).

## Consecuencias
Sin capas Api/Application/Domain/Infrastructure separadas en proyectos distintos mientras el dominio sea pequeño.
