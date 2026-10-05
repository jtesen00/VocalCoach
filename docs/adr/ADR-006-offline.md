# ADR-006 — Offline y almacenamiento local

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Decisión
- **PWA** con `vite-plugin-pwa` (Workbox): shell y ejercicios precacheados.
- **IndexedDB vía Dexie** para progreso, intentos, ajustes y trayectorias reducidas opcionales (10 pts/s) solo locales.
- `navigator.storage.persist()` al empezar a guardar progreso (Safari puede borrar datos de PWAs no instaladas).
- Sin audio crudo almacenado.

La PWA se adelanta **antes** del backend (es barata y el producto ya es local).
