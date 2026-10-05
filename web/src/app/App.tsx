import { useState } from 'react';
import { audioEngine } from '../audio/engine';
import { ExercisesPage } from '../features/exercises/ExercisesPage';
import { RangeCalibration } from '../features/range/RangeCalibration';
import { TunerPage } from '../features/tuner/TunerPage';
import { useEngineSnapshot } from '../features/tuner/useEngine';
import { useSettings } from '../shared/settings';

type View = 'tuner' | 'exercises' | 'range';

export function App() {
  const [settings, updateSettings] = useSettings();
  const [view, setView] = useState<View>(settings.range ? 'tuner' : 'range');
  const snapshot = useEngineSnapshot();
  const running = snapshot.status === 'running';

  const start = async () => {
    await audioEngine.start();
    audioEngine.setDetector(settings.detector);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Vocal Coach</h1>
        {running && (
          <nav aria-label="Secciones">
            <button aria-current={view === 'tuner' ? 'page' : undefined} onClick={() => setView('tuner')}>Afinador</button>
            <button aria-current={view === 'exercises' ? 'page' : undefined} onClick={() => setView('exercises')}>Ejercicios</button>
            <button aria-current={view === 'range' ? 'page' : undefined} onClick={() => setView('range')}>Mi rango</button>
          </nav>
        )}
        <div className={`mic ${running ? 'on' : ''}`} role="status">
          <span className="mic-dot" aria-hidden="true" />
          {running ? 'Micrófono activo' : 'Micrófono apagado'}
          {running && <button className="small" onClick={() => audioEngine.stop()}>Detener</button>}
        </div>
      </header>

      {running && snapshot.diagnostics?.bluetooth.suspected && (
        <p className="notice warn" role="alert">
          Parece que usas un micrófono Bluetooth ({snapshot.diagnostics.bluetooth.reason}). Los micrófonos Bluetooth reducen
          la calidad y añaden 150–300 ms de retraso. Para practicar usa el micrófono del dispositivo o auriculares con cable.
        </p>
      )}

      <main>
        {!running ? (
          <section className="welcome">
            <h2>Canta y mira tu afinación al instante</h2>
            <p>Vocal Coach escucha tu voz, detecta la nota que cantas y te dice si estás alto, bajo o en el centro.</p>
            <ul>
              <li><strong>Privado:</strong> el audio se analiza en tu dispositivo y no se envía a ningún servidor.</li>
              <li><strong>Mejor sin Bluetooth:</strong> usa el micrófono del dispositivo o auriculares con cable.</li>
              <li><strong>Funciona sin internet</strong> una vez cargada la página.</li>
            </ul>
            <button className="primary large" onClick={start} disabled={snapshot.status === 'starting'}>
              {snapshot.status === 'starting' ? 'Activando…' : 'Activar micrófono'}
            </button>
            {snapshot.error && <p className="notice error" role="alert">{snapshot.error}</p>}
          </section>
        ) : view === 'tuner' ? (
          <TunerPage settings={settings} updateSettings={updateSettings} onCalibrate={() => setView('range')} />
        ) : view === 'exercises' ? (
          <ExercisesPage settings={settings} onCalibrate={() => setView('range')} />
        ) : (
          <RangeCalibration range={settings.range} onSave={(range) => updateSettings({ range })} onDone={() => setView('tuner')} />
        )}
      </main>
    </div>
  );
}
