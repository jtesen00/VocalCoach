# ADR-001 — Frontend

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Contexto
La app es un instrumento interactivo. Lo crítico (audio) es TypeScript independiente del framework; el framework solo afecta a UI, ecosistema y salida a móvil.

## Decisión
**React + Vite + TypeScript.** Una sola app (sin monorepo de paquetes al inicio). Visualizaciones de alta frecuencia en **Canvas + requestAnimationFrame**, fuera del render de React. Estado: `useSyncExternalStore` + `useReducer`; Zustand solo si aparece estado global real.

## Alternativas
- **Svelte:** técnicamente igual de válido y más ligero; menor ecosistema y sin camino a React Native.
- **Vue:** válido; sin ventaja diferencial.
- **Angular:** demasiado marco para un producto centrado en audio.

## Consecuencias
`src/core` no puede importar React (regla de lint) para poder extraerlo a paquete o reutilizarlo en tests, benchmarks y móvil.
