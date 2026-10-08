import type { PhraseRef } from './types';
import type { PhraseIssue } from './scoring';

/** Problema principal de una frase en lenguaje cotidiano (spec §9: "Main issue"). */
export function describeIssue(ref: PhraseRef, issue: PhraseIssue): { title: string; tip: string } {
  const syl = (i: number | null) => (i === null ? '' : ref.phrase.notes[i]?.syllable ?? '');
  switch (issue.kind) {
    case 'none':
      return { title: '¡Bien! Sigues la melodía', tip: 'Pasa a la siguiente frase o repite para afianzarla.' };
    case 'no_voice':
      return { title: 'No te he oído', tip: 'Acércate al micrófono y canta la letra siguiendo la guía.' };
    case 'melody':
      return { title: 'La melodía aún no está asentada', tip: 'Escúchala despacio y tararéala antes de cantarla con letra.' };
    case 'leap': {
      const up = ref.phrase.notes[issue.noteIndex!].midi > ref.phrase.notes[issue.fromIndex!].midi;
      return {
        title: `El salto hacia ${up ? 'arriba' : 'abajo'} («${syl(issue.fromIndex)}» → «${syl(issue.noteIndex)}»)`,
        tip: 'Imagina la nota de llegada antes de saltar y llega a ella sin empujar.',
      };
    }
    case 'high_notes':
      return { title: `Las notas agudas («${syl(issue.noteIndex)}»)`, tip: 'Llega a ellas sin forzar. Si cuestan mucho, prueba una versión más grave.' };
    case 'low_notes':
      return { title: `Las notas graves («${syl(issue.noteIndex)}»)`, tip: 'Mantén el sonido presente. Si no llegas, prueba una versión más aguda.' };
    case 'sustained':
      return { title: `Sostener la nota larga («${syl(issue.noteIndex)}»)`, tip: 'Reserva aire y mantenla recta hasta el final.' };
    case 'flat':
      return { title: 'Te quedas un poco bajo', tip: 'Piensa las notas un poquito más arriba.' };
    case 'sharp':
      return { title: 'Te quedas un poco alto', tip: 'Canta más relajado y un poquito más abajo.' };
  }
}
