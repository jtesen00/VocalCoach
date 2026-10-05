import { transpositionToFit, type VocalRange } from '../range/vocal-range';
import type { ExerciseDef, ExercisePlan, PlanSegment } from './types';

/** Tónica nominal de los ejercicios antes de transponer. */
export const NOMINAL_ROOT_MIDI = 60;

export function exerciseOffsets(def: ExerciseDef): number[] {
  return def.kind === 'siren' ? [...def.path] : def.notes.map((n) => n.offset);
}

/** Tónica que centra el ejercicio en el rango del usuario (C4 si no hay rango). */
export function rootForRange(def: ExerciseDef, range: VocalRange | null): number {
  if (!range) return NOMINAL_ROOT_MIDI;
  const offsets = exerciseOffsets(def);
  return NOMINAL_ROOT_MIDI + transpositionToFit(offsets.map((o) => NOMINAL_ROOT_MIDI + o), range);
}

export function buildPlan(def: ExerciseDef, rootMidi: number): ExercisePlan {
  const segments: PlanSegment[] = [];
  if (def.kind === 'siren') {
    const legs = def.path.length - 1;
    const legS = def.durationMs / 1000 / legs;
    for (let i = 0; i < legs; i++) {
      segments.push({ startS: i * legS, endS: (i + 1) * legS, fromMidi: rootMidi + def.path[i], toMidi: rootMidi + def.path[i + 1] });
    }
  } else {
    let t = 0;
    for (const n of def.notes) {
      const d = n.durationMs / 1000;
      segments.push({ startS: t, endS: t + d, fromMidi: rootMidi + n.offset, toMidi: rootMidi + n.offset });
      t += d;
    }
  }
  return { def, rootMidi, segments, durationS: segments[segments.length - 1].endS };
}

/** Nota objetivo en el instante t (s desde el inicio), interpolada en las sirenas. */
export function targetAt(plan: ExercisePlan, t: number): number | null {
  const seg = plan.segments.find((s) => t >= s.startS && t < s.endS);
  if (!seg) return null;
  const k = (t - seg.startS) / (seg.endS - seg.startS);
  return seg.fromMidi + (seg.toMidi - seg.fromMidi) * k;
}

export function planMidiRange(plan: ExercisePlan): [number, number] {
  const all = plan.segments.flatMap((s) => [s.fromMidi, s.toMidi]);
  return [Math.min(...all), Math.max(...all)];
}
