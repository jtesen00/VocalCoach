import { noteName, solfegeName } from '../music/notes';

/** Formato de cifras según el modo: técnico (cents, C4) o cotidiano ("un poco", Do). */
export interface Fmt {
  detailed: boolean;
  /** Desviación entre paréntesis, con espacio delante: " (−40 c)" o " (un poco)". */
  dev: (cents: number) => string;
  note: (midi: number) => string;
}

export function amount(cents: number): string {
  const a = Math.abs(cents);
  return a <= 30 ? 'un poco' : a <= 100 ? 'bastante' : 'mucho';
}

export function formatter(detailed: boolean): Fmt {
  return detailed
    ? { detailed, dev: (c) => ` (${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c))} c)`, note: noteName }
    : { detailed, dev: (c) => ` (${amount(c)})`, note: solfegeName };
}

/** "la nota 2 (Re) y la nota 4 (Re)". */
export function listNotes(indices: readonly number[], targets: readonly number[], f: Fmt, max = 3): string {
  const items = indices.slice(0, max).map((i) => `la nota ${i + 1} (${f.note(targets[i])})`);
  const more = indices.length > max ? ` y ${indices.length - max} más` : '';
  if (items.length <= 1) return items.join('') + more;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}${more}`;
}
