import { describe, expect, it } from 'vitest';
import { SONGS } from './catalog';
import { allPhrases } from './melody';
import { karaokeTimeline, originOffset, phraseAt } from './karaoke';
import { melodyToSong } from './formats/to-song';

describe('karaoke: la canción entera en el tiempo', () => {
  const song = SONGS.find((s) => s.id === 'estrellita')!;
  const tl = karaokeTimeline(song, 0);

  it('catálogo: frases seguidas con dos pulsos de respiro, sin solaparse', () => {
    expect(tl.phrases).toHaveLength(allPhrases(song).length);
    expect(tl.phrases[0].startS).toBe(0);
    for (let i = 1; i < tl.phrases.length; i++) expect(tl.phrases[i].startS).toBeGreaterThan(tl.phrases[i - 1].endS);
    expect(tl.durationS).toBe(tl.phrases.at(-1)!.endS);
  });

  it('el plan completo contiene todas las notas en su sitio (para la guía)', () => {
    expect(tl.plan.segments).toHaveLength(tl.phrases.reduce((a, p) => a + p.plan.segments.length, 0));
    const p2 = tl.phrases[1];
    expect(tl.plan.segments.find((s) => Math.abs(s.startS - p2.startS) < 1e-9)).toBeTruthy();
  });

  it('sílabas con su tiempo para resaltar la letra', () => {
    const p = tl.phrases[0];
    expect(p.syllables.map((s) => s.text).join('')).not.toBe('');
    expect(p.syllables[0].startS).toBe(0);
  });

  it('frase activa: la que suena o la siguiente', () => {
    expect(phraseAt(tl, 0.1)?.index).toBe(0);
    expect(phraseAt(tl, tl.phrases[0].endS + 0.5)?.index).toBe(1);
    expect(phraseAt(tl, tl.durationS + 5)).toBeNull();
  });

  it('importadas: respeta el segundo de la original y lo quita la intro', () => {
    const imported = melodyToSong(
      { title: 't', notes: [{ startS: 10, endS: 11, midi: 60, syllable: 'a' }, { startS: 11, endS: 12, midi: 62, syllable: 'b' }, { startS: 20, endS: 21, midi: 64, syllable: 'c' }, { startS: 21, endS: 22, midi: 65, syllable: 'd' }], lineStartsS: [10, 20], warnings: [] },
      { id: 'i', format: 'ultrastar' },
    );
    const t = karaokeTimeline(imported, 0);
    expect(originOffset(imported)).toBe(10);
    expect(t.phrases.map((p) => p.startS)).toEqual([0, 10]);
  });
});
