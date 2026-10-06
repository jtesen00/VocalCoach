import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { evaluateExercise } from '../../core/exercises/evaluate';
import { guideChords, guideEvents } from '../../core/exercises/guide';
import { profileRanges } from '../../core/profile/vocal-profile';
import type { PitchFrame } from '../../core/pitch/types';
import { TOLERANCE_BY_LEVEL, type OctaveMode } from '../../core/scoring/pitch-scoring';
import { karaokeTimeline, originOffset, phraseAt, type KaraokePhrase } from '../../core/songs/karaoke';
import { scorePhrase, type PhraseResult } from '../../core/songs/scoring';
import type { Song } from '../../core/songs/types';
import { stars } from '../../shared/labels';
import { profileStore } from '../../shared/profile-store';
import { recordAttempt } from '../../shared/progress-store';
import type { Settings } from '../../shared/settings';
import { practiceTranspose, recordPhrase } from '../../shared/song-store';
import { ExerciseTimeline } from '../exercises/ExerciseTimeline';
import type { RunTiming } from '../exercises/useExerciseRun';
import { Stars } from './Stars';

type Mode = 'guide' | 'original';
type Phase = 'setup' | 'countdown' | 'running' | 'done';

interface Props {
  song: Song;
  settings: Settings;
  onBack: () => void;
  onTrain: (phraseIndex: number) => void;
}

/**
 * Cantar la canción entera de corrido (Fase 8b, modo karaoke): la letra avanza sílaba a
 * sílaba, se ve tu voz sobre la melodía y cada frase se puntúa al terminar.
 *  - Con la guía de la app: suenan la melodía (opcional) y los acordes. Con auriculares.
 *  - Con la canción original: la pones tú en otro sitio (YouTube, Spotify…) con auriculares y
 *    pulsas «Empezar» a la vez. La app nunca reproduce el audio original.
 */
export function Karaoke({ song, settings, onBack, onTrain }: Props) {
  const hasOrigin = song.license === 'user-provided';
  const [mode, setMode] = useState<Mode>('guide');
  const [melody, setMelody] = useState(true);
  const [headphones, setHeadphones] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [beat, setBeat] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<Map<number, PhraseResult>>(new Map());
  const [offsetMs, setOffsetMs] = useState(0);
  const [, tick] = useState(0);

  // Versión: la recomendada con la guía; la original (sin transponer) al cantar con el original.
  const transpose = useMemo(() => (mode === 'guide' ? practiceTranspose(song) : 0), [mode, song]);
  const timeline = useMemo(() => karaokeTimeline(song, transpose), [song, transpose]);
  // Con el original, un hombre puede cantar una canción de mujer una octava abajo (y al revés).
  const octaveMode: OctaveMode = mode === 'original' ? 'pitch-class' : settings.octaveMode;
  const tolerance = TOLERANCE_BY_LEVEL[settings.level];

  const framesRef = useRef<PitchFrame[]>([]);
  const timingRef = useRef<RunTiming>({ guideStartT: 0, guideDurationS: 1, singT: Infinity, latencyS: 0 });
  /** Instante (reloj de audio) en que empieza la primera frase. */
  const songT0 = useRef(Infinity);
  const offsetRef = useRef(0);
  offsetRef.current = offsetMs / 1000;
  const evaluated = useRef(new Set<number>());
  const run = useRef(0);

  useEffect(() => () => {
    run.current++;
    audioEngine.stopGuide();
  }, []);

  const phraseStartT = (p: KaraokePhrase) => songT0.current + p.startS + offsetRef.current;

  const evaluate = (p: KaraokePhrase) => {
    const latencyS = audioEngine.latencyS();
    const evaluation = evaluateExercise(p.plan, framesRef.current, { tolerance, octaveMode, startT: phraseStartT(p), latencyS });
    const result = scorePhrase(p.plan, evaluation, octaveMode, profileRanges(profileStore.get()));
    const phraseId = p.plan.def.id.split('/').pop()!;
    recordAttempt({ kind: 'phrase', itemId: `${song.id}/${phraseId}`, score: result.score, accuracy: result.accuracy, passed: result.status === 'good', durationS: p.plan.durationS });
    if (mode === 'guide') recordPhrase(song.id, transpose, phraseId, result.score, result.accuracy, result.issue);
    setResults((r) => new Map(r).set(p.index, result));
  };

  const start = async () => {
    const id = ++run.current;
    framesRef.current = [];
    evaluated.current = new Set();
    setResults(new Map());
    setCurrent(0);
    const off = audioEngine.onFrame((f) => framesRef.current.push(f));
    try {
      if (mode === 'guide') {
        setPhase('countdown');
        const beatS = 0.6;
        const { singT, beatTimes } = audioEngine.countdown(3, beatS);
        for (let i = 0; i < beatTimes.length; i++) {
          await waitUntil(beatTimes[i]);
          if (run.current !== id) return;
          setBeat(3 - i);
        }
        const now = audioEngine.now() ?? 0;
        const guide = audioEngine.playGuide(guideEvents(timeline.plan), settings.accompaniment ? guideChords(timeline.plan) : undefined, {
          listen: true,
          startDelayS: Math.max(0, singT - now - 0.08),
          melodyGain: melody ? 1 : 0,
        });
        songT0.current = guide.startT;
      } else {
        // La canción original empieza ahora: la primera frase llega tras su introducción.
        songT0.current = (audioEngine.now() ?? 0) + originOffset(song);
      }
      setBeat(null);
      setPhase('running');
      timingRef.current = { guideStartT: songT0.current, guideDurationS: timeline.durationS, singT: songT0.current, latencyS: audioEngine.latencyS() };

      // Bucle: frase activa y evaluación de cada frase al terminar.
      for (;;) {
        await new Promise((r) => setTimeout(r, 100));
        if (run.current !== id) return;
        const now = audioEngine.now();
        if (now === null) return;
        const t = now - songT0.current - offsetRef.current;
        const latency = audioEngine.latencyS();
        for (const p of timeline.phrases) {
          if (!evaluated.current.has(p.index) && t > p.endS + latency + 0.3) {
            evaluated.current.add(p.index);
            evaluate(p);
          }
        }
        const active = phraseAt(timeline, t);
        // Termina cuando la última frase ya se evaluó (tras su retraso), no cuando deja de sonar.
        if (!active && evaluated.current.size === timeline.phrases.length) break;
        if (active) {
          setCurrent(active.index);
          timingRef.current = { ...timingRef.current, singT: phraseStartT(active), latencyS: latency };
        }
        tick((n) => n + 1);
      }
      setPhase('done');
    } finally {
      off();
    }
  };

  const stop = () => {
    run.current++;
    audioEngine.stopGuide();
    setBeat(null);
    setPhase(results.size ? 'done' : 'setup');
  };

  const active = timeline.phrases[current];
  const next = timeline.phrases[current + 1];
  const now = audioEngine.now();
  const t = now === null ? 0 : now - songT0.current - offsetRef.current;

  if (phase === 'done') {
    const list = timeline.phrases.filter((p) => results.has(p.index));
    const avg = list.length ? Math.round(list.reduce((a, p) => a + results.get(p.index)!.score, 0) / list.length) : 0;
    const weakest = [...list].sort((a, b) => results.get(a.index)!.score - results.get(b.index)!.score)[0];
    return (
      <section className="karaoke" aria-label="Canción entera">
        <button className="link back" onClick={onBack}>← Volver a la canción</button>
        <h2>{song.title}</h2>
        <p className="result-verdict pass">{avg >= 80 ? '¡Canción superada!' : avg >= 60 ? '¡Bien! Ya casi la tienes' : 'Primera vuelta hecha'}</p>
        <p>
          <Stars value={stars(avg, avg >= 80)} max={3} label="Resultado de la canción" />{' '}
          {settings.showDetails && <span className="hint">media {avg} %</span>}
        </p>
        <ol className="karaoke-results">
          {list.map((p) => (
            <li key={p.index}>
              <span>«{p.lyrics}»</span> <Stars value={stars(results.get(p.index)!.score, results.get(p.index)!.status === 'good')} max={3} label={`Frase ${p.index + 1}`} />
            </li>
          ))}
        </ol>
        <p>
          {weakest && results.get(weakest.index)!.status !== 'good' && (
            <button className="primary" onClick={() => onTrain(weakest.index)}>Entrenar la frase más difícil</button>
          )}{' '}
          <button onClick={() => setPhase('setup')}>Cantarla otra vez</button>
        </p>
      </section>
    );
  }

  return (
    <section className="karaoke" aria-label="Canción entera">
      <button className="link back" onClick={() => { stop(); onBack(); }}>← Volver a la canción</button>
      <h2>{song.title}</h2>

      {phase === 'setup' && (
        <div className="karaoke-setup">
          {hasOrigin && (
            <fieldset>
              <legend>¿Con qué la cantas?</legend>
              <label className="choice">
                <input type="radio" name="karaoke-mode" checked={mode === 'guide'} onChange={() => setMode('guide')} />
                <span><strong>Con la guía de la app</strong><span className="hint"> — melodía y acordes en tu tono recomendado.</span></span>
              </label>
              <label className="choice">
                <input type="radio" name="karaoke-mode" checked={mode === 'original'} onChange={() => setMode('original')} />
                <span>
                  <strong>Con la canción original</strong>
                  <span className="hint"> — la pones tú en otra app o web (YouTube, Spotify…) y pulsas «Empezar» justo cuando arranque. La app no la reproduce.</span>
                </span>
              </label>
            </fieldset>
          )}
          {mode === 'guide' && (
            <label className="choice">
              <input type="checkbox" checked={melody} onChange={(e) => setMelody(e.target.checked)} />
              <span><strong>Que suene la melodía</strong><span className="hint"> — quítala cuando te la sepas: solo quedan los acordes.</span></span>
            </label>
          )}
          <label className="choice">
            <input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} />
            <span><strong>Llevo auriculares</strong><span className="hint"> — si no, el micrófono oye la música en vez de tu voz.</span></span>
          </label>
          {settings.latencyMs === null && <p className="hint">Consejo: mide la sincronía una vez en Ajustes → Sincronía para que la puntuación vaya justa.</p>}
          <p><button className="primary" disabled={!headphones} onClick={() => void start()}>▶ Empezar</button></p>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="phase phase-countdown" role="status" aria-live="assertive"><span className="beat">{beat}</span></div>
      )}

      {phase === 'running' && active && (
        <>
          <p className="karaoke-line" aria-live="polite">
            {active.syllables.map((s, i) => (
              <span key={i} className={t >= s.endS ? 'sung' : t >= s.startS ? 'now' : ''}>{s.text}{' '}</span>
            ))}
          </p>
          {next && <p className="karaoke-next hint">{next.lyrics}</p>}
          <ExerciseTimeline plan={active.plan} phase="singing" framesRef={framesRef} timingRef={timingRef} tolerance={tolerance} octaveMode={octaveMode} detailed={settings.showDetails} />
          <ol className="karaoke-chips" aria-label="Frases cantadas">
            {timeline.phrases.map((p) => {
              const r = results.get(p.index);
              return <li key={p.index} className={r ? `status-${r.status}` : p.index === current ? 'current' : ''} title={p.lyrics} />;
            })}
          </ol>
          {mode === 'original' && (
            <p className="target-row">
              <span className="hint">¿La letra va desfasada?</span>
              <button className="small" onClick={() => setOffsetMs((o) => o - 250)} aria-label="La letra va tarde">− va tarde</button>
              <button className="small" onClick={() => setOffsetMs((o) => o + 250)} aria-label="La letra va adelantada">va adelantada +</button>
              {settings.showDetails && <span className="hint">{offsetMs} ms</span>}
            </p>
          )}
          <p><button onClick={stop}>■ Terminar</button></p>
        </>
      )}
    </section>
  );
}

function waitUntil(t: number): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const now = audioEngine.now();
      if (now === null || now >= t) resolve();
      else setTimeout(check, Math.min(100, (t - now) * 1000 + 2));
    };
    check();
  });
}
