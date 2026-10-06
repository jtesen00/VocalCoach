import { useState } from 'react';
import { SONGS } from '../../core/songs/catalog';
import { songDifficulty } from '../../core/songs/difficulty';
import { allPhrases } from '../../core/songs/melody';
import type { Song } from '../../core/songs/types';
import { profileStore } from '../../shared/profile-store';
import type { Settings } from '../../shared/settings';
import { importedSongsStore } from '../../shared/imported-songs';
import { practiceTranspose, setSongVersion, songStore } from '../../shared/song-store';
import { ImportSong } from './ImportSong';
import { PhrasePractice } from './PhrasePractice';
import { SongOverview } from './SongOverview';
import { TrainingFlow } from './TrainingFlow';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onMeasure: () => void;
}

type View =
  | { kind: 'list' }
  | { kind: 'song'; id: string }
  | { kind: 'phrase'; id: string; index: number; transpose: number }
  | { kind: 'training'; id: string; index: number; transpose: number };

export function SongsPage({ settings, updateSettings, onMeasure }: Props) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const imported = importedSongsStore.use().songs;
  const songs = [...SONGS, ...imported];
  const profile = profileStore.use();
  songStore.use();
  const song = view.kind === 'list' ? null : songs.find((s) => s.id === view.id) ?? null;
  /** Al empezar a practicar se fija la versión: lo aprendido afecta a la próxima recomendación, no a la práctica en curso. */
  const practise = (s: Song, kind: 'phrase' | 'training', index: number) => {
    const transpose = practiceTranspose(s);
    setSongVersion(s.id, transpose);
    setView({ kind, id: s.id, index, transpose });
  };

  if (song && view.kind === 'song') {
    return (
      <SongOverview
        song={song}
        settings={settings}
        onPhrase={(index) => practise(song, 'phrase', index)}
        onTrain={(index) => practise(song, 'training', index)}
        onMeasure={onMeasure}
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }
  if (song && view.kind === 'phrase') {
    const count = allPhrases(song).length;
    return (
      <PhrasePractice
        key={`${song.id}-${view.index}`}
        song={song}
        phraseIndex={view.index}
        transpose={view.transpose}
        tempo={1}
        settings={settings}
        onBack={() => setView({ kind: 'song', id: song.id })}
        onTrain={() => setView({ ...view, kind: 'training' })}
        onNext={view.index + 1 < count ? () => setView({ ...view, index: view.index + 1 }) : undefined}
      />
    );
  }
  if (song && view.kind === 'training') {
    return (
      <TrainingFlow
        key={`${song.id}-${view.index}`}
        song={song}
        phraseIndex={view.index}
        transpose={view.transpose}
        settings={settings}
        updateSettings={updateSettings}
        onBack={() => setView({ kind: 'song', id: song.id })}
      />
    );
  }

  return (
    <section className="songs" aria-label="Canciones">
      <h2>Canciones</h2>
      <p className="hint">Elige una canción: te diremos en qué tono te queda mejor, dónde te cuesta y cómo entrenarlo.</p>
      {!settings.range && (
        <p className="notice">
          Para adaptar las canciones a tu voz, <button className="link" onClick={onMeasure}>mide tu voz</button> primero (1 minuto).
        </p>
      )}
      <ul className="exercise-list song-list">
        {SONGS.map((s) => {
          const d = songDifficulty(s, practiceTranspose(s), profile);
          return (
            <li key={s.id}>
              <div className="exercise-body">
                <h3>{s.title}</h3>
                <p className="exercise-summary hint">{s.credit}</p>
                <p className="exercise-meta">{allPhrases(s).length} frases · Para tu voz: <strong>{d.overall}</strong></p>
              </div>
              <button onClick={() => setView({ kind: 'song', id: s.id })} aria-label={`Abrir ${s.title}`}>Practicar</button>
            </li>
          );
        })}
      </ul>
      <ImportSong onOpen={(id) => setView({ kind: 'song', id })} />
    </section>
  );
}
