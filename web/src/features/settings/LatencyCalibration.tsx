import { useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { estimateLatency, type LevelFrame } from '../../core/pitch/latency';
import type { Settings } from '../../shared/settings';

/**
 * Ajustes → Sincronía: mide el retraso entre lo que suena y lo que oye el micro, para
 * que al cantar la canción entera tu voz se compare con la nota justa en el tiempo.
 */
export function LatencyCalibration({ settings, updateSettings }: { settings: Settings; updateSettings: (p: Partial<Settings>) => void }) {
  const [state, setState] = useState<{ kind: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({ kind: 'idle' });

  const measure = async () => {
    setState({ kind: 'running' });
    const frames: LevelFrame[] = [];
    const off = audioEngine.onFrame((f) => frames.push({ t: f.t, levelDb: f.levelDb }));
    const clicks = audioEngine.calibrationClicks(8, 0.5);
    await new Promise((r) => setTimeout(r, (clicks.length * 0.5 + 1.2) * 1000));
    off();
    const r = estimateLatency(frames, clicks);
    if (!r || r.spreadS > 0.08) {
      setState({ kind: 'fail', text: 'No se oyeron bien los clics. Quita los auriculares, sube un poco el volumen y prueba en silencio.' });
      return;
    }
    const ms = Math.round(r.latencyS * 1000);
    updateSettings({ latencyMs: ms });
    audioEngine.setCalibratedLatency(r.latencyS);
    setState({ kind: 'ok', text: settings.showDetails ? `Retraso medido: ${ms} ms (${r.detected}/${r.total} clics).` : 'Listo: sincronía ajustada.' });
  };

  return (
    <fieldset>
      <legend>Sincronía</legend>
      <p className="hint">
        Para cantar una canción entera, la app compara tu voz con la melodía en el tiempo. Mide el retraso de tu dispositivo una vez:
        sin auriculares, con el volumen a media altura y en silencio. Sonarán 8 clics.
      </p>
      <p>
        <button onClick={() => void measure()} disabled={state.kind === 'running'}>{state.kind === 'running' ? 'Escuchando los clics…' : settings.latencyMs === null ? 'Medir el retraso' : 'Volver a medir'}</button>{' '}
        {settings.latencyMs !== null && state.kind === 'idle' && <span className="hint">✓ Medido{settings.showDetails ? ` (${settings.latencyMs} ms)` : ''}.</span>}
      </p>
      {state.text && <p className={`notice ${state.kind === 'fail' ? 'error' : ''}`} role="status">{state.text}</p>}
    </fieldset>
  );
}
