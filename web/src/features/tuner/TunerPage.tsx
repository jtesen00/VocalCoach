import { useEffect, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { midiToFreq, nearestNote, noteName } from '../../core/music/notes';
import type { PitchFrame } from '../../core/pitch/types';
import { comfortableNote } from '../../core/range/vocal-range';
import {
  centsVsTarget, classifyCents, noteAccuracy, TOLERANCE_BY_LEVEL,
  type NoteAccuracy, type PitchStatus,
} from '../../core/scoring/pitch-scoring';
import type { Settings } from '../../shared/settings';
import { CentsMeter } from './CentsMeter';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { PitchTrail } from './PitchTrail';
import { useEngineSnapshot, useSampledFrame } from './useEngine';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onCalibrate: () => void;
}

const STATUS_TEXT: Record<PitchStatus, { label: string; hint: string; icon: string }> = {
  perfect: { label: 'Perfecto', hint: 'Mantén la nota', icon: '●' },
  close: { label: 'Cerca', hint: 'Casi en el centro', icon: '◐' },
  too_high: { label: 'Demasiado alto', hint: 'Baja un poco', icon: '▼' },
  too_low: { label: 'Demasiado bajo', hint: 'Sube un poco', icon: '▲' },
  no_voice: { label: 'Sin voz', hint: 'Canta una vocal sostenida, p. ej. "aaa"', icon: '○' },
};

/** Silencio (frames) que cierra un intento: ~0,4 s. */
const END_OF_ATTEMPT_FRAMES = 40;

export function TunerPage({ settings, updateSettings, onCalibrate }: Props) {
  const snapshot = useEngineSnapshot();
  const frame = useSampledFrame(15);
  const [targetMidi, setTargetMidi] = useState(() => (settings.range ? comfortableNote(settings.range) : 60));
  const [hasTarget, setHasTarget] = useState(true);
  const [turn, setTurn] = useState<'idle' | 'listen' | 'sing'>('idle');
  const attempt = useAttempt(targetMidi, settings);

  const tolerance = TOLERANCE_BY_LEVEL[settings.level];
  const voiced = frame?.voiced && frame.midi !== null ? frame.midi : null;
  const nearest = voiced !== null ? nearestNote(voiced) : null;
  const cents = voiced === null ? null : hasTarget ? centsVsTarget(voiced, targetMidi, settings.octaveMode) : nearest!.cents;
  const status = classifyCents(cents, tolerance);
  const centerMidi = hasTarget ? targetMidi : nearest?.midi ?? targetMidi;

  const listenAndSing = async () => {
    setTurn('listen');
    await audioEngine.playReference(targetMidi);
    setTurn('sing');
  };

  return (
    <section className="tuner" aria-label="Afinador">
      {!settings.range && (
        <p className="notice">
          Aún no conocemos tu rango vocal. <button className="link" onClick={onCalibrate}>Calibrarlo (1 minuto)</button> para que las notas objetivo te queden cómodas.
        </p>
      )}

      <div className="target-row">
        <label className="switch">
          <input type="checkbox" checked={hasTarget} onChange={(e) => setHasTarget(e.target.checked)} />
          Nota objetivo
        </label>
        {hasTarget && (
          <>
            <div className="stepper" role="group" aria-label="Nota objetivo">
              <button onClick={() => setTargetMidi((m) => m - 1)} aria-label="Bajar un semitono">−</button>
              <output aria-live="polite">{noteName(targetMidi)}</output>
              <button onClick={() => setTargetMidi((m) => m + 1)} aria-label="Subir un semitono">+</button>
            </div>
            <button className="primary" onClick={listenAndSing} disabled={snapshot.referencePlaying}>
              {snapshot.referencePlaying ? 'Escuchando…' : 'Escuchar y cantar'}
            </button>
          </>
        )}
      </div>
      {hasTarget && turn !== 'idle' && (
        <p className="turn" role="status">
          {turn === 'listen' ? `Escucha la nota ${noteName(targetMidi)}…` : `¡Tu turno! Canta ${noteName(targetMidi)}.`}
        </p>
      )}

      <div className={`readout status-${status}`}>
        <div className="note" aria-live="off">{nearest?.name ?? '—'}</div>
        <div className="readout-detail">
          <span className="cents">{nearest ? `${nearest.cents >= 0 ? '+' : ''}${nearest.cents.toFixed(0)} c` : ''}</span>
          <span>{frame?.f0 ? `${frame.f0.toFixed(1)} Hz` : ''}</span>
          <span>Confianza {frame ? `${Math.round(frame.clarity * 100)}%` : '—'}</span>
        </div>
        <div className="status" role="status" aria-live="polite">
          {snapshot.referencePlaying ? (
            <>
              <span className="status-icon" aria-hidden="true">♪</span>
              <strong>Escucha la referencia</strong>
              <span className="status-hint">El micrófono se ignora mientras suena la nota</span>
            </>
          ) : (
            <>
              <span className="status-icon" aria-hidden="true">{STATUS_TEXT[status].icon}</span>
              <strong>{STATUS_TEXT[status].label}</strong>
              {cents !== null && hasTarget && <span> · {cents >= 0 ? '+' : ''}{cents.toFixed(0)} c respecto a {noteName(targetMidi)}</span>}
              <span className="status-hint">{STATUS_TEXT[status].hint}</span>
            </>
          )}
        </div>
        <CentsMeter cents={cents} perfectCents={tolerance.perfectCents} toleranceCents={tolerance.toleranceCents} />
      </div>

      <PitchTrail centerMidi={centerMidi} tolerance={tolerance} octaveMode={settings.octaveMode} showTarget={hasTarget} />

      {hasTarget && <AttemptSummary attempt={attempt} targetMidi={targetMidi} />}

      <div className="settings-row">
        <label className="field">
          Nivel
          <select value={settings.level} onChange={(e) => updateSettings({ level: e.target.value as Settings['level'] })}>
            <option value="beginner">Principiante (±{TOLERANCE_BY_LEVEL.beginner.toleranceCents} c)</option>
            <option value="intermediate">Intermedio (±{TOLERANCE_BY_LEVEL.intermediate.toleranceCents} c)</option>
            <option value="advanced">Avanzado (±{TOLERANCE_BY_LEVEL.advanced.toleranceCents} c)</option>
          </select>
        </label>
        <label className="field">
          Octava
          <select value={settings.octaveMode} onChange={(e) => updateSettings({ octaveMode: e.target.value as Settings['octaveMode'] })}>
            <option value="pitch-class">Cualquier octava vale</option>
            <option value="exact">Octava exacta</option>
          </select>
        </label>
        <span className="hint">Referencia A4 = {midiToFreq(69).toFixed(0)} Hz</span>
      </div>

      {snapshot.diagnostics && (
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

function AttemptSummary({ attempt, targetMidi }: { attempt: { live: NoteAccuracy | null; last: NoteAccuracy | null }; targetMidi: number }) {
  const shown = attempt.live?.accuracy != null ? attempt.live : attempt.last;
  if (!shown || shown.accuracy === null) return <p className="attempt hint">Sostén {noteName(targetMidi)} un par de segundos para ver tu precisión.</p>;
  const pct = Math.round(shown.accuracy * 100);
  const median = shown.medianCents!;
  return (
    <p className="attempt">
      <span className="attempt-label">{shown === attempt.live ? 'Precisión ahora' : 'Último intento'}</span>
      <strong className={pct >= 80 ? 'pass' : 'fail'}>{pct}%</strong>
      <span>{pct >= 80 ? 'Superado (≥ 80%)' : 'Por debajo del 80%'}</span>
      <span className="hint">mediana {median >= 0 ? '+' : ''}{median.toFixed(0)} c · sin contar los primeros 250 ms</span>
    </p>
  );
}
