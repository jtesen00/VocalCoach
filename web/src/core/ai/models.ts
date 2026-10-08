/**
 * Elección del modelo de texto de cada proveedor (multi-IA, Fase 9). Los catálogos rotan,
 * así que no se fijan nombres: se elige sobre la lista que devuelve `/models`.
 */
export type ProviderId = 'groq' | 'gemini' | 'xai';

/** Versión numérica de un id ("gemini-3.6-flash" → 3.6) para preferir la más nueva. */
const version = (id: string) => Number(/(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);

/** El primer patrón que encaje gana; dentro de un patrón, la versión más alta. */
export function rankModels(ids: readonly string[], patterns: readonly RegExp[], exclude?: RegExp): string | null {
  const ok = ids.filter((id) => !exclude?.test(id));
  for (const p of patterns) {
    const hits = ok.filter((id) => p.test(id)).sort((a, b) => version(b) - version(a) || a.length - b.length);
    if (hits.length) return hits[0];
  }
  return null;
}

/** Modelos de Groq preferidos, por orden (Groq rota su catálogo). */
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

export const MODEL_PICKERS: Record<ProviderId, (ids: readonly string[]) => string | null> = {
  groq: (ids) => GROQ_MODELS.find((m) => ids.includes(m)) ?? null,
  // Flash: rápido, buen español y con plan gratuito. Fuera los de imagen, voz, tiempo real o vista previa.
  gemini: (ids) =>
    rankModels(
      ids.map((id) => id.replace(/^models\//, '')),
      [/^gemini-[\d.]+-flash$/, /^gemini-flash-latest$/, /^gemini-[\d.]+-flash-lite$/, /^gemini-.*flash/],
      /image|tts|audio|live|embedding|thinking|exp|preview/,
    ),
  // Los rápidos y sin razonamiento bastan para explicar un intento; si no, el más nuevo.
  xai: (ids) => rankModels(ids, [/^grok-.*fast.*non-reasoning/, /^grok-.*non-reasoning/, /^grok-.*fast/, /^grok-.*mini/, /^grok-\d/], /image|vision|imagine|code|build|voice/),
};
