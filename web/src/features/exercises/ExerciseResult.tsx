import { noteName } from '../../core/music/notes';
import type { ExerciseEvaluation, NoteStatus } from '../../core/exercises/evaluate';
import type { FeedbackMessage } from '../../core/exercises/feedback';

const STATUS: Record<NoteStatus, { label: string; icon: string }> = {
  perfect: { label: 'Perfecto', icon: '●' },
  close: { label: 'Cerca', icon: '◐' },
  too_high: { label: 'Alto', icon: '▼' },
  too_low: { label: 'Bajo', icon: '▲' },
  unstable: { label: 'Inestable', icon: '≈' },
  no_voice: { label: 'Sin voz', icon: '○' },
};

const cents = (c: number | null) => (c === null ? '—' : `${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c))} c`);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

export function ExerciseResult({ evaluation: e, feedback }: { evaluation: ExerciseEvaluation; feedback: FeedbackMessage[] }) {
  return (
    <div className="result" aria-live="polite">
      <div className="result-head">
        <strong className="result-score">{e.score}</strong>
        <div>
          <p className={`result-verdict ${e.passed ? 'pass' : 'fail'}`}>{e.passed ? '✓ Superado' : '✗ No superado'}</p>
          <p className="hint">
            {e.accuracy !== null
              ? `Precisión ${pct(e.accuracy)} (mínimo 80 %, sin contar los primeros 250 ms de cada nota)`
              : 'Sirena: se evalúa el recorrido, la dirección y la continuidad'}
          </p>
        </div>
      </div>

      {feedback.length > 0 && (
        <ul className="feedback">
          {feedback.map((m) => (
            <li key={m.id} className={`feedback-${m.tone}`}>{m.text}</li>
          ))}
        </ul>
      )}

      {e.notes.length > 0 && (
        <table className="notes-table">
          <thead>
            <tr><th>#</th><th>Nota</th><th>Estado</th><th>Desviación</th><th>Precisión</th><th>Estabilidad</th></tr>
          </thead>
          <tbody>
            {e.notes.map((n) => (
              <tr key={n.index} className={`status-${n.status}`}>
                <td>{n.index + 1}</td>
                <td>{noteName(n.targetMidi)}</td>
                <td><span aria-hidden="true">{STATUS[n.status].icon} </span>{STATUS[n.status].label}{n.vibrato ? ' · vibrato' : ''}</td>
                <td>{cents(n.medianCents)}</td>
                <td>{pct(n.accuracy)}</td>
                <td>{pct(n.stability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {e.interval && (
        <p>Intervalo: objetivo {Math.round(e.interval.targetCents)} c · cantado {e.interval.sungCents === null ? '—' : `${Math.round(e.interval.sungCents)} c`} ({cents(e.interval.errorCents)})</p>
      )}

      {e.siren && (
        <dl className="siren-stats">
          <dt>Recorrido cubierto</dt><dd>{pct(e.siren.coverage)}</dd>
          <dt>Dirección correcta</dt><dd>{pct(e.siren.direction)}</dd>
          <dt>Cortes</dt><dd>{e.siren.breaks}</dd>
          <dt>Alcanzado</dt>
          <dd>
            {e.siren.reachedLowMidi === null
              ? '—'
              : `${noteName(e.siren.reachedLowMidi - e.siren.octaveShift)} – ${noteName(e.siren.reachedHighMidi! - e.siren.octaveShift)}`}
          </dd>
        </dl>
      )}
    </div>
  );
}
