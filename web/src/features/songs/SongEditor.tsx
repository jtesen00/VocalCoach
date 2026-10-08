import { useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { guideEvents } from '../../core/exercises/guide';
import { solfegeName } from '../../core/music/notes';
import {
  deleteNote,
  deletePhrase,
  hasLyrics,
  mergeWithNext,
  naturalSplitPoint,
  renameSong,
  setPhraseLyrics,
  setSongLyrics,
  shiftNote,
  shiftPhraseOctave,
  splitPhrase,
} from '../../core/songs/edit';
import { allPhrases, phrasePlan } from '../../core/songs/melody';
import type { Song } from '../../core/songs/types';
import { updateImportedSong } from '../../shared/imported-songs';
import { MelodyShape } from '../exercises/MelodyShape';
import { ListenButton } from './ListenButton';

/**
 * Editar una canción importada (Fases 8c y 9): título, letra (frase a frase o la canción
 * entera de una vez), frases (unir, dividir, octava, borrar) y notas sueltas (subir, bajar,
 * borrar). Se trabaja sobre un borrador; nada se guarda hasta «Guardar».
 */
export function SongEditor({ song, onDone }: { song: Song; onDone: () => void }) {
  const [history, setHistory] = useState<Song[]>([song]);
  const draft = history[history.length - 1];
  const [title, setTitle] = useState(song.title);
  /** Letra escrita y aún no aplicada, por id de frase. */
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [fullLyrics, setFullLyrics] = useState<string | null>(null);
  /** Frase con las notas desplegadas y nota elegida. */
  const [notesOf, setNotesOf] = useState<{ phraseId: string; note: number | null } | null>(null);
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
        <li>Escribe la letra de cada frase: las sílabas se reparten solas entre las notas. Si alguna cae mal, sepárala tú con guiones («a-mor») o une dos en una nota con «_» («de_es»).</li>
        {extracted && <li>Si una frase suena una octava más aguda o más grave que en la canción, corrígela con «Octava». Con «Notas» puedes corregir una nota suelta.</li>}
        <li>Une las frases demasiado cortas y divide las demasiado largas. El progreso de cada frase se conserva mientras exista.</li>
      </ul>

      {fullLyrics === null ? (
        <p><button onClick={() => setFullLyrics('')}>📋 Pegar la letra entera</button></p>
      ) : (
        <div className="full-lyrics">
          <label className="field">
            Letra de toda la canción (mejor una línea por frase)
            <textarea rows={6} value={fullLyrics} onChange={(e) => setFullLyrics(e.target.value)} aria-label="Letra de toda la canción" />
          </label>
          <p className="version-buttons">
            <button
              className="primary"
              disabled={!fullLyrics.trim()}
              onClick={() => {
                apply((s) => setSongLyrics(s, fullLyrics));
                setFullLyrics(null);
              }}
            >
              Repartir en las {phrases.length} frases
            </button>
            <button className="link" onClick={() => setFullLyrics(null)}>Cancelar</button>
          </p>
          <p className="hint">Se cuentan las sílabas de cada palabra y se reparten según las notas de cada frase, cortando donde pusiste saltos de línea. Luego puedes retocar cada frase.</p>
        </div>
      )}

      <ol className="phrase-list editor-list">
        {phrases.map((p, i) => {
          const plan = phrasePlan(p);
          const value = texts[p.phrase.id] ?? (hasLyrics(p.phrase) ? p.phrase.lyrics : '');
          const n = p.phrase.notes.length;
          const open = notesOf?.phraseId === p.phrase.id;
          const sel = open ? notesOf!.note : null;
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
                <button className="small" aria-expanded={open} onClick={() => setNotesOf(open ? null : { phraseId: p.phrase.id, note: null })} aria-label={`Notas de la frase ${i + 1}`}>
                  Notas
                </button>
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
              {open && (
                <div className="note-editor">
                  <div className="note-chips" role="group" aria-label={`Notas de la frase ${i + 1}`}>
                    {p.phrase.notes.map((note, k) => (
                      <button
                        key={k}
                        className={`note-chip ${sel === k ? 'selected' : ''}`}
                        aria-pressed={sel === k}
                        aria-label={`Nota ${k + 1}: ${solfegeName(note.midi)}${note.syllable.trim() ? `, «${note.syllable.trim()}»` : ''}`}
                        onClick={() => {
                          setNotesOf({ phraseId: p.phrase.id, note: k });
                          void audioEngine.playReference(note.midi, 0.5);
                        }}
                      >
                        <span>{note.syllable.trim() || '·'}</span>
                        <small>{solfegeName(note.midi)}</small>
                      </button>
                    ))}
                  </div>
                  {sel !== null && p.phrase.notes[sel] && (
                    <p className="version-buttons">
                      <button className="small" onClick={() => { apply((s) => shiftNote(s, p.phrase.id, sel, 1)); void audioEngine.playReference(p.phrase.notes[sel].midi + 1, 0.5); }}>Más aguda ↑</button>
                      <button className="small" onClick={() => { apply((s) => shiftNote(s, p.phrase.id, sel, -1)); void audioEngine.playReference(p.phrase.notes[sel].midi - 1, 0.5); }}>Más grave ↓</button>
                      {n > 1 && (
                        <button className="small link" onClick={() => { apply((s) => deleteNote(s, p.phrase.id, sel)); setNotesOf({ phraseId: p.phrase.id, note: null }); }}>Borrar nota</button>
                      )}
                    </p>
                  )}
                </div>
              )}
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
