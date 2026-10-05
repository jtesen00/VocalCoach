/** Señales sintéticas deterministas para tests y benchmark. */

export interface ToneOptions {
  sampleRate: number;
  durationS: number;
  /** Frecuencia en Hz o función del tiempo (vibrato, sirenas). */
  hz: number | ((t: number) => number);
  amplitude?: number;
  /** Amplitudes relativas de los armónicos (1 = fundamental). */
  harmonics?: readonly number[];
}

/** Armónicos con caída ~1/k^1.5, aproximación grosera de una vocal cantada. */
export const VOICE_LIKE_HARMONICS = [1, 0.5, 0.35, 0.25, 0.2, 0.12, 0.1, 0.06];

export function tone({ sampleRate, durationS, hz, amplitude = 0.3, harmonics = [1] }: ToneOptions): Float32Array {
  const n = Math.round(sampleRate * durationS);
  const out = new Float32Array(n);
  const freq = typeof hz === 'number' ? () => hz : hz;
  const norm = harmonics.reduce((a, b) => a + b, 0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) v += harmonics[k] * Math.sin((k + 1) * phase);
    out[i] = (amplitude * v) / norm;
    phase += (2 * Math.PI * freq(i / sampleRate)) / sampleRate;
  }
  return out;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function whiteNoise(sampleRate: number, durationS: number, amplitude: number, seed = 1): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.round(sampleRate * durationS));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * (2 * r() - 1);
  return out;
}

/** Suma b sobre a (mismo largo o b más corto). */
export function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = Float32Array.from(a);
  for (let i = 0; i < Math.min(a.length, b.length); i++) out[i] += b[i];
  return out;
}

export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/** Añade ruido blanco con la SNR indicada (dB). */
export function withNoise(signal: Float32Array, snrDb: number, seed = 7): Float32Array {
  const noiseRms = rms(signal) / 10 ** (snrDb / 20);
  return mix(signal, whiteNoise(1, signal.length, noiseRms * Math.sqrt(3), seed));
}

/** Trocea una señal en ventanas como lo hace el worklet (ventana `size`, salto `hop`). */
export function* frames(signal: Float32Array, size: number, hop: number): Generator<{ frame: Float32Array; end: number }> {
  for (let end = size; end <= signal.length; end += hop) {
    yield { frame: signal.subarray(end - size, end), end };
  }
}
