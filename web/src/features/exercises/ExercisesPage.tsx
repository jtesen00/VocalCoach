import { useMemo, useState } from 'react';
import { EXERCISES } from '../../core/exercises/catalog';
import { buildPlan, rootForRange } from '../../core/exercises/plan';
import type { ExerciseDef, ExercisePlan } from '../../core/exercises/types';
import { TOLERANCE_BY_LEVEL } from '../../core/scoring/pitch-scoring';
import { advise } from '../../core/teacher/teacher';
import { DIFFICULTY_DOTS, DIFFICULTY_LABEL, displayNote, KIND_LABEL, stars } from '../../shared/labels';
import type { PathStep } from '../../core/progress/path';
import { localDay, summarize } from '../../core/progress/progress';
import { SONGS } from '../../core/songs/catalog';
import { allPhrases } from '../../core/songs/melody';
import type { Song } from '../../core/songs/types';
import { useAttempts } from '../../shared/progress-store';
import { practiceTranspose, setSongVersion } from '../../shared/song-store';
import { PathCard } from '../progress/PathCard';
import { summarizeAttempt } from '../../core/ai/teacher-prompt';
import { PhrasePractice } from '../songs/PhrasePractice';
import { Stars } from '../songs/Stars';
import type { Settings } from '../../shared/settings';
import { ExerciseResult } from './ExerciseResult';
import { ExerciseTimeline } from './ExerciseTimeline';
import { MelodyShape } from './MelodyShape';
import { useExerciseRun } from './useExerciseRun';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
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

export function ExercisesPage({ settings, updateSettings, onCalibrate }: Props) {
  const [selected, setSelected] = useState<ExerciseDef | null>(null);
  const [phrase, setPhrase] = useState<{ song: Song; index: number; transpose: number } | null>(null);
  const { attempts } = useAttempts();
  const best = useMemo(() => summarize(attempts, localDay(Date.now())).byItem, [attempts]);

  const openStep = (step: PathStep) => {
    if (step.kind === 'exercise') {
      setSelected(EXERCISES.find((x) => x.id === step.itemId) ?? null);
      return;
    }
    const [songId, phraseId] = step.itemId.split('/');
    const song = SONGS.find((x) => x.id === songId);
    const index = song ? allPhrases(song).findIndex((r) => r.phrase.id === phraseId) : -1;
    if (!song || index < 0) return;
    const transpose = practiceTranspose(song);
    setSongVersion(song.id, transpose);
    setPhrase({ song, index, transpose });
  };

  if (phrase) {
    return (
      <PhrasePractice
        key={`${phrase.song.id}-${phrase.index}`}
        song={phrase.song}
        phraseIndex={phrase.index}
        transpose={phrase.transpose}
        tempo={1}
        settings={settings}
        onBack={() => setPhrase(null)}
        backLabel="← Volver a Practicar"
      />
    );
  }
  if (selected) {
    return (
      <ExerciseRunner
        key={selected.id}
        def={selected}
        settings={settings}
        updateSettings={updateSettings}
        onSelect={(id) => setSelected(EXERCISES.find((x) => x.id === id) ?? null)}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <section className="exercises" aria-label="Practicar">
      <h2>Practicar</h2>
      {!settings.range && (
        <p className="notice">
          Los ejercicios se adaptan a tu voz. <button className="link" onClick={onCalibrate}>Mídela primero</button> (1 minuto) para que no tengas que forzar.
        </p>
      )}
      <PathCard onStep={openStep} />
      <h3>Todos los ejercicios</h3>
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
                {(() => {
                  const b = best.get(def.id);
                  return b && (
                    <p className="exercise-best">
                      Tu mejor: <Stars value={stars(b.best, b.bestPassed)} max={3} label="Tu mejor resultado" />
                      {settings.showDetails && <span className="hint"> {Math.round(b.best)} %</span>}
                    </p>
                  );
                })()}
              </div>
              <button onClick={() => setSelected(def)} aria-label={`Practicar ${def.title}`}>Practicar</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface RunnerProps {
  def: ExerciseDef;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onSelect: (exerciseId: string) => void;
  onBack: () => void;
  /** Tónica exacta (ejercicios generados desde una canción); si no, se adapta al rango. */
  fixedRoot?: number;
  /** Catálogo para el "siguiente paso" del profesor (por defecto, los ejercicios generales). */
  catalog?: readonly ExerciseDef[];
  backLabel?: string;
}

export function ExerciseRunner({ def, settings, updateSettings, onSelect, onBack, fixedRoot, catalog = EXERCISES, backLabel = '← Todos los ejercicios' }: RunnerProps) {
  const [root, setRoot] = useState(() => fixedRoot ?? rootForRange(def, settings.range));
  const plan = useMemo(() => buildPlan(def, root), [def, root]);
  const { state, start, cancel, framesRef, timingRef } = useExerciseRun(plan, settings);
  const running = state.phase === 'listening' || state.phase === 'countdown' || state.phase === 'singing';
  const tech = settings.showDetails;
  const advice = useMemo(
    () =>
      state.evaluation &&
      advise({
        plan,
        evaluation: state.evaluation,
        history: state.previous,
        catalog,
        octaveMode: settings.octaveMode,
        level: settings.level,
        detailed: tech,
      }),
    [plan, state.evaluation, state.previous, settings.octaveMode, settings.level, tech, catalog],
  );
  const actions = {
    titleOf: (id: string) => catalog.find((x) => x.id === id)?.title ?? id,
    onExercise: onSelect,
    onRelax: () => updateSettings({ level: 'beginner' }),
    onAllowOctave: () => updateSettings({ octaveMode: 'pitch-class' }),
  };

  return (
    <section className="runner" aria-label={def.title}>
      <button className="link back" onClick={() => { cancel(); onBack(); }}>{backLabel}</button>
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
        {state.phase === 'result' && <button onClick={onBack}>{backLabel.replace(/^← /, '')}</button>}
      </div>

      {state.phase === 'result' && state.evaluation && advice && (
        <ExerciseResult evaluation={state.evaluation} advice={advice} actions={actions} detailed={tech} aiSummary={summarizeAttempt(plan, state.evaluation, advice, state.previous, settings.level)} />
      )}
    </section>
  );
}
