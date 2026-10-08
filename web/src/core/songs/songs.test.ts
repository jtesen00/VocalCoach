import { describe, expect, it } from 'vitest';
import { evaluateExercise, type EvaluationOptions } from '../exercises/evaluate';
import { guideEvents } from '../exercises/guide';
import { targetAt } from '../exercises/plan';
import type { ExercisePlan } from '../exercises/types';
import { midiToFreq } from '../music/notes';
import type { PitchFrame } from '../pitch/types';
import {
  commonErrors, difficultIntervals, emptyProfile, noteSuccess, profileRanges, recordCalibration, recordEvaluation, registerStats,
  type VocalProfile,
} from '../profile/vocal-profile';
import { TOLERANCE_BY_LEVEL } from '../scoring/pitch-scoring';
import { analyzeSong, rangeWarnings } from './analysis';
import { findSong, SONGS } from './catalog';
import { songDifficulty } from './difficulty';
import { keyName, recommendKey } from './key';
import { songCue } from './live';
import { allNotes, allPhrases, phrase, phrasePlan } from './melody';
import { scorePhrase, weakestPhrase } from './scoring';
import { trainingFor } from './training';
import type { Song } from './types';

const RATE = 94;
const opts: EvaluationOptions = { tolerance: TOLERANCE_BY_LEVEL.beginner, octaveMode: 'exact', startT: 10 };
const luz = findSong('luz-de-puerto')!;
const phraseOf = (song: Song, id: string) => allPhrases(song).find((p) => p.phrase.id === id)!;

/** Canta la frase: en cada instante, la nota objetivo transformada por `sing` (null = silencio). */
function sing(plan: ExercisePlan, sing: (target: number, index: number) => number | null = (t) => t): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let i = 0; i < plan.durationS * RATE; i++) {
    const t = i / RATE;
    const idx = plan.segments.findIndex((s) => t >= s.startS && t < s.endS);
    const target = targetAt(plan, t);
    const midi = target === null ? null : sing(target, idx);
    out.push({ t: 10 + t, midi, f0: midi === null ? null : midiToFreq(midi), clarity: 0.95, levelDb: -20, voiced: midi !== null });
  }
  return out;
}

const profileWith = (low: number, high: number) => recordCalibration(emptyProfile(), { lowMidi: low, highMidi: high });

/** Repite `times` veces una frase cantada con `fn` para que el perfil aprenda. */
function practise(p: VocalProfile, plan: ExercisePlan, times: number, fn: Parameters<typeof sing>[1]): VocalProfile {
  for (let i = 0; i < times; i++) p = recordEvaluation(p, evaluateExercise(plan, sing(plan, fn), opts), 'exact');
  return p;
}

describe('catálogo de canciones', () => {
  it('ids únicos, contenido con licencia segura y autoría visible', () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const s of SONGS) {
      expect(['public-domain', 'traditional', 'original']).toContain(s.license);
      expect(s.credit.length).toBeGreaterThan(5);
      for (const p of allPhrases(s)) expect(p.phrase.notes.every((n) => n.syllable.length > 0 && n.beats > 0)).toBe(true);
    }
  });

  it('una sílaba por nota (si no, la frase no se construye)', () => {
    expect(() => phrase('x', 'tres sí-la-bas', [60, 62], [1, 1])).toThrow(/sílabas/);
    expect(phrase('x', 'dón-de_es-tás', [60, 62, 64], [1, 1, 1]).notes.map((n) => n.syllable)).toEqual(['dón', 'de es', 'tás']);
  });

  it('rangos de las canciones de demostración', () => {
    const r = Object.fromEntries(SONGS.map((s) => [s.id, [analyzeSong(s).lowest, analyzeSong(s).highest]]));
    expect(r).toEqual({ estrellita: [60, 69], martinillo: [60, 74], 'oda-alegria': [57, 69], 'luz-de-puerto': [57, 76] });
  });
});

describe('melodía → plan temporal', () => {
  it('tiempos según el pulso, sílabas como etiquetas, transposición y tempo', () => {
    const ref = phraseOf(luz, 'p8');
    const plan = phrasePlan(ref);
    const spb = 60 / luz.bpm;
    expect(plan.segments.map((s) => s.label)).toEqual(['tu', 'luz', 'me', 'de', 'vuel', 've a', 'mí']);
    expect(plan.durationS).toBeCloseTo(10 * spb, 6);
    expect(phrasePlan(ref, -2).segments[0].fromMidi).toBe(55);
    expect(phrasePlan(ref, 0, 0.5).durationS).toBeCloseTo(20 * spb, 6);
  });

  it('la guía respeta los silencios entre notas', () => {
    const s: Song = { ...luz, sections: [{ name: 'x', phrases: [{ ...phrase('p', 'la la', [60, 62], [1, 1]), notes: [{ midi: 60, beats: 1, syllable: 'la' }, { midi: 62, beats: 1, restBefore: 1, syllable: 'la' }] }] }] };
    const ev = guideEvents(phrasePlan(allPhrases(s)[0]));
    expect(ev.map((e) => e.type)).toEqual(['note', 'rest', 'note']);
  });
});

describe('análisis de la canción frente al perfil (spec §5)', () => {
  it('canción A3–E5 y zona cómoda A3–D5 → el estribillo tiene notas por encima', () => {
    const a = analyzeSong(luz);
    expect(a.span).toBe(19);
    expect(a.leaps).toBeGreaterThan(0);
    expect(a.longNotes).toBeGreaterThan(0);
    const w = rangeWarnings(a, profileRanges(profileWith(57, 74)));
    expect(w).toEqual([{ section: 'Estribillo', side: 'above', semitones: 2 }]);
  });
});

describe('perfil vocal dinámico (spec §4)', () => {
  it('sin datos no inventa rangos', () => {
    expect(profileRanges(emptyProfile())).toEqual({ detected: null, reliable: null, comfortable: null });
  });

  it('la medición inicial es la primera estimación de la zona cómoda', () => {
    const r = profileRanges(profileWith(55, 67));
    expect(r.comfortable).toEqual({ lowMidi: 55, highMidi: 67 });
    expect(r.detected).toEqual({ lowMidi: 55, highMidi: 67 });
  });

  it('una sola nota buena no amplía la zona cómoda; varias sí', () => {
    const plan = phrasePlan(phraseOf(luz, 'p6'), -4); // Ab4–C5
    const once = practise(profileWith(55, 67), plan, 1, (t) => t);
    expect(profileRanges(once).comfortable!.highMidi).toBe(67);
    const twice = practise(once, plan, 1, (t) => t);
    expect(profileRanges(twice).comfortable!.highMidi).toBe(72);
  });

  it('un borde que falla una y otra vez se recorta (detectado ≠ fiable ≠ cómodo)', () => {
    const plan = phrasePlan(phraseOf(luz, 'p6'), -9); // G4 en el borde alto de 55–67
    const p = practise(profileWith(55, 67), plan, 3, (t) => (t >= 67 ? t - 0.7 : t));
    const r = profileRanges(p);
    expect(r.comfortable!.highMidi).toBeLessThan(67);
    expect(r.detected!.highMidi).toBeGreaterThanOrEqual(r.comfortable!.highMidi);
  });

  it('acierto esperado: datos reales pesan más que la zona', () => {
    const plan = phrasePlan(phraseOf(luz, 'p6'), -4);
    const good = practise(profileWith(55, 67), plan, 3, (t) => t);
    const bad = practise(profileWith(55, 67), plan, 3, (t) => t - 0.8);
    expect(noteSuccess(good, 72)).toBeGreaterThan(0.8);
    expect(noteSuccess(bad, 72)).toBeLessThan(0.2);
  });

  it('registros, errores frecuentes y saltos difíciles', () => {
    const plan = phrasePlan(phraseOf(luz, 'p5'), -5); // salto de cuarta al inicio
    const p = practise(profileWith(55, 70), plan, 3, (t, i) => (i === 1 ? t - 1.5 : t));
    expect(registerStats(p).map((r) => r.name)).toEqual(['grave', 'media', 'aguda']);
    expect(commonErrors(p).length).toBeGreaterThan(0);
    expect(difficultIntervals(p)[0]).toMatchObject({ semitones: 5, rate: 0 });
  });
});

describe('recomendación de tono (spec §6–8)', () => {
  it('sin perfil: versión original', () => {
    const k = recommendKey(luz, emptyProfile());
    expect(k.reason).toBe('no-profile');
    expect(k.best.transpose).toBe(0);
  });

  it('voz grave: recomienda bajar y la nueva versión queda en su zona', () => {
    const k = recommendKey(luz, profileWith(48, 67)); // C3–G4
    expect(k.reason).toBe('lower');
    expect(k.best.transpose).toBeLessThan(0);
    expect(k.best.highest).toBeLessThanOrEqual(67 + 1);
    expect(k.best.expectedAccuracy).toBeGreaterThan(k.original.expectedAccuracy);
  });

  it('voz que abarca la canción: la original encaja', () => {
    expect(recommendKey(luz, profileWith(55, 79)).reason).toBe('original-fits');
  });

  it('voz aguda: recomienda subir una canción grave', () => {
    const oda = findSong('oda-alegria')!;
    const k = recommendKey(oda, profileWith(64, 81));
    expect(k.reason).toBe('higher');
    expect(k.best.lowest).toBeGreaterThan(k.original.lowest);
    expect(k.best.expectedAccuracy).toBeGreaterThan(k.original.expectedAccuracy);
  });

  it('no basta con "caber": dos usuarios llegan a E5, pero solo uno lo canta bien', () => {
    const highPlan = phrasePlan(phraseOf(luz, 'p6')); // C5–E5
    const solid = practise(profileWith(55, 76), highPlan, 3, (t) => t);
    const shaky = practise(profileWith(55, 76), highPlan, 3, (t) => (t >= 74 ? t - 0.7 : t));
    expect(recommendKey(luz, solid).best.transpose).toBe(0);
    expect(recommendKey(luz, shaky).best.transpose).toBeLessThan(0);
  });

  it('aprende de la interpretación real en cada tonalidad', () => {
    const p = profileWith(52, 72);
    const before = recommendKey(luz, p);
    const t = before.best.transpose;
    const history = { [String(t)]: [0.3, 0.35, 0.3, 0.32], [String(t - 1)]: [0.9, 0.92, 0.88, 0.95] };
    expect(recommendKey(luz, p, history).best.transpose).toBe(t - 1);
  });

  it('nombre de la tonalidad: sencillo y técnico', () => {
    expect(keyName(luz, 0)).toBe('La menor');
    expect(keyName(luz, -2, true)).toBe('G menor');
  });
});

describe('dificultad personalizada (spec §13)', () => {
  it('la misma canción es distinta para cada voz', () => {
    const low = songDifficulty(luz, 0, profileWith(45, 62));
    const wide = songDifficulty(luz, 0, profileWith(55, 81));
    expect(low.highNotes).toBe(5);
    expect(wide.highNotes).toBeLessThan(low.highNotes);
    expect(['Difícil', 'Muy difícil']).toContain(low.overall);
    expect(['Fácil', 'Media']).toContain(songDifficulty(findSong('estrellita')!, 0, profileWith(55, 72)).overall);
  });
});

describe('puntuación por frase y problema principal (spec §9)', () => {
  it('frase bien cantada → buena, sin problema', () => {
    const plan = phrasePlan(phraseOf(luz, 'p1'));
    const r = scorePhrase(plan, evaluateExercise(plan, sing(plan), opts), 'exact', null);
    expect(r).toMatchObject({ status: 'good', issue: { kind: 'none' } });
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it('grave → agudo → aguda sostenida, fallando la nota aguda → "notas agudas"', () => {
    const plan = phrasePlan(phraseOf(luz, 'p8'));
    const r = scorePhrase(plan, evaluateExercise(plan, sing(plan, (t) => (t >= 76 ? t - 1.2 : t)), opts), 'exact', null);
    expect(r.status).not.toBe('good');
    expect(r.issue).toMatchObject({ kind: 'high_notes', noteIndex: 6 });
  });

  it('salto grande fallado → "salto"', () => {
    const plan = phrasePlan(phraseOf(luz, 'p5')); // E4 → A4
    const r = scorePhrase(plan, evaluateExercise(plan, sing(plan, (t, i) => (i === 1 ? t - 1.6 : t)), opts), 'exact', null);
    expect(r.issue).toMatchObject({ kind: 'leap', fromIndex: 0, noteIndex: 1 });
  });

  it('nota larga que cae → "nota larga"', () => {
    const plan = phrasePlan(phraseOf(findSong('estrellita')!, 'p1'));
    const last = plan.segments[plan.segments.length - 1];
    const frames = sing(plan).map((f) => (f.t - 10 >= last.startS + 0.3 && f.midi !== null ? { ...f, midi: f.midi - 0.9 } : f));
    expect(scorePhrase(plan, evaluateExercise(plan, frames, opts), 'exact', null).issue.kind).toBe('sustained');
  });

  it('silencio → sin voz; la frase más débil se identifica', () => {
    const plan = phrasePlan(phraseOf(luz, 'p1'));
    expect(scorePhrase(plan, evaluateExercise(plan, sing(plan, () => null), opts), 'exact', null)).toMatchObject({ score: 0, issue: { kind: 'no_voice' } });
    expect(weakestPhrase({ p1: { score: 91 }, p2: { score: 64 }, p3: { score: 88 }, p4: { score: 51 } })).toBe('p4');
    expect(weakestPhrase({ p1: { score: 91 } })).toBeNull();
  });
});

describe('de la frase al entrenamiento (spec §10)', () => {
  it('salto grande: mitad → mitad → completo → sostener → frase lenta → frase normal', () => {
    const t = trainingFor(phraseOf(luz, 'p5'), 0, { kind: 'leap', fromIndex: 0, noteIndex: 1 });
    expect(t.steps.map((s) => (s.kind === 'phrase' ? `frase×${s.tempo}` : `${s.def.kind}@${s.rootMidi}`))).toEqual([
      'interval@64', 'interval@67', 'interval@64', 'sustained@69', 'frase×0.7', 'frase×1',
    ]);
    const [a, b, c] = t.steps as Extract<(typeof t.steps)[number], { kind: 'exercise' }>[];
    const reach = (s: typeof a) => s.rootMidi + (s.def.kind === 'siren' ? 0 : s.def.notes[s.def.notes.length - 1].offset);
    expect([reach(a), reach(b), reach(c)]).toEqual([67, 69, 69]);
  });

  it('notas agudas: escalones, sirena y nota sostenida en la tonalidad elegida', () => {
    const t = trainingFor(phraseOf(luz, 'p8'), -2, { kind: 'high_notes', noteIndex: 6, fromIndex: null });
    const ex = t.steps.filter((s) => s.kind === 'exercise');
    expect(ex.map((s) => s.kind === 'exercise' && s.def.kind)).toEqual(['scale', 'siren', 'sustained']);
    expect(ex[2].kind === 'exercise' && ex[2].rootMidi).toBe(74);
  });

  it('todos los problemas generan un entrenamiento que acaba volviendo a la frase', () => {
    for (const kind of ['none', 'no_voice', 'melody', 'leap', 'high_notes', 'low_notes', 'sustained', 'flat', 'sharp'] as const) {
      const t = trainingFor(phraseOf(luz, 'p5'), 0, { kind, noteIndex: 1, fromIndex: 0 });
      expect(t.steps.at(-1)).toEqual({ kind: 'phrase', title: 'La frase, a velocidad normal', tempo: 1 });
      expect(t.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('indicaciones en vivo durante la canción (spec §11)', () => {
  const plan = phrasePlan(phraseOf(luz, 'p8'));
  const tol = TOLERANCE_BY_LEVEL.beginner;

  it('afinado, bajo, alto y sin voz', () => {
    const mid = (i: number) => (plan.segments[i].startS + plan.segments[i].endS) / 2;
    expect(songCue(plan, mid(6), 76.05, tol, 'exact').text).toBe('✓ ¡Así! Vas con la melodía');
    expect(songCue(plan, mid(6), 75.6, tol, 'exact').text).toBe('↓ Un poco bajo: sube un poco');
    expect(songCue(plan, mid(6), 77.5, tol, 'exact').text).toBe('↑ Estás alto: baja bastante');
    expect(songCue(plan, mid(6), null, tol, 'exact').text).toBe('Canta ahora');
  });

  it('anticipa que la melodía sube', () => {
    const t = plan.segments[2].endS - 0.2; // justo antes de saltar de E4 a A4
    expect(songCue(plan, t, plan.segments[2].fromMidi, tol, 'exact')).toMatchObject({ upcoming: 'up', text: 'La melodía sube ↑ prepárate' });
  });
});

describe('integración: todas las frases de todas las canciones se cantan y puntúan', () => {
  it.each(SONGS.map((s) => [s.title, s] as const))('%s', (_, song) => {
    for (const ref of allPhrases(song)) {
      const plan = phrasePlan(ref);
      expect(plan.segments).toHaveLength(ref.phrase.notes.length);
      const r = scorePhrase(plan, evaluateExercise(plan, sing(plan), opts), 'exact', null);
      expect(r.score).toBeGreaterThanOrEqual(90);
    }
    expect(allNotes(song).length).toBeGreaterThan(10);
  });
});
