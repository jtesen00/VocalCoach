import type { Attempt } from './progress';

/**
 * Camino de aprendizaje por días. Cada "día" es una sesión corta con un objetivo; se
 * desbloquea al superar (≥ 80 %) todos los pasos del anterior. El calendario no influye:
 * se pueden hacer varios días seguidos o tardar una semana en uno (PLAN §2).
 */
export interface PathStep {
  kind: 'exercise' | 'phrase';
  /** Id del ejercicio, o `canción/frase`. */
  itemId: string;
}

export interface PathDay {
  title: string;
  goal: string;
  steps: PathStep[];
}

const ex = (itemId: string): PathStep => ({ kind: 'exercise', itemId });
const ph = (itemId: string): PathStep => ({ kind: 'phrase', itemId });

export const LEARNING_PATH: PathDay[] = [
  { title: 'Tu primera nota', goal: 'Escucha una nota y cántala igual, sin prisa.', steps: [ex('sustained-3s')] },
  { title: 'Que no se caiga', goal: 'Mantén la nota firme hasta el final.', steps: [ex('sustained-3s'), ex('sustained-5s')] },
  { title: 'Paso a paso', goal: 'Sube y baja por notas vecinas.', steps: [ex('steps-do-re-mi')] },
  { title: 'El primer salto', goal: 'Salta a otra nota sin pasar por las de en medio.', steps: [ex('interval-major-third'), ex('steps-do-re-mi')] },
  { title: 'Saltos más grandes', goal: 'Un salto más amplio, con calma.', steps: [ex('interval-fifth')] },
  { title: 'Tu primera canción', goal: 'Junta lo aprendido en una frase de canción.', steps: [ex('scale-five'), ph('estrellita/p1')] },
  { title: 'La escala', goal: 'Ocho notas seguidas: la base de todas las melodías.', steps: [ex('scale-major')] },
  { title: 'Desliza la voz', goal: 'De grave a agudo sin cortes.', steps: [ex('siren-up')] },
  { title: 'Ida y vuelta', goal: 'Sube y baja deslizando, y termina con una nota larga.', steps: [ex('siren-up-down'), ex('sustained-5s')] },
  { title: 'Repaso con canción', goal: 'Escala, salto y dos frases más de la canción.', steps: [ex('scale-major'), ex('interval-fifth'), ph('estrellita/p2'), ph('estrellita/p3')] },
];

export type DayStatus = 'done' | 'current' | 'locked';

export interface PathDayState {
  index: number;
  day: PathDay;
  status: DayStatus;
  /** Por paso: superado alguna vez. */
  passed: boolean[];
}

export function pathState(attempts: readonly Attempt[], path: readonly PathDay[] = LEARNING_PATH): PathDayState[] {
  const passedItems = new Set(attempts.filter((a) => a.passed).map((a) => a.itemId));
  let unlocked = true;
  return path.map((day, index) => {
    const passed = day.steps.map((s) => passedItems.has(s.itemId));
    const complete = passed.every(Boolean);
    const status: DayStatus = !unlocked ? 'locked' : complete ? 'done' : 'current';
    if (!complete) unlocked = false;
    return { index, day, status, passed };
  });
}

/** Día en curso (el primero sin completar), o null si el camino está completo. */
export function currentDay(states: readonly PathDayState[]): PathDayState | null {
  return states.find((s) => s.status === 'current') ?? null;
}
