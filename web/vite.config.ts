/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Groq no garantiza CORS para llamadas desde el navegador: en desarrollo y en `vite preview`
// se reenvían por el propio servidor local (/groq → api.groq.com). La clave la pone el usuario.
const groqProxy = { '/groq': { target: 'https://api.groq.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/groq/, '') } };

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
        navigateFallbackDenylist: [/^\/groq/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { proxy: groqProxy },
  preview: { proxy: groqProxy },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
