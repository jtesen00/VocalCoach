import { createDetector, rmsDb } from '../pitch/detector';
import { frames as windows } from '../pitch/signals';
import { median, PitchTracker } from '../pitch/tracker';
import type { PitchFrame } from '../pitch/types';
import type { TimedChord } from '../music/chords';
import { recognizeChords } from './chord-recognition';
import { extractMelody, type MelodyFrame } from './melody-extraction';
import type { MelodyNote, Song, SongPhrase, SongSection } from './types';

/**
 * Transcripción de la melodía cantada a partir de un audio (spec §16, nivel local):
 * línea melódica principal (melody-extraction.ts, estilo Melodia: funciona con la mezcla
 * completa) → notas → frases → canción. `trackPitch` (detector monofónico de la app) se
 * conserva como referencia de comparación: solo sirve para voz sola.
 */

/** Parámetros para audio remuestreado a 16 kHz (ventana de 64 ms, salto de 16 ms). */
export const TRANSCRIBE_SAMPLE_RATE = 16000;
const WINDOW = 1024;
const HOP = 256;

export interface TranscribedNote {
  midi: number;
  startS: number;
  endS: number;
}

/** Detector monofónico (el del micrófono) sobre un audio: solo válido para voz sola. Referencia del benchmark. */
export function trackPitch(samples: Float32Array, sampleRate: number, onProgress?: (p: number) => void): PitchFrame[] {
  const detector = createDetector('mpm', { sampleRate, windowSize: WINDOW, minHz: 70, maxHz: 1100 });
  // Más exigente que en vivo: en una grabación hay instrumentos y reverberación.
  const tracker = new PitchTracker({ clarityOn: 0.9, clarityOff: 0.8, medianSize: 5 });
  const out: PitchFrame[] = [];
  const total = Math.max(1, Math.floor((samples.length - WINDOW) / HOP));
  let i = 0;
  for (const { frame, end } of windows(samples, WINDOW, HOP)) {
    // Se fecha en el centro de la ventana: es una transcripción, no tiempo real.
    out.push(tracker.push({ t: (end - WINDOW / 2) / sampleRate, levelDb: rmsDb(frame), ...detector.detect(frame) }));
    if (onProgress && ++i % 500 === 0) onProgress(i / total);
  }
  onProgress?.(1);
  return out;
}

export interface SegmentOptions {
  /** Duración mínima de una nota (s). */
  minNoteS: number;
  /** Cambio de altura (semitonos) que inicia una nota nueva. */
  splitSemitones: number;
  /** Frames seguidos con la altura cambiada para confirmar la nota nueva. */
  confirmFrames: number;
}

const DEFAULT_SEGMENT: SegmentOptions = { minNoteS: 0.1, splitSemitones: 0.6, confirmFrames: 3 };

/**
 * Desafinación global de la grabación en cents (p. ej. una referencia de 432 Hz),
 * para redondear a la nota correcta.
 */
export function tuningOffsetCents(frames: readonly PitchFrame[]): number {
  const dev = frames.filter((f) => f.voiced && f.midi !== null).map((f) => f.midi! - Math.round(f.midi!));
  if (dev.length < 20) return 0;
  // Media circular (−0,5..0,5 semitonos) para no partir la distribución en el borde.
  const s = dev.reduce((a, d) => a + Math.sin(2 * Math.PI * d), 0);
  const c = dev.reduce((a, d) => a + Math.cos(2 * Math.PI * d), 0);
  return (Math.atan2(s, c) / (2 * Math.PI)) * 100;
}

/** Pista de pitch → notas (altura en semitonos enteros, ya corregida la afinación). */
export function segmentNotes(frames: readonly PitchFrame[], options: Partial<SegmentOptions> = {}): TranscribedNote[] {
  const o = { ...DEFAULT_SEGMENT, ...options };
  const offset = tuningOffsetCents(frames) / 100;
  const hop = frames.length > 1 ? frames[1].t - frames[0].t : 0.016;
  const notes: TranscribedNote[] = [];
  let cur: { start: number; last: number; midis: number[] } | null = null;
  let pending: number[] = [];

  const close = () => {
    if (cur && cur.last - cur.start + hop >= o.minNoteS) {
      notes.push({ midi: Math.round(median(cur.midis) - offset), startS: cur.start, endS: cur.last + hop });
    }
    cur = null;
    pending = [];
  };

  for (const f of frames) {
    if (!f.voiced || f.midi === null) {
      close();
      continue;
    }
    if (!cur) {
      cur = { start: f.t, last: f.t, midis: [f.midi] };
      continue;
    }
    const center = median(cur.midis.slice(-15));
    if (Math.abs(f.midi - center) > o.splitSemitones) {
      pending.push(f.midi);
      if (pending.length >= o.confirmFrames) {
        const start = f.t - (pending.length - 1) * hop;
        const keep = pending;
        cur.last = start - hop;
        close();
        cur = { start, last: f.t, midis: keep };
      }
    } else {
      cur.midis.push(...pending, f.midi);
      pending = [];
      cur.last = f.t;
    }
  }
  close();
  return fixOctaveJumps(notes);
}

/** Nota corta a una octava de sus dos vecinas: error típico del detector, se corrige. */
function fixOctaveJumps(notes: TranscribedNote[]): TranscribedNote[] {
  return notes.map((n, i) => {
    const prev = notes[i - 1];
    const next = notes[i + 1];
    if (!prev || !next || n.endS - n.startS > 0.25) return n;
    for (const shift of [-12, 12]) {
      const m = n.midi + shift;
      if (Math.abs(m - prev.midi) <= 4 && Math.abs(m - next.midi) <= 4 && Math.abs(n.midi - prev.midi) >= 9) return { ...n, midi: m };
    }
    return n;
  });
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Tonalidad estimada (Krumhansl–Schmuckler), ponderando cada nota por su duración. */
export function estimateKey(notes: readonly TranscribedNote[]): Song['key'] {
  const hist = Array(12).fill(0);
  for (const n of notes) hist[((n.midi % 12) + 12) % 12] += n.endS - n.startS;
  let best = { tonic: 0, mode: 'mayor' as 'mayor' | 'menor', r: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['mayor', MAJOR], ['menor', MINOR]] as const) {
      const rotated = hist.map((_, i) => hist[(i + tonic) % 12]);
      const r = correlation(rotated, profile);
      if (r > best.r) best = { tonic, mode, r };
    }
  }
  // Tónica en la octava central (C4–B4) solo como referencia de nombre.
  return { tonic: 60 + best.tonic, mode: best.mode };
}

export interface ExtractionQuality {
  /** Fracción del audio analizado con voz principal detectada. */
  voicedRatio: number;
  /** Centrado estéreo medio de la voz detectada (1 en mono). */
  center: number;
  stereo: boolean;
  /** La melodía se extrajo de la voz separada con IA (Fase 8c). */
  separated: boolean;
  level: 'buena' | 'media' | 'baja';
}

export function extractionQuality(frames: readonly MelodyFrame[], stereo: boolean, separated = false): ExtractionQuality {
  const voiced = frames.filter((f) => f.midi !== null);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;
  const center = voiced.length ? voiced.reduce((a, f) => a + f.center, 0) / voiced.length : 0;
  // Pocas zonas con voz o una voz poco centrada suelen indicar que se siguió a un instrumento.
  // Con la voz separada, el centrado ya no informa: lo que queda es la voz.
  const centered = separated || !stereo || center >= 0.8;
  const level = voicedRatio >= 0.3 && centered ? 'buena' : voicedRatio >= 0.12 ? 'media' : 'baja';
  return { voicedRatio, center, stereo, separated, level };
}

export interface TranscribeOptions {
  onProgress?: (p: number) => void;
  /**
   * Voz separada de la mezcla (Fase 8c), a la misma frecuencia de muestreo. Si está, la
   * melodía se extrae de ella; los acordes, siempre de la mezcla.
   */
  vocals?: { left: Float32Array; right: Float32Array | null };
}

const isStereo = (left: Float32Array, right: Float32Array | null) => !!right && !left.every((v, i) => Math.abs(v - right[i]) < 1e-6);

/**
 * Audio → notas de la melodía cantada, con la extracción polifónica.
 * `right` = null para audio mono.
 */
export function transcribeAudio(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number,
  options: TranscribeOptions | ((p: number) => void) = {},
): { notes: TranscribedNote[]; chords: TimedChord[]; quality: ExtractionQuality } {
  const o = typeof options === 'function' ? { onProgress: options } : options;
  const src = o.vocals ?? { left, right };
  const line = extractMelody(src.left, src.right, sampleRate, { onProgress: (p) => o.onProgress?.(0.9 * p) });
  const frames: PitchFrame[] = line.map((f) => ({ t: f.t, f0: null, midi: f.midi, clarity: 1, levelDb: 0, voiced: f.midi !== null }));
  const notes = segmentNotes(frames);
  // Acordes del propio audio, con preferencia por los de la tonalidad de la melodía.
  const chords = recognizeChords(left, right, sampleRate, notes.length ? estimateKey(notes) : undefined);
  o.onProgress?.(1);
  return { notes, chords, quality: extractionQuality(line, isStereo(left, right), !!o.vocals) };
}

/** Limpieza de la línea melódica para que se pueda cantar y seguir (estilo karaoke). */
export function cleanNotes(input: readonly TranscribedNote[]): TranscribedNote[] {
  let notes = input.map((n) => ({ ...n }));
  // 1. Notas cortísimas (< 120 ms) pegadas a una vecina cercana en altura: son transiciones o
  //    adornos del detector; se funden con la vecina más larga.
  for (let pass = 0; pass < 2; pass++) {
    const out: TranscribedNote[] = [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const prev = out[out.length - 1];
      const next = notes[i + 1];
      const dur = n.endS - n.startS;
      if (dur < 0.12) {
        const nearPrev = prev && n.startS - prev.endS < 0.08 && Math.abs(prev.midi - n.midi) <= 2;
        const nearNext = next && next.startS - n.endS < 0.08 && Math.abs(next.midi - n.midi) <= 2;
        if (nearPrev && (!nearNext || prev.endS - prev.startS >= next.endS - next.startS)) {
          prev.endS = n.endS;
          continue;
        }
        if (nearNext) {
          next.startS = n.startS;
          continue;
        }
        if (dur < 0.08) continue; // fragmento aislado
      }
      out.push(n);
    }
    notes = out;
  }
  // 2. Saltos sueltos de más de una octava respecto a las dos vecinas: error de detección.
  notes = notes.filter((n, i) => {
    const p = notes[i - 1];
    const x = notes[i + 1];
    return !(p && x && Math.abs(n.midi - p.midi) > 12 && Math.abs(n.midi - x.midi) > 12 && n.endS - n.startS < 0.4);
  });
  // 3. Legato: los huecos breves entre notas (consonantes) se cierran alargando la nota anterior.
  for (let i = 0; i + 1 < notes.length; i++) {
    const gap = notes[i + 1].startS - notes[i].endS;
    if (gap > 0 && gap < 0.15) notes[i].endS = notes[i + 1].startS;
  }
  return notes;
}

export interface PhraseOptions {
  /** Duración ideal de una línea (s). */
  idealMinS: number;
  idealMaxS: number;
  /** Silencio que separa partes de la canción (instrumental): siempre corta. */
  sectionGapS: number;
  /** Máximo de frases por sección. */
  maxPhrasesPerSection: number;
}

const DEFAULT_PHRASES: PhraseOptions = { idealMinS: 4, idealMaxS: 9, sectionGapS: 2.5, maxPhrasesPerSection: 6 };

/** Coste de una línea según su duración: 0 en la franja ideal, cuadrático fuera. */
function lengthCost(d: number, o: PhraseOptions): number {
  if (d < o.idealMinS) return 2 * (o.idealMinS - d) ** 2;
  if (d > o.idealMaxS) return 2 * (d - o.idealMaxS) ** 2;
  return 0;
}

/** Premio por cortar en un silencio de `gap` s: mejor en respiraciones largas, muy mal en mitad de un legato. */
function boundaryCost(gap: number): number {
  if (gap < 0.12) return 6;
  return -3 * Math.min(gap, 1.5);
}

/**
 * Divide notas en líneas tipo karaoke con programación dinámica: elige los cortes que
 * dan frases de unos 4–9 s cortando en las respiraciones más largas. Los silencios largos
 * (partes instrumentales) siempre cortan y separan secciones.
 */
export function karaokeLines(notes: readonly TranscribedNote[], options: Partial<PhraseOptions> = {}): { lines: TranscribedNote[][]; sectionStarts: Set<number> } {
  const o = { ...DEFAULT_PHRASES, ...options };
  const blocks: TranscribedNote[][] = [];
  for (const n of notes) {
    const b = blocks[blocks.length - 1];
    if (b && n.startS - b[b.length - 1].endS < o.sectionGapS) b.push(n);
    else blocks.push([n]);
  }
  const lines: TranscribedNote[][] = [];
  const sectionStarts = new Set<number>();
  for (const b of blocks) {
    sectionStarts.add(lines.length);
    const n = b.length;
    const best = new Array<number>(n + 1).fill(Infinity);
    const from = new Array<number>(n + 1).fill(0);
    best[0] = 0;
    for (let j = 1; j <= n; j++) {
      for (let i = j - 1; i >= 0; i--) {
        const dur = b[j - 1].endS - b[i].startS;
        if (dur > 3 * o.idealMaxS) break;
        const gapAfter = j < n ? b[j].startS - b[j - 1].endS : 1.5;
        const c = best[i] + lengthCost(dur, o) + boundaryCost(gapAfter);
        if (c < best[j]) {
          best[j] = c;
          from[j] = i;
        }
      }
    }
    const cuts: number[] = [];
    for (let j = n; j > 0; j = from[j]) cuts.push(j);
    cuts.reverse();
    let i = 0;
    for (const j of cuts) {
      lines.push(b.slice(i, j));
      i = j;
    }
  }
  return { lines, sectionStarts };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Rótulo de una frase sin letra de una canción importada desde audio: "0:12 – 0:18". */
export const phraseTimeLabel = (startS: number, endS: number) => `${clock(startS)} – ${clock(endS)}`;

/**
 * Notas → canción con líneas tipo karaoke y, si se reconocieron, los acordes del audio.
 * Se usa 60 pulsos por minuto para que un pulso sea un segundo (no hace falta detectar el tempo).
 */
export function notesToSong(
  rawNotes: readonly TranscribedNote[],
  meta: { id: string; title: string },
  options: Partial<PhraseOptions> & { chords?: readonly TimedChord[] } = {},
): Song {
  const o = { ...DEFAULT_PHRASES, ...options };
  const notes = cleanNotes(rawNotes);
  const { lines, sectionStarts } = karaokeLines(notes, o);
  const kept = lines.filter((g) => g.length >= 3 && g.reduce((a, n) => a + n.endS - n.startS, 0) >= 0.8);

  const phrases: SongPhrase[] = kept.map((g, i) => {
    const origin = g[0].startS;
    const end = g[g.length - 1].endS;
    const chords = (options.chords ?? [])
      .filter((c) => c.endS > origin && c.startS < end)
      .map((c) => {
        const s0 = Math.max(c.startS, origin);
        const s1 = Math.min(c.endS, end);
        return { startBeat: s0 - origin, beats: s1 - s0, chord: c.chord };
      })
      .filter((c) => c.beats > 0.15);
    return {
      id: `p${i + 1}`,
      lyrics: phraseTimeLabel(origin, end),
      originS: origin,
      chords: chords.length ? chords : undefined,
      notes: g.map(
        (n, j): MelodyNote => ({
          midi: n.midi,
          beats: n.endS - n.startS,
          restBefore: j ? Math.max(0, n.startS - g[j - 1].endS) : 0,
          syllable: '',
        }),
      ),
    };
  });

  // Secciones: nuevas tras cada parte instrumental o cada `maxPhrasesPerSection` líneas.
  const sections: SongSection[] = [];
  kept.forEach((g, i) => {
    const lineIndex = lines.indexOf(g);
    const cur = sections[sections.length - 1];
    if (!cur || sectionStarts.has(lineIndex) || cur.phrases.length >= o.maxPhrasesPerSection) {
      sections.push({ name: `Parte ${sections.length + 1}`, phrases: [] });
    }
    sections[sections.length - 1].phrases.push(phrases[i]);
  });
  return {
    id: meta.id,
    title: meta.title,
    credit: 'Importada por ti · la melodía solo se guarda en este dispositivo · uso educativo personal',
    license: 'user-provided',
    bpm: 60,
    key: estimateKey(notes),
    sections,
  };
}
