import { useEffect, useState } from 'react';

/**
 * Almacenamiento persistente (Fase 7): sin él, el navegador puede borrar IndexedDB y
 * localStorage si falta espacio. Se pide tras el primer intento guardado (el usuario ya
 * tiene algo que perder); los navegadores lo conceden sobre todo a apps instaladas.
 */
let persistAsked = false;

/** Pide al navegador que no borre los datos (progreso, perfil, canciones) si falta espacio. */
export async function requestPersistence(): Promise<boolean> {
  if (persistAsked || !navigator.storage?.persist) return false;
  persistAsked = true;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** ¿El navegador protege los datos de la app? (null si no se puede saber). */
export function usePersisted(): boolean | null {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    navigator.storage?.persisted?.().then((p) => alive && setPersisted(p), () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return persisted;
}
