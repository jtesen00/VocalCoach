import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { noteName } from '../../core/music/notes';
import type { PitchFrame } from '../../core/pitch/types';
import { makeRange, sustainedNote, type VocalRange } from '../../core/range/vocal-range';
import { useSampledFrame } from '../tuner/useEngine';

interface Props {
  range: VocalRange | null;
  onSave: (range: VocalRange) => void;
  onDone: () => void;
}

type Step = 'low' | 'high' | 'done';

/** Tiempo máximo de cada toma y voz necesaria para cerrarla antes. */
const MAX_TAKE_MS = 5000;
const ENOUGH_VOICED_FRAMES = 180;

const STEPS: Record<Exclude<Step, 'done'>, { title: string; text: string }> = {
  low: { title: 'Nota más grave', text: 'Canta "aaa" en la nota más grave que te salga cómoda, sin forzar, y sostenla.' },
  high: { title: 'Nota más aguda', text: 'Ahora la nota más aguda que puedas cantar cómodamente, sin gritar ni forzar.' },
};

export function RangeCalibration({ range, onSave, onDone }: Props) {
  const [step, setStep] = useState<Step>('low');
  const [recording, setRecording] = useState(false);
  const [low, setLow] = useState<number | null>(null);
  const [result, setResult] = useState<VocalRange | null>(null);
  const [retry, setRetry] = useState(false);
  const frame = useSampledFrame(15);
  const latest = useRef({ step, low, onSave });
  latest.current = { step, low, onSave };

  useEffect(() => {
    if (!recording) return;
    const frames: PitchFrame[] = [];
    let voiced = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const { step, low, onSave } = latest.current;
      setRecording(false);
      const note = sustainedNote(frames);
      if (note === null) {
        setRetry(true);
        return;
      }
      setRetry(false);
      if (step === 'low') {
        setLow(note);
        setStep('high');
      } else {
        const r = makeRange(low!, note);
        setResult(r);
        onSave(r);
        setStep('done');
      }
    };
    const off = audioEngine.onFrame((f) => {
      frames.push(f);
      if (f.voiced && ++voiced >= ENOUGH_VOICED_FRAMES) finish();
    });
    const timer = setTimeout(finish, MAX_TAKE_MS);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [recording]);

  if (step === 'done' && result) {
    return (
      <section className="range" aria-label="Rango vocal">
        <h2>Tu rango cómodo</h2>
        <p className="range-result">{noteName(result.lowMidi)} – {noteName(result.highMidi)}</p>
        <p>{result.highMidi - result.lowMidi} semitonos. Los ejercicios se transpondrán a este rango.</p>
        <div className="actions">
          <button className="primary" onClick={onDone}>Ir al afinador</button>
          <button onClick={() => { setStep('low'); setResult(null); setLow(null); }}>Repetir</button>
        </div>
      </section>
    );
  }

  const current = STEPS[step as 'low' | 'high'];
  return (
    <section className="range" aria-label="Calibración del rango vocal">
      <p className="step-count">Paso {step === 'low' ? 1 : 2} de 2</p>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      {range && step === 'low' && <p className="hint">Rango guardado: {noteName(range.lowMidi)} – {noteName(range.highMidi)}</p>}
      {low !== null && <p className="hint">Grave: {noteName(low)}</p>}
      <div className="readout compact">
        <div className="note">{frame?.voiced && frame.midi !== null ? noteName(frame.midi) : '—'}</div>
      </div>
      {retry && <p className="notice warn" role="status">No te he oído lo suficiente. Acércate al micrófono y sostén la nota unos 2 segundos.</p>}
      <button className="primary" disabled={recording} onClick={() => setRecording(true)}>
        {recording ? 'Escuchando…' : 'Empezar'}
      </button>
    </section>
  );
}
