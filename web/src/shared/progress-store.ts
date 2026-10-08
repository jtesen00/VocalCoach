import Dexie, { type Table } from 'dexie';
import { useSyncExternalStore } from 'react';
import type { ExerciseEvaluation } from '../core/exercises/evaluate';
import { localDay, type Attempt, type AttemptKind } from '../core/progress/progress';
import { requestPersistence } from './persistence';

/**
 * Historial de intentos en IndexedDB (Dexie). Se carga entero en memoria al abrir la app
 * (son agregados pequeños: miles de intentos ocupan pocos cientos de KB) para que la
 * interfaz y el profe lo lean de forma síncrona; cada intento nuevo se escribe en segundo
 * plano. Si IndexedDB no está disponible, el progreso dura la sesión.
 */
/** Intento guardado en el dispositivo; `syncedAt` = cuándo se subió a la cuenta (si hay). */
export type StoredAttempt = Attempt & { syncedAt?: number };

class ProgressDb extends Dexie {
  attempts!: Table<StoredAttempt, string>;
  constructor() {
    super('vocalcoach');
    this.version(1).stores({ attempts: '&id, itemId, day, at' });
  }
}

let db: ProgressDb | null = null;
let attempts: StoredAttempt[] = [];
const recordedListeners = new Set<() => void>();
let ready = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function open(): ProgressDb | null {
  if (db) return db;
  try {
    db = new ProgressDb();
  } catch {
    db = null;
  }
  return db;
}

/** Carga el historial guardado (una vez, al arrancar). */
export const progressLoaded: Promise<void> = (async () => {
  try {
    const stored = (await open()?.attempts.orderBy('at').toArray()) ?? [];
    // Lo registrado mientras cargaba se conserva.
    const ids = new Set(stored.map((a) => a.id));
    attempts = [...stored, ...attempts.filter((a) => !ids.has(a.id))];
  } catch {
    /* sin IndexedDB (modo privado antiguo, etc.) */
  }
  ready = true;
  notify();
})();

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export interface NewAttempt {
  kind: AttemptKind;
  itemId: string;
  score: number;
  accuracy: number | null;
  passed: boolean;
  durationS: number;
  evaluation?: ExerciseEvaluation;
}

/** Guarda un intento y devuelve los anteriores del mismo ejercicio o frase (del más antiguo al más reciente). */
export function recordAttempt(input: NewAttempt): Attempt[] {
  const previous = attempts.filter((a) => a.itemId === input.itemId);
  const now = Date.now();
  const attempt: Attempt = { id: newId(), at: now, day: localDay(now), ...input };
  attempts = [...attempts, attempt];
  notify();
  void open()?.attempts.add(attempt).catch(() => undefined);
  void requestPersistence();
  recordedListeners.forEach((l) => l());
  return previous;
}

/** Aviso tras cada intento nuevo (la sincronización con la cuenta se engancha aquí). */
export function onAttemptRecorded(listener: () => void): () => void {
  recordedListeners.add(listener);
  return () => recordedListeners.delete(listener);
}

/** Intentos aún no subidos a la cuenta. */
export const unsyncedAttempts = (): StoredAttempt[] => attempts.filter((a) => !a.syncedAt);

export function markSynced(ids: readonly string[]): void {
  const set = new Set(ids);
  const now = Date.now();
  attempts = attempts.map((a) => (set.has(a.id) ? { ...a, syncedAt: now } : a));
  const changed = attempts.filter((a) => set.has(a.id));
  void open()?.attempts.bulkPut(changed).catch(() => undefined);
}

/** Añade intentos hechos en otros dispositivos (los que ya están se ignoran). */
export function mergeRemote(remote: readonly Attempt[]): number {
  const known = new Set(attempts.map((a) => a.id));
  const fresh = remote.filter((a) => !known.has(a.id)).map((a) => ({ ...a, syncedAt: Date.now() }));
  if (fresh.length === 0) return 0;
  attempts = [...attempts, ...fresh].sort((x, y) => x.at - y.at);
  notify();
  void open()?.attempts.bulkPut(fresh).catch(() => undefined);
  return fresh.length;
}

/** Evaluaciones anteriores de un ejercicio (para el profe). */
export function previousEvaluations(itemId: string): ExerciseEvaluation[] {
  return attempts.filter((a) => a.itemId === itemId && a.evaluation).map((a) => a.evaluation!);
}

export async function clearProgress(): Promise<void> {
  attempts = [];
  notify();
  await open()?.attempts.clear().catch(() => undefined);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getAttempts = () => attempts;

/** Historial reactivo. `ready` es false hasta que termina de cargar. */
export function useAttempts(): { attempts: Attempt[]; ready: boolean } {
  const list = useSyncExternalStore(subscribe, getAttempts);
  const isReady = useSyncExternalStore(subscribe, () => ready);
  return { attempts: list, ready: isReady };
}
