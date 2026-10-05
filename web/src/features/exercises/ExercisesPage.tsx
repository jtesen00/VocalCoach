import { useMemo, useState } from 'react';
import { EXERCISES } from '../../core/exercises/catalog';
import { buildPlan, rootForRange } from '../../core/exercises/plan';
import type { ExerciseDef, ExercisePlan } from '../../core/exercises/types';
import { TOLERANCE_BY_LEVEL } from '../../core/scoring/pitch-scoring';
import { DIFFICULTY_DOTS, DIFFICULTY_LABEL, displayNote, KIND_LABEL } from '../../shared/labels';
import type { Settings } from '../../shared/settings';
import { ExerciseResult } from './ExerciseResult';
import { ExerciseTimeline } from './ExerciseTimeline';
import { MelodyShape } from './MelodyShape';
import { useExerciseRun } from './useExerciseRun';

interface Props {
  settings: Settings;
  onCalibrate: () => void;
}

export function describePlan(plan: ExercisePlan, detailed: boolean): string {
  const name = (m: number) => displayNote(m, detailed);
  if (plan.def.kind === 'siren') return [plan.segments[0].fromMidi, ...plan.segments.map((s) => s.toMidi)].map(name).join(' ↝ ');
  return plan.segments.map((s) => name(s.fromMidi)).join(' → ');
}

function seconds(plan: ExercisePlan): string {
  return `${Math.round(plan.durationS)} s`;
}

function Difficulty({ def }: { def: ExerciseDef }) {
  const n = DIFFICULTY_DOTS[def.level];
  return (
    <span className="difficulty" aria-label={`Dificultad: ${DIFFICULTY_LABEL[def.level]}`}>
      <span aria-hidden="true">{'●'.repeat(n)}{'○'.repeat(3 - n)}</span> {DIFFICULTY_LABEL[def.level]}
    </span>
  );
}

export function ExercisesPage({ settings, onCalibrate }: Props) {
  const [selected, setSelected] = useState<ExerciseDef | null>(null);
  if (selected) return <ExerciseRunner def={selected} settings={settings} onBack={() => setSelected(null)} />;

  return (
    <section className="exercises" aria-label="Practicar">
      <h2>Practicar</h2>
      {!settings.range && (
        <p className="notice">
          Los ejercicios se adaptan a tu voz. <button className="link" onClick={onCalibrate}>Mídela primero</button> (1 minuto) para que no tengas que forzar.
        </p>
      )}
      <ul className="exercise-list">
        {EXERCISES.map((def) => {
          const plan = buildPlan(def, rootForRange(def, settings.range));
          return (
            <li key={def.id}>
              <MelodyShape plan={plan} />
              <div className="exercise-body">
                <h3>{def.title}</h3>
                <p className="exercise-summary">{def.summary}</p>
                <p className="exercise-meta">
                  {KIND_LABEL[def.kind]} · <Difficulty def={def} /> · {seconds(plan)}
                </p>
                {settings.showDetails && <p className="exercise-notes">{describePlan(plan, true)}</p>}
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
  const tech = settings.showDetails;

  return (
    <section className="runner" aria-label={def.title}>
      <button className="link back" onClick={() => { cancel(); onBack(); }}>← Todos los ejercicios</button>
      <p className="exercise-meta">{KIND_LABEL[def.kind]} · <Difficulty def={def} /></p>
      <h2>{def.title}</h2>
      <p>{def.instructions}</p>

      <div className="target-row">
        <span className="hint">¿Te queda incómodo?</span>
        <div className="stepper wide" role="group" aria-label="Altura del ejercicio">
          <button onClick={() => setRoot((r) => r - 1)} disabled={running} aria-label="Más grave">− grave</button>
          {tech && <output>{displayNote(root, true)}</output>}
          <button onClick={() => setRoot((r) => r + 1)} disabled={running} aria-label="Más agudo">agudo +</button>
        </div>
        {tech && <span className="exercise-notes">{describePlan(plan, true)}</span>}
      </div>

      <div className={`phase phase-${state.phase}`} role="status" aria-live="assertive">
        {state.phase === 'ready' && 'Primero escuchas la guía; después, tras la cuenta atrás, cantas tú.'}
        {state.phase === 'listening' && '♪ Escucha la guía…'}
        {state.phase === 'countdown' && <span className="beat">{state.beat}</span>}
        {state.phase === 'singing' && '¡Canta!'}
        {state.phase === 'result' && (state.evaluation?.passed ? '¡Bien hecho!' : 'Resultado')}
      </div>

      <ExerciseTimeline
        plan={plan}
        phase={state.phase}
        framesRef={framesRef}
        timingRef={timingRef}
        tolerance={TOLERANCE_BY_LEVEL[settings.level]}
        octaveMode={settings.octaveMode}
        detailed={tech}
      />
      <p className="legend" aria-hidden="true">
        <span className="legend-target">▬ lo que hay que cantar</span>
        <span className="legend-voice">━ tu voz</span>
      </p>

      <div className="actions">
        {running ? (
          <button onClick={cancel}>Cancelar</button>
        ) : (
          <button className="primary" onClick={start}>{state.phase === 'result' ? 'Repetir' : '▶ Empezar'}</button>
        )}
        {state.phase === 'result' && <button onClick={onBack}>Otro ejercicio</button>}
      </div>

      {state.phase === 'result' && state.evaluation && <ExerciseResult evaluation={state.evaluation} detailed={tech} />}
    </section>
  );
}
