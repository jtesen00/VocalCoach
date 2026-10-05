/**
 * Modelo de canción como datos musicales, independiente de cualquier grabación.
 * Solo se incluyen las entidades necesarias para el MVP (ver ADR-010).
 */

/** Nota de la melodía. `beats` es la duración; `restBefore`, el silencio previo (en pulsos). */
export interface MelodyNote {
  midi: number;
  beats: number;
  restBefore?: number;
  /** Sílaba de la letra que se canta en esta nota. */
  syllable: string;
}

export interface SongPhrase {
  id: string;
  /** Letra completa de la frase, para mostrarla. */
  lyrics: string;
  notes: MelodyNote[];
}

export interface SongSection {
  name: string;
  phrases: SongPhrase[];
}

/** `user-provided`: melodía extraída de un archivo del usuario; solo existe en su dispositivo. */
export type ContentLicense = 'public-domain' | 'traditional' | 'original' | 'user-provided';

export interface Song {
  id: string;
  title: string;
  /** Autoría o procedencia, siempre visible. */
  credit: string;
  license: ContentLicense;
  bpm: number;
  /** Tonalidad original (para el modo con detalles técnicos). */
  key: { tonic: number; mode: 'mayor' | 'menor' };
  sections: SongSection[];
  /** Solo en canciones importadas: cómo fue la extracción de la melodía. */
  extraction?: { quality: 'buena' | 'media' | 'baja'; stereo: boolean; fromS: number; toS: number };
}

/** Referencia a una frase con su posición en la canción. */
export interface PhraseRef {
  song: Song;
  section: SongSection;
  phrase: SongPhrase;
  /** Posición global (0..n-1) de la frase en la canción. */
  index: number;
}
