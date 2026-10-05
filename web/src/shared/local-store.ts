import { useSyncExternalStore } from 'react';

/**
 * Almacén reactivo persistido en localStorage. Para datos pequeños y locales
 * (perfil vocal, progreso de canciones); en la Fase 5 se migra a IndexedDB.
 */
export function createLocalStore<T>(key: string, initial: () => T) {
  let value: T = initial();
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = { ...initial(), ...(JSON.parse(raw) as T) };
  } catch {
    /* sin almacenamiento: se usa el valor inicial */
  }
  const listeners = new Set<() => void>();
  const store = {
    get: () => value,
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: el dato dura la sesión */
      }
      listeners.forEach((l) => l());
    },
    update(fn: (prev: T) => T) {
      store.set(fn(value));
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): T {
      return useSyncExternalStore(store.subscribe, store.get);
    },
  };
  return store;
}
