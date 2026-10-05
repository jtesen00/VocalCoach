import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFakeMic, writeMelodyFile, writeSongMixFile } from './e2e/fake-mic';

const fakeMic = resolve(import.meta.dirname, 'e2e/.fixtures/c4-voice.wav');
writeFakeMic(fakeMic);
writeMelodyFile(resolve(import.meta.dirname, 'e2e/.fixtures/melodia-prueba.wav'));
writeSongMixFile(resolve(import.meta.dirname, 'e2e/.fixtures/cancion-completa.wav'));

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${fakeMic}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: { command: 'pnpm exec vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
});
