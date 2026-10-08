/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Groq no garantiza CORS para llamadas desde el navegador: en desarrollo y en `vite preview`
// se reenvían por el propio servidor local (/groq → api.groq.com). La clave la pone el usuario.
const groqProxy = { '/groq': { target: 'https://api.groq.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/groq/, '') } };
// Backend .NET local (api/): `dotnet run --project src/VocalCoach.Api` escucha en el puerto 5080.
const proxy = { ...groqProxy, '/api': { target: process.env.VOCALCOACH_API ?? 'http://localhost:5080', changeOrigin: true } };

const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  plugins: [
    react(),
    // Fase 7 — PWA: instalable y sin internet. Se guarda en caché todo lo necesario para
    // practicar (app, workers, sonidos de la guía). La actualización se ofrece, no se impone,
    // para no recargar la página a mitad de un ejercicio.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vocal Coach',
        short_name: 'Vocal Coach',
        description: 'Aprende a cantar afinado: corrección en tiempo real, ejercicios y canciones. Tu voz se analiza en tu dispositivo.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1d1b17',
        theme_color: '#1d1b17',
        categories: ['education', 'music'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json,md,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/groq/, /^\/api\//],
        cleanupOutdatedCaches: true,
        // El motor de la separación de voz (28 MB) no se precarga: se guarda la primera vez que se usa.
        runtimeCaching: [{ urlPattern: /\/assets\/ort-wasm.*\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'vocalcoach-ort-wasm', expiration: { maxEntries: 2 } } }],
      },
    }),
  ],
  // ONNX Runtime (separación de voz, Fase 8c) localiza sus .wasm con import.meta.url: sin pre-empaquetar.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  // Aislamiento de origen: permite a ONNX Runtime usar varios hilos al separar la voz (Fase 8c).
  // El hosting de producción debe enviar las mismas cabeceras; sin ellas funciona con un solo hilo.
  server: { proxy, headers: isolation },
  preview: { proxy, headers: isolation },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
