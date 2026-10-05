import { useEffect, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { nearestNote, noteName } from '../../core/music/notes';
import type { PitchFrame } from '../../core/pitch/types';
import { comfortableNote } from '../../core/range/vocal-range';
import {
  centsVsTarget, classifyCents, noteAccuracy, TOLERANCE_BY_LEVEL, type NoteAccuracy,
} from '../../core/scoring/pitch-scoring';
import { displayNote, liveStatus } from '../../shared/labels';
import type { Settings } from '../../shared/settings';
import { useLiveCoach } from '../teacher/useLiveCoach';
import { CentsMeter } from './CentsMeter';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { PitchTrail } from './PitchTrail';
import { useEngineSnapshot, useSampledFrame } from './useEngine';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onCalibrate: () => void;
}

/** Silencio (frames) que cierra un intento: ~0,4 s. */
const END_OF_ATTEMPT_FRAMES = 40;

/** Canto libre: la persona canta y ve al instante si debe subir o bajar. */
export function TunerPage({ settings, updateSettings, onCalibrate }: Props) {
  const snapshot = useEngineSnapshot();
  const frame = useSampledFrame(15);
  const [targetMidi, setTargetMidi] = useState(() => (settings.range ? comfortableNote(settings.range) : 60));
  const [hasTarget, setHasTarget] = useState(true);
  const [turn, setTurn] = useState<'idle' | 'listen' | 'sing'>('idle');
  const attempt = useAttempt(targetMidi, settings);
  const tech = settings.showDetails;

  const tolerance = TOLERANCE_BY_LEVEL[settings.level];
  const voiced = frame?.voiced && frame.midi !== null ? frame.midi : null;
  const nearest = voiced !== null ? nearestNote(voiced) : null;
  const cents = voiced === null ? null : hasTarget ? centsVsTarget(voiced, targetMidi, settings.octaveMode) : nearest!.cents;
  const status = classifyCents(cents, tolerance);
  const live = liveStatus(status, cents);
  const centerMidi = hasTarget ? targetMidi : nearest?.midi ?? targetMidi;
  const tip = useLiveCoach(status, snapshot.referencePlaying || !hasTarget);

  const listenAndSing = async () => {
    setTurn('listen');
    await audioEngine.playReference(targetMidi);
    setTurn('sing');
  };

  return (
    <section className="tuner" aria-label="Canta libre">
      {!settings.range && (
        <p className="notice">
          Aún no conocemos tu voz. <button className="link" onClick={onCalibrate}>Mídela en 1 minuto</button> y te propondremos notas cómodas.
        </p>
      )}

      <div className="target-row">
        <label className="switch">
          <input type="checkbox" checked={hasTarget} onChange={(e) => setHasTarget(e.target.checked)} />
          Seguir una nota
        </label>
        {hasTarget && (
          <>
            <div className="stepper" role="group" aria-label="Nota a cantar">
              <button onClick={() => setTargetMidi((m) => m - 1)} aria-label="Nota más grave">−</button>
              <output aria-live="polite">{displayNote(targetMidi, tech)}</output>
              <button onClick={() => setTargetMidi((m) => m + 1)} aria-label="Nota más aguda">+</button>
            </div>
            <button className="primary" onClick={listenAndSing} disabled={snapshot.referencePlaying}>
              {snapshot.referencePlaying ? 'Escuchando…' : '▶ Escuchar y cantar'}
            </button>
          </>
        )}
      </div>
      {hasTarget && turn !== 'idle' && (
        <p className="turn" role="status">
          {turn === 'listen' ? 'Escucha la nota…' : '¡Tu turno! Cántala igual.'}
        </p>
      )}

      <div className={`readout status-${snapshot.referencePlaying ? 'no_voice' : status}`}>
        <div className="status-big" role="status" aria-live="polite">
          {snapshot.referencePlaying ? (
            <>
              <span className="status-icon" aria-hidden="true">♪</span>
              <strong>Escucha la nota</strong>
              <span className="status-hint">Mientras suena no te escuchamos</span>
            </>
          ) : (
            <>
              <span className="status-icon" aria-hidden="true">{live.icon}</span>
              <strong>{live.label}</strong>
              <span className="status-hint">{live.hint}</span>
            </>
          )}
        </div>
        <p className="live-tip" role="status" aria-live="polite">{tip ? `💬 ${tip.message}` : ''}</p>
        <CentsMeter cents={snapshot.referencePlaying ? null : cents} perfectCents={tolerance.perfectCents} toleranceCents={tolerance.toleranceCents} detailed={tech} />
        <p className="singing-now">
          {nearest && !snapshot.referencePlaying ? (
            <>Estás cantando: <strong className="note-inline">{displayNote(nearest.midi, tech)}</strong></>
          ) : (
            <span className="hint">{hasTarget ? `Nota a cantar: ${displayNote(targetMidi, tech)}` : 'Canta y verás qué nota haces'}</span>
          )}
        </p>
        {tech && (
          <div className="readout-detail">
            <span className="cents">{nearest ? `${nearest.cents >= 0 ? '+' : ''}${nearest.cents.toFixed(0)} c` : '—'}</span>
            <span>{frame?.f0 ? `${frame.f0.toFixed(1)} Hz` : '—'}</span>
            <span>Confianza {frame ? `${Math.round(frame.clarity * 100)}%` : '—'}</span>
            {cents !== null && hasTarget && <span>{cents >= 0 ? '+' : ''}{cents.toFixed(0)} c respecto a {noteName(targetMidi)}</span>}
          </div>
        )}
      </div>

      <PitchTrail centerMidi={centerMidi} tolerance={tolerance} octaveMode={settings.octaveMode} showTarget={hasTarget} detailed={tech} />

      {hasTarget && <AttemptSummary attempt={attempt} targetMidi={targetMidi} detailed={tech} />}

      {tech && snapshot.diagnostics && (
        <DiagnosticsPanel diagnostics={snapshot.diagnostics} frame={frame} onDetectorChange={(detector) => updateSettings({ detector })} />
      )}
    </section>
  );
}

/** Acumula el intento en curso (desde que empieza la voz hasta ~0,4 s de silencio). */
function useAttempt(targetMidi: number, settings: Settings) {
  const [state, setState] = useState<{ live: NoteAccuracy | null; last: NoteAccuracy | null }>({ live: null, last: null });
  useEffect(() => {
    const opts = { targetMidi, tolerance: TOLERANCE_BY_LEVEL[settings.level], octaveMode: settings.octaveMode };
    let segment: PitchFrame[] = [];
    let silent = 0;
    setState({ live: null, last: null });
    const off = audioEngine.onFrame((f) => {
      if (f.voiced) {
        segment.push(f);
        silent = 0;
      } else if (segment.length && ++silent >= END_OF_ATTEMPT_FRAMES) {
        const result = noteAccuracy(segment, opts);
        segment = [];
        if (result.accuracy !== null) setState({ live: null, last: result });
      }
    });
    const id = setInterval(() => {
      if (segment.length) setState((s) => ({ ...s, live: noteAccuracy(segment, opts) }));
    }, 200);
    return () => {
      off();
      clearInterval(id);
    };
  }, [targetMidi, settings.level, settings.octaveMode]);
  return state;
}

function AttemptSummary({ attempt, targetMidi, detailed }: { attempt: { live: NoteAccuracy | null; last: NoteAccuracy | null }; targetMidi: number; detailed: boolean }) {
  const shown = attempt.live?.accuracy != null ? attempt.live : attempt.last;
  if (!shown || shown.accuracy === null) {
    return <p className="attempt hint">Sostén {displayNote(targetMidi, detailed)} un par de segundos y te diremos qué tal.</p>;
  }
  const pct = Math.round(shown.accuracy * 100);
  const median = shown.medianCents!;
  return (
    <p className="attempt">
      <span className="attempt-label">{shown === attempt.live ? 'Ahora mismo' : 'Último intento'}</span>
      <strong className={pct >= 80 ? 'pass' : 'fail'}>{pct}%</strong>
      <span>del tiempo afinado · {pct >= 80 ? '¡Superado!' : 'sigue intentándolo (objetivo 80 %)'}</span>
      {detailed && <span className="hint">mediana {median >= 0 ? '+' : ''}{median.toFixed(0)} c · sin contar los primeros 250 ms</span>}
    </p>
  );
}
