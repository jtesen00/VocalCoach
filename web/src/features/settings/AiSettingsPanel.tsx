import { useState } from 'react';
import { AiError, pickModel, PROVIDER_IDS, PROVIDERS, type ProviderId } from '../../ai/providers';
import { aiSettingsStore, removeProvider, saveProvider } from '../../shared/ai-settings';

/**
 * Ajustes → Profe con IA (experimental, multi-IA): claves de Groq, Gemini o Grok guardadas
 * solo en este navegador. El preferido se usa primero; los demás, si ese falla.
 */
export function AiSettingsPanel({ detailed }: { detailed: boolean }) {
  const ai = aiSettingsStore.use();
  const connected = PROVIDER_IDS.filter((id) => ai.providers[id]);
  const [provider, setProvider] = useState<ProviderId>(PROVIDER_IDS.find((id) => !ai.providers[id]) ?? 'groq');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<ProviderId | null>(null);

  const connect = async (id: ProviderId, key: string) => {
    setBusy(id);
    setStatus(null);
    try {
      const model = await pickModel(id, key);
      saveProvider(id, key, model);
      setDraft('');
      setStatus({ ok: true, text: `${PROVIDERS[id].name} conectado. Tras cada ejercicio verás «💬 Explícamelo (IA)».` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof AiError ? e.message : 'No se pudo comprobar la clave.' });
    } finally {
      setBusy(null);
    }
  };

  const p = PROVIDERS[provider];
  return (
    <fieldset>
      <legend>Profe con IA (experimental)</legend>
      <p className="hint">
        Un profe que te explica cada intento con sus palabras, responde tus dudas y te da ideas para cantar cada frase. Puedes conectar
        <strong> Groq</strong>, <strong>Google Gemini</strong> o <strong>xAI Grok</strong> (los dos primeros tienen plan gratuito). Si conectas
        varios, se usa tu preferido y, si falla, el siguiente. Solo se envía un resumen en texto: nunca tu voz.
      </p>
      <p className="hint">Si entras con tu cuenta, el profe con IA funciona sin pegar ninguna clave (la pone el servidor). La clave propia es solo para pruebas.</p>

      {connected.length > 0 && (
        <ul className="ai-providers">
          {connected.map((id) => (
            <li key={id}>
              <label className="choice">
                <input type="radio" name="ai-preferred" checked={ai.preferred === id} onChange={() => aiSettingsStore.update((s) => ({ ...s, preferred: id }))} />
                <span>
                  ✓ <strong>{PROVIDERS[id].name}</strong>
                  {ai.preferred === id ? ' (preferido)' : ' (respaldo)'}
                  {detailed && ai.providers[id]?.model ? ` · modelo ${ai.providers[id]!.model}` : ''}
                </span>
              </label>{' '}
              <button className="link" onClick={() => connect(id, ai.providers[id]!.key)} disabled={!!busy}>{busy === id ? 'Comprobando…' : 'Comprobar'}</button>{' '}
              <button className="link" onClick={() => { removeProvider(id); setStatus(null); }} aria-label={`Borrar la clave de ${PROVIDERS[id].name}`}>Borrar clave</button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="ai-key"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void connect(provider, draft.trim());
        }}
      >
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)} aria-label="Proveedor de IA">
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>{PROVIDERS[id].name}{ai.providers[id] ? ' (conectado)' : ''}</option>
          ))}
        </select>
        <input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Pega tu clave de ${p.name} (${p.keyPlaceholder})`} aria-label={`Clave de ${p.name}`} />
        <button disabled={!!busy || !draft.trim()}>{busy === provider ? 'Comprobando…' : ai.providers[provider] ? 'Cambiar' : 'Conectar'}</button>
      </form>
      {status && <p className={`notice ${status.ok ? '' : 'error'}`} role="status">{status.text}</p>}
      <p className="hint">
        Las claves se guardan solo en este navegador y son para pruebas: no las compartas ni las uses en un ordenador ajeno.
        Consigue la de {p.name} en {p.console}.
      </p>
    </fieldset>
  );
}
