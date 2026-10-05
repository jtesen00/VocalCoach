import { audioEngine, type EngineDiagnostics } from '../../audio/engine';
import type { DetectorKind, PitchFrame } from '../../core/pitch/types';

interface Props {
  diagnostics: EngineDiagnostics;
  frame: PitchFrame | null;
  onDetectorChange: (kind: DetectorKind) => void;
}

const ms = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} ms`);
const flag = (v: boolean | null) => (v === null ? 'desconocido' : v ? 'ACTIVO ⚠' : 'desactivado');

/** Panel de desarrollo: lo necesario para medir el prototipo en cada dispositivo. */
export function DiagnosticsPanel({ diagnostics: d, frame, onDetectorChange }: Props) {
  const estimated = d.algorithmicLatencyMs + (d.inputLatencyMs ?? d.baseLatencyMs ?? 0) + d.transportMs + 1000 / 60;
  const processing = d.echoCancellation || d.noiseSuppression || d.autoGainControl;
  return (
    <details className="diagnostics">
      <summary>Diagnóstico</summary>
      {processing && (
        <p className="notice warn" role="status">
          El navegador sigue procesando la señal del micrófono. La detección puede ser menos precisa en este dispositivo.
        </p>
      )}
      <label className="field">
        Detector
        <select value={d.detector} onChange={(e) => {
          audioEngine.setDetector(e.target.value as DetectorKind);
          onDetectorChange(e.target.value as DetectorKind);
        }}>
          <option value="mpm">McLeod (MPM)</option>
          <option value="yin">YIN</option>
        </select>
      </label>
      <dl>
        <dt>Frecuencia</dt><dd>{frame?.f0 ? `${frame.f0.toFixed(2)} Hz` : '—'}</dd>
        <dt>Clarity</dt><dd>{frame ? frame.clarity.toFixed(3) : '—'}</dd>
        <dt>Nivel / ruido de fondo</dt><dd>{frame ? `${frame.levelDb.toFixed(1)} dB` : '—'} / {d.noiseFloorDb.toFixed(1)} dB</dd>
        <dt>Estimaciones por segundo</dt><dd>{d.framesPerSecond.toFixed(1)}</dd>
        <dt>Cómputo del detector</dt><dd>{d.processMs === null ? 'no medible aquí (ver pnpm bench)' : ms(d.processMs)}</dd>
        <dt>Latencia algorítmica (½ ventana)</dt><dd>{ms(d.algorithmicLatencyMs)}</dd>
        <dt>Latencia de entrada</dt><dd>{ms(d.inputLatencyMs)} {d.inputLatencyMs === null && `(base del contexto: ${ms(d.baseLatencyMs)})`}</dd>
        <dt>Worklet → UI</dt><dd>{ms(d.transportMs)}</dd>
        <dt>Estimación extremo a extremo</dt><dd>≈ {ms(estimated)}</dd>
        <dt>Frecuencia de muestreo</dt><dd>{d.sampleRate} Hz · ventana {d.windowSize} · salto {d.hopSize}</dd>
        <dt>Micrófono</dt><dd>{d.deviceLabel || '—'}</dd>
        <dt>Cancelación de eco</dt><dd>{flag(d.echoCancellation)}</dd>
        <dt>Supresión de ruido</dt><dd>{flag(d.noiseSuppression)}</dd>
        <dt>Control de ganancia</dt><dd>{flag(d.autoGainControl)}</dd>
      </dl>
      <p className="hint">La estimación extremo a extremo no incluye la latencia del hardware que el navegador no informa. Para medirla, ver docs/benchmarks.</p>
    </details>
  );
}
