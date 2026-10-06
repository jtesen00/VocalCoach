import { useState } from 'react';
import { AiError, pickModel } from '../../ai/groq';
import { aiSettingsStore } from '../../shared/ai-settings';

/** Ajustes → Profe con IA (experimental): clave de Groq guardada solo en este navegador. */
export function AiSettingsPanel({ detailed }: { detailed: boolean }) {
  const ai = aiSettingsStore.use();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async (key: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const model = await pickModel(key);
      aiSettingsStore.set({ groqKey: key, model });
      setDraft('');
      setStatus({ ok: true, text: 'Conectado. Tras cada ejercicio verás «💬 Explícamelo (IA)».' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof AiError ? e.message : 'No se pudo comprobar la clave.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset>
      <legend>Profe con IA (experimental)</legend>
      <p className="hint">
        Un profe que te explica cada intento con sus palabras y responde tus dudas. Usa <strong>Groq</strong> (gratuito para probar).
        Solo se envía un resumen en texto de tu intento: nunca tu voz.
      </p>
      {ai.groqKey ? (
        <>
          <p>
            ✓ Clave guardada en este navegador{detailed && ai.model ? ` · modelo ${ai.model}` : ''}.{' '}
            <button className="link" onClick={() => connect(ai.groqKey)} disabled={busy}>{busy ? 'Comprobando…' : 'Comprobar'}</button>{' '}
            <button className="link" onClick={() => { aiSettingsStore.set({ groqKey: '', model: null }); setStatus(null); }}>Borrar clave</button>
          </p>
        </>
      ) : (
        <form
          className="ai-key"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void connect(draft.trim());
          }}
        >
          <input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pega tu clave de Groq (gsk_…)" aria-label="Clave de Groq" />
          <button disabled={busy || !draft.trim()}>{busy ? 'Comprobando…' : 'Conectar'}</button>
        </form>
      )}
      {status && <p className={`notice ${status.ok ? '' : 'error'}`} role="status">{status.text}</p>}
      <p className="hint">
        La clave se guarda solo en este navegador y es para pruebas: no la compartas ni la uses en un ordenador ajeno.
        Consíguela en console.groq.com → API Keys.
      </p>
    </fieldset>
  );
}
