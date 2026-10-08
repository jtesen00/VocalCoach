import { targetAt } from '../exercises/plan';
import type { ExercisePlan } from '../exercises/types';
import { centsVsTarget, classifyCents, type OctaveMode, type PitchStatus, type Tolerance } from '../scoring/pitch-scoring';

export interface SongCue {
  status: PitchStatus | null;
  /** Hacia dónde va la melodía en el próximo medio segundo. */
  upcoming: 'up' | 'down' | null;
  text: string;
}

const LOOKAHEAD_S = 0.5;

/**
 * Indicación en vivo durante una frase (spec §11): compara la nota objetivo de ese instante
 * con la voz y anticipa si la melodía va a subir o bajar.
 */
export function songCue(plan: ExercisePlan, t: number, midi: number | null, tol: Tolerance, mode: OctaveMode): SongCue {
  const target = targetAt(plan, t);
  const next = plan.segments.find((s) => s.startS > t && s.startS - t <= LOOKAHEAD_S);
  const ref = target ?? next?.fromMidi ?? null;
  const upcoming = next && ref !== null && Math.abs(next.fromMidi - ref) >= 2 ? (next.fromMidi > ref ? 'up' : 'down') : null;

  if (target === null) {
    return { status: null, upcoming, text: upcoming === 'up' ? 'La melodía sube ↑' : upcoming === 'down' ? 'La melodía baja ↓' : '' };
  }
  const cents = midi === null ? null : centsVsTarget(midi, target, mode);
  const status = classifyCents(cents, tol);
  const big = cents !== null && Math.abs(cents) > 100;
  let text: string;
  switch (status) {
    case 'perfect':
      text = '✓ ¡Así! Vas con la melodía';
      break;
    case 'close':
      text = 'Casi, muy cerca';
      break;
    case 'too_low':
      text = big ? '↓ Estás bajo: sube bastante' : '↓ Un poco bajo: sube un poco';
      break;
    case 'too_high':
      text = big ? '↑ Estás alto: baja bastante' : '↑ Un poco alto: baja un poco';
      break;
    default:
      text = 'Canta ahora';
  }
  if (upcoming && (status === 'perfect' || status === 'close')) text = upcoming === 'up' ? 'La melodía sube ↑ prepárate' : 'La melodía baja ↓ prepárate';
  return { status, upcoming, text };
}
