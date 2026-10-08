import { useEffect, useMemo, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { guideChords, guideEvents } from '../../core/exercises/guide';
import { profileRanges } from '../../core/profile/vocal-profile';
import { TOLERANCE_BY_LEVEL } from '../../core/scoring/pitch-scoring';
import { describeIssue } from '../../core/songs/coach';
import { allPhrases, phrasePlan } from '../../core/songs/melody';
import { scorePhrase, type PhraseResult } from '../../core/songs/scoring';
import type { Song } from '../../core/songs/types';
import { profileStore } from '../../shared/profile-store';
import type { Settings } from '../../shared/settings';
import { recordPhrase, type PhraseRecord } from '../../shared/song-store';
import { recordAttempt } from '../../shared/progress-store';
import { ExerciseTimeline } from '../exercises/ExerciseTimeline';
import { useExerciseRun } from '../exercises/useExerciseRun';
import { LiveSongCue } from './LiveSongCue';
import { sungGuide } from '../../shared/sung-guide';
import { songStore } from '../../shared/song-store';
import { AiPhraseTips } from './AiPhraseTips';

interface Props {
  song: Song;
  phraseIndex: number;
  transpose: number;
  /** 1 = velocidad normal; < 1 más despacio (entrenamiento). */
  tempo: number;
  settings: Settings;
  onBack: () => void;
  onTrain?: () => void;
  onNext?: () => void;
  backLabel?: string;
}

const ICON = { good: '✓', fair: '⚠', weak: '✗' } as const;

export function PhrasePractice({ song, phraseIndex, transpose, tempo, settings, onBack, onTrain, onNext, backLabel = '← Volver a la canción' }: Props) {
  const ref = useMemo(() => allPhrases(song)[phraseIndex], [song, phraseIndex]);
  const plan = useMemo(() => phrasePlan(ref, transpose, tempo), [ref, transpose, tempo]);
  const { state, start, cancel, framesRef, timingRef } = useExerciseRun(plan, settings, { record: false, sing: settings.singLyrics });
  const [result, setResult] = useState<{ score: PhraseResult; record: PhraseRecord | null } | null>(null);
  const [demo, setDemo] = useState<'slow' | 'sung' | null>(null);
  const sung = useMemo(() => sungGuide(plan), [plan]);
  const running = state.phase === 'listening' || state.phase === 'countdown' || state.phase === 'singing';

  useEffect(() => {
    if (state.phase !== 'result' || !state.evaluation) {
      setResult(null);
      return;
    }
    const score = scorePhrase(plan, state.evaluation, settings.octaveMode, profileRanges(profileStore.get()));
    // Solo los intentos a velocidad normal cuentan para el progreso y para elegir tono.
    const record = tempo === 1 ? recordPhrase(song.id, transpose, ref.phrase.id, score.score, score.accuracy, score.issue) : null;
    // Historial (Fase 5): cuenta el tiempo cantado; solo supera a velocidad normal.
    recordAttempt({
      kind: 'phrase',
      itemId: `${song.id}/${ref.phrase.id}`,
      score: score.score,
      accuracy: score.accuracy,
      passed: tempo === 1 && score.status === 'good',
      durationS: plan.durationS,
    });
    setResult({ score, record });
  }, [state.phase, state.evaluation]); // eslint-disable-line react-hooks/exhaustive-deps

  const listenSlow = async () => {
    setDemo('slow');
    await audioEngine.playGuide(guideEvents(plan, 0.7), settings.accompaniment ? guideChords(plan, 0.7) : undefined, {
      sung: settings.singLyrics ? sungGuide(plan, 0.7) : undefined,
    }).done;
    setDemo(null);
  };
  /** Demostración cantada con la letra (voz sintética), a velocidad normal. */
  const listenSung = async () => {
    setDemo('sung');
    await audioEngine.playGuide(guideEvents(plan), settings.accompaniment ? guideChords(plan) : undefined, { sung }).done;
    setDemo(null);
  };

  const issue = result ? describeIssue(ref, result.score.issue) : null;
  return (
    <section className="phrase-practice" aria-label={`Frase ${phraseIndex + 1}`}>
      <button className="link back" onClick={() => { cancel(); onBack(); }}>{backLabel}</button>
      <p className="exercise-meta">{song.title} · {ref.section.name} · Frase {phraseIndex + 1}{tempo < 1 ? ' · despacio' : ''}</p>
      <h2 className="lyrics">«{ref.phrase.lyrics}»</h2>

      <div className={`phase phase-${state.phase}`} role="status" aria-live="assertive">
        {state.phase === 'ready' && 'Primero escuchas la frase; después, tras la cuenta atrás, la cantas tú.'}
        {state.phase === 'listening' && '♪ Escucha la frase…'}
        {state.phase === 'countdown' && <span className="beat">{state.beat}</span>}
        {state.phase === 'singing' && '¡Canta!'}
        {state.phase === 'result' && 'Resultado'}
      </div>

      <ExerciseTimeline
        plan={plan}
        phase={state.phase}
        framesRef={framesRef}
        timingRef={timingRef}
        tolerance={TOLERANCE_BY_LEVEL[settings.level]}
        octaveMode={settings.octaveMode}
        detailed={settings.showDetails}
      />
      {state.phase === 'singing' ? (
        <LiveSongCue plan={plan} timingRef={timingRef} settings={settings} />
      ) : (
        <p className="legend" aria-hidden="true">
          <span className="legend-target">▬ la melodía</span>
          <span className="legend-voice">━ tu voz</span>
        </p>
      )}

      <div className="actions">
        {running ? (
          <button onClick={cancel}>Cancelar</button>
        ) : (
          <button className="primary" onClick={start}>{state.phase === 'result' ? 'Repetir' : '▶ Empezar'}</button>
        )}
        {!running && (
          <button onClick={listenSlow} disabled={!!demo}>{demo === 'slow' ? '♪ Sonando…' : '🔊 Escuchar despacio'}</button>
        )}
        {!running && sung && (
          <button onClick={listenSung} disabled={!!demo}>{demo === 'sung' ? '♪ Cantando…' : '🗣 Escúchala cantada'}</button>
        )}
      </div>

      {!running && (
        <AiPhraseTips
          context={() => {
            const last = songStore.get()[song.id]?.byKey[String(transpose)]?.[ref.phrase.id];
            return {
              song: song.title,
              lyrics: ref.phrase.lyrics,
              plan: tempo === 1 ? plan : phrasePlan(ref, transpose),
              comfortable: profileRanges(profileStore.get()).comfortable,
              last: last?.lastIssue ? { score: last.last, issue: describeIssue(ref, last.lastIssue).title } : null,
            };
          }}
        />
      )}

      {result && issue && (
        <div className="phrase-result" aria-live="polite">
          <p className={`phrase-score status-${result.score.status}`}>
            <span aria-hidden="true">{ICON[result.score.status]}</span> <strong>{result.score.score} %</strong>
            <span>{result.score.status === 'good' ? '¡Frase conseguida!' : result.score.status === 'fair' ? 'Va bien, aún puede mejorar' : 'Esta frase necesita práctica'}</span>
          </p>
          {result.record?.previous != null && (
            <p className="improvement">
              Antes {result.record.previous} % → ahora {result.record.last} %
              {result.record.last > result.record.previous ? ` (+${result.record.last - result.record.previous}) ¡Mejoras!` : ''}
            </p>
          )}
          <div className="teacher">
            <p className="teacher-label">Problema principal</p>
            <h3>{issue.title}</h3>
            <p>{issue.tip}</p>
            <p className="teacher-next">
              {onTrain && result.score.issue.kind !== 'none' && (
                <button className="primary" onClick={onTrain}>Entrenar esta frase</button>
              )}
              {onNext && <button onClick={onNext}>Siguiente frase →</button>}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
