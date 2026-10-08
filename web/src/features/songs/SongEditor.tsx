import { useState } from 'react';
import { guideEvents } from '../../core/exercises/guide';
import { deletePhrase, hasLyrics, mergeWithNext, naturalSplitPoint, renameSong, setPhraseLyrics, shiftPhraseOctave, splitPhrase } from '../../core/songs/edit';
import { allPhrases, phrasePlan } from '../../core/songs/melody';
import type { Song } from '../../core/songs/types';
import { updateImportedSong } from '../../shared/imported-songs';
import { MelodyShape } from '../exercises/MelodyShape';
import { ListenButton } from './ListenButton';

/**
 * Editar una canción importada (Fase 8c): título, letra de cada frase y frases (unir, dividir,
 * cambiar de octava, borrar). Se trabaja sobre un borrador; nada se guarda hasta «Guardar».
 */
export function SongEditor({ song, onDone }: { song: Song; onDone: () => void }) {
  const [history, setHistory] = useState<Song[]>([song]);
  const draft = history[history.length - 1];
  const [title, setTitle] = useState(song.title);
  /** Letra escrita y aún no aplicada, por id de frase. */
  const [texts, setTexts] = useState<Record<string, string>>({});
  const phrases = allPhrases(draft);
  const extracted = !song.source;

  /** Aplica la letra escrita a un borrador. */
  const withTexts = (s: Song) =>
    Object.entries(texts).reduce((acc, [id, text]) => {
      const p = allPhrases(acc).find((r) => r.phrase.id === id)?.phrase;
      return p && text !== (hasLyrics(p) ? p.lyrics : '') ? setPhraseLyrics(acc, id, text) : acc;
    }, s);

  /** La letra pendiente cuenta como un paso propio: «Deshacer» no la pierde. */
  const apply = (op: (s: Song) => Song) => {
    setHistory((h) => {
      const cur = h[h.length - 1];
      const typed = withTexts(cur);
      return [...(typed === cur ? h : [...h, typed]), op(typed)];
    });
    setTexts({});
  };
  const undo = () => {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    setTexts({});
  };
  const changed = history.length > 1 || Object.keys(texts).length > 0 || title.trim() !== song.title;

  const save = () => {
    updateImportedSong(renameSong(withTexts(draft), title));
    onDone();
  };

  return (
    <section className="song song-editor" aria-label={`Editar ${song.title}`}>
      <button className="link back" onClick={onDone}>← Volver sin guardar</button>
      <h2>Editar canción</h2>
      <label className="field">
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <ul className="hint">
        <li>Escribe la letra de cada frase. Separa las sílabas con guiones para que cada una caiga en su nota: «a-mor mí-o».</li>
        {extracted && <li>Si una frase suena una octava más aguda o más grave que en la canción, corrígela con «Octava».</li>}
        <li>Une las frases demasiado cortas y divide las demasiado largas. El progreso de cada frase se conserva mientras exista.</li>
      </ul>

      <ol className="phrase-list editor-list">
        {phrases.map((p, i) => {
          const plan = phrasePlan(p);
          const value = texts[p.phrase.id] ?? (hasLyrics(p.phrase) ? p.phrase.lyrics : '');
          const n = p.phrase.notes.length;
          return (
            <li key={p.phrase.id}>
              <span className="phrase-num">Frase {i + 1}</span>
              <span className="phrase-lyrics">
                <MelodyShape plan={plan} />
                <input
                  className="lyrics-input"
                  value={value}
                  placeholder={hasLyrics(p.phrase) ? '' : `${p.phrase.lyrics || 'Sin letra'} · ${n} notas`}
                  onChange={(e) => setTexts((t) => ({ ...t, [p.phrase.id]: e.target.value }))}
                  aria-label={`Letra de la frase ${i + 1}`}
                />
              </span>
              <ListenButton className="small" events={() => ({ events: guideEvents(plan) })} label="▶" playingLabel="■" />
              <span className="editor-actions">
                <button className="small" onClick={() => apply((s) => shiftPhraseOctave(s, p.phrase.id, 12))} aria-label={`Frase ${i + 1} una octava más aguda`}>Octava ↑</button>
                <button className="small" onClick={() => apply((s) => shiftPhraseOctave(s, p.phrase.id, -12))} aria-label={`Frase ${i + 1} una octava más grave`}>Octava ↓</button>
                {n >= 4 && (
                  <button className="small" onClick={() => apply((s) => splitPhrase(s, p.phrase.id, naturalSplitPoint(p.phrase)))} aria-label={`Dividir la frase ${i + 1}`}>Dividir</button>
                )}
                {i + 1 < phrases.length && (
                  <button className="small" onClick={() => apply((s) => mergeWithNext(s, p.phrase.id))} aria-label={`Unir la frase ${i + 1} con la siguiente`}>Unir con la siguiente</button>
                )}
                {phrases.length > 1 && (
                  <button className="small link" onClick={() => apply((s) => deletePhrase(s, p.phrase.id))} aria-label={`Borrar la frase ${i + 1}`}>Borrar</button>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="version-buttons editor-footer">
        <button className="primary" onClick={save} disabled={!changed}>Guardar cambios</button>
        <button onClick={undo} disabled={history.length < 2}>Deshacer</button>
        <button className="link" onClick={onDone}>Descartar</button>
      </p>
    </section>
  );
}
