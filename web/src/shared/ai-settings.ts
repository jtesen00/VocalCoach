import { createLocalStore } from './local-store';

/**
 * Profe con IA (experimental). La clave de Groq la pega el usuario y se guarda SOLO en
 * este navegador (localStorage): es para probar. En producción irá en un intermediario.
 */
export interface AiSettings {
  groqKey: string;
  /** Modelo elegido al probar la conexión. */
  model: string | null;
}

export const aiSettingsStore = createLocalStore<AiSettings>('vocalcoach.ai.v1', () => ({ groqKey: '', model: null }));

export const aiReady = (s: AiSettings) => s.groqKey.trim() !== '' && s.model !== null;
