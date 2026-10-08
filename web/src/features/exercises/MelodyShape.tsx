import type { ExercisePlan } from '../../core/exercises/types';

/** Dibujo mínimo de la forma de la melodía (sube, baja, se mantiene) sin nombres de nota. */
export function MelodyShape({ plan }: { plan: ExercisePlan }) {
  const W = 84;
  const H = 30;
  const all = plan.segments.flatMap((s) => [s.fromMidi, s.toMidi]);
  const lo = Math.min(...all);
  const span = Math.max(4, Math.max(...all) - lo);
  const x = (t: number) => 2 + (t / plan.durationS) * (W - 4);
  const y = (m: number) => H - 4 - ((m - lo) / span) * (H - 8);
  const d = plan.segments.map((s) => `M${x(s.startS) + (s.fromMidi === s.toMidi ? 1 : 0)},${y(s.fromMidi)} L${x(s.endS) - (s.fromMidi === s.toMidi ? 1 : 0)},${y(s.toMidi)}`).join(' ');
  return (
    <svg className="melody-shape" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
