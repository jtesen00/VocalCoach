import { useState } from 'react';
import { importSongFromFile } from '../../audio/melody-import';
import { allPhrases } from '../../core/songs/melody';
import { addImportedSong, importedSongsStore, removeImportedSong } from '../../shared/imported-songs';

/** "mm:ss" o segundos → segundos. */
function parseTime(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Importar una canción desde un archivo de audio (spec §16, ADR-009 actualizado). */
export function ImportSong({ onOpen }: { onOpen: (id: string) => void }) {
  const imported = importedSongsStore.use().songs;
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<{ stage: 'decoding' | 'analyzing'; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!file) return;
    setError(null);
    try {
      const { song } = await importSongFromFile(file, {
        fromS: parseTime(from),
        toS: parseTime(to),
        onProgress: (stage, value) => setProgress({ stage, value }),
      });
      if (!allPhrases(song).length) {
        setError('No encontramos una melodía cantada clara. Prueba con un fragmento donde se oiga bien la voz, o con una pista solo de voz.');
        return;
      }
      addImportedSong(song);
      setFile(null);
      onOpen(song.id);
    } catch (e) {
      setError(e instanceof DOMException || (e as Error).name === 'EncodingError'
        ? 'No se pudo leer el archivo. Prueba con MP3, M4A o WAV.'
        : (e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="import-song" aria-label="Importar canción">
      <h3>Importa la canción que quieres cantar</h3>
      <p>
        Elige un archivo de audio (MP3, M4A, WAV…). Analizamos <strong>cómo se canta la melodía</strong> y la conviertes en una canción
        para practicar aquí, con tu tono recomendado y entrenamiento por frases. Luego, ¡a cantarla de verdad con el original!
      </p>
      <ul className="hint">
        <li>🔒 El audio se analiza en tu dispositivo: no se sube, no se guarda y la app no lo reproduce. Solo guardamos la melodía extraída, aquí.</li>
        <li>🎤 Funciona mejor con voz sola o pistas de voz. Con la canción completa (voz + instrumentos) la melodía es aproximada.</li>
      </ul>

      <label className="field file-field">
        Archivo
        <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="target-row">
        <label className="field">Desde <input className="time" placeholder="0:00" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde (minutos:segundos)" /></label>
        <label className="field">Hasta <input className="time" placeholder="final" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta (minutos:segundos)" /></label>
        <span className="hint">Opcional: analiza solo el fragmento que quieres cantar.</span>
      </div>
      <label className="choice">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span>Uso este audio solo para mi práctica personal y educativa, y tengo derecho a usarlo así.</span>
      </label>
      <p>
        <button className="primary" onClick={run} disabled={!file || !rights || !!progress}>
          {progress ? (progress.stage === 'decoding' ? 'Leyendo el audio…' : `Analizando la melodía… ${Math.round(progress.value * 100)} %`) : 'Analizar melodía'}
        </button>
      </p>
      {progress && <progress max={1} value={progress.stage === 'decoding' ? undefined : progress.value} aria-label="Progreso del análisis" />}
      {error && <p className="notice error" role="alert">{error}</p>}

      {imported.length > 0 && (
        <>
          <h3>Tus canciones importadas</h3>
          <ul className="exercise-list">
            {imported.map((s) => (
              <li key={s.id}>
                <div className="exercise-body">
                  <h3>{s.title}</h3>
                  <p className="exercise-meta">{allPhrases(s).length} frases · solo en este dispositivo</p>
                </div>
                <button onClick={() => onOpen(s.id)} aria-label={`Abrir ${s.title}`}>Practicar</button>
                <button className="link" onClick={() => removeImportedSong(s.id)} aria-label={`Borrar ${s.title}`}>Borrar</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
