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
