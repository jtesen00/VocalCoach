import { useRef, useState } from 'react';
import { AiError, chat } from '../../ai/groq';
import { teacherMessages, type AttemptSummary, type ChatMessage } from '../../core/ai/teacher-prompt';
import { aiReady, aiSettingsStore } from '../../shared/ai-settings';
import { accountStore, authed } from '../../shared/account';
import { ApiError } from '../../api/client';
import { useOnline } from '../../app/pwa';

/**
 * "Pregúntale al profe (IA)": explica el intento con otras palabras y responde dudas.
 * Solo aparece si el usuario configuró la IA en Ajustes. Se envía un resumen en texto,
 * nunca audio.
 */
export function AiTeacher({ summary }: { summary: AttemptSummary }) {
  const ai = aiSettingsStore.use();
  const account = accountStore.use();
  // Con clave propia (pruebas) se llama a Groq directamente; con cuenta, por el servidor (la clave no sale de él).
  const mode = aiReady(ai) ? 'byok' : account.user ? 'server' : null;
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const abort = useRef<AbortController | null>(null);
  const online = useOnline();
  if (!mode) return null;
  if (!online) return <p className="hint ai-teacher">El profe con IA necesita internet. Lo demás funciona sin conexión.</p>;

  const ask = async (extra: ChatMessage[]) => {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const messages = teacherMessages(summary, extra);
      const answer =
        mode === 'byok'
          ? await chat(ai.groqKey, ai.model!, messages, abort.current.signal)
          : (await authed<{ content: string }>('/api/coach/teacher', { method: 'POST', body: JSON.stringify({ messages }), signal: abort.current.signal })).content;
      setConversation([...extra, { role: 'assistant', content: answer }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof AiError || e instanceof ApiError ? e.message : 'No se pudo obtener respuesta.');
    } finally {
      setBusy(false);
    }
  };

  const answers = conversation.filter((m) => m.role !== 'system');
  return (
    <div className="ai-teacher" aria-label="Profe con IA">
      {answers.length === 0 ? (
        <button onClick={() => ask([])} disabled={busy}>{busy ? 'Pensando…' : '💬 Explícamelo (IA)'}</button>
      ) : (
        <>
          <ul className="ai-chat">
            {answers.map((m, i) => (
              <li key={i} className={m.role}>
                {m.role === 'user' && <span className="hint">Tú: </span>}
                {m.content}
              </li>
            ))}
          </ul>
          <form
            className="ai-ask"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question.trim();
              if (!q || busy) return;
              setQuestion('');
              void ask([...conversation, { role: 'user', content: q.slice(0, 500) }]);
            }}
          >
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Tienes una duda? Pregúntale al profe" aria-label="Pregunta para el profe" maxLength={500} />
            <button disabled={busy || !question.trim()}>{busy ? 'Pensando…' : 'Preguntar'}</button>
          </form>
        </>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <p className="hint">La IA solo recibe un resumen de tu intento (sin audio). Puede equivocarse.</p>
    </div>
  );
}
