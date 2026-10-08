import { MODEL_PICKERS, type ProviderId } from '../core/ai/models';
import type { ChatMessage } from '../core/ai/teacher-prompt';

export type { ProviderId };

/**
 * Proveedores de IA de texto (Fase 9, multi-IA): Groq, Google Gemini y xAI Grok. Los tres
 * ofrecen una API compatible con OpenAI (`/models` y `/chat/completions`), así que un solo
 * cliente sirve para todos. Solo para PRUEBAS con la clave del usuario guardada en su
 * navegador; con cuenta, la llamada va por el servidor (docs/research/ia-proveedores.md).
 *
 * En desarrollo y en `vite preview` (puerto 4173) las llamadas pasan por el servidor local
 * (vite.config.ts), porque no todos garantizan CORS desde el navegador.
 */
export interface AiProvider {
  id: ProviderId;
  name: string;
  /** Dónde conseguir la clave. */
  console: string;
  keyPlaceholder: string;
  /** URL base de la API compatible con OpenAI (sin barra final). */
  base: string;
  /** Prefijo del intermediario local en desarrollo. */
  devProxy: string;
  /** Elige el mejor modelo de la lista del proveedor (los catálogos rotan: no se fijan nombres). */
  pickModel: (ids: readonly string[]) => string | null;
  /** Ajustes extra de la petición de chat. */
  extraBody?: Record<string, unknown>;
}

const useProxy = () => import.meta.env.DEV || location.port === '4173';

export const PROVIDERS: Record<ProviderId, AiProvider> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    console: 'console.groq.com → API Keys',
    keyPlaceholder: 'gsk_…',
    base: 'https://api.groq.com/openai/v1',
    devProxy: '/groq/openai/v1',
    pickModel: MODEL_PICKERS.groq,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    console: 'aistudio.google.com → Get API key',
    keyPlaceholder: 'AIza…',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    devProxy: '/gemini/v1beta/openai',
    pickModel: MODEL_PICKERS.gemini,
    // Sin "pensamiento" largo: respuestas breves y rápidas.
    extraBody: { reasoning_effort: 'low' },
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    console: 'console.x.ai → API Keys',
    keyPlaceholder: 'xai-…',
    base: 'https://api.x.ai/v1',
    devProxy: '/xai/v1',
    pickModel: MODEL_PICKERS.xai,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'network' | 'model' | 'other',
  ) {
    super(message);
  }
}

const baseOf = (p: AiProvider) => (useProxy() ? p.devProxy : p.base);

async function call(p: AiProvider, path: string, key: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(baseOf(p) + path, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(`No se pudo conectar con ${p.name}. Revisa tu conexión; si usas la versión publicada, puede que ${p.name} no acepte llamadas desde el navegador: prueba con «pnpm dev».`, 'network');
  }
  if (res.status === 401 || res.status === 403) throw new AiError(`La clave de ${p.name} no es válida o no tiene permiso.`, 'auth');
  if (res.status === 400 && path === '/models') throw new AiError(`La clave de ${p.name} no es válida.`, 'auth');
  if (res.status === 429) throw new AiError(`${p.name} está limitando las peticiones (plan gratuito). Prueba en un minuto.`, 'rate');
  if (res.status === 404) throw new AiError(`El modelo ya no está disponible en ${p.name}.`, 'model');
  if (!res.ok) throw new AiError(`${p.name} respondió con un error (${res.status}).`, 'other');
  return res;
}

/** Comprueba la clave y elige el mejor modelo disponible. */
export async function pickModel(provider: ProviderId, key: string): Promise<string> {
  const p = PROVIDERS[provider];
  const res = await call(p, '/models', key);
  const data = (await res.json()) as { data?: { id: string; active?: boolean }[] };
  const model = p.pickModel((data.data ?? []).filter((m) => m.active !== false).map((m) => m.id));
  if (!model) throw new AiError(`No encontramos un modelo de texto adecuado en tu cuenta de ${p.name}.`, 'model');
  return model;
}

export async function chat(provider: ProviderId, key: string, model: string, messages: readonly ChatMessage[], signal?: AbortSignal, maxTokens = 400): Promise<string> {
  const p = PROVIDERS[provider];
  const send = (extra?: Record<string, unknown>) =>
    call(p, '/chat/completions', key, { method: 'POST', signal, body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: maxTokens, ...extra }) });
  let res: Response;
  try {
    res = await send(p.extraBody);
  } catch (e) {
    // Un modelo que no admite los ajustes extra (p. ej. sin razonamiento): se reintenta sin ellos.
    if (!p.extraBody || !(e instanceof AiError) || e.kind !== 'other') throw e;
    res = await send();
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError('La IA no devolvió respuesta.', 'other');
  // Algunos modelos de razonamiento devuelven su "pensamiento" entre <think>…</think>.
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
