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
  return plan.segments.map((s) =>
    s.fromMidi === s.toMidi
      ? { type: 'note', midi: s.fromMidi, durationS: (s.endS - s.startS) / tempo }
      : { type: 'glide', fromMidi: s.fromMidi, toMidi: s.toMidi, durationS: (s.endS - s.startS) / tempo },
  );
}

export function guideDuration(events: readonly GuideEvent[]): number {
  return events.reduce((a, e) => a + e.durationS, 0);
}
