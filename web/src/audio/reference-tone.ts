import { midiToFreq } from '../core/music/notes';

/**
 * Nota de referencia con armónicos suaves (más agradable que un seno puro)
 * y envolvente para evitar clics. Devuelve el instante (reloj del contexto) en que termina.
 */
export function playReferenceTone(ctx: AudioContext, midi: number, durationS: number, a4Hz = 440): number {
  const start = ctx.currentTime + 0.05;
  const end = start + durationS;
  const real = new Float32Array([0, 1, 0.4, 0.2, 0.1, 0.05]);
  const wave = ctx.createPeriodicWave(real, new Float32Array(real.length));

  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = midiToFreq(midi, a4Hz);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
  gain.gain.setValueAtTime(0.25, end - 0.15);
  gain.gain.linearRampToValueAtTime(0, end);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.01);
  return end;
}
