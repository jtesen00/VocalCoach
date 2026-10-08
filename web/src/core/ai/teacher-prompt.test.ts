import { describe, expect, it } from 'vitest';
import { findExercise } from '../exercises/catalog';
import { buildPlan } from '../exercises/plan';
import type { ExerciseEvaluation } from '../exercises/evaluate';
import { summarizeAttempt, teacherMessages } from './teacher-prompt';
import type { TeacherAdvice } from '../teacher/teacher';

const plan = buildPlan(findExercise('steps-do-re-mi')!, 60);
const evaluation: ExerciseEvaluation = {
  kind: 'sequence',
  score: 62,
  accuracy: 0.55,
  passed: false,
  siren: null,
  interval: null,
  notes: plan.segments.map((s, i) => ({
    index: i,
    targetMidi: s.fromMidi,
    status: i === 2 ? 'too_low' : 'perfect',
    score: i === 2 ? 20 : 90,
    accuracy: i === 2 ? 0.1 : 0.9,
    medianCents: i === 2 ? -45 : 4,
    stability: 0.8,
    vibrato: null,
    voicedRatio: 1,
    endDriftCents: 0,
    inTuneFrames: 10,
    evaluatedFrames: 12,
  })),
};
const advice: TeacherAdvice = {
  diagnosis: 'flat',
  headline: 'Te quedas un poco bajo en el Mi',
  explanation: 'Cuando subes al Mi no llegas del todo.',
  tips: ['Imagina que la nota está un poco más arriba'],
  extras: [],
  demo: null,
  progress: null,
  next: { kind: 'repeat' },
};

describe('profe con IA: lo que se envía', () => {
  const s = summarizeAttempt(plan, evaluation, advice, [{ ...evaluation, score: 40 }], 'beginner');

  it('resume el intento con agregados y en do-re-mi', () => {
    expect(s).toMatchObject({ exercise: plan.def.title, passed: false, score: 62, inTunePercent: 55, previousScores: [40] });
    expect(s.notes[2]).toEqual({ note: 'Mi', result: 'demasiado baja', cents: -45 });
  });

  it('el prompt incluye el consejo de la app y las reglas (sin cuerpo ni jerga)', () => {
    const msgs = teacherMessages(s);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/no diagnostiques problemas de salud/);
    expect(msgs[1].content).toContain('Consejo de la app: Te quedas un poco bajo en el Mi');
    expect(msgs[1].content).toContain('Mi demasiado baja (-45 c)');
  });

  it('no envía frames de pitch ni audio: solo texto corto', () => {
    const body = JSON.stringify(teacherMessages(s));
    expect(body.length).toBeLessThan(4000);
    expect(body).not.toMatch(/inTuneFrames|evaluatedFrames|f0|samples/);
  });

  it('continúa la conversación con las dudas del usuario', () => {
    const msgs = teacherMessages(s, [{ role: 'assistant', content: 'Vas bien.' }, { role: 'user', content: '¿Y si me canso?' }]);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });
});
