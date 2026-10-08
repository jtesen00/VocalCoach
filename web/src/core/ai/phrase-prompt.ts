import type { ExercisePlan } from '../exercises/types';
import { solfegeName } from '../music/notes';
import type { VocalRange } from '../range/vocal-range';
import type { ChatMessage } from './teacher-prompt';

/**
 * «¿Cómo la canto?» (Fase 9, spec §17): ideas de interpretación para una frase a partir de
 * la frase + la melodía objetivo + las características vocales del usuario. A la IA solo va
 * TEXTO: la letra, las notas en do-re-mi con su duración, dónde hay silencios y qué notas
 * quedan fuera de la zona cómoda. Nunca audio.
 */
export interface PhraseContext {
  song: string;
  lyrics: string;
  plan: ExercisePlan;
  comfortable: VocalRange | null;
  /** Última puntuación y problema principal de la frase, si ya se cantó. */
  last?: { score: number; issue: string } | null;
}

const SYSTEM = `Eres el profe de canto de la app Vocal Coach. Hablas en español, con calidez y frases cortas, a personas que aprenden a cantar.
Te piden ideas para interpretar UNA frase de una canción. Solo conoces los datos que te pasan (no oyes nada). No inventes notas ni letra.
Reglas:
- Da 3 o 4 ideas concretas y prácticas, en viñetas, ancladas en la letra (cita las palabras): dónde respirar, qué vocal sostener o abrir en las notas largas o agudas, cómo preparar los saltos y cómo dar intención o volumen a la frase.
- Habla de lo que se oye, no del cuerpo: no diagnostiques salud ni técnica física. Si hay notas fuera de la zona cómoda, sugiere bajar el tono en la app o cantarlas más suave, nunca forzar.
- Nada de jerga técnica. Las notas, en do-re-mi. Máximo unas 130 palabras.`;

const fmt = (s: number) => `${Math.round(s * 10) / 10} s`;

export function describePhrase(c: PhraseContext): string {
  const segs = c.plan.segments;
  const notes = segs.map((s, i) => {
    const rest = i && s.startS - segs[i - 1].endS > 0.25 ? `(silencio ${fmt(s.startS - segs[i - 1].endS)}) ` : '';
    const syl = s.label?.trim() ? `«${s.label.trim()}» ` : '';
    const len = s.endS - s.startS;
    return `${rest}${syl}${solfegeName(s.fromMidi)}${len >= 1 ? ` larga (${fmt(len)})` : ''}`;
  });
  const midis = segs.map((s) => s.fromMidi);
  const lines = [
    `Canción: ${c.song}`,
    `Letra de la frase: «${c.lyrics}»`,
    `Notas en orden: ${notes.join(', ')}`,
    `Dura ${fmt(c.plan.durationS)}. Nota más grave: ${solfegeName(Math.min(...midis))}; más aguda: ${solfegeName(Math.max(...midis))}.`,
  ];
  const jumps = segs.slice(1).map((s, i) => ({ i, d: s.fromMidi - segs[i].toMidi })).filter((j) => Math.abs(j.d) >= 5);
  if (jumps.length) lines.push(`Saltos grandes: ${jumps.map((j) => `${j.d > 0 ? 'sube' : 'baja'} ${Math.abs(j.d)} semitonos antes de la nota ${j.i + 2}`).join('; ')}.`);
  if (c.comfortable) {
    const high = midis.filter((m) => m > c.comfortable!.highMidi).length;
    const low = midis.filter((m) => m < c.comfortable!.lowMidi).length;
    lines.push(high || low ? `Para esta persona: ${high} notas por encima y ${low} por debajo de su zona cómoda.` : 'Toda la frase está dentro de su zona cómoda.');
  }
  if (c.last) lines.push(`Último intento: ${c.last.score} %. Lo que más le costó: ${c.last.issue}.`);
  return lines.join('\n');
}

export function phraseTipsMessages(c: PhraseContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${describePhrase(c)}\n\n¿Cómo canto esta frase?` },
  ];
}
