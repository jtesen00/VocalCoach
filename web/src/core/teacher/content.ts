import type { ExerciseEvaluation } from '../exercises/evaluate';
import { guideEvents, type GuideEvent } from '../exercises/guide';
import type { ExercisePlan } from '../exercises/types';
import type { Diagnosis, DiagnosisId } from './diagnose';
import { listNotes, type Fmt } from './format';

export interface LessonContext {
  plan: ExercisePlan;
  evaluation: ExerciseEvaluation;
  diagnosis: Diagnosis;
  f: Fmt;
}

export interface Lesson {
  /** Titular corto: qué trabajar. */
  headline: (c: LessonContext) => string;
  /** Qué se oyó, en lenguaje acústico. */
  explanation: (c: LessonContext) => string;
  /** Qué probar (2–3 consejos accionables). */
  tips: readonly string[];
  /** Una línea, para mencionarlo como observación secundaria. */
  short: (c: LessonContext) => string;
  /** Ejemplo sonoro opcional ("así suena / así sonó"). */
  demo?: { label: string; build: (c: LessonContext) => GuideEvent[] };
}

const targets = (c: LessonContext) => c.evaluation.notes.map((n) => n.targetMidi);
const firstNote = (c: LessonContext) => c.evaluation.notes[c.diagnosis.notes[0] ?? 0];
const note = (midi: number, durationS: number): GuideEvent => ({ type: 'note', midi, durationS });
const rest = (durationS = 0.35): GuideEvent => ({ type: 'rest', durationS });

/** La nota correcta, la cantada y otra vez la correcta. */
function compareDemo(c: LessonContext): GuideEvent[] {
  const target = firstNote(c).targetMidi;
  const sungCents = c.diagnosis.cents ?? firstNote(c).medianCents ?? 0;
  return [note(target, 1), rest(), note(target + sungCents / 100, 1), rest(), note(target, 1)];
}

const slowMelody = { label: 'Escucha la melodía más despacio', build: (c: LessonContext) => guideEvents(c.plan, 0.7) };

/**
 * Lecciones por diagnóstico. Son datos: el motor de decisión (teacher.ts) elige cuál mostrar.
 * Regla: describir el sonido y proponer qué probar; nunca diagnosticar el cuerpo.
 */
export const LESSONS: Record<DiagnosisId, Lesson> = {
  no_voice: {
    headline: () => 'No te he oído',
    explanation: () => 'El micrófono no captó tu voz durante el ejercicio.',
    tips: [
      'Acércate al micrófono: a un palmo es ideal.',
      'Canta con una vocal abierta y sostenida, como «aaa».',
      'Empieza justo después de la cuenta atrás.',
    ],
    short: () => 'No se oyó tu voz.',
  },
  octave_off: {
    headline: () => 'Las notas están bien, pero en otra altura',
    explanation: (c) =>
      `Cantaste la melodía correcta, pero una octava más ${(c.diagnosis.cents ?? 0) < 0 ? 'grave' : 'aguda'}. Es muy normal cuando tu voz es más grave o más aguda que la guía.`,
    tips: [
      'Si te resulta cómodo así, permite cantar en otra octava (abajo tienes el botón).',
      'O usa «− grave / agudo +» para llevar el ejercicio a tu zona.',
    ],
    short: () => 'Cantaste en otra octava.',
    demo: {
      label: 'Escucha: la nota de la guía y la misma nota en otra octava',
      build: (c) => {
        const t = firstNote(c).targetMidi;
        return [note(t, 1), rest(), note(t + Math.sign(c.diagnosis.cents ?? -1) * 12, 1)];
      },
    },
  },
  not_following: {
    headline: () => 'Sigue la melodía',
    explanation: () => 'Mantuviste casi la misma nota todo el rato, pero la melodía sube y baja.',
    tips: [
      'Escucha la guía y tararéala por dentro antes de cantar.',
      'Exagera un poco los cambios: imagina que subes y bajas escalones.',
      'Si va muy rápido, empieza por «Salto pequeño».',
    ],
    short: () => 'La melodía sube y baja: síguela.',
    demo: slowMelody,
  },
  missing_notes: {
    headline: () => 'Te faltaron notas',
    explanation: (c) => `No se oyó tu voz en ${listNotes(c.diagnosis.notes, targets(c), c.f)}.`,
    tips: [
      'Mantén el sonido durante toda la nota, hasta que empiece la siguiente.',
      'Respira antes de la cuenta atrás para llegar hasta el final.',
    ],
    short: (c) => `No se oyó ${listNotes(c.diagnosis.notes, targets(c), c.f, 2)}.`,
    demo: slowMelody,
  },
  wrong_notes: {
    headline: () => 'Algunas notas se fueron lejos',
    explanation: (c) => {
      const n = c.diagnosis.notes.map((i) => c.evaluation.notes[i]);
      const dir = n.every((x) => x.medianCents! < 0) ? ' por debajo' : n.every((x) => x.medianCents! > 0) ? ' por encima' : '';
      return `${capitalize(listNotes(c.diagnosis.notes, targets(c), c.f))} quedaron lejos${dir} de la nota correcta.`;
    },
    tips: [
      'Escucha la melodía más despacio y cántala por partes.',
      'Antes de cada nota, imagina cómo suena.',
    ],
    short: (c) => `${capitalize(listNotes(c.diagnosis.notes, targets(c), c.f, 2))}: lejos de la nota.`,
    demo: slowMelody,
  },
  siren_direction: {
    headline: () => 'Sigue la dirección de la sirena',
    explanation: () => 'Tu voz no fue en la misma dirección que la guía.',
    tips: [
      'Al subir, desliza siempre hacia arriba, sin volver atrás (y al bajar, igual).',
      'Hazlo despacio, como una sirena de ambulancia lenta.',
    ],
    short: () => 'Sigue la dirección de la guía.',
    demo: { label: 'Escucha la sirena de la guía', build: (c) => guideEvents(c.plan) },
  },
  siren_range: {
    headline: () => 'Llega un poco más lejos',
    explanation: (c) => `Recorriste el ${c.diagnosis.cents ?? 0} % del camino de la sirena.`,
    tips: [
      'Empieza en lo más grave que te resulte cómodo y llega a lo más agudo cómodo.',
      'Si no llegas sin forzar, usa «− grave» o vuelve a medir tu voz.',
    ],
    short: (c) => `Recorriste el ${c.diagnosis.cents ?? 0} % del camino.`,
    demo: { label: 'Escucha la sirena completa', build: (c) => guideEvents(c.plan) },
  },
  siren_breaks: {
    headline: () => 'Que no se corte el sonido',
    explanation: (c) => `El sonido se cortó ${c.diagnosis.cents ?? 0} veces durante la sirena.`,
    tips: [
      'Usa «uuu» o haz vibrar los labios, como imitando un motor: ayuda a no cortar.',
      'Toma aire antes de empezar y gástalo poco a poco.',
    ],
    short: () => 'El sonido se cortó varias veces.',
    demo: { label: 'Escucha la sirena continua', build: (c) => guideEvents(c.plan) },
  },
  interval_short: {
    headline: () => 'El salto se quedó corto',
    explanation: (c) => `La segunda nota quedó más cerca de la primera de lo que debía${c.f.dev(c.diagnosis.cents ?? 0)}.`,
    tips: [
      'Imagina la segunda nota antes de saltar.',
      'Si cuesta, canta las notas intermedias despacio y luego salta directo.',
    ],
    short: () => 'El salto se quedó corto.',
    demo: {
      label: 'Escucha: el salto correcto y cómo sonó el tuyo',
      build: (c) => intervalDemo(c),
    },
  },
  interval_long: {
    headline: () => 'El salto se pasó',
    explanation: (c) => `La segunda nota quedó más lejos de la primera de lo que debía${c.f.dev(c.diagnosis.cents ?? 0)}.`,
    tips: ['Imagina la segunda nota antes de saltar.', 'Salta con suavidad: mejor quedarse corto y ajustar que pasarse.'],
    short: () => 'El salto se pasó.',
    demo: {
      label: 'Escucha: el salto correcto y cómo sonó el tuyo',
      build: (c) => intervalDemo(c),
    },
  },
  flat: {
    headline: () => 'Te quedas un poco bajo',
    explanation: (c) => `Tus notas quedan por debajo de la correcta${c.f.dev(c.diagnosis.cents ?? 0)}. Es lo más habitual al empezar.`,
    tips: [
      'Piensa la nota un poquito más arriba de lo que crees.',
      'Mantén un flujo de aire constante, sin dejar que el sonido se apague.',
      'Escucha la nota de nuevo justo antes de cantar.',
    ],
    short: (c) => `Tiendes a quedarte por debajo${c.f.dev(c.diagnosis.cents ?? 0)}.`,
    demo: { label: 'Escucha: la nota correcta, cómo sonó la tuya y otra vez la correcta', build: compareDemo },
  },
  sharp: {
    headline: () => 'Te quedas un poco alto',
    explanation: (c) => `Tus notas quedan por encima de la correcta${c.f.dev(c.diagnosis.cents ?? 0)}.`,
    tips: [
      'Canta a un volumen cómodo, sin empujar el sonido.',
      'Piensa la nota un poquito más abajo de lo que crees.',
    ],
    short: (c) => `Tiendes a quedarte por encima${c.f.dev(c.diagnosis.cents ?? 0)}.`,
    demo: { label: 'Escucha: la nota correcta, cómo sonó la tuya y otra vez la correcta', build: compareDemo },
  },
  unstable: {
    headline: () => 'La nota baila',
    explanation: () => 'La altura sube y baja dentro de la nota, sin un patrón regular.',
    tips: [
      'Canta a volumen medio y constante.',
      'Imagina una línea recta y sigue esa línea con la voz.',
      'Practica «Mantén una nota» para ganar estabilidad.',
    ],
    short: () => 'La nota oscila: intenta sostenerla recta.',
    demo: {
      label: 'Escucha: una nota estable y una que baila',
      build: (c) => {
        const t = firstNote(c).targetMidi;
        const wobble: GuideEvent[] = [0.35, -0.3, 0.25, -0.4, 0.3, -0.2].map((d, i, a) => ({
          type: 'glide',
          fromMidi: t + (i === 0 ? 0 : a[i - 1]),
          toMidi: t + d,
          durationS: 0.22,
        }));
        return [note(t, 1.4), rest(0.45), ...wobble];
      },
    },
  },
  falling_end: {
    headline: () => 'La nota cae al final',
    explanation: (c) => `Empiezas bien, pero la nota baja al final${c.f.dev(c.diagnosis.cents ?? 0)}. Suele pasar cuando se acaba el aire.`,
    tips: [
      'Toma aire antes de empezar y gástalo poco a poco.',
      'Piensa en terminar la nota tan arriba como empezó.',
    ],
    short: () => 'La nota cae al final: mantenla hasta el último momento.',
    demo: {
      label: 'Escucha: una nota que se mantiene y otra que cae',
      build: (c) => {
        const t = firstNote(c).targetMidi;
        return [note(t, 1.8), rest(0.45), note(t, 1.1), { type: 'glide', fromMidi: t, toMidi: t - 0.45, durationS: 0.7 }];
      },
    },
  },
  vibrato: {
    headline: () => 'Tienes vibrato',
    explanation: () => 'Tu voz ondula de forma regular. No es un error.',
    tips: [],
    short: (c) => {
      const v = c.evaluation.notes.find((n) => n.vibrato)?.vibrato;
      return c.f.detailed && v
        ? `Vibrato de ≈ ${v.rateHz.toFixed(1)} Hz y ±${Math.round(v.extentCents)} c: no resta, se evalúa su centro.`
        : 'Tu voz tiene vibrato (ondula un poco). Está bien: no te resta puntos.';
    },
  },
  almost: {
    headline: () => '¡Casi!',
    explanation: () => 'Estás cerca de la nota, pero no siempre en el centro.',
    tips: [
      'Escucha otra vez la guía y fíjate en el centro de la nota.',
      'Mira la línea: intenta que tu voz quede dentro de la franja.',
    ],
    short: () => 'Estás cerca: busca el centro de la nota.',
    demo: { label: 'Escucha otra vez la guía', build: (c) => guideEvents(c.plan, 0.85) },
  },
  good: {
    headline: () => '¡Superado!',
    explanation: (c) => `Afinado el ${Math.round((c.evaluation.accuracy ?? 1) * 100)} % del tiempo.`,
    tips: ['Repite para hacerlo aún más estable, o pasa al siguiente ejercicio.'],
    short: () => 'Superado.',
  },
  great: {
    headline: () => '¡Excelente!',
    explanation: (c) =>
      c.evaluation.siren ? 'Sirena completa, en la dirección correcta y sin cortes.' : 'Afinado y estable de principio a fin.',
    tips: ['Estás listo para el siguiente ejercicio.'],
    short: () => 'Excelente.',
  },
};

function intervalDemo(c: LessonContext): GuideEvent[] {
  const [a, b] = c.evaluation.notes;
  const err = c.diagnosis.cents ?? 0;
  return [note(a.targetMidi, 0.9), note(b.targetMidi, 0.9), rest(0.5), note(a.targetMidi, 0.9), note(b.targetMidi + err / 100, 0.9)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
