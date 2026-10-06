import { useState } from 'react';
import { findExercise } from '../../core/exercises/catalog';
import { currentDay, LEARNING_PATH, pathState, type PathStep } from '../../core/progress/path';
import { localDay, streak } from '../../core/progress/progress';
import { SONGS } from '../../core/songs/catalog';
import { allPhrases } from '../../core/songs/melody';
import { useAttempts } from '../../shared/progress-store';

/** Nombre sencillo de un paso del camino. */
export function stepTitle(step: PathStep): string {
  if (step.kind === 'exercise') return findExercise(step.itemId)?.title ?? step.itemId;
  const [songId, phraseId] = step.itemId.split('/');
  const song = SONGS.find((s) => s.id === songId);
  const index = song ? allPhrases(song).findIndex((r) => r.phrase.id === phraseId) : -1;
  return song ? `${song.title}, frase ${index + 1}` : step.itemId;
}

interface Props {
  onStep: (step: PathStep) => void;
}

/** "Tu camino": el día en curso con sus pasos, la racha y el mapa de días. */
export function PathCard({ onStep }: Props) {
  const { attempts, ready } = useAttempts();
  const [showAll, setShowAll] = useState(false);
  if (!ready) return null;
  const states = pathState(attempts);
  const today = currentDay(states);
  const done = states.filter((s) => s.status === 'done').length;
  const st = streak(new Set(attempts.map((a) => a.day)), localDay(Date.now()));

  return (
    <section className="path-card" aria-label="Tu camino">
      <div className="path-head">
        <h3>Tu camino</h3>
        {st.current > 0 && (
          <span className="streak" title={st.practicedToday ? 'Hoy ya practicaste' : 'Practica hoy para mantenerla'}>
            🔥 {st.current === 1 ? '1 día' : `${st.current} días seguidos`}
          </span>
        )}
      </div>
      <div className="path-bar" role="progressbar" aria-label="Días completados" aria-valuemin={0} aria-valuemax={LEARNING_PATH.length} aria-valuenow={done}>
        <span style={{ width: `${(100 * done) / LEARNING_PATH.length}%` }} />
      </div>
      {today ? (
        <>
          <p className="path-day">
            <strong>Día {today.index + 1} de {LEARNING_PATH.length}: {today.day.title}</strong>
            <span className="hint"> — {today.day.goal}</span>
          </p>
          <ol className="path-steps">
            {today.day.steps.map((step, i) => (
              <li key={step.itemId + i} className={today.passed[i] ? 'ok' : ''}>
                <span aria-hidden="true">{today.passed[i] ? '✓' : '○'}</span> {stepTitle(step)}
                {today.passed[i] ? <span className="hint"> superado</span> : (
                  <button className="small primary" onClick={() => onStep(step)} aria-label={`Empezar paso: ${stepTitle(step)}`}>Empezar</button>
                )}
              </li>
            ))}
          </ol>
          <p className="hint">Supera cada paso (80 % o más) para desbloquear el día siguiente. Puedes hacer varios días seguidos.</p>
        </>
      ) : (
        <p className="path-day"><strong>¡Completaste el camino!</strong> <span className="hint">Sigue con las canciones y repite tus ejercicios favoritos.</span></p>
      )}
      <button className="link" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>{showAll ? 'Ocultar los días' : 'Ver todos los días'}</button>
      {showAll && (
        <ol className="path-days">
          {states.map((s) => (
            <li key={s.index} className={s.status}>
              <span aria-hidden="true">{s.status === 'done' ? '✓' : s.status === 'current' ? '▶' : '🔒'}</span> Día {s.index + 1}: {s.day.title}
              <span className="hint"> {s.status === 'done' ? '(completado)' : s.status === 'locked' ? '(bloqueado)' : '(en curso)'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
