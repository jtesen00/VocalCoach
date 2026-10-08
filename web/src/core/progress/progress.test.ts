import { describe, expect, it } from 'vitest';
import { addDays, localDay, streak, summarize, type Attempt } from './progress';
import { currentDay, LEARNING_PATH, pathState } from './path';

const at = (day: string, h = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, h).getTime();
};
let n = 0;
const attempt = (day: string, itemId: string, score: number, extra: Partial<Attempt> = {}): Attempt => ({
  id: String(++n),
  kind: 'exercise',
  itemId,
  at: at(day),
  day,
  score,
  accuracy: score / 100,
  passed: score >= 80,
  durationS: 30,
  ...extra,
});

describe('días locales', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('el día local no depende de la hora', () => {
    expect(localDay(at('2026-10-06', 0))).toBe('2026-10-06');
    expect(localDay(at('2026-10-06', 23))).toBe('2026-10-06');
  });
});

describe('racha', () => {
  it('cuenta los días seguidos hasta hoy', () => {
    expect(streak(['2026-10-04', '2026-10-05', '2026-10-06'], '2026-10-06')).toEqual({ current: 3, best: 3, practicedToday: true });
  });
  it('si hoy aún no practicó, la racha sigue viva desde ayer', () => {
    expect(streak(['2026-10-04', '2026-10-05'], '2026-10-06')).toMatchObject({ current: 2, practicedToday: false });
  });
  it('un día sin practicar la corta, pero se recuerda la mejor', () => {
    const s = streak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-05', '2026-10-06'], '2026-10-06');
    expect(s).toEqual({ current: 2, best: 4, practicedToday: true });
    expect(streak(['2026-10-03'], '2026-10-06').current).toBe(0);
  });
});

describe('resumen del progreso', () => {
  const list = [
    attempt('2026-10-05', 'sustained-3s', 60),
    attempt('2026-10-05', 'sustained-3s', 85),
    attempt('2026-10-06', 'sustained-3s', 70),
    attempt('2026-10-06', 'steps-do-re-mi', 92),
  ];
  const s = summarize(list, '2026-10-06');
  it('totales, minutos y días', () => {
    expect(s).toMatchObject({ attempts: 4, passed: 2, minutes: 2, daysPracticed: 2 });
    expect(s.streak.current).toBe(2);
  });
  it('mejor resultado y último por ejercicio', () => {
    expect(s.byItem.get('sustained-3s')).toMatchObject({ attempts: 3, best: 85, bestPassed: true, last: 70 });
  });
  it('calendario de 35 días que termina hoy', () => {
    expect(s.calendar).toHaveLength(35);
    expect(s.calendar.at(-1)).toEqual({ day: '2026-10-06', attempts: 2 });
    expect(s.calendar.at(-2)).toEqual({ day: '2026-10-05', attempts: 2 });
  });
  it('media semanal: la semana actual al final', () => {
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly.at(-1)).toBeCloseTo((60 + 85 + 70 + 92) / 4);
    expect(s.weekly[0]).toBeNull();
  });
});

describe('camino de aprendizaje', () => {
  it('al empezar: día 1 en curso y el resto bloqueado', () => {
    const st = pathState([]);
    expect(st[0].status).toBe('current');
    expect(st.slice(1).every((d) => d.status === 'locked')).toBe(true);
    expect(currentDay(st)?.index).toBe(0);
  });
  it('un día se completa al superar todos sus pasos (≥ 80 %), en cualquier fecha', () => {
    const st = pathState([attempt('2026-10-06', 'sustained-3s', 90), attempt('2026-10-06', 'sustained-5s', 60)]);
    expect(st[0].status).toBe('done');
    expect(st[1]).toMatchObject({ status: 'current', passed: [true, false] });
    expect(st[2].status).toBe('locked');
  });
  it('superar un ejercicio de un día bloqueado no salta días', () => {
    const st = pathState([attempt('2026-10-06', 'scale-major', 95)]);
    expect(st[0].status).toBe('current');
    expect(st[6]).toMatchObject({ status: 'locked', passed: [true] });
  });
  it('camino completo', () => {
    const all = LEARNING_PATH.flatMap((d) => d.steps.map((s) => attempt('2026-10-06', s.itemId, 90, { kind: s.kind })));
    expect(currentDay(pathState(all))).toBeNull();
  });
});
