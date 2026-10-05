import type { GuideEvent } from '../core/exercises/guide';

export type { GuideEvent };

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
