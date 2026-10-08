import { useRef, useState } from 'react';
import { aiErrorMessage, askAi } from '../../ai/ask';
import { PROVIDERS } from '../../ai/providers';
import { phraseTipsMessages, type PhraseContext } from '../../core/ai/phrase-prompt';
import { accountStore } from '../../shared/account';
import { aiReady, aiSettingsStore } from '../../shared/ai-settings';
import { useOnline } from '../../app/pwa';

/**
 * «¿Cómo la canto? (IA)» (Fase 9): ideas de interpretación para la frase. Solo aparece con una
 * IA conectada (clave propia o cuenta). Se envía la letra y la melodía en texto, nunca audio.
 */
export function AiPhraseTips({ context }: { context: () => PhraseContext }) {
  const ai = aiSettingsStore.use();
  const account = accountStore.use();
  const online = useOnline();
  const [answer, setAnswer] = useState<{ text: string; via: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  if (!aiReady(ai) && !account.user) return null;
  if (!online) return null;

  const ask = async () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const r = await askAi(ai, !!account.user, phraseTipsMessages(context()), abort.current.signal, 450);
      setAnswer({ text: r.text, via: r.via === 'server' ? 'el servidor' : PROVIDERS[r.via].name });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-teacher ai-phrase-tips" aria-label="Ideas para cantar la frase">
      {answer ? (
        <>
          <p className="teacher-label">Cómo cantarla</p>
          <p className="ai-tips-text">{answer.text}</p>
          <p className="hint">Ideas de la IA ({answer.via}) a partir de la letra y la melodía, sin oír tu voz. Puede equivocarse. <button className="link" onClick={ask} disabled={busy}>Otras ideas</button></p>
        </>
      ) : (
        <button onClick={ask} disabled={busy}>{busy ? 'Pensando…' : '💡 ¿Cómo la canto? (IA)'}</button>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
