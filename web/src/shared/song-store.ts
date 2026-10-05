import type { PhraseIssue } from '../core/songs/scoring';
import { createLocalStore } from './local-store';

export interface PhraseRecord {
  attempts: number;
  best: number;
  last: number;
  /** Puntuación del intento anterior (para medir mejora). */
  previous: number | null;
  lastAccuracy: number | null;
  lastIssue: PhraseIssue | null;
}

export interface SongProgress {
  /** Versión elegida (semitonos respecto a la original), o null si aún no se eligió. */
  transpose: number | null;
  /** Resultados por tonalidad ("-2", "0"…) y por frase. */
  byKey: Record<string, Record<string, PhraseRecord>>;
}

export const songStore = createLocalStore<Record<string, SongProgress>>('vocalcoach.songs.v1', () => ({}));

export function songProgress(songId: string): SongProgress {
  return songStore.get()[songId] ?? { transpose: null, byKey: {} };
}

export function setSongVersion(songId: string, transpose: number): void {
  songStore.update((all) => ({ ...all, [songId]: { ...songProgress(songId), transpose } }));
}

export function recordPhrase(songId: string, transpose: number, phraseId: string, score: number, accuracy: number | null, issue: PhraseIssue): PhraseRecord {
  const progress = songProgress(songId);
  const key = String(transpose);
  const prev = progress.byKey[key]?.[phraseId];
  const rec: PhraseRecord = {
    attempts: (prev?.attempts ?? 0) + 1,
    best: Math.max(prev?.best ?? 0, score),
    last: score,
    previous: prev?.last ?? null,
    lastAccuracy: accuracy,
    lastIssue: issue,
  };
  songStore.update((all) => ({
    ...all,
    [songId]: { ...progress, byKey: { ...progress.byKey, [key]: { ...progress.byKey[key], [phraseId]: rec } } },
  }));
  return rec;
}

/** Historial real por tonalidad para el recomendador: precisión de la última vez en cada frase. */
export function keyHistory(songId: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [key, phrases] of Object.entries(songProgress(songId).byKey)) {
    const acc = Object.values(phrases).map((r) => r.lastAccuracy).filter((a): a is number => a !== null);
    if (acc.length) out[key] = acc;
  }
  return out;
}
