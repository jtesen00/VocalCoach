import { describe, expect, it } from 'vitest';
import { MODEL_PICKERS, rankModels } from './models';

describe('multi-IA: elección del modelo según la lista de cada proveedor', () => {
  it('Groq: el primero disponible de la lista de preferidos', () => {
    expect(MODEL_PICKERS.groq(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'])).toBe('llama-3.3-70b-versatile');
    expect(MODEL_PICKERS.groq(['whisper-large-v3'])).toBeNull();
  });

  it('Gemini: el Flash más nuevo, sin imagen, voz ni vista previa', () => {
    const ids = ['models/gemini-2.5-flash', 'models/gemini-3.6-flash', 'models/gemini-3.6-flash-image', 'models/gemini-3.6-flash-lite', 'models/gemini-3.6-pro-preview', 'models/text-embedding-004'];
    expect(MODEL_PICKERS.gemini(ids)).toBe('gemini-3.6-flash');
    expect(MODEL_PICKERS.gemini(['models/gemini-2.5-flash-lite', 'models/gemini-2.5-pro'])).toBe('gemini-2.5-flash-lite');
  });

  it('Grok: el rápido sin razonamiento; si no hay, el más nuevo', () => {
    expect(MODEL_PICKERS.xai(['grok-4.6', 'grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning', 'grok-imagine-image'])).toBe('grok-4-1-fast-non-reasoning');
    expect(MODEL_PICKERS.xai(['grok-4.5', 'grok-4.6', 'grok-build-0.1'])).toBe('grok-4.6');
  });

  it('rankModels respeta el orden de los patrones', () => {
    expect(rankModels(['b-2', 'a-1', 'a-3'], [/^a/, /^b/])).toBe('a-3');
    expect(rankModels(['x'], [/^a/])).toBeNull();
  });
});
