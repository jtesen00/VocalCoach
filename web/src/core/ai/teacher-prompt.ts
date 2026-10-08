import type { ExerciseEvaluation, NoteStatus } from '../exercises/evaluate';
import type { ExercisePlan } from '../exercises/types';
import { solfegeName } from '../music/notes';
import type { SkillLevel } from '../scoring/pitch-scoring';
import type { TeacherAdvice } from '../teacher/teacher';

/**
 * Profe conversacional con IA (caso A de docs/research/ia-proveedores.md).
 * A la IA solo se le envía TEXTO con un resumen agregado del intento: nunca audio,
 * ni frames de pitch, ni datos personales. El diagnóstico lo sigue haciendo el profe
 * por reglas; la IA lo explica con otras palabras y responde dudas.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AttemptSummary {
  exercise: string;
  instructions: string;
  level: SkillLevel;
  passed: boolean;
  /** 0..100 */
  score: number;
  /** % del tiempo afinado (null en sirenas). */
  inTunePercent: number | null;
  notes: { note: string; result: string; cents: number | null }[];
  siren: { coveragePercent: number; breaks: number } | null;
  /** Puntuaciones de los intentos anteriores del mismo ejercicio (del más antiguo al más reciente). */
  previousScores: number[];
  advice: { headline: string; explanation: string; tips: string[] };
}

const RESULT: Record<NoteStatus, string> = {
  perfect: 'afinada',
  close: 'casi afinada',
  too_high: 'demasiado alta',
  too_low: 'demasiado baja',
  unstable: 'inestable',
  no_voice: 'no se oyó',
};

const LEVEL: Record<SkillLevel, string> = { beginner: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' };

export function summarizeAttempt(plan: ExercisePlan, evaluation: ExerciseEvaluation, advice: TeacherAdvice, history: readonly ExerciseEvaluation[], level: SkillLevel): AttemptSummary {
  return {
    exercise: plan.def.title,
    instructions: plan.def.instructions,
    level,
    passed: evaluation.passed,
    score: Math.round(evaluation.score),
    inTunePercent: evaluation.accuracy === null ? null : Math.round(evaluation.accuracy * 100),
    notes: evaluation.notes.map((n) => ({
      note: solfegeName(n.targetMidi),
      result: RESULT[n.status],
      cents: n.medianCents === null ? null : Math.round(n.medianCents),
    })),
    siren: evaluation.siren ? { coveragePercent: Math.round(evaluation.siren.coverage * 100), breaks: evaluation.siren.breaks } : null,
    previousScores: history.slice(-5).map((h) => Math.round(h.score)),
    advice: { headline: advice.headline, explanation: advice.explanation, tips: advice.tips },
  };
}

const SYSTEM = `Eres el profe de canto de la app Vocal Coach. Hablas en español, con calidez y frases cortas, a personas que están aprendiendo a cantar afinado.
Reglas:
- Solo conoces el resumen del intento que te pasan (no oyes el audio). No inventes datos.
- El diagnóstico ya está hecho por la app ("consejo de la app"): explícalo con otras palabras y mantén la misma prioridad; no lo contradigas.
- Habla de lo que se oye (más alto, más bajo, mantener, deslizar), no del cuerpo: no diagnostiques problemas de salud ni de técnica física. Si preguntan por dolor o molestias, recomienda parar y consultar a un profesional.
- Nada de jerga técnica salvo que la pidan (centésimas, Hz…). Las notas, en do-re-mi.
- Máximo unas 120 palabras: 1 frase de ánimo concreta, qué pasó y 1 a 3 cosas para probar en el próximo intento.`;

function describe(s: AttemptSummary): string {
  const lines = [
    `Ejercicio: ${s.exercise} (${s.instructions})`,
    `Nivel de exigencia: ${LEVEL[s.level]}`,
    `Resultado: ${s.passed ? 'superado' : 'no superado'} · puntuación ${s.score}/100${s.inTunePercent === null ? '' : ` · afinado el ${s.inTunePercent} % del tiempo (se supera con 80 %)`}`,
  ];
  if (s.siren) lines.push(`Sirena: recorrió el ${s.siren.coveragePercent} % del camino, ${s.siren.breaks} cortes`);
  if (s.notes.length) lines.push(`Notas: ${s.notes.map((n) => `${n.note} ${n.result}${n.cents === null ? '' : ` (${n.cents > 0 ? '+' : ''}${n.cents} c)`}`).join('; ')}`);
  if (s.previousScores.length) lines.push(`Intentos anteriores (puntuación): ${s.previousScores.join(', ')}`);
  lines.push(`Consejo de la app: ${s.advice.headline}. ${s.advice.explanation}${s.advice.tips.length ? ` Sugerencias: ${s.advice.tips.join(' / ')}` : ''}`);
  return lines.join('\n');
}

/** Mensajes para pedir la explicación del intento y, opcionalmente, responder una duda. */
export function teacherMessages(summary: AttemptSummary, conversation: readonly ChatMessage[] = []): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Resumen de mi último intento:\n${describe(summary)}\n\nExplícame cómo me fue y qué pruebo ahora.` },
    ...conversation,
  ];
}
