/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Groq no garantiza CORS para llamadas desde el navegador: en desarrollo y en `vite preview`
// se reenvían por el propio servidor local (/groq → api.groq.com). La clave la pone el usuario.
const groqProxy = { '/groq': { target: 'https://api.groq.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/groq/, '') } };

export default defineConfig({
  plugins: [react()],
  server: { proxy: groqProxy },
  preview: { proxy: groqProxy },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
