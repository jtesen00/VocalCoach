import type { SkillLevel } from '../scoring/pitch-scoring';

/** Nota de un ejercicio, relativa a la tónica (en semitonos). */
export interface NoteTarget {
  offset: number;
  durationMs: number;
}

interface BaseExercise {
  id: string;
  title: string;
  /** Una línea en lenguaje cotidiano para la lista. */
  summary: string;
  instructions: string;
  level: SkillLevel;
}

export interface NotesExercise extends BaseExercise {
  kind: 'sustained' | 'sequence' | 'interval' | 'scale';
  notes: readonly NoteTarget[];
}

/** Sirena: deslizamiento continuo por los puntos de `path` (semitonos relativos a la tónica). */
export interface SirenExercise extends BaseExercise {
  kind: 'siren';
  path: readonly number[];
  durationMs: number;
}

export type ExerciseDef = NotesExercise | SirenExercise;
export type ExerciseKind = ExerciseDef['kind'];

/** Segmento del plan temporal, en segundos desde el inicio del canto. */
export interface PlanSegment {
  startS: number;
  endS: number;
  fromMidi: number;
  /** Igual a fromMidi en notas; distinto en los tramos de sirena. */
  toMidi: number;
}

export interface ExercisePlan {
  def: ExerciseDef;
  rootMidi: number;
  segments: PlanSegment[];
  durationS: number;
}
