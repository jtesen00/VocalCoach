import { analyzeSong, rangeWarnings } from '../../core/songs/analysis';
import { songDifficulty } from '../../core/songs/difficulty';
import { keyName, recommendKey } from '../../core/songs/key';
import { guideEvents, type GuideEvent } from '../../core/exercises/guide';
import { allPhrases, phrasePlan } from '../../core/songs/melody';
import { describeIssue } from '../../core/songs/coach';
import { weakestPhrase } from '../../core/songs/scoring';
import type { Song } from '../../core/songs/types';
import { profileRanges } from '../../core/profile/vocal-profile';
import { displayNote } from '../../shared/labels';
import { profileStore } from '../../shared/profile-store';
import type { Settings } from '../../shared/settings';
import { keyHistory, setSongVersion, songStore } from '../../shared/song-store';
import { MelodyShape } from '../exercises/MelodyShape';
import { ListenButton } from './ListenButton';
import { Stars } from './Stars';

interface Props {
  song: Song;
  settings: Settings;
  onPhrase: (index: number) => void;
  onTrain: (index: number) => void;
  onMeasure: () => void;
  onBack: () => void;
}

const ICON = (score: number) => (score >= 80 ? '✓' : score >= 60 ? '⚠' : '✗');

function amountWord(t: number): string {
  const a = Math.abs(t);
  return a <= 2 ? 'un poco' : a <= 5 ? '' : 'bastante';
}

export function SongOverview({ song, settings, onPhrase, onTrain, onMeasure, onBack }: Props) {
  const profile = profileStore.use();
  const all = songStore.use();
  const progress = all[song.id] ?? { transpose: null, byKey: {} };
  const tech = settings.showDetails;
  const ranges = profileRanges(profile);

  const rec = recommendKey(song, profile, keyHistory(song.id));
  const transpose = progress.transpose ?? rec.best.transpose;
  const isRecommended = transpose === rec.best.transpose;
  const analysis = analyzeSong(song, transpose);
  const warnings = rangeWarnings(analysis, ranges);
  const diff = songDifficulty(song, transpose, profile, ranges);
  const phrases = allPhrases(song);
  const results = progress.byKey[String(transpose)] ?? {};
  const weakId = weakestPhrase(Object.fromEntries(phrases.map((p) => [p.phrase.id, results[p.phrase.id] && { score: results[p.phrase.id].last }])));
  const weak = weakId ? phrases.find((p) => p.phrase.id === weakId)! : null;
  const t = rec.best.transpose;
  const imported = song.license === 'user-provided';
  /** Toda la melodía, con los silencios reales entre frases (máx. 1,5 s). */
  const wholeMelody = (): GuideEvent[] => {
    const out: GuideEvent[] = [];
    phrases.forEach((p, i) => {
      if (i) out.push({ type: 'rest', durationS: 0.8 });
      out.push(...guideEvents(phrasePlan(p, transpose)));
    });
    return out;
  };
  const QUALITY = {
    buena: 'La melodía se extrajo con claridad.',
    media: 'Extracción aproximada: escucha las frases y practica las que suenen como la canción.',
    baja: 'Se oyó poca voz principal: prueba con otro fragmento, con una pista solo de voz o con otra versión de la canción.',
  } as const;

  return (
    <section className="song" aria-label={song.title}>
      <button className="link back" onClick={onBack}>← Todas las canciones</button>
      <h2>{song.title}</h2>
      <p className="hint">{song.credit}</p>
      {imported && song.extraction && (
        <p className={`notice quality-${song.extraction.quality}`}>
          <strong>Calidad de la extracción: {song.extraction.quality}.</strong> {QUALITY[song.extraction.quality]}
          {!song.extraction.stereo && ' El archivo es mono: con estéreo se separa mejor la voz de los instrumentos.'}
        </p>
      )}
      <p className="version-buttons">
        <ListenButton events={wholeMelody} label="▶ Escuchar toda la melodía" />
        {imported && <span className="hint">Cada frase indica en qué minuto empieza en la canción original, para que la compares.</span>}
      </p>

      <div className="version-card">
        <p className="teacher-label">Tu versión recomendada</p>
        {rec.reason === 'no-profile' ? (
          <>
            <p>Mide tu voz y te diremos en qué tono te queda mejor esta canción.</p>
            <button className="primary" onClick={onMeasure}>Medir mi voz</button>
          </>
        ) : rec.reason === 'original-fits' ? (
          <p>La versión original encaja bien con tu voz. ¡A cantar!</p>
        ) : (
          <>
            <p>
              La versión original tiene notas que hoy te quedan {t < 0 ? 'altas' : 'graves'} para tu voz.
              Te recomendamos un tono {amountWord(t)} {t < 0 ? 'más grave' : 'más agudo'}.
            </p>
            <p className="version-buttons">
              <button className={isRecommended ? 'primary' : ''} aria-pressed={isRecommended} onClick={() => setSongVersion(song.id, t)}>
                {isRecommended ? '✓ ' : ''}Practicar versión recomendada
              </button>
              <button className={transpose === 0 ? 'primary' : ''} aria-pressed={transpose === 0} onClick={() => setSongVersion(song.id, 0)}>
                {transpose === 0 ? '✓ ' : ''}Probar versión original
              </button>
            </p>
          </>
        )}
        {tech && (
          <p className="hint">
            Original: {keyName(song, 0, true)} · Recomendada: {keyName(song, t, true)} · Diferencia: {t > 0 ? '+' : ''}{t} semitonos ·
            Acierto esperado: {Math.round(rec.original.expectedAccuracy * 100)} % → {Math.round(rec.best.expectedAccuracy * 100)} %
            {rec.best.observed && ` · Medido: ${Math.round(rec.best.observed.accuracy * 100)} % en ${rec.best.observed.attempts} frases`}
          </p>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="warnings">
          {[...new Set(warnings.map((w) => w.section))].map((section) => {
            const ws = warnings.filter((w) => w.section === section);
            const sides = ws.map((w) => (w.side === 'above' ? 'por encima' : 'por debajo')).join(' y ');
            return (
              <li key={section}>
                ⚠ {section}: tiene notas {sides} de tu zona cómoda
                {tech ? ` (${ws.map((w) => `${w.semitones} st`).join(' / ')})` : ''}.
              </li>
            );
          })}
        </ul>
      )}

      <div className="difficulty-card">
        <p className="teacher-label">Dificultad para ti</p>
        <dl>
          <dt>Afinación</dt><dd><Stars value={diff.pitch} label="Afinación" /></dd>
          <dt>Rango</dt><dd><Stars value={diff.range} label="Rango" /></dd>
          <dt>Notas agudas</dt><dd><Stars value={diff.highNotes} label="Notas agudas" /></dd>
          <dt>Saltos</dt><dd><Stars value={diff.transitions} label="Saltos" /></dd>
          <dt>Ritmo</dt><dd><Stars value={diff.timing} label="Ritmo" /></dd>
        </dl>
        <p><strong>En general: {diff.overall}</strong>{tech && ` · ${displayNote(analysis.lowest, true)}–${displayNote(analysis.highest, true)}`}</p>
      </div>

      {weak && results[weak.phrase.id]?.lastIssue && (
        <div className="weak-card">
          <p className="teacher-label">Tu frase más débil</p>
          <h3>Frase {weak.index + 1} · {results[weak.phrase.id].last} %</h3>
          <p>Problema principal: {describeIssue(weak, results[weak.phrase.id].lastIssue!).title}</p>
          <p className="version-buttons">
            <button className="primary" onClick={() => onTrain(weak.index)}>Entrenar esta frase</button>
            <button onClick={() => onPhrase(weak.index)}>Practicar frase</button>
          </p>
        </div>
      )}

      {song.sections.map((section) => (
        <div key={section.name} className="song-section">
          <h3>{section.name}</h3>
          <ol className="phrase-list">
            {phrases.filter((p) => p.section === section).map((p) => {
              const r = results[p.phrase.id];
              return (
                <li key={p.phrase.id}>
                  <span className="phrase-num">Frase {p.index + 1}</span>
                  <span className="phrase-lyrics">
                    <MelodyShape plan={phrasePlan(p, transpose)} />
                    {imported ? `${p.phrase.lyrics} · ${p.phrase.notes.length} notas` : p.phrase.lyrics}
                  </span>
                  <ListenButton className="small" events={() => guideEvents(phrasePlan(p, transpose))} label="▶" playingLabel="■" />
                  <span className={`phrase-last ${r ? (r.last >= 80 ? 'pass' : r.last >= 60 ? 'fair' : 'fail') : ''}`}>
                    {r ? `${r.last} % ${ICON(r.last)}` : '—'}
                  </span>
                  <button onClick={() => onPhrase(p.index)} aria-label={`Practicar frase ${p.index + 1}`}>Practicar</button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
