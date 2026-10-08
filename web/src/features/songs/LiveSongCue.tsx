import type { RefObject } from 'react';
import { audioEngine } from '../../audio/engine';
import type { ExercisePlan } from '../../core/exercises/types';
import { TOLERANCE_BY_LEVEL } from '../../core/scoring/pitch-scoring';
import { songCue } from '../../core/songs/live';
import type { Settings } from '../../shared/settings';
import type { RunTiming } from '../exercises/useExerciseRun';
import { useSampledFrame } from '../tuner/useEngine';

/** Indicación en vivo mientras se canta la frase: "Un poco bajo ↓", "La melodía sube ↑"… */
export function LiveSongCue({ plan, timingRef, settings }: { plan: ExercisePlan; timingRef: RefObject<RunTiming>; settings: Settings }) {
  const frame = useSampledFrame(15);
  const now = audioEngine.now();
  const timing = timingRef.current;
  if (now === null || !Number.isFinite(timing.singT)) return <p className="song-cue" />;
  const t = now - timing.singT - timing.latencyS;
  const midi = frame?.voiced ? frame.midi : null;
  const cue = songCue(plan, t, midi, TOLERANCE_BY_LEVEL[settings.level], settings.octaveMode);
  return (
    <p className={`song-cue cue-${cue.status ?? 'rest'}`} role="status" aria-live="polite">
      {cue.text}
    </p>
  );
}
