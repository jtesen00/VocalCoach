import { useRef } from 'react';
import { LiveCoach, type LiveRule } from '../../core/teacher/live';
import type { PitchStatus } from '../../core/scoring/pitch-scoring';

/** Consejo en vivo según cuánto tiempo se mantiene un estado (se llama en cada render muestreado). */
export function useLiveCoach(status: PitchStatus, paused: boolean): LiveRule | null {
  const coach = useRef(new LiveCoach());
  if (paused) {
    coach.current.reset();
    return null;
  }
  return coach.current.update(status, performance.now() / 1000);
}
