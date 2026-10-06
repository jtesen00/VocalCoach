import type { ChatMessage } from '../core/ai/teacher-prompt';

/**
 * Adaptador de Groq (API compatible con OpenAI). Solo para PRUEBAS: la clave la pega el
 * usuario en Ajustes y se guarda en su navegador (nunca en el código ni en variables
 * VITE_*). En producción, la llamada pasará por un intermediario (backend o Worker) que
 * guarde la clave (docs/research/ia-proveedores.md).
 *
 * En desarrollo y en `vite preview` (puerto 4173) la llamada va por el servidor local
 * (vite.config.ts), porque Groq no garantiza CORS desde el navegador; si no, va directa.
 */
export const GROQ_BASE = import.meta.env.DEV || location.port === '4173' ? '/groq/openai/v1' : 'https://api.groq.com/openai/v1';

/** Modelos preferidos, por orden. Groq rota su catálogo: se usa el primero disponible. */
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'network' | 'model' | 'other',
  ) {
    super(message);
  }
}

async function call(path: string, key: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(GROQ_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new AiError('No se pudo conectar con Groq. Revisa tu conexión; si usas la versión publicada, Groq puede bloquear llamadas desde el navegador: prueba con «pnpm dev».', 'network');
  }
  if (res.status === 401 || res.status === 403) throw new AiError('La clave de Groq no es válida o no tiene permiso.', 'auth');
  if (res.status === 429) throw new AiError('Groq está limitando las peticiones (plan gratuito). Prueba en un minuto.', 'rate');
  if (res.status === 404) throw new AiError('El modelo ya no está disponible en Groq.', 'model');
  if (!res.ok) throw new AiError(`Groq respondió con un error (${res.status}).`, 'other');
  return res;
}

/** Comprueba la clave y elige el mejor modelo disponible. */
export async function pickModel(key: string): Promise<string> {
  const res = await call('/models', key);
  const data = (await res.json()) as { data?: { id: string; active?: boolean }[] };
  const ids = new Set((data.data ?? []).filter((m) => m.active !== false).map((m) => m.id));
  const model = GROQ_MODELS.find((m) => ids.has(m));
  if (!model) throw new AiError('Ninguno de los modelos previstos está disponible en tu cuenta de Groq.', 'model');
  return model;
}

export async function chat(key: string, model: string, messages: readonly ChatMessage[], signal?: AbortSignal): Promise<string> {
  const res = await call('/chat/completions', key, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 400 }),
  });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError('La IA no devolvió respuesta.', 'other');
  // Algunos modelos de razonamiento devuelven su "pensamiento" entre <think>…</think>.
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
