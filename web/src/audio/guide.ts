import { midiToFreq } from '../core/music/notes';

/** Evento de la guía de referencia: nota fija o deslizamiento (sirena). */
export type GuideEvent =
  | { type: 'note'; midi: number; durationS: number }
  | { type: 'glide'; fromMidi: number; toMidi: number; durationS: number };

const LEVEL = 0.22;

function voice(ctx: AudioContext): OscillatorNode {
  // Armónicos suaves: más agradable que un seno puro y fácil de imitar.
  const real = new Float32Array([0, 1, 0.4, 0.2, 0.1, 0.05]);
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ctx.createPeriodicWave(real, new Float32Array(real.length)));
  return osc;
}

/**
 * Programa la guía empezando en `start` (reloj del contexto). Las notas consecutivas
 * suenan legato con una envolvente por nota para evitar clics. Devuelve el instante final.
 */
export function scheduleGuide(ctx: AudioContext, events: readonly GuideEvent[], start: number, a4Hz = 440): number {
  let t = start;
  for (const ev of events) {
    const end = t + ev.durationS;
    const osc = voice(ctx);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(LEVEL, t + 0.03);
    gain.gain.setValueAtTime(LEVEL, Math.max(t + 0.03, end - 0.06));
    gain.gain.linearRampToValueAtTime(0, end);
    if (ev.type === 'note') {
      osc.frequency.setValueAtTime(midiToFreq(ev.midi, a4Hz), t);
    } else {
      // Deslizamiento lineal en semitonos = exponencial en Hz.
      osc.frequency.setValueAtTime(midiToFreq(ev.fromMidi, a4Hz), t);
      osc.frequency.exponentialRampToValueAtTime(midiToFreq(ev.toMidi, a4Hz), end);
    }
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(end + 0.01);
    t = end;
  }
  return t;
}

/** Claqueta corta para la cuenta atrás. Devuelve el instante en que termina. */
export function scheduleClick(ctx: AudioContext, at: number, accent = false): number {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = accent ? 1760 : 1320;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.07);
  return at + 0.07;
}
