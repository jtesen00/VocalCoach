import { describe, expect, it } from 'vitest';
import { fitSyllables, syllabifyText, syllabifyWord } from './syllables';

const syl = (w: string) => syllabifyWord(w).join('-');

describe('sílabas del español', () => {
  it.each([
    ['casa', 'ca-sa'],
    ['canción', 'can-ción'],
    ['cielo', 'cie-lo'],
    ['Estrellita', 'Es-tre-lli-ta'],
    ['hablar', 'ha-blar'],
    ['instante', 'ins-tan-te'],
    ['obstruir', 'obs-truir'],
    ['transporte', 'trans-por-te'],
    ['día', 'dí-a'],
    ['país', 'pa-ís'],
    ['leer', 'le-er'],
    ['reina', 'rei-na'],
    ['queso', 'que-so'],
    ['guitarra', 'gui-ta-rra'],
    ['ahora', 'a-ho-ra'],
    ['hoy', 'hoy'],
    ['muy', 'muy'],
    ['puerto', 'puer-to'],
    ['corazón,', 'co-ra-zón,'],
    ['y', 'y'],
  ])('%s → %s', (w, expected) => expect(syl(w)).toBe(expected));

  it('los guiones del usuario mandan; «_» une en una nota', () => {
    expect(syllabifyText('a-mor mío').map((t) => t.text)).toEqual(['a', 'mor', 'mí', 'o']);
    expect(syllabifyText('dón-de_es-tás').map((t) => t.text)).toEqual(['dón', 'de es', 'tás']);
  });

  it('ajuste a las notas: sinalefa si sobran, melisma si faltan', () => {
    const t = syllabifyText('Estrellita, dónde estás'); // 8 sílabas escritas
    expect(fitSyllables(t, 8)).toEqual(['Es', 'tre', 'lli', 'ta,', 'dón', 'de', 'es', 'tás']);
    expect(fitSyllables(t, 7)).toEqual(['Es', 'tre', 'lli', 'ta,', 'dón', 'de es', 'tás']);
    expect(fitSyllables(t, 6)).toEqual(['Es', 'tre', 'lli', 'ta,', 'dón', 'de es tás']);
    expect(fitSyllables(syllabifyText('sol mar'), 4)).toEqual(['sol', '', 'mar', '']);
  });
});
