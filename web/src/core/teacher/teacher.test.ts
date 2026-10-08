import { describe, expect, it } from 'vitest';
import { EXERCISES, findExercise } from '../exercises/catalog';
import { evaluateExercise, type EvaluationOptions, type ExerciseEvaluation } from '../exercises/evaluate';
import { buildPlan } from '../exercises/plan';
import type { ExercisePlan } from '../exercises/types';
import { midiToFreq } from '../music/notes';
import { rng } from '../pitch/signals';
import type { PitchFrame } from '../pitch/types';
import { TOLERANCE_BY_LEVEL, type OctaveMode, type SkillLevel } from '../scoring/pitch-scoring';
import { LESSONS } from './content';
import { diagnose, type DiagnosisId } from './diagnose';
import { LiveCoach } from './live';
import { advise, type AdviceInput } from './teacher';

const RATE = 94;
const opts: EvaluationOptions = { tolerance: TOLERANCE_BY_LEVEL.beginner, octaveMode: 'exact', startT: 10 };

function synth(durationS: number, midiAt: (t: number) => number | null): PitchFrame[] {
  return Array.from({ length: Math.round(durationS * RATE) }, (_, i) => {
    const t = i / RATE;
    const midi = midiAt(t);
    return { t: 10 + t, midi, f0: midi === null ? null : midiToFreq(midi), clarity: 0.95, levelDb: -20, voiced: midi !== null };
  });
}

const plan = (id: string, root = 60) => buildPlan(findExercise(id)!, root);
const steps = (notes: number[], dur: number) => (t: number) => notes[Math.min(notes.length - 1, Math.floor(t / dur))];

interface Case {
  name: string;
  plan: ExercisePlan;
  frames: PitchFrame[];
  octaveMode?: OctaveMode;
  expect: DiagnosisId;
}

/** Un intento representativo por cada diagnóstico. */
const CASES: Case[] = [
  { name: 'silencio', plan: plan('sustained-3s'), frames: synth(3, () => null), expect: 'no_voice' },
  { name: 'una octava abajo', plan: plan('steps-do-re-mi'), frames: synth(4.5, (t) => steps([60, 62, 64, 62, 60], 0.9)(t) - 12), expect: 'octave_off' },
  { name: 'misma nota en una escala', plan: plan('scale-five'), frames: synth(6.3, () => 61), expect: 'not_following' },
  { name: 'nota sin cantar', plan: plan('steps-do-re-mi'), frames: synth(4.5, (t) => (t >= 1.8 && t < 2.7 ? null : steps([60, 62, 64, 62, 60], 0.9)(t))), expect: 'missing_notes' },
  { name: 'dos notas lejos', plan: plan('steps-do-re-mi'), frames: synth(4.5, steps([60, 63.5, 65.5, 62, 60], 0.9)), expect: 'wrong_notes' },
  { name: 'sirena al revés', plan: plan('siren-up'), frames: synth(3, (t) => 72 - 12 * (t / 3)), expect: 'siren_direction' },
  { name: 'sirena corta', plan: plan('siren-up'), frames: synth(3, (t) => 60 + 5 * (t / 3)), expect: 'siren_range' },
  {
    name: 'sirena con cortes',
    plan: plan('siren-up'),
    frames: synth(3, (t) => (Math.floor(t / 0.5) % 2 === 1 && t % 0.5 < 0.25 ? null : 60 + 12 * (t / 3))),
    expect: 'siren_breaks',
  },
  { name: 'salto corto', plan: plan('interval-fifth'), frames: synth(3, (t) => (t < 1.5 ? 60 : 66.4)), expect: 'interval_short' },
  { name: 'salto largo', plan: plan('interval-fifth'), frames: synth(3, (t) => (t < 1.5 ? 60 : 67.6)), expect: 'interval_long' },
  { name: 'algo bajo', plan: plan('sustained-3s'), frames: synth(3, () => 59.6), expect: 'flat' },
  { name: 'algo alto', plan: plan('sustained-3s'), frames: synth(3, () => 60.45), expect: 'sharp' },
  { name: 'temblor', plan: plan('sustained-3s'), frames: (() => { const r = rng(9); return synth(3, () => 60 + (r() - 0.5) * 1.4); })(), expect: 'unstable' },
  { name: 'cae al final', plan: plan('sustained-5s'), frames: synth(5, (t) => (t < 3 ? 60.05 : 60.05 - 0.45 * (t - 3))), expect: 'falling_end' },
  { name: 'casi', plan: plan('steps-do-re-mi'), frames: synth(4.5, (t) => steps([60, 62, 64, 62, 60], 0.9)(t) + (Math.floor(t * 4) % 2 ? 0.38 : -0.1)), expect: 'almost' },
  { name: 'afinado', plan: plan('sustained-3s'), frames: synth(3, () => 60.05), expect: 'great' },
];

function evaluate(c: Case): ExerciseEvaluation {
  return evaluateExercise(c.plan, c.frames, { ...opts, octaveMode: c.octaveMode ?? 'exact' });
}

function input(c: Case, extra: Partial<AdviceInput> = {}): AdviceInput {
  return {
    plan: c.plan,
    evaluation: evaluate(c),
    history: [],
    catalog: EXERCISES,
    octaveMode: c.octaveMode ?? 'exact',
    level: 'beginner',
    detailed: false,
    ...extra,
  };
}

describe('diagnóstico: el problema principal de cada intento', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(advise(input(c)).diagnosis).toBe(c.expect);
  });

  it('cada diagnóstico tiene su lección', () => {
    for (const id of Object.keys(LESSONS) as DiagnosisId[]) {
      expect(LESSONS[id].headline).toBeTypeOf('function');
    }
  });

  it('sirena con la voz casi quieta → el problema es el recorrido', () => {
    const c: Case = { name: '', plan: plan('siren-up'), frames: synth(3, () => 61), expect: 'siren_range' };
    expect(advise(input(c)).diagnosis).toBe('siren_range');
  });

  it('con "cualquier octava" una octava abajo no es un error', () => {
    const c = CASES.find((x) => x.expect === 'octave_off')!;
    const ids = diagnose(evaluateExercise(c.plan, c.frames, { ...opts, octaveMode: 'pitch-class' }), 'pitch-class').map((d) => d.id);
    expect(ids).not.toContain('octave_off');
    expect(ids).toContain('great');
  });

  it('el vibrato se menciona como observación, no como error', () => {
    const p = plan('sustained-3s');
    const a = advise({ ...input(CASES[0]), plan: p, evaluation: evaluateExercise(p, synth(3, (t) => 60 + 0.25 * Math.sin(2 * Math.PI * 5.5 * t)), opts) });
    expect(['great', 'good']).toContain(a.diagnosis);
    expect(a.extras.join(' ')).toContain('vibrato');
  });

  it('superado con un detalle a mejorar → "Para mejorar: …"', () => {
    const p = plan('sustained-5s');
    const e = evaluateExercise(p, synth(5, (t) => (t < 3.3 ? 60.05 : 60.05 - 0.3 * (t - 3.3))), opts);
    expect(e.passed).toBe(true);
    const a = advise({ ...input(CASES[0]), plan: p, evaluation: e });
    expect(a.extras.some((x) => x.startsWith('Para mejorar:'))).toBe(true);
  });

  it('no repite lo mismo: "sigue la melodía" oculta "notas lejos" y "algo bajo"', () => {
    const a = advise(input(CASES.find((c) => c.expect === 'not_following')!));
    expect(a.extras.join(' ')).not.toMatch(/lejos|por debajo|por encima/);
  });
});

describe('demostraciones sonoras', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s: eventos válidos', (_, c) => {
    const a = advise(input(c));
    const lesson = LESSONS[a.diagnosis];
    expect(Boolean(a.demo)).toBe(Boolean(lesson.demo));
    for (const ev of a.demo?.events ?? []) {
      expect(ev.durationS).toBeGreaterThan(0);
      if (ev.type === 'note') expect(Number.isFinite(ev.midi)).toBe(true);
      if (ev.type === 'glide') expect(Number.isFinite(ev.fromMidi + ev.toMidi)).toBe(true);
    }
  });

  it('"algo bajo" compara la nota correcta con la cantada (−40 c)', () => {
    const a = advise(input(CASES.find((c) => c.expect === 'flat')!));
    const notes = a.demo!.events.filter((e) => e.type === 'note');
    expect(notes.map((n) => n.midi)).toEqual([60, expect.closeTo(59.6, 2), 60]);
  });
});

describe('siguiente paso (árbol de decisión)', () => {
  const great = CASES.find((c) => c.expect === 'great')!;
  const flat = CASES.find((c) => c.expect === 'flat')!;

  it('superado → siguiente ejercicio del catálogo', () => {
    expect(advise(input(great)).next).toEqual({ kind: 'next', exerciseId: 'sustained-5s' });
  });

  it('primer o segundo fallo → repetir', () => {
    expect(advise(input(flat)).next).toEqual({ kind: 'repeat' });
    expect(advise(input(flat, { history: [evaluate(flat)] })).next).toEqual({ kind: 'repeat' });
  });

  it('tercer fallo seguido por lo mismo → algo más fácil (en el ejercicio más fácil no hay otro)', () => {
    const history = [evaluate(flat), evaluate(flat)];
    expect(advise(input(flat, { history })).next).toEqual({ kind: 'easier', exerciseId: null, relaxStrictness: false });
  });

  it('…y si la exigencia no es "Relajado", propone relajarla', () => {
    const history = [evaluate(flat), evaluate(flat)];
    const n = advise(input(flat, { history, level: 'intermediate' as SkillLevel })).next;
    expect(n).toMatchObject({ kind: 'easier', relaxStrictness: true });
  });

  it('un ejercicio difícil propone uno más fácil del mismo tipo', () => {
    const c: Case = { name: '', plan: plan('scale-major'), frames: synth(4.8, () => 61), expect: 'not_following' };
    const n = advise(input(c, { history: [evaluate(c), evaluate(c)] })).next;
    expect(n).toMatchObject({ kind: 'easier', exerciseId: 'scale-five' });
  });

  it('si los fallos son por motivos distintos, no se rinde: repetir', () => {
    const other = CASES.find((c) => c.expect === 'unstable')!;
    expect(advise(input(flat, { history: [evaluate(other), evaluate(flat)] })).next).toEqual({ kind: 'repeat' });
  });

  it('otra octava → propone permitir otra octava', () => {
    expect(advise(input(CASES.find((c) => c.expect === 'octave_off')!)).next).toEqual({ kind: 'allow_octave' });
  });

  it('mejora respecto al intento anterior → lo celebra', () => {
    expect(advise(input(great, { history: [evaluate(flat)] })).progress).toBe('¡Mejor que el intento anterior!');
    expect(advise(input(great, { history: [evaluate(flat)], detailed: true })).progress).toMatch(/Has mejorado \d+ puntos/);
    expect(advise(input(flat, { history: [evaluate(great)] })).progress).toBeNull();
  });
});

describe('lenguaje', () => {
  const allText = (detailed: boolean) =>
    CASES.flatMap((c) => {
      const a = advise(input(c, { detailed }));
      return [a.headline, a.explanation, ...a.tips, ...a.extras, a.demo?.label ?? '', a.progress ?? ''];
    });

  it('modo sencillo: sin cents, Hz ni nombres de nota con octava', () => {
    for (const t of allText(false)) expect(t).not.toMatch(/\d+ c\b|Hz|[A-G]#?-?\d/);
  });

  it('modo detallado: con cifras técnicas', () => {
    expect(allText(true).join(' ')).toMatch(/[−+]\d+ c/);
  });

  it('nunca diagnostica el cuerpo (spec §17)', () => {
    const forbidden = /diafragma|cuerdas vocales|pliegues vocales|laringe|garganta|tensi[oó]n|postura|m[uú]sculo/i;
    const tips = Object.values(LESSONS).flatMap((l) => l.tips);
    for (const t of [...allText(false), ...allText(true), ...tips]) expect(t).not.toMatch(forbidden);
  });
});

describe('coach en vivo', () => {
  const feed = (coach: LiveCoach, status: Parameters<LiveCoach['update']>[0], from: number, to: number) => {
    let r = null;
    for (let t = from; t <= to + 1e-9; t += 1 / 15) r = coach.update(status, t);
    return r;
  };

  it('por debajo durante 2 s → consejo de subir', () => {
    const c = new LiveCoach();
    expect(feed(c, 'too_low', 0, 1.8)).toBeNull();
    expect(feed(c, 'too_low', 1.8, 2.1)?.id).toBe('held-low');
  });

  it('un frame suelto no rompe la racha', () => {
    const c = new LiveCoach();
    feed(c, 'too_low', 0, 1);
    c.update('close', 1.05);
    expect(feed(c, 'too_low', 1.1, 2.1)?.id).toBe('held-low');
  });

  it('una interrupción larga reinicia la cuenta', () => {
    const c = new LiveCoach();
    feed(c, 'too_low', 0, 1.5);
    feed(c, 'no_voice', 1.55, 2.5);
    expect(feed(c, 'too_low', 2.55, 3.5)).toBeNull();
  });

  it('afinado 3 s → felicita; el mensaje se mantiene un momento y luego desaparece', () => {
    const c = new LiveCoach();
    expect(feed(c, 'perfect', 0, 3.1)?.id).toBe('held-good');
    expect(c.update('no_voice', 3.5)?.id).toBe('held-good');
    expect(feed(c, 'no_voice', 3.5, 5.5)).toBeNull();
  });
});
