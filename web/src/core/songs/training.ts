import type { ExerciseDef } from '../exercises/types';
import type { PhraseRef } from './types';
import type { PhraseIssue } from './scoring';

/** Paso del entrenamiento: un ejercicio generado (con su tónica exacta) o la frase a un tempo. */
export type TrainingStep =
  | { kind: 'exercise'; def: ExerciseDef; rootMidi: number }
  | { kind: 'phrase'; title: string; tempo: number };

export interface TrainingPlan {
  title: string;
  /** Por qué este entrenamiento, en lenguaje sencillo. */
  reason: string;
  steps: TrainingStep[];
}

const half = (d: number) => Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 2));

function exercise(id: string, title: string, summary: string, kind: ExerciseDef['kind'], offsets: number[], ms: number, rootMidi: number): TrainingStep {
  const def: ExerciseDef =
    kind === 'siren'
      ? { id, title, summary, instructions: summary, level: 'beginner', kind, path: offsets, durationMs: ms }
      : { id, title, summary, instructions: summary, level: 'beginner', kind, notes: offsets.map((offset) => ({ offset, durationMs: ms })) };
  return { kind: 'exercise', def, rootMidi };
}

const slow = (): TrainingStep => ({ kind: 'phrase', title: 'La frase, despacio', tempo: 0.7 });
const normal = (): TrainingStep => ({ kind: 'phrase', title: 'La frase, a velocidad normal', tempo: 1 });

/**
 * Convierte la dificultad de una frase en una progresión de ejercicios (spec §10):
 * se aísla el problema, se trabaja por partes y se vuelve a la frase, primero despacio.
 * Las alturas son las de la frase en la tonalidad elegida (`transpose`).
 */
export function trainingFor(ref: PhraseRef, transpose: number, issue: PhraseIssue): TrainingPlan {
  const notes = ref.phrase.notes.map((n) => ({ ...n, midi: n.midi + transpose }));
  const base = `train/${ref.song.id}/${ref.phrase.id}`;
  const at = (i: number | null) => notes[Math.max(0, Math.min(notes.length - 1, i ?? 0))];

  switch (issue.kind) {
    case 'leap': {
      const a = at(issue.fromIndex).midi;
      const b = at(issue.noteIndex).midi;
      const d = b - a;
      const h = half(d);
      const dir = d > 0 ? 'arriba' : 'abajo';
      return {
        title: `Entrena el salto hacia ${dir}`,
        reason: `En esta frase hay un salto grande hacia ${dir} («${at(issue.fromIndex).syllable}» → «${at(issue.noteIndex).syllable}») y la segunda nota se escapa.`,
        steps: [
          exercise(`${base}/1`, 'Primera mitad del salto', 'Salta solo hasta la mitad del camino.', 'interval', [0, h], 1300, a),
          exercise(`${base}/2`, 'Segunda mitad del salto', 'Desde la mitad, completa el salto.', 'interval', [0, d - h], 1300, a + h),
          exercise(`${base}/3`, 'El salto completo', 'Ahora el salto entero, con calma.', 'interval', [0, d], 1600, a),
          exercise(`${base}/4`, 'Sostén la nota de llegada', 'Mantén la nota de llegada, estable.', 'sustained', [0], 3000, b),
          slow(),
          normal(),
        ],
      };
    }
    case 'high_notes': {
      const target = at(issue.noteIndex).midi;
      return {
        title: 'Entrena las notas agudas',
        reason: `Las notas más agudas de la frase («${at(issue.noteIndex).syllable}») se te escapan.`,
        steps: [
          exercise(`${base}/1`, 'Sube por escalones', 'Llega a la nota aguda paso a paso.', 'scale', [0, 2, 4], 900, target - 4),
          exercise(`${base}/2`, 'Sirena hasta la nota', 'Desliza la voz desde abajo hasta la nota aguda.', 'siren', [-7, 0], 2500, target),
          exercise(`${base}/3`, 'Sostén la nota aguda', 'Mantenla sin forzar, a volumen cómodo.', 'sustained', [0], 3000, target),
          slow(),
          normal(),
        ],
      };
    }
    case 'low_notes': {
      const target = at(issue.noteIndex).midi;
      return {
        title: 'Entrena las notas graves',
        reason: `Las notas más graves de la frase («${at(issue.noteIndex).syllable}») se pierden.`,
        steps: [
          exercise(`${base}/1`, 'Baja por escalones', 'Llega a la nota grave paso a paso.', 'scale', [4, 2, 0], 900, target),
          exercise(`${base}/2`, 'Sostén la nota grave', 'Mantén el sonido presente aunque sea grave.', 'sustained', [0], 3000, target),
          slow(),
          normal(),
        ],
      };
    }
    case 'sustained': {
      const n = at(issue.noteIndex);
      return {
        title: 'Entrena la nota larga',
        reason: `La nota larga («${n.syllable}») no se mantiene estable hasta el final.`,
        steps: [
          exercise(`${base}/1`, 'Sostén la nota', 'Mantén la nota recta durante 3 segundos.', 'sustained', [0], 3000, n.midi),
          exercise(`${base}/2`, 'Sostén la nota más tiempo', 'Ahora 5 segundos, sin que caiga al final.', 'sustained', [0], 5000, n.midi),
          slow(),
          normal(),
        ],
      };
    }
    case 'flat':
    case 'sharp': {
      const i = issue.noteIndex ?? 0;
      const n = at(i);
      const prev = i > 0 ? at(i - 1) : null;
      const steps: TrainingStep[] = [exercise(`${base}/1`, 'Afina la nota', 'Escucha la nota y mantenla en el centro.', 'sustained', [0], 3000, n.midi)];
      if (prev && prev.midi !== n.midi) {
        steps.push(exercise(`${base}/2`, 'Llega a la nota', 'Desde la nota anterior, llega justo al centro.', 'interval', [0, n.midi - prev.midi], 1300, prev.midi));
      }
      return {
        title: issue.kind === 'flat' ? 'Afina un poco más arriba' : 'Afina un poco más abajo',
        reason: `En esta frase tiendes a quedarte ${issue.kind === 'flat' ? 'por debajo' : 'por encima'} de la melodía.`,
        steps: [...steps, slow(), normal()],
      };
    }
    case 'no_voice':
      return { title: 'Vuelve a intentarlo', reason: 'No se oyó tu voz en esta frase.', steps: [slow(), normal()] };
    case 'melody':
    case 'none':
    default:
      return {
        title: 'Aprende la melodía',
        reason: 'La melodía de esta frase aún no está asentada: la aprenderemos poco a poco.',
        steps: [
          { kind: 'phrase', title: 'La frase, muy despacio', tempo: 0.55 },
          slow(),
          normal(),
        ],
      };
  }
}
