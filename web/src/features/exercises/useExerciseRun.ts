import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { evaluateExercise, type ExerciseEvaluation } from '../../core/exercises/evaluate';
import { guideChords, guideEvents } from '../../core/exercises/guide';
import type { ExercisePlan } from '../../core/exercises/types';
import type { PitchFrame } from '../../core/pitch/types';
import { TOLERANCE_BY_LEVEL } from '../../core/scoring/pitch-scoring';
import type { Settings } from '../../shared/settings';
import { recordAttempt } from '../../shared/progress-store';
import { recordEvaluation } from '../../core/profile/vocal-profile';
import { profileStore } from '../../shared/profile-store';

export type RunPhase = 'ready' | 'listening' | 'countdown' | 'singing' | 'result';

export interface RunTiming {
  /** Inicio de la guía y su duración (reloj del contexto). */
  guideStartT: number;
  guideDurationS: number;
  /** Inicio del canto (reloj del contexto). */
  singT: number;
  latencyS: number;
}

export interface RunState {
  phase: RunPhase;
  beat: number | null;
  evaluation: ExerciseEvaluation | null;
  /** Intentos anteriores del mismo ejercicio (guardados en el dispositivo). */
  previous: ExerciseEvaluation[];
}

const BEATS = 3;
const BEAT_S = 0.6;
/** Margen tras el final del ejercicio antes de evaluar. */
const END_MARGIN_S = 0.3;

function waitUntil(t: number, isCancelled: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      if (isCancelled()) return resolve(false);
      const now = audioEngine.now();
      if (now === null) return resolve(false);
      if (now >= t) return resolve(true);
      setTimeout(check, Math.min(100, (t - now) * 1000 + 2));
    };
    check();
  });
}

/**
 * Orquesta un intento: guía (llamada) → cuenta atrás → canto (respuesta) → evaluación.
 * Con `record` (por defecto) el intento se guarda en el historial como ejercicio; las
 * frases de canción lo guardan ellas mismas con su propia puntuación.
 * Los frames se acumulan en un ref (no en estado de React) y se comparten con el canvas.
 */
export function useExerciseRun(plan: ExercisePlan, settings: Settings, options: { record?: boolean } = {}) {
  const record = options.record ?? true;
  const [state, setState] = useState<RunState>({ phase: 'ready', beat: null, evaluation: null, previous: [] });
  const framesRef = useRef<PitchFrame[]>([]);
  const timingRef = useRef<RunTiming>({ guideStartT: 0, guideDurationS: 1, singT: 0, latencyS: 0 });
  const runId = useRef(0);

  useEffect(() => () => void runId.current++, []);
  useEffect(() => {
    runId.current++;
    framesRef.current = [];
    setState({ phase: 'ready', beat: null, evaluation: null, previous: [] });
  }, [plan]);

  const start = useCallback(async () => {
    const id = ++runId.current;
    const cancelled = () => runId.current !== id;
    framesRef.current = [];
    setState({ phase: 'listening', beat: null, evaluation: null, previous: [] });

    const events = guideEvents(plan);
    const guide = audioEngine.playGuide(events, settings.accompaniment ? guideChords(plan) : undefined);
    timingRef.current = {
      guideStartT: guide.startT,
      guideDurationS: guide.endT - guide.startT,
      singT: Infinity,
      latencyS: audioEngine.latencyS(),
    };
    await guide.done;
    if (cancelled()) return;

    const { singT, beatTimes } = audioEngine.countdown(BEATS, BEAT_S);
    timingRef.current = { ...timingRef.current, singT };
    const off = audioEngine.onFrame((f) => framesRef.current.push(f));
    try {
      for (let i = 0; i < beatTimes.length; i++) {
        if (!(await waitUntil(beatTimes[i], cancelled))) return;
        setState((s) => ({ ...s, phase: 'countdown', beat: BEATS - i }));
      }
      if (!(await waitUntil(singT, cancelled))) return;
      setState((s) => ({ ...s, phase: 'singing', beat: null }));
      const latencyS = timingRef.current.latencyS;
      if (!(await waitUntil(singT + plan.durationS + latencyS + END_MARGIN_S, cancelled))) return;
    } finally {
      off();
    }

    const evaluation = evaluateExercise(plan, framesRef.current, {
      tolerance: TOLERANCE_BY_LEVEL[settings.level],
      octaveMode: settings.octaveMode,
      startT: singT,
      latencyS: timingRef.current.latencyS,
    });
    // El perfil vocal aprende de cada intento (ejercicios y frases de canciones).
    profileStore.update((p) => recordEvaluation(p, evaluation, settings.octaveMode));
    // Historial persistente (Fase 5): el profe compara con los intentos anteriores, de esta y otras sesiones.
    const previous = !record ? [] : recordAttempt({
      kind: 'exercise',
      itemId: plan.def.id,
      score: evaluation.score,
      accuracy: evaluation.accuracy,
      passed: evaluation.passed,
      durationS: plan.durationS,
      evaluation,
    });
    setState({ phase: 'result', beat: null, evaluation, previous: previous.flatMap((a) => (a.evaluation ? [a.evaluation] : [])) });
  }, [plan, settings.level, settings.octaveMode, settings.accompaniment, record]);

  const cancel = useCallback(() => {
    runId.current++;
    setState({ phase: 'ready', beat: null, evaluation: null, previous: [] });
  }, []);

  return { state, start, cancel, framesRef, timingRef };
}
