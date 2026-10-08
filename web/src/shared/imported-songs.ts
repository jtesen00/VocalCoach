import type { Song } from '../core/songs/types';
import { createLocalStore } from './local-store';

/** Canciones importadas: solo la melodía extraída, guardada en este dispositivo. */
export const importedSongsStore = createLocalStore<{ songs: Song[] }>('vocalcoach.imported.v1', () => ({ songs: [] }));

export function addImportedSong(song: Song): void {
  importedSongsStore.update((s) => ({ songs: [song, ...s.songs] }));
}

export function removeImportedSong(id: string): void {
  importedSongsStore.update((s) => ({ songs: s.songs.filter((x) => x.id !== id) }));
}

/** Guarda una canción importada editada (Fase 8c), en su sitio de la lista. */
export function updateImportedSong(song: Song): void {
  importedSongsStore.update((s) => ({ songs: s.songs.map((x) => (x.id === song.id ? song : x)) }));
}
