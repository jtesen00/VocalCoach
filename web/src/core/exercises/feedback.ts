import { noteName, solfegeName } from '../music/notes';
import type { ExerciseEvaluation } from './evaluate';

export interface FeedbackMessage {
  id: string;
  tone: 'success' | 'tip' | 'info';
  text: string;
}

export interface FeedbackOptions {
  /** true: cents y nombres de nota con octava (C4). false: lenguaje cotidiano y solfeo (Do). */
  detailed: boolean;
}

interface Rule {
  id: string;
  tone: FeedbackMessage['tone'];
  /** Reglas que dejan de mostrarse si esta aplica (dirían lo mismo con otras palabras). */
  supersedes?: readonly string[];
  /** Devuelve el texto si la regla aplica, o null. */
  apply: (e: ExerciseEvaluation, f: Fmt) => string | null;
}

/** Formateadores según el modo: técnico o cotidiano. */
interface Fmt {
  detailed: boolean;
  /** Desviación entre paréntesis: " (−40 c)" o " (un poco)". */
  dev: (cents: number) => string;
  note: (midi: number) => string;
}

function amount(cents: number): string {
  const a = Math.abs(cents);
  return a <= 30 ? 'un poco' : a <= 100 ? 'bastante' : 'mucho';
}

function formatter(o: FeedbackOptions): Fmt {
  return o.detailed
    ? { detailed: true, dev: (c) => ` (${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c))} c)`, note: noteName }
    : { detailed: false, dev: (c) => ` (${amount(c)})`, note: solfegeName };
}

/**
 * Reglas básicas de feedback (Fase 3), en orden de prioridad. El profesor virtual de la
 * Fase 4 las amplía. Lenguaje siempre acústico: describe lo que se oye, no diagnostica el cuerpo.
 */
export const BASIC_RULES: readonly Rule[] = [
  {
    id: 'no-voice',
    tone: 'tip',
    apply: (e) =>
      e.siren
        ? e.siren.reachedHighMidi === null ? 'No te hemos oído. Acércate al micrófono y desliza la voz con un sonido continuo.' : null
        : e.notes.every((n) => n.status === 'no_voice')
          ? 'No te hemos oído. Acércate al micrófono y canta con una vocal abierta, como "aaa".'
          : null,
  },
  {
    id: 'great',
    tone: 'success',
    apply: (e) => (e.passed && e.score >= 90 ? '¡Muy bien! Afinado y estable.' : e.passed ? 'Superado. Repite para ganar estabilidad.' : null),
  },
  {
    id: 'missing-notes',
    tone: 'tip',
    apply: (e, f) => {
      const missing = e.notes.filter((n) => n.status === 'no_voice');
      if (!missing.length || missing.length === e.notes.length) return null;
      const which = missing.map((n) => `la nota ${n.index + 1} (${f.note(n.targetMidi)})`).join(', ');
      return `No te oímos en ${which}. Mantén el sonido durante toda la nota y sigue la guía de tiempo.`;
    },
  },
  {
    id: 'not-following',
    tone: 'tip',
    supersedes: ['wrong-notes', 'consistently-low', 'consistently-high'],
    apply: (e) => {
      const sung = e.notes.filter((n) => n.medianCents !== null);
      const targets = e.notes.map((n) => n.targetMidi);
      if (sung.length < 2 || Math.max(...targets) - Math.min(...targets) < 2) return null;
      const midis = sung.map((n) => n.targetMidi + n.medianCents! / 100);
      if (Math.max(...midis) - Math.min(...midis) >= 1) return null;
      return 'Mantuviste casi la misma nota todo el tiempo. Escucha la guía otra vez y sigue cómo sube y baja.';
    },
  },
  {
    id: 'consistently-low',
    tone: 'tip',
    apply: (e, f) => intonationBias(e, 'too_low', f),
  },
  {
    id: 'consistently-high',
    tone: 'tip',
    apply: (e, f) => intonationBias(e, 'too_high', f),
  },
  {
    id: 'wrong-notes',
    tone: 'tip',
    apply: (e, f) => {
      if (e.notes.length < 2) return null;
      const off = e.notes.filter((n) => n.status === 'too_low' || n.status === 'too_high');
      if (!off.length) return null;
      const listed = off
        .slice(0, 3)
        .map((n) => `la nota ${n.index + 1} (${f.note(n.targetMidi)}) quedó ${n.status === 'too_low' ? 'baja' : 'alta'}${f.dev(n.medianCents!)}`)
        .join('; ');
      const more = off.length > 3 ? ` y ${off.length - 3} más` : '';
      return listed.replace(/^./, (c) => c.toUpperCase()) + more + '.';
    },
  },
  {
    id: 'unstable',
    tone: 'tip',
    apply: (e) =>
      e.notes.some((n) => n.status === 'unstable')
        ? 'La afinación oscila bastante dentro de la nota. Intenta sostener el sonido con un flujo de aire más constante y sin cambiar el volumen.'
        : null,
  },
  {
    id: 'falling-end',
    tone: 'tip',
    apply: (e, f) =>
      e.kind === 'sustained' && e.notes[0]?.endDriftCents != null && e.notes[0].endDriftCents <= -20
        ? `La nota cae al final${f.dev(e.notes[0].endDriftCents)}. Reserva aire para terminar la nota tan arriba como empezó.`
        : null,
  },
  {
    id: 'interval',
    tone: 'tip',
    apply: (e, f) => {
      const err = e.interval?.errorCents;
      if (err == null || Math.abs(err) <= 30) return null;
      return `El salto te quedó ${err < 0 ? 'corto' : 'largo'}${f.dev(err)}. Imagina la segunda nota antes de cantarla.`;
    },
  },
  {
    id: 'siren-breaks',
    tone: 'tip',
    apply: (e) =>
      e.siren && e.siren.breaks > 1
        ? `La sirena se cortó ${e.siren.breaks} veces. Desliza la voz sin parar el sonido; "uuu" o los labios vibrando ayudan.`
        : null,
  },
  {
    id: 'siren-coverage',
    tone: 'tip',
    apply: (e, f) =>
      e.siren && e.siren.reachedHighMidi !== null && e.siren.coverage < 0.8
        ? `Recorriste el ${Math.round(e.siren.coverage * 100)} % del camino` +
          (f.detailed
            ? ` (de ${noteName(e.siren.reachedLowMidi! - e.siren.octaveShift)} a ${noteName(e.siren.reachedHighMidi - e.siren.octaveShift)})`
            : '') +
          '. Intenta llegar a ambos extremos sin forzar.'
        : null,
  },
  {
    id: 'siren-direction',
    tone: 'tip',
    apply: (e) =>
      e.siren && e.siren.reachedHighMidi !== null && e.siren.direction < 0.7
        ? 'Sigue la dirección de la guía: el deslizamiento debe ir siempre hacia arriba al subir y hacia abajo al bajar.'
        : null,
  },
  {
    id: 'vibrato',
    tone: 'info',
    apply: (e, f) => {
      const v = e.notes.find((n) => n.vibrato)?.vibrato;
      if (!v) return null;
      return f.detailed
        ? `Detectamos vibrato (≈ ${v.rateHz.toFixed(1)} Hz, ±${Math.round(v.extentCents)} c). No se penaliza: se evalúa su centro.`
        : 'Detectamos vibrato (la voz ondula un poco). Está bien: no te resta puntos.';
    },
  },
];

/** Sesgo de afinación: la mayoría de las notas cantadas quedan al mismo lado, a menos de un semitono. */
function intonationBias(e: ExerciseEvaluation, side: 'too_low' | 'too_high', f: Fmt): string | null {
  const sung = e.notes.filter((n) => n.medianCents !== null);
  const biased = sung.filter((n) => n.status === side && Math.abs(n.medianCents!) <= 100);
  if (sung.length === 0 || biased.length / sung.length < 0.5) return null;
  const m = biased.reduce((a, n) => a + n.medianCents!, 0) / biased.length;
  return side === 'too_low'
    ? `Tiendes a quedarte por debajo de la nota${f.dev(m)}. Prueba a subir ligeramente y a mantener un flujo de aire constante.`
    : `Tiendes a quedarte por encima de la nota${f.dev(m)}. Prueba a bajar ligeramente y a no empujar el sonido.`;
}

export function basicFeedback(e: ExerciseEvaluation, max = 3, options: FeedbackOptions = { detailed: false }): FeedbackMessage[] {
  const f = formatter(options);
  const out: FeedbackMessage[] = [];
  const skipped = new Set<string>();
  for (const rule of BASIC_RULES) {
    if (skipped.has(rule.id)) continue;
    const text = rule.apply(e, f);
    if (text) {
      out.push({ id: rule.id, tone: rule.tone, text });
      rule.supersedes?.forEach((id) => skipped.add(id));
    }
    if (rule.id === 'no-voice' && text) break;
    if (out.length >= max) break;
  }
  return out;
}
