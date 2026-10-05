import type { ExerciseEvaluation } from '../../core/exercises/evaluate';
import type { TeacherAdvice } from '../../core/teacher/teacher';
import { displayNote, NOTE_RESULT, stars } from '../../shared/labels';
import { TeacherCard, type NextStepActions } from '../teacher/TeacherCard';

const cents = (c: number | null) => (c === null ? '—' : `${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c))} c`);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

interface Props {
  evaluation: ExerciseEvaluation;
  advice: TeacherAdvice;
  actions: NextStepActions;
  detailed: boolean;
}

export function ExerciseResult({ evaluation: e, advice, actions, detailed }: Props) {
  const n = stars(e.score, e.passed);
  return (
    <div className="result" aria-live="polite">
      <div className="result-head">
        <span className="stars" role="img" aria-label={`${n} de 3 estrellas`}>
          {[0, 1, 2].map((i) => <span key={i} className={i < n ? 'on' : 'off'}>★</span>)}
        </span>
        <div>
          <p className={`result-verdict ${e.passed ? 'pass' : 'fail'}`}>{e.passed ? '¡Superado!' : 'Casi… inténtalo otra vez'}</p>
          <p className="hint">
            {e.accuracy !== null
              ? `Afinado el ${pct(e.accuracy)} del tiempo (para superarlo, 80 %)`
              : `Recorriste el ${pct(e.siren!.coverage)} del camino${e.siren!.breaks ? ` · se cortó ${e.siren!.breaks} ${e.siren!.breaks === 1 ? 'vez' : 'veces'}` : ' sin cortes'}`}
            {detailed && ` · puntuación ${e.score}/100`}
          </p>
        </div>
      </div>

      <TeacherCard advice={advice} actions={actions} />

      {e.notes.length > 1 && !detailed && (
        <ol className="note-chips" aria-label="Resultado de cada nota">
          {e.notes.map((note) => (
            <li key={note.index} className={`status-${note.status}`}>
              <span aria-hidden="true">{NOTE_RESULT[note.status].icon}</span> {displayNote(note.targetMidi, false)}: {NOTE_RESULT[note.status].label}
            </li>
          ))}
        </ol>
      )}

      {detailed && e.notes.length > 0 && (
        <table className="notes-table">
          <thead>
            <tr><th>#</th><th>Nota</th><th>Estado</th><th>Desviación</th><th>Precisión</th><th>Estabilidad</th></tr>
          </thead>
          <tbody>
            {e.notes.map((note) => (
              <tr key={note.index} className={`status-${note.status}`}>
                <td>{note.index + 1}</td>
                <td>{displayNote(note.targetMidi, true)}</td>
                <td><span aria-hidden="true">{NOTE_RESULT[note.status].icon} </span>{NOTE_RESULT[note.status].label}{note.vibrato ? ' · vibrato' : ''}</td>
                <td>{cents(note.medianCents)}</td>
                <td>{pct(note.accuracy)}</td>
                <td>{pct(note.stability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detailed && e.interval && (
        <p>Intervalo: objetivo {Math.round(e.interval.targetCents)} c · cantado {e.interval.sungCents === null ? '—' : `${Math.round(e.interval.sungCents)} c`} ({cents(e.interval.errorCents)})</p>
      )}

      {detailed && e.siren && (
        <dl className="siren-stats">
          <dt>Recorrido cubierto</dt><dd>{pct(e.siren.coverage)}</dd>
          <dt>Dirección correcta</dt><dd>{pct(e.siren.direction)}</dd>
          <dt>Cortes</dt><dd>{e.siren.breaks}</dd>
          <dt>Alcanzado</dt>
          <dd>
            {e.siren.reachedLowMidi === null
              ? '—'
              : `${displayNote(e.siren.reachedLowMidi - e.siren.octaveShift, true)} – ${displayNote(e.siren.reachedHighMidi! - e.siren.octaveShift, true)}`}
          </dd>
        </dl>
      )}
    </div>
  );
}
