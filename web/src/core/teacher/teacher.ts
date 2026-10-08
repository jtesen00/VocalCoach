import type { ExerciseEvaluation } from '../exercises/evaluate';
import type { GuideEvent } from '../exercises/guide';
import type { ExerciseDef, ExercisePlan } from '../exercises/types';
import type { OctaveMode, SkillLevel } from '../scoring/pitch-scoring';
import { LESSONS } from './content';
import { diagnose, POSITIVE, type Diagnosis, type DiagnosisId } from './diagnose';
import { formatter } from './format';

export type NextStep =
  | { kind: 'repeat' }
  | { kind: 'next'; exerciseId: string | null }
  | { kind: 'easier'; exerciseId: string | null; relaxStrictness: boolean }
  | { kind: 'allow_octave' };

export interface TeacherAdvice {
  diagnosis: DiagnosisId;
  headline: string;
  explanation: string;
  tips: string[];
  /** Observaciones secundarias de una línea (máximo 2). */
  extras: string[];
  demo: { label: string; events: GuideEvent[] } | null;
  /** Comparación con el intento anterior, si hay mejora. */
  progress: string | null;
  next: NextStep;
}

export interface AdviceInput {
  plan: ExercisePlan;
  evaluation: ExerciseEvaluation;
  /** Intentos anteriores del mismo ejercicio en esta sesión, del más antiguo al más reciente. */
  history: readonly ExerciseEvaluation[];
  catalog: readonly ExerciseDef[];
  octaveMode: OctaveMode;
  level: SkillLevel;
  detailed: boolean;
}

/** Un diagnóstico que hace redundantes a otros (dirían lo mismo con otras palabras). */
const SUPERSEDES: Partial<Record<DiagnosisId, readonly DiagnosisId[]>> = {
  not_following: ['wrong_notes', 'flat', 'sharp', 'almost'],
  octave_off: ['wrong_notes', 'flat', 'sharp'],
  missing_notes: ['almost'],
};

/** Intentos fallidos seguidos con el mismo problema antes de proponer algo más fácil. */
const STUCK_AFTER = 3;

const DIFFICULTY: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** El problema principal del intento: el que hay que trabajar primero. */
export function primaryDiagnosis(diagnoses: readonly Diagnosis[], passed: boolean): Diagnosis {
  if (passed) return diagnoses.find((d) => d.id === 'great' || d.id === 'good')!;
  return diagnoses.find((d) => !POSITIVE.has(d.id)) ?? diagnoses[0];
}

/**
 * Árbol de decisión del profesor virtual. Función pura: a partir de la evaluación,
 * los intentos anteriores y los ajustes, decide qué explicar, qué demostración ofrecer
 * y cuál es el siguiente paso.
 */
export function advise(input: AdviceInput): TeacherAdvice {
  const { plan, evaluation: e, history, catalog, octaveMode, level, detailed } = input;
  const f = formatter(detailed);
  const all = diagnose(e, octaveMode);
  const primary = primaryDiagnosis(all, e.passed);

  const hidden = new Set<DiagnosisId>([primary.id, ...(SUPERSEDES[primary.id] ?? [])]);
  const extras: string[] = [];
  for (const d of all) {
    if (hidden.has(d.id) || d.id === 'great' || d.id === 'good' || d.id === 'almost') continue;
    const ctx = { plan, evaluation: e, diagnosis: d, f };
    const text = LESSONS[d.id].short(ctx);
    extras.push(e.passed && d.id !== 'vibrato' ? `Para mejorar: ${lowerFirst(text)}` : text);
    (SUPERSEDES[d.id] ?? []).forEach((id) => hidden.add(id));
    hidden.add(d.id);
    if (extras.length === 2) break;
  }

  const lesson = LESSONS[primary.id];
  const ctx = { plan, evaluation: e, diagnosis: primary, f };
  return {
    diagnosis: primary.id,
    headline: lesson.headline(ctx),
    explanation: lesson.explanation(ctx),
    tips: [...lesson.tips],
    extras,
    demo: lesson.demo ? { label: lesson.demo.label, events: lesson.demo.build(ctx) } : null,
    progress: progressMessage(e, history, detailed),
    next: nextStep(plan.def, e, primary.id, history, catalog, octaveMode, level),
  };
}

function progressMessage(e: ExerciseEvaluation, history: readonly ExerciseEvaluation[], detailed: boolean): string | null {
  const prev = history[history.length - 1];
  if (!prev) return null;
  const delta = e.score - prev.score;
  if (delta < 5) return null;
  return detailed ? `Has mejorado ${delta} puntos respecto al intento anterior.` : '¡Mejor que el intento anterior!';
}

function nextStep(
  def: ExerciseDef,
  e: ExerciseEvaluation,
  primary: DiagnosisId,
  history: readonly ExerciseEvaluation[],
  catalog: readonly ExerciseDef[],
  octaveMode: OctaveMode,
  level: SkillLevel,
): NextStep {
  if (primary === 'octave_off') return { kind: 'allow_octave' };
  if (e.passed) {
    const i = catalog.findIndex((x) => x.id === def.id);
    return { kind: 'next', exerciseId: catalog[i + 1]?.id ?? null };
  }

  // ¿Lleva varios intentos fallando por lo mismo? Entonces, algo más fácil.
  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.passed || primaryDiagnosis(diagnose(h, octaveMode), false).id !== primary) break;
    streak++;
  }
  if (streak < STUCK_AFTER || primary === 'no_voice') return { kind: 'repeat' };

  const easier =
    catalog.find((x) => x.kind === def.kind && DIFFICULTY[x.level] < DIFFICULTY[def.level]) ??
    catalog.find((x) => x.id !== def.id && x.kind === 'sustained' && x.level === 'beginner') ??
    null;
  return { kind: 'easier', exerciseId: easier?.id ?? null, relaxStrictness: level !== 'beginner' };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
