import { useMemo, useState } from 'react';
import { EXERCISES } from '../../core/exercises/catalog';
import { buildPlan, rootForRange } from '../../core/exercises/plan';
import type { ExerciseDef, ExerciseKind, ExercisePlan } from '../../core/exercises/types';
import { noteName } from '../../core/music/notes';
import { TOLERANCE_BY_LEVEL, type SkillLevel } from '../../core/scoring/pitch-scoring';
import type { Settings } from '../../shared/settings';
import { ExerciseResult } from './ExerciseResult';
import { ExerciseTimeline } from './ExerciseTimeline';
import { useExerciseRun } from './useExerciseRun';

interface Props {
  settings: Settings;
  onCalibrate: () => void;
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  sustained: 'Nota sostenida',
  sequence: 'Secuencia',
  interval: 'Intervalo',
  scale: 'Escala',
  siren: 'Sirena',
};

const LEVEL_LABEL: Record<SkillLevel, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };

export function describePlan(plan: ExercisePlan): string {
  if (plan.def.kind === 'siren') {
    return [plan.segments[0].fromMidi, ...plan.segments.map((s) => s.toMidi)].map(noteName).join(' ↝ ');
  }
  return plan.segments.map((s) => noteName(s.fromMidi)).join(' → ');
}

export function ExercisesPage({ settings, onCalibrate }: Props) {
  const [selected, setSelected] = useState<ExerciseDef | null>(null);
  if (selected) return <ExerciseRunner def={selected} settings={settings} onBack={() => setSelected(null)} />;

  return (
    <section className="exercises" aria-label="Ejercicios">
      {!settings.range && (
        <p className="notice">
          Los ejercicios se ajustan a tu rango vocal. <button className="link" onClick={onCalibrate}>Calibrarlo</button> para que las notas te queden cómodas (ahora se usa C4 como tónica).
        </p>
      )}
      <ul className="exercise-list">
        {EXERCISES.map((def) => {
          const plan = buildPlan(def, rootForRange(def, settings.range));
          return (
            <li key={def.id}>
              <div>
                <p className="exercise-meta">{KIND_LABEL[def.kind]} · {LEVEL_LABEL[def.level]}</p>
                <h3>{def.title}</h3>
                <p className="exercise-notes">{describePlan(plan)}</p>
              </div>
              <button onClick={() => setSelected(def)} aria-label={`Practicar ${def.title}`}>Practicar</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ExerciseRunner({ def, settings, onBack }: { def: ExerciseDef; settings: Settings; onBack: () => void }) {
  const [root, setRoot] = useState(() => rootForRange(def, settings.range));
  const plan = useMemo(() => buildPlan(def, root), [def, root]);
  const { state, start, cancel, framesRef, timingRef } = useExerciseRun(plan, settings);
  const running = state.phase === 'listening' || state.phase === 'countdown' || state.phase === 'singing';

  return (
    <section className="runner" aria-label={def.title}>
      <button className="link back" onClick={() => { cancel(); onBack(); }}>← Ejercicios</button>
      <p className="exercise-meta">{KIND_LABEL[def.kind]} · {LEVEL_LABEL[def.level]}</p>
      <h2>{def.title}</h2>
      <p>{def.instructions}</p>

      <div className="target-row">
        <div className="stepper" role="group" aria-label="Tónica">
          <button onClick={() => setRoot((r) => r - 1)} disabled={running} aria-label="Bajar la tónica un semitono">−</button>
          <output>{noteName(root)}</output>
          <button onClick={() => setRoot((r) => r + 1)} disabled={running} aria-label="Subir la tónica un semitono">+</button>
        </div>
        <span className="exercise-notes">{describePlan(plan)}</span>
      </div>

      <div className={`phase phase-${state.phase}`} role="status" aria-live="assertive">
        {state.phase === 'ready' && 'Primero escucharás la guía; después, tras la cuenta atrás, cantas tú.'}
        {state.phase === 'listening' && '♪ Escucha la guía…'}
        {state.phase === 'countdown' && <span className="beat">{state.beat}</span>}
        {state.phase === 'singing' && '¡Canta!'}
        {state.phase === 'result' && (state.evaluation?.passed ? 'Resultado: superado' : 'Resultado: no superado')}
      </div>

      <ExerciseTimeline
        plan={plan}
        phase={state.phase}
        framesRef={framesRef}
        timingRef={timingRef}
        tolerance={TOLERANCE_BY_LEVEL[settings.level]}
        octaveMode={settings.octaveMode}
      />

      <div className="actions">
        {running ? (
          <button onClick={cancel}>Cancelar</button>
        ) : (
          <button className="primary" onClick={start}>{state.phase === 'result' ? 'Repetir' : 'Empezar'}</button>
        )}
      </div>

      {state.phase === 'result' && state.evaluation && <ExerciseResult evaluation={state.evaluation} feedback={state.feedback} />}
    </section>
  );
}
