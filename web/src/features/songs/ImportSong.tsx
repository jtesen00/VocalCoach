import { useEffect, useRef, useState } from 'react';
import { importSongFromFile, type ImportStage } from '../../audio/melody-import';
import { downloadModel, isModelDownloaded, modelSizeLabel } from '../../audio/separation-model';
import { allPhrases } from '../../core/songs/melody';
import { addImportedSong, importedSongsStore, removeImportedSong } from '../../shared/imported-songs';
import { isMelodyFile } from '../../core/songs/formats';
import { importMelodyFile } from '../../shared/melody-file';

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
  const [separate, setSeparate] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [progress, setProgress] = useState<{ stage: ImportStage | 'downloading'; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const melodyFile = !!file && isMelodyFile(file.name);

  useEffect(() => {
    isModelDownloaded().then(setModelReady);
    return () => abort.current?.abort();
  }, []);

  const run = async () => {
    if (!file) return;
    setError(null);
    abort.current = new AbortController();
    const signal = abort.current.signal;
    try {
      if (melodyFile) {
        // Archivo de melodía (UltraStar, MIDI, MusicXML): la melodía es exacta y suele traer letra.
        const song = await importMelodyFile(file);
        if (!allPhrases(song).length) {
          setError('El archivo no tiene notas que cantar.');
          return;
        }
        addImportedSong(song);
        setFile(null);
        onOpen(song.id);
        return;
      }
      const withSeparation = separate;
      if (withSeparation && !modelReady) {
        setProgress({ stage: 'downloading', value: 0 });
        await downloadModel((value) => setProgress({ stage: 'downloading', value }), signal);
        setModelReady(true);
      }
      const { song } = await importSongFromFile(file, {
        fromS: parseTime(from),
        toS: parseTime(to),
        separate: withSeparation,
        signal,
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
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof DOMException || (e as Error).name === 'EncodingError'
        ? 'No se pudo leer el archivo. Prueba con MP3, M4A o WAV, o con un archivo de melodía (UltraStar, MIDI o MusicXML).'
        : (e as Error).message);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const label = (() => {
    if (!progress) return melodyFile ? 'Importar melodía' : 'Analizar melodía';
    const p = `${Math.round(progress.value * 100)} %`;
    switch (progress.stage) {
      case 'downloading': return `Descargando el separador de voz… ${p}`;
      case 'decoding': return 'Leyendo el audio…';
      case 'separating': return `Separando la voz… ${p}`;
      case 'analyzing': return `Analizando la melodía… ${p}`;
    }
  })();

  return (
    <section className="import-song" aria-label="Importar canción">
      <h3>Importa la canción que quieres cantar</h3>
      <p>
        Elige un archivo de audio (MP3, M4A, WAV…). Analizamos <strong>cómo se canta la melodía</strong> y la conviertes en una canción
        para practicar aquí, con tu tono recomendado y entrenamiento por frases. Luego, ¡a cantarla de verdad con el original!
      </p>
      <ul className="hint">
        <li>🔒 El audio se analiza en tu dispositivo: no se sube, no se guarda y la app no lo reproduce. Solo guardamos la melodía extraída, aquí.</li>
        <li>🎤 Funciona con la canción completa (voz + instrumentos). Mejor en estéreo y con la voz clara; con una pista solo de voz, mejor aún.</li>
        <li>🎼 <strong>¿Tienes la melodía en un archivo?</strong> UltraStar (.txt), MIDI o karaoke (.mid, .kar) o partitura MusicXML (.musicxml, .mxl): la melodía sale exacta y, si el archivo trae letra, la verás sílaba a sílaba.</li>
      </ul>

      <label className="field file-field">
        Archivo
        <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.txt,.mid,.midi,.kar,.musicxml,.xml,.mxl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {!melodyFile && <div className="target-row">
        <label className="field">Desde <input className="time" placeholder="0:00" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde (minutos:segundos)" /></label>
        <label className="field">Hasta <input className="time" placeholder="final" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta (minutos:segundos)" /></label>
        <span className="hint">Opcional: analiza solo el fragmento que quieres cantar.</span>
      </div>}
      {!melodyFile && (
        <label className="choice">
          <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} disabled={!!progress} />
          <span>
            <strong>Separar la voz con IA</strong> <span className="hint">(útil cuando los instrumentos tapan la voz)</span>
            <span className="hint">
              {' '}— Un modelo de IA aísla la voz antes de analizarla. Funciona en tu dispositivo: el audio sigue sin salir de él.
              {modelReady ? ' El modelo ya está descargado.' : ` La primera vez se descarga el modelo (${modelSizeLabel}, una sola vez; mejor con wifi).`}
              {' '}Tarda más: en un ordenador sin tarjeta gráfica, unos 3 minutos por minuto de canción. Mejor con un fragmento.
            </span>
          </span>
        </label>
      )}
      <label className="choice">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span>Uso este archivo solo para mi práctica personal y educativa, y tengo derecho a usarlo así.</span>
      </label>
      <p>
        <button className="primary" onClick={run} disabled={!file || !rights || !!progress}>{label}</button>
        {progress && progress.stage !== 'analyzing' && separate && (
          <button className="link" onClick={() => abort.current?.abort()}>Cancelar</button>
        )}
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
