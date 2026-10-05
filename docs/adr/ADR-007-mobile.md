# ADR-007 — Estrategia móvil

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Decisión
1. **PWA** como única plataforma hasta tener mediciones reales (Android Chrome, iOS Safari).
2. **Capacitor** si se necesita tienda, notificaciones fiables en iOS o audio en segundo plano. Reutiliza el mismo motor.
3. **Nativo / React Native** solo ante una limitación **medida** de latencia o calidad que una API nativa resuelva.

## Riesgos a medir en Fase 2
Gesto de usuario para `AudioContext`, switch de silencio en iOS (`navigator.audioSession`), procesado forzado en Android, micro Bluetooth (HFP), pantalla bloqueada (Wake Lock).
