import { describe, expect, it } from 'vitest';
import { SONGS } from '../songs/catalog';
import { allPhrases, phrasePlan } from '../songs/melody';
import { describePhrase, phraseTipsMessages } from './phrase-prompt';

describe('«¿Cómo la canto?»: lo que se envía a la IA', () => {
  const song = SONGS.find((s) => s.id === 'estrellita')!;
  const ref = allPhrases(song)[0];
  const plan = phrasePlan(ref);

  it('solo texto: letra, notas en do-re-mi con sílabas, extremos y zona cómoda', () => {
    const text = describePhrase({ song: song.title, lyrics: ref.phrase.lyrics, plan, comfortable: { lowMidi: 55, highMidi: 67 }, last: { score: 62, issue: 'la nota aguda queda baja' } });
    expect(text).toContain('«Es»');
    expect(text).toContain('larga');
    expect(text).toMatch(/2 notas por encima y 0 por debajo/);
    expect(text).toContain('Último intento: 62 %');
    expect(text).not.toMatch(/Hz|cents|\bC4\b/);
  });

  it('sin perfil, no habla de la zona cómoda; los saltos grandes se señalan', () => {
    const text = describePhrase({ song: song.title, lyrics: ref.phrase.lyrics, plan, comfortable: null });
    expect(text).not.toContain('zona cómoda');
    expect(text).toMatch(/sube 7 semitonos/);
  });

  it('mensajes: sistema + pregunta', () => {
    const m = phraseTipsMessages({ song: song.title, lyrics: ref.phrase.lyrics, plan, comfortable: null });
    expect(m.map((x) => x.role)).toEqual(['system', 'user']);
    expect(m[1].content.length).toBeLessThan(2000);
  });
});
