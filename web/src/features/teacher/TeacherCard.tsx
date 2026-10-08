import { useState } from 'react';
import { audioEngine } from '../../audio/engine';
import type { NextStep, TeacherAdvice } from '../../core/teacher/teacher';

export interface NextStepActions {
  /** Título de un ejercicio por id (para los botones). */
  titleOf: (id: string) => string;
  onExercise: (id: string) => void;
  onRelax: () => void;
  onAllowOctave: () => void;
}

/** "Tu profe": qué pasó, qué probar, un ejemplo sonoro y el siguiente paso. */
export function TeacherCard({ advice, actions }: { advice: TeacherAdvice; actions: NextStepActions }) {
  const [playing, setPlaying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const wrapped: NextStepActions = {
    ...actions,
    onRelax: () => {
      actions.onRelax();
      setApplied('Listo: ahora te corregimos con menos exigencia. Pulsa «Repetir».');
    },
    onAllowOctave: () => {
      actions.onAllowOctave();
      setApplied('Listo: ahora vale cantar en otra octava. Pulsa «Repetir».');
    },
  };
  const playDemo = async () => {
    if (!advice.demo) return;
    setPlaying(true);
    await audioEngine.playGuide(advice.demo.events).done;
    setPlaying(false);
  };

  return (
    <section className="teacher" aria-label="Tu profe">
      <p className="teacher-label">Tu profe</p>
      <h3>{advice.headline}</h3>
      {advice.progress && <p className="teacher-progress">↑ {advice.progress}</p>}
      <p>{advice.explanation}</p>

      {advice.demo && (
        <p className="teacher-demo">
          <button onClick={playDemo} disabled={playing} aria-describedby="demo-label">
            {playing ? '♪ Sonando…' : '🔊 Escúchalo'}
          </button>
          <span id="demo-label" className="hint">{advice.demo.label}</span>
        </p>
      )}

      {advice.tips.length > 0 && (
        <>
          <p className="teacher-tips-title">Prueba esto:</p>
          <ul className="teacher-tips">
            {advice.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </>
      )}

      {advice.extras.length > 0 && (
        <ul className="teacher-extras">
          {advice.extras.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}

      {applied ? <p className="teacher-next" role="status">✓ {applied}</p> : <NextStepButtons next={advice.next} actions={wrapped} />}
    </section>
  );
}

function NextStepButtons({ next, actions }: { next: NextStep; actions: NextStepActions }) {
  switch (next.kind) {
    case 'repeat':
      return null;
    case 'next':
      return next.exerciseId ? (
        <p className="teacher-next">
          <button className="primary" onClick={() => actions.onExercise(next.exerciseId!)}>
            Siguiente: {actions.titleOf(next.exerciseId)} →
          </button>
        </p>
      ) : (
        <p className="teacher-next">¡Has llegado al último ejercicio! Repite los que más te cuesten.</p>
      );
    case 'allow_octave':
      return (
        <p className="teacher-next">
          <button className="primary" onClick={actions.onAllowOctave}>Permitir cantar en otra octava</button>
        </p>
      );
    case 'easier':
      return (
        <div className="teacher-next">
          <p>Llevas varios intentos con lo mismo. No pasa nada: vamos paso a paso.</p>
          {next.relaxStrictness && <button onClick={actions.onRelax}>Corregirme con menos exigencia</button>}
          {next.exerciseId && <button onClick={() => actions.onExercise(next.exerciseId!)}>Probar uno más fácil: {actions.titleOf(next.exerciseId)}</button>}
          {!next.relaxStrictness && !next.exerciseId && (
            <p className="hint">Practica la nota sin prisa en «Canta libre» con «Escuchar y cantar» y vuelve después.</p>
          )}
        </div>
      );
  }
}
