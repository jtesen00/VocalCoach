import type { ExerciseEvaluation } from '../exercises/evaluate';

/**
 * Progreso local (Fase 5): cada intento se guarda como un registro inmutable con sus
 * agregados (nunca audio ni frames de pitch). El id lo genera el cliente: cuando exista
 * el backend, la sincronización será idempotente (ADR-005).
 */
export type AttemptKind = 'exercise' | 'phrase';

export interface Attempt {
  id: string;
  kind: AttemptKind;
  /** Id del ejercicio, o `canción/frase` en las canciones. */
  itemId: string;
  /** Momento del intento (ms desde 1970). */
  at: number;
  /** Día local (AAAA-MM-DD): para la racha y el calendario. */
  day: string;
  /** 0..100 */
  score: number;
  accuracy: number | null;
  passed: boolean;
  /** Tiempo cantando (s). */
  durationS: number;
  /** Evaluación completa (ejercicios): el profe compara con los intentos anteriores. */
  evaluation?: ExerciseEvaluation;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Día local de un instante. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Suma `n` días a un día local (AAAA-MM-DD). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  // Mediodía: evita saltos por cambio de hora.
  return localDay(new Date(y, m - 1, d + n, 12).getTime());
}

export interface Streak {
  /** Días seguidos practicando hasta hoy (o hasta ayer, si hoy aún no se practicó). */
  current: number;
  best: number;
  practicedToday: boolean;
}

/** Racha: solo depende del calendario (el camino de aprendizaje avanza al superar, no por fechas). */
export function streak(days: Iterable<string>, today: string): Streak {
  const set = new Set(days);
  const practicedToday = set.has(today);
  let current = 0;
  for (let d = practicedToday ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // no es el comienzo de una racha
    let n = 0;
    for (let x = d; set.has(x); x = addDays(x, 1)) n++;
    best = Math.max(best, n);
  }
  return { current, best, practicedToday };
}

export interface ItemBest {
  itemId: string;
  kind: AttemptKind;
  attempts: number;
  best: number;
  bestPassed: boolean;
  last: number;
  lastAt: number;
}

export interface ProgressSummary {
  attempts: number;
  passed: number;
  /** Minutos cantando. */
  minutes: number;
  daysPracticed: number;
  streak: Streak;
  /** Intentos por día en los últimos `calendarDays` días (del más antiguo a hoy). */
  calendar: { day: string; attempts: number }[];
  /** Puntuación media por semana (las últimas 8, de la más antigua a la actual; null sin intentos). */
  weekly: (number | null)[];
  byItem: Map<string, ItemBest>;
}

export function summarize(attempts: readonly Attempt[], today: string, calendarDays = 35): ProgressSummary {
  const perDay = new Map<string, number>();
  const byItem = new Map<string, ItemBest>();
  let passed = 0;
  let seconds = 0;
  for (const a of [...attempts].sort((x, y) => x.at - y.at)) {
    perDay.set(a.day, (perDay.get(a.day) ?? 0) + 1);
    if (a.passed) passed++;
    seconds += a.durationS;
    const prev = byItem.get(a.itemId);
    byItem.set(a.itemId, {
      itemId: a.itemId,
      kind: a.kind,
      attempts: (prev?.attempts ?? 0) + 1,
      best: Math.max(prev?.best ?? 0, a.score),
      bestPassed: (prev?.bestPassed ?? false) || a.passed,
      last: a.score,
      lastAt: a.at,
    });
  }
  const calendar = Array.from({ length: calendarDays }, (_, i) => {
    const day = addDays(today, i - calendarDays + 1);
    return { day, attempts: perDay.get(day) ?? 0 };
  });
  const weekly = Array.from({ length: 8 }, (_, w) => {
    const from = addDays(today, -7 * (8 - w) + 1);
    const to = addDays(today, -7 * (7 - w));
    const xs = attempts.filter((a) => a.day >= from && a.day <= to).map((a) => a.score);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  });
  return {
    attempts: attempts.length,
    passed,
    minutes: seconds / 60,
    daysPracticed: perDay.size,
    streak: streak(perDay.keys(), today),
    calendar,
    weekly,
    byItem,
  };
}
