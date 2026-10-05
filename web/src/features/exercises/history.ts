import type { ExerciseEvaluation } from '../../core/exercises/evaluate';

/**
 * Intentos de esta sesión por ejercicio (en memoria). El profesor los usa para comparar
 * y decidir el siguiente paso. En la Fase 5 se persisten en IndexedDB.
 */
const attempts = new Map<string, ExerciseEvaluation[]>();

/** Guarda el intento y devuelve los anteriores (del más antiguo al más reciente). */
export function recordAttempt(exerciseId: string, evaluation: ExerciseEvaluation): ExerciseEvaluation[] {
  const previous = attempts.get(exerciseId) ?? [];
  attempts.set(exerciseId, [...previous, evaluation]);
  return previous;
}
