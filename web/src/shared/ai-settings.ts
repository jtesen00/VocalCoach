import type { ProviderId } from '../ai/providers';
import { PROVIDER_IDS } from '../ai/providers';
import { createLocalStore } from './local-store';

/**
 * IA con clave propia (experimental, Fase 9 multi-IA): el usuario puede conectar varios
 * proveedores (Groq, Gemini, Grok). Las claves se guardan SOLO en este navegador
 * (localStorage): es para probar. En producción la clave va en el servidor.
 */
export interface ProviderConfig {
  key: string;
  /** Modelo elegido al comprobar la clave. */
  model: string | null;
}

export interface AiSettings {
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  /** Proveedor que se prueba primero; los demás conectados hacen de respaldo. */
  preferred: ProviderId | null;
}

const KEY = 'vocalcoach.ai.v2';

/** Versión anterior (solo Groq): `{ groqKey, model }`. */
function migrate(): AiSettings {
  const empty: AiSettings = { providers: {}, preferred: null };
  try {
    const old = JSON.parse(localStorage.getItem('vocalcoach.ai.v1') ?? 'null') as { groqKey?: string; model?: string | null } | null;
    if (old?.groqKey) return { providers: { groq: { key: old.groqKey, model: old.model ?? null } }, preferred: 'groq' };
  } catch {
    /* sin almacenamiento o dato corrupto */
  }
  return empty;
}

export const aiSettingsStore = createLocalStore<AiSettings>(KEY, migrate);

const ready = (c: ProviderConfig | undefined): c is ProviderConfig & { model: string } => !!c && c.key.trim() !== '' && c.model !== null;

/** Proveedores listos, en el orden en que se prueban: el preferido y luego los demás. */
export function readyProviders(s: AiSettings): { id: ProviderId; key: string; model: string }[] {
  const order = s.preferred ? [s.preferred, ...PROVIDER_IDS.filter((p) => p !== s.preferred)] : PROVIDER_IDS;
  return order.flatMap((id) => {
    const c = s.providers[id];
    return ready(c) ? [{ id, key: c.key, model: c.model }] : [];
  });
}

export const aiReady = (s: AiSettings) => readyProviders(s).length > 0;

export function saveProvider(id: ProviderId, key: string, model: string): void {
  aiSettingsStore.update((s) => ({ providers: { ...s.providers, [id]: { key, model } }, preferred: s.preferred ?? id }));
}

export function removeProvider(id: ProviderId): void {
  aiSettingsStore.update((s) => {
    const providers = { ...s.providers };
    delete providers[id];
    const left = PROVIDER_IDS.find((p) => providers[p]);
    return { providers, preferred: s.preferred === id ? left ?? null : s.preferred };
  });
}
