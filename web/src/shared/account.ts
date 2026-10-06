import { ApiError, request } from '../api/client';
import type { ExerciseEvaluation } from '../core/exercises/evaluate';
import type { Attempt } from '../core/progress/progress';
import { createLocalStore } from './local-store';
import { markSynced, mergeRemote, onAttemptRecorded, progressLoaded, unsyncedAttempts } from './progress-store';

/**
 * Cuenta opcional (Fase 6): copia de seguridad del progreso y sincronización entre
 * dispositivos. Los tokens se guardan en este navegador; el de acceso dura una hora y se
 * renueva con el de refresco (que el servidor rota en cada uso).
 */
export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

interface AccountState {
  user: AccountUser | null;
  accessToken: string | null;
  accessExpiresAt: number;
  refreshToken: string | null;
  /** Cursor para traer intentos de otros dispositivos (receivedAtUtc del último recibido). */
  pulledUntil: string | null;
  lastSyncAt: number | null;
  syncError: string | null;
}

const empty = (): AccountState => ({ user: null, accessToken: null, accessExpiresAt: 0, refreshToken: null, pulledUntil: null, lastSyncAt: null, syncError: null });

export const accountStore = createLocalStore<AccountState>('vocalcoach.account.v1', empty);

interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAtUtc: string;
  refreshToken: string;
  user: AccountUser;
}

function signIn(r: AuthResponse) {
  const prev = accountStore.get();
  // Otra cuenta: se vuelve a traer todo desde el principio.
  const sameUser = prev.user?.id === r.user.id;
  accountStore.set({
    ...empty(),
    user: r.user,
    accessToken: r.accessToken,
    accessExpiresAt: Date.parse(r.accessTokenExpiresAtUtc),
    refreshToken: r.refreshToken,
    pulledUntil: sameUser ? prev.pulledUntil : null,
    lastSyncAt: sameUser ? prev.lastSyncAt : null,
  });
}

export async function register(email: string, password: string, displayName: string): Promise<void> {
  signIn(await request<AuthResponse>('/api/identity/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }));
  void syncNow();
}

export async function login(email: string, password: string): Promise<void> {
  signIn(await request<AuthResponse>('/api/identity/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
  void syncNow();
}

export async function logout(): Promise<void> {
  const { refreshToken } = accountStore.get();
  accountStore.set(empty());
  if (refreshToken) await request('/api/identity/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
}

let refreshing: Promise<string | null> | null = null;

/** Token de acceso válido (lo renueva si caduca en menos de un minuto). null si la sesión ya no vale. */
async function accessToken(): Promise<string | null> {
  const s = accountStore.get();
  if (!s.user) return null;
  if (s.accessToken && s.accessExpiresAt - Date.now() > 60_000) return s.accessToken;
  refreshing ??= (async () => {
    try {
      signIn(await request<AuthResponse>('/api/identity/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: s.refreshToken }) }));
      return accountStore.get().accessToken;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) accountStore.set(empty()); // sesión caducada o revocada
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Petición autenticada (renueva el token si hace falta). */
export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new ApiError('Inicia sesión de nuevo.', 401, 'session');
  return request<T>(path, { ...init, token });
}

interface SyncResult {
  accepted: number;
  alreadySynced: number;
  rejected: { id: string; code: string; message: string }[];
}

interface RemoteAttempt {
  id: string;
  kind: 'exercise' | 'phrase';
  itemId: string;
  performedAtUtc: string;
  localDay: string;
  score: number;
  accuracy: number | null;
  passed: boolean;
  durationSeconds: number;
  details: string | null;
  receivedAtUtc: string;
}

const BATCH = 200;
let syncing: Promise<void> | null = null;

/** Sube lo pendiente y trae lo hecho en otros dispositivos. Seguro de repetir (idempotente en el servidor). */
export function syncNow(): Promise<void> {
  if (!accountStore.get().user || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve();
  syncing ??= (async () => {
    try {
      await progressLoaded;
      // 1. Subir.
      for (let pending = unsyncedAttempts(); pending.length; pending = unsyncedAttempts()) {
        const batch = pending.slice(0, BATCH);
        const r = await authed<SyncResult>('/api/practice/attempts/sync', {
          method: 'POST',
          body: JSON.stringify({
            attempts: batch.map((a) => ({
              id: a.id,
              kind: a.kind,
              itemId: a.itemId,
              performedAtUtc: new Date(a.at).toISOString(),
              localDay: a.day,
              score: Math.round(a.score),
              accuracy: a.accuracy,
              passed: a.passed,
              durationSeconds: a.durationS,
              details: a.evaluation ? JSON.stringify(a.evaluation).slice(0, 32_000) : null,
            })),
          }),
        });
        // Los rechazados también se marcan: reintentarlos daría el mismo error.
        markSynced(batch.map((a) => a.id));
        if (r.rejected.length) console.warn('Intentos rechazados por el servidor', r.rejected);
      }
      // 2. Traer (paginado).
      for (;;) {
        const since = accountStore.get().pulledUntil;
        const page = await authed<{ attempts: RemoteAttempt[]; next: string | null }>(`/api/practice/attempts?limit=500${since ? `&since=${encodeURIComponent(since)}` : ''}`);
        mergeRemote(page.attempts.map(fromRemote));
        const last = page.attempts.at(-1)?.receivedAtUtc ?? since;
        accountStore.update((s) => ({ ...s, pulledUntil: last }));
        if (!page.next) break;
      }
      accountStore.update((s) => ({ ...s, lastSyncAt: Date.now(), syncError: null }));
    } catch (e) {
      accountStore.update((s) => ({ ...s, syncError: e instanceof Error ? e.message : 'Error al sincronizar.' }));
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function fromRemote(r: RemoteAttempt): Attempt {
  let evaluation: ExerciseEvaluation | undefined;
  try {
    evaluation = r.details ? (JSON.parse(r.details) as ExerciseEvaluation) : undefined;
  } catch {
    evaluation = undefined;
  }
  return {
    id: r.id,
    kind: r.kind,
    itemId: r.itemId,
    at: Date.parse(r.performedAtUtc),
    day: r.localDay,
    score: r.score,
    accuracy: r.accuracy,
    passed: r.passed,
    durationS: r.durationSeconds,
    evaluation,
  };
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Sincronización automática: al abrir la app, tras cada intento (agrupando 3 s) y al recuperar la conexión. */
export function startAutoSync(): () => void {
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 3000);
  };
  const off = onAttemptRecorded(soon);
  window.addEventListener('online', soon);
  void syncNow();
  return () => {
    off();
    window.removeEventListener('online', soon);
  };
}

/** Para mostrar "N intentos pendientes de subir". */
export const pendingCount = () => unsyncedAttempts().length;
