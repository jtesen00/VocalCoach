import type { TimedChord } from '../music/chords';
import type { ExercisePlan } from './types';

/** Evento de una guía o demostración sonora: nota fija, deslizamiento o silencio. Altura en MIDI (admite decimales). */
export type GuideEvent =
  | { type: 'note'; midi: number; durationS: number }
  | { type: 'glide'; fromMidi: number; toMidi: number; durationS: number }
  | { type: 'rest'; durationS: number };

/** En la nota sostenida la guía dura menos que el ejercicio: basta con oír la nota. */
const SUSTAINED_GUIDE_S = 1.5;

/** Guía de un ejercicio. `tempo` < 1 la hace más lenta (útil en las demostraciones). */
export function guideEvents(plan: ExercisePlan, tempo = 1): GuideEvent[] {
  if (plan.def.kind === 'sustained') return [{ type: 'note', midi: plan.rootMidi, durationS: SUSTAINED_GUIDE_S / tempo }];
  const out: GuideEvent[] = [];
  let t = 0;
  for (const s of plan.segments) {
    // Los silencios entre notas (frases de canciones) se respetan.
    if (s.startS > t + 1e-6) out.push({ type: 'rest', durationS: (s.startS - t) / tempo });
    const durationS = (s.endS - s.startS) / tempo;
    out.push(s.fromMidi === s.toMidi ? { type: 'note', midi: s.fromMidi, durationS } : { type: 'glide', fromMidi: s.fromMidi, toMidi: s.toMidi, durationS });
    t = s.endS;
  }
  return out;
}

export function guideDuration(events: readonly GuideEvent[]): number {
  return events.reduce((a, e) => a + e.durationS, 0);
}

/** Acordes del plan ajustados a un tempo (< 1 = más lentos), para tocarlos junto a la guía. */
export function guideChords(plan: ExercisePlan, tempo = 1): TimedChord[] | undefined {
  return plan.chords?.map((c) => ({ ...c, startS: c.startS / tempo, endS: c.endS / tempo }));
}
