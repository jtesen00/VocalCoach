import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { midiToFreq } from '../src/core/music/notes';
import { tone, VOICE_LIKE_HARMONICS } from '../src/core/pitch/signals';

/** WAV PCM 16 bits mono. */
export function writeWav(path: string, samples: Float32Array, sampleRate: number): void {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, data]));
}

/** Micrófono falso: 0,5 s de silencio + 2,5 s de una "vocal" sintética en C4 +5 cents (Chromium lo repite en bucle). */
export function writeFakeMic(path: string): void {
  const sr = 48000;
  const voice = tone({ sampleRate: sr, durationS: 2.5, hz: midiToFreq(60.05), harmonics: VOICE_LIKE_HARMONICS, amplitude: 0.3 });
  const out = new Float32Array(sr * 3);
  out.set(voice, sr / 2);
  writeWav(path, out, sr);
}

/** Archivo "canción" para importar: do-re-mi-fa-sol, silencio, sol-mi-do (voz sintética, 44,1 kHz). */
export function writeMelodyFile(path: string): void {
  const sr = 44100;
  const parts: [number | null, number][] = [
    [null, 0.3], [60, 0.4], [62, 0.4], [64, 0.4], [65, 0.4], [67, 0.8],
    [null, 0.6], [67, 0.5], [64, 0.5], [60, 1.0], [null, 0.3],
  ];
  const chunks = parts.map(([m, d]) =>
    m === null ? new Float32Array(Math.round(d * sr)) : tone({ sampleRate: sr, durationS: d, hz: midiToFreq(m), harmonics: VOICE_LIKE_HARMONICS, amplitude: 0.3 }),
  );
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  writeWav(path, out, sr);
}
