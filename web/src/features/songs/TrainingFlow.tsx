import { useMemo, useState } from 'react';
import type { ExerciseDef } from '../../core/exercises/types';
import { allPhrases } from '../../core/songs/melody';
import { trainingFor } from '../../core/songs/training';
import type { Song } from '../../core/songs/types';
import type { Settings } from '../../shared/settings';
import { songProgress } from '../../shared/song-store';
import { ExerciseRunner } from '../exercises/ExercisesPage';
import { PhrasePractice } from './PhrasePractice';

interface Props {
  song: Song;
  phraseIndex: number;
  transpose: number;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onBack: () => void;
}

/** Entrenamiento generado a partir de la dificultad de una frase (spec §10). */
export function TrainingFlow({ song, phraseIndex, transpose, settings, updateSettings, onBack }: Props) {
  const ref = useMemo(() => allPhrases(song)[phraseIndex], [song, phraseIndex]);
  const plan = useMemo(() => {
    const issue = songProgress(song.id).byKey[String(transpose)]?.[ref.phrase.id]?.lastIssue ?? { kind: 'melody' as const, noteIndex: null, fromIndex: null };
    return trainingFor(ref, transpose, issue);
  }, [song.id, ref, transpose]);
  const [step, setStep] = useState(0);
  const defs = plan.steps.flatMap((s) => (s.kind === 'exercise' ? [s.def] : [])) as ExerciseDef[];
  const current = plan.steps[step];

  return (
    <section className="training" aria-label="Entrenamiento de la frase">
      <p className="exercise-meta">{song.title} · Frase {phraseIndex + 1} · Entrenamiento</p>
      <h2>{plan.title}</h2>
      <p>{plan.reason}</p>
      <ol className="training-steps">
        {plan.steps.map((s, i) => (
          <li key={i} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button className="link" onClick={() => setStep(i)}>
              {i < step ? '✓ ' : ''}{s.kind === 'exercise' ? s.def.title : s.title}
            </button>
          </li>
        ))}
      </ol>

      {current.kind === 'exercise' ? (
        <ExerciseRunner
          key={`${step}-${current.def.id}`}
          def={current.def}
          fixedRoot={current.rootMidi}
          catalog={defs}
          settings={settings}
          updateSettings={updateSettings}
          onSelect={(id) => setStep(plan.steps.findIndex((s) => s.kind === 'exercise' && s.def.id === id))}
          onBack={onBack}
          backLabel="← Volver a la canción"
        />
      ) : (
        <PhrasePractice
          key={`${step}-phrase`}
          song={song}
          phraseIndex={phraseIndex}
          transpose={transpose}
          tempo={current.tempo}
          settings={settings}
          onBack={onBack}
        />
      )}

      <p className="training-nav">
        {step < plan.steps.length - 1 ? (
          <button onClick={() => setStep(step + 1)}>Siguiente paso →</button>
        ) : (
          <button className="primary" onClick={onBack}>Terminar y volver a la canción</button>
        )}
      </p>
    </section>
  );
}
