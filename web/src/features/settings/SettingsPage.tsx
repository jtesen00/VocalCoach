import { audioEngine } from '../../audio/engine';
import { INSTRUMENTS } from '../../audio/instruments';
import { AiSettingsPanel } from './AiSettingsPanel';
import { AccountPanel } from './AccountPanel';
import { LatencyCalibration } from './LatencyCalibration';
import { InstallSection } from '../../app/pwa';
import { phraseChords } from '../../core/music/chords';
import { noteName, solfegeName } from '../../core/music/notes';
import { TOLERANCE_BY_LEVEL, type SkillLevel } from '../../core/scoring/pitch-scoring';
import { STRICTNESS_LABEL } from '../../shared/labels';
import type { Settings } from '../../shared/settings';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onMeasureVoice: () => void;
}

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced'];

/** Muestra breve: do-re-mi-fa-sol-mi-do con sus acordes. */
function preview(withChords: boolean) {
  audioEngine.stopGuide();
  const notes = [60, 62, 64, 65, 67, 64, 60];
  const durs = [0.4, 0.4, 0.4, 0.4, 0.8, 0.4, 1.0];
  const chords = phraseChords('C:2 G:1 C:1').map((c) => ({ startS: c.startBeat * 0.95, endS: (c.startBeat + c.beats) * 0.95, chord: c.chord }));
  audioEngine.playGuide(
    notes.map((midi, i) => ({ type: 'note' as const, midi, durationS: durs[i] })),
    withChords ? chords : undefined,
  );
}

export function SettingsPage({ settings, updateSettings, onMeasureVoice }: Props) {
  const range = settings.range;
  return (
    <section className="settings" aria-label="Ajustes">
      <h2>Ajustes</h2>

      <fieldset>
        <legend>¿Cuánto te corregimos?</legend>
        {LEVELS.map((level) => (
          <label key={level} className="choice">
            <input type="radio" name="level" checked={settings.level === level} onChange={() => updateSettings({ level })} />
            <span>
              <strong>{STRICTNESS_LABEL[level].name}</strong>
              <span className="hint">
                {' '}— {STRICTNESS_LABEL[level].description}
                {settings.showDetails && ` (±${TOLERANCE_BY_LEVEL[level].toleranceCents} c)`}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Sonido de la guía</legend>
        <p className="hint">Con este instrumento suenan las notas de referencia, las demostraciones y las canciones.</p>
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="choice">
            <input
              type="radio"
              name="instrument"
              checked={settings.instrument === ins.id}
              onChange={async () => {
                updateSettings({ instrument: ins.id });
                audioEngine.stopGuide();
                await audioEngine.setInstrument(ins.id);
                preview(settings.accompaniment);
              }}
            />
            <span>
              <strong>{ins.name}</strong>
              <span className="hint"> — {ins.description}</span>
            </span>
          </label>
        ))}
        <label className="choice">
          <input type="checkbox" checked={settings.accompaniment} onChange={(e) => updateSettings({ accompaniment: e.target.checked })} />
          <span>
            <strong>Acompañamiento con acordes</strong>
            <span className="hint"> — en las canciones suenan también los acordes, como en un karaoke.</span>
          </span>
        </label>
        <p><button onClick={() => preview(settings.accompaniment)}>▶ Probar sonido</button></p>
        <p className="hint">
          Grabaciones: piano Salamander (A. Holm, CC BY 3.0), voz FluidR3 (F. Wen, CC BY 3.0) y silbido, flauta y cuerdas Musyng Kite (CC BY-SA 3.0).{' '}
          <a href={`${import.meta.env.BASE_URL}samples/CREDITS.md`} target="_blank" rel="noreferrer">Créditos</a>
        </p>
      </fieldset>

      <fieldset>
        <legend>Más grave o más agudo</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={settings.octaveMode === 'pitch-class'}
            onChange={(e) => updateSettings({ octaveMode: e.target.checked ? 'pitch-class' : 'exact' })}
          />
          <span>
            <strong>Vale cantar la misma nota más grave o más aguda</strong>
            <span className="hint"> — por ejemplo, si una voz grave canta una melodía pensada para una voz aguda (otra octava).</span>
          </span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Tu voz</legend>
        <p>
          {range
            ? `Tu zona cómoda abarca ${range.highMidi - range.lowMidi + 1} notas` +
              (settings.showDetails ? ` (${noteName(range.lowMidi)} – ${noteName(range.highMidi)}).` : ` (de ${solfegeName(range.lowMidi)} grave a ${solfegeName(range.highMidi)} agudo).`)
            : 'Aún no hemos medido tu voz.'}
        </p>
        <button onClick={onMeasureVoice}>{range ? 'Volver a medir mi voz' : 'Medir mi voz'}</button>
      </fieldset>

      <LatencyCalibration settings={settings} updateSettings={updateSettings} />

      <AccountPanel />

      <fieldset>
        <legend>Instalar la app</legend>
        <InstallSection />
      </fieldset>

      <AiSettingsPanel detailed={settings.showDetails} />

      <fieldset>
        <legend>Para curiosos</legend>
        <label className="choice">
          <input type="checkbox" checked={settings.showDetails} onChange={(e) => updateSettings({ showDetails: e.target.checked })} />
          <span>
            <strong>Mostrar detalles técnicos</strong>
            <span className="hint"> — nombres de nota con octava (C4), desviación en cents, frecuencia en Hz y diagnóstico del micrófono.</span>
          </span>
        </label>
      </fieldset>
    </section>
  );
}
