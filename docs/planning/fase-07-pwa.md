# Fase 7 — PWA: instalable y sin internet

**Estado:** implementada (en `dev`). Sigue lo decidido en ADR-006.

## Qué incluye
- **Service worker** (`vite-plugin-pwa`, Workbox `generateSW`).
  - Precachea todo lo necesario para practicar (≈ 3,6 MB):
    - la app y los workers (detector de pitch y análisis de canciones);
    - los iconos;
    - los sonidos de la guía.
  - Sin internet se puede hacer todo menos el profe con IA.
  - Las llamadas a `/groq` (proxy local de la IA) quedan fuera de la caché.
- **Actualizaciones sin sorpresas** (`registerType: 'prompt'`):
  - aviso «Hay una versión nueva → Actualizar / Más tarde»;
  - nunca se recarga a mitad de un ejercicio;
  - la primera vez avisa de que la app está «Lista para usar sin internet».
- **Instalación:**
  - Manifiesto (`display: standalone`, español, colores de la app) e iconos 192/512, *maskable* y Apple.
  - En **Ajustes → Instalar la app**: el botón del navegador (`beforeinstallprompt`) o instrucciones para iPhone/iPad (Compartir → Añadir a pantalla de inicio).
- **Sin conexión:** aviso en la cabecera. El profe con IA indica que necesita internet.
- **Almacenamiento persistente:**
  - `navigator.storage.persist()` se pide tras el primer intento guardado, cuando el usuario ya tiene progreso que perder.
  - En Progreso se indica si está protegido o se recomienda instalar la app.

## Pruebas
- E2E `pwa.spec.ts` sobre la versión compilada (`vite build && vite preview` en el puerto 4173):
  - manifiesto;
  - service worker activo;
  - sin conexión, la app carga, los sonidos salen de la caché y se supera un ejercicio.
- Con el servidor de desarrollo el service worker no se registra; para probarlo a mano: `pnpm build && pnpm preview`.

## Pendiente
- Probar la instalación en Android (Chrome) y iPhone (Safari) reales.
- Comprobar en Safari si concede `persist()` a la app instalada.
