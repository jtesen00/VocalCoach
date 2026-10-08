import type { ChatMessage } from '../core/ai/teacher-prompt';
import { ApiError } from '../api/client';
import { authed } from '../shared/account';
import { readyProviders, type AiSettings } from '../shared/ai-settings';
import { AiError, chat, PROVIDERS, type ProviderId } from './providers';

export interface AiAnswer {
  text: string;
  /** Quién respondió: un proveedor con clave propia o el servidor. */
  via: ProviderId | 'server';
}

/**
 * Pregunta a la IA (multi-IA). Con claves propias se prueba el proveedor preferido y, si falla
 * (límite, red, modelo retirado…), el siguiente conectado. Sin claves y con cuenta, el servidor,
 * que tiene su propia lista de respaldo.
 */
export async function askAi(settings: AiSettings, signedIn: boolean, messages: readonly ChatMessage[], signal?: AbortSignal, maxTokens?: number): Promise<AiAnswer> {
  const providers = readyProviders(settings);
  if (!providers.length) {
    if (!signedIn) throw new AiError('Conecta una IA en Ajustes o entra con tu cuenta.', 'auth');
    const r = await authed<{ content: string }>('/api/coach/teacher', { method: 'POST', body: JSON.stringify({ messages, maxTokens }), signal });
    return { text: r.content, via: 'server' };
  }
  const errors: string[] = [];
  for (const p of providers) {
    try {
      return { text: await chat(p.id, p.key, p.model, messages, signal, maxTokens), via: p.id };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      errors.push(e instanceof AiError ? e.message : `${PROVIDERS[p.id].name}: error inesperado.`);
    }
  }
  throw new AiError(errors.length > 1 ? `Ninguna IA respondió. ${errors.join(' ')}` : errors[0], 'other');
}

export const aiErrorMessage = (e: unknown) => (e instanceof AiError || e instanceof ApiError ? e.message : 'No se pudo obtener respuesta.');
