import { useEffect, useState } from 'react';
import { audioEngine } from '../audio/engine';
import { ExercisesPage } from '../features/exercises/ExercisesPage';
import { RangeCalibration } from '../features/range/RangeCalibration';
import { SongsPage } from '../features/songs/SongsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TunerPage } from '../features/tuner/TunerPage';
import { useEngineSnapshot } from '../features/tuner/useEngine';
import { recordCalibration } from '../core/profile/vocal-profile';
import { profileStore } from '../shared/profile-store';
import { useSettings } from '../shared/settings';

type View = 'exercises' | 'songs' | 'tuner' | 'range' | 'settings';

export function App() {
  const [settings, updateSettings] = useSettings();
  const [view, setView] = useState<View>(settings.range ? 'exercises' : 'range');
  const snapshot = useEngineSnapshot();
  const running = snapshot.status === 'running';

  useEffect(() => void audioEngine.setInstrument(settings.instrument), [settings.instrument]);

  // Quien midió su voz antes de existir el perfil vocal: se usa esa medición como punto de partida.
  useEffect(() => {
    if (settings.range && !profileStore.get().calibrated) profileStore.update((p) => recordCalibration(p, settings.range!));
  }, [settings.range]);

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
            {(
              [
                ['exercises', 'Practicar'],
                ['songs', 'Canciones'],
                ['tuner', 'Canta libre'],
                ['range', 'Mi voz'],
                ['settings', 'Ajustes'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>
            ))}
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
          Parece que usas auriculares o un micrófono Bluetooth. Con Bluetooth la voz llega con retraso y peor calidad, y las correcciones
          pueden fallar. Para practicar usa el micrófono del móvil u ordenador, o auriculares con cable.
          {settings.showDetails && ` (${snapshot.diagnostics.bluetooth.reason})`}
        </p>
      )}

      <main>
        {!running ? (
          <section className="welcome">
            <h2>Aprende a cantar afinado</h2>
            <p>Canta y verás al instante si tienes que subir o bajar. Con ejercicios cortos, a tu ritmo y adaptados a tu voz.</p>
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
          <ExercisesPage settings={settings} updateSettings={updateSettings} onCalibrate={() => setView('range')} />
        ) : view === 'songs' ? (
          <SongsPage settings={settings} updateSettings={updateSettings} onMeasure={() => setView('range')} />
        ) : view === 'settings' ? (
          <SettingsPage settings={settings} updateSettings={updateSettings} onMeasureVoice={() => setView('range')} />
        ) : (
          <RangeCalibration
            range={settings.range}
            detailed={settings.showDetails}
            onSave={(range) => {
              updateSettings({ range });
              profileStore.update((p) => recordCalibration(p, range));
            }}
            onDone={() => setView('exercises')}
          />
        )}
      </main>
    </div>
  );
}
