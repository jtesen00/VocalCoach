import { readFileSync } from 'node:fs';

/** Lector WAV mínimo (PCM 16/24/32 bits o float32). Mezcla a mono. */
export function readWav(path: string): { sampleRate: number; samples: Float32Array } {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('No es un WAV');
  let offset = 12;
  let format = 0, channels = 0, sampleRate = 0, bits = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      const bytes = bits / 8;
      const frames = Math.floor(size / (bytes * channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const p = body + (i * channels + c) * bytes;
          if (format === 3) sum += view.getFloat32(p, true);
          else if (bits === 16) sum += view.getInt16(p, true) / 32768;
          else if (bits === 24) sum += ((view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16)) / 8388608);
          else if (bits === 32) sum += view.getInt32(p, true) / 2147483648;
        }
        out[i] = sum / channels;
      }
      return { sampleRate, samples: out };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV sin bloque de datos');
}
