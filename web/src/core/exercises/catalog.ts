import type { ExerciseDef } from './types';

/**
 * Catálogo inicial, original (sin contenido con copyright). Datos, no código:
 * añadir un ejercicio no requiere tocar la UI. Los offsets se transponen al rango del usuario.
 */
export const EXERCISES: readonly ExerciseDef[] = [
  {
    id: 'sustained-3s',
    kind: 'sustained',
    title: 'Nota sostenida',
    instructions: 'Escucha la nota y sostenla 3 segundos con una vocal abierta ("aaa"), sin cambiar el volumen.',
    level: 'beginner',
    notes: [{ offset: 0, durationMs: 3000 }],
  },
  {
    id: 'sustained-5s',
    kind: 'sustained',
    title: 'Nota sostenida larga',
    instructions: 'Sostén la nota 5 segundos. Fíjate en que no caiga al final, cuando se acaba el aire.',
    level: 'intermediate',
    notes: [{ offset: 0, durationMs: 5000 }],
  },
  {
    id: 'steps-do-re-mi',
    kind: 'sequence',
    title: 'Tres notas: do-re-mi-re-do',
    instructions: 'Canta las cinco notas siguiendo el tiempo de la guía, cambiando de nota sin cortar el sonido.',
    level: 'beginner',
    notes: [0, 2, 4, 2, 0].map((offset) => ({ offset, durationMs: 900 })),
  },
  {
    id: 'interval-major-third',
    kind: 'interval',
    title: 'Intervalo: tercera mayor',
    instructions: 'Canta la primera nota y salta a la segunda (como "do-mi").',
    level: 'beginner',
    notes: [{ offset: 0, durationMs: 1500 }, { offset: 4, durationMs: 1500 }],
  },
  {
    id: 'interval-fifth',
    kind: 'interval',
    title: 'Intervalo: quinta justa',
    instructions: 'Canta la primera nota y salta a la quinta (como "do-sol").',
    level: 'intermediate',
    notes: [{ offset: 0, durationMs: 1500 }, { offset: 7, durationMs: 1500 }],
  },
  {
    id: 'scale-five',
    kind: 'scale',
    title: 'Escala de cinco notas',
    instructions: 'Sube y baja la escala: do-re-mi-fa-sol-fa-mi-re-do.',
    level: 'intermediate',
    notes: [0, 2, 4, 5, 7, 5, 4, 2, 0].map((offset) => ({ offset, durationMs: 700 })),
  },
  {
    id: 'scale-major',
    kind: 'scale',
    title: 'Escala mayor completa',
    instructions: 'Sube la escala mayor completa, una octava.',
    level: 'advanced',
    notes: [0, 2, 4, 5, 7, 9, 11, 12].map((offset) => ({ offset, durationMs: 600 })),
  },
  {
    id: 'siren-up',
    kind: 'siren',
    title: 'Sirena ascendente',
    instructions: 'Desliza la voz de forma continua desde la nota grave hasta la aguda (una octava), sin cortar el sonido. Funciona bien con "uuu" o con los labios vibrando.',
    level: 'beginner',
    path: [0, 12],
    durationMs: 3000,
  },
  {
    id: 'siren-up-down',
    kind: 'siren',
    title: 'Sirena de ida y vuelta',
    instructions: 'Sube deslizando una octava y vuelve a bajar, todo en una sola respiración.',
    level: 'intermediate',
    path: [0, 12, 0],
    durationMs: 5000,
  },
];

export function findExercise(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id);
}
