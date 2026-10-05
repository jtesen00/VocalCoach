import { createDetector, rmsDb } from '../pitch/detector';
import { frames as windows } from '../pitch/signals';
import { median, PitchTracker } from '../pitch/tracker';
import type { PitchFrame } from '../pitch/types';
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
  level: 'buena' | 'media' | 'baja';
}

export function extractionQuality(frames: readonly MelodyFrame[], stereo: boolean): ExtractionQuality {
  const voiced = frames.filter((f) => f.midi !== null);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;
  const center = voiced.length ? voiced.reduce((a, f) => a + f.center, 0) / voiced.length : 0;
  // Pocas zonas con voz o una voz poco centrada suelen indicar que se siguió a un instrumento.
  const level = voicedRatio >= 0.3 && (!stereo || center >= 0.8) ? 'buena' : voicedRatio >= 0.12 ? 'media' : 'baja';
  return { voicedRatio, center, stereo, level };
}

/**
 * Audio → notas de la melodía cantada, con la extracción polifónica.
 * `right` = null para audio mono.
 */
export function transcribeAudio(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number,
  onProgress?: (p: number) => void,
): { notes: TranscribedNote[]; quality: ExtractionQuality } {
  const line = extractMelody(left, right, sampleRate, { onProgress });
  const stereo = !!right && !left.every((v, i) => Math.abs(v - right[i]) < 1e-6);
  const frames: PitchFrame[] = line.map((f) => ({ t: f.t, f0: null, midi: f.midi, clarity: 1, levelDb: 0, voiced: f.midi !== null }));
  return { notes: segmentNotes(frames), quality: extractionQuality(line, stereo) };
}

export interface PhraseOptions {
  /** Silencio que separa frases (s). */
  phraseGapS: number;
  /** Duración máxima de una frase (s): las más largas se parten por su mayor silencio. */
  maxPhraseS: number;
  /** Frases por sección. */
  phrasesPerSection: number;
}

const DEFAULT_PHRASES: PhraseOptions = { phraseGapS: 0.45, maxPhraseS: 9, phrasesPerSection: 4 };

/** Una frase más corta que esto (o con menos de 3 notas) se une a la vecina si están cerca. */
const MIN_PHRASE_S = 1.5;
const MERGE_GAP_S = 1.2;

/** Une frases demasiado cortas con la anterior o la siguiente (respiraciones breves). */
function mergeShort(groups: TranscribedNote[][]): TranscribedNote[][] {
  const out: TranscribedNote[][] = [];
  const dur = (g: TranscribedNote[]) => g[g.length - 1].endS - g[0].startS;
  for (const g of groups) {
    const prev = out[out.length - 1];
    const short = (x: TranscribedNote[]) => dur(x) < MIN_PHRASE_S || x.length < 3;
    if (prev && (short(g) || short(prev)) && g[0].startS - prev[prev.length - 1].endS < MERGE_GAP_S) prev.push(...g);
    else out.push([...g]);
  }
  return out;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function splitLong(group: TranscribedNote[], maxS: number): TranscribedNote[][] {
  const dur = group[group.length - 1].endS - group[0].startS;
  if (dur <= maxS || group.length < 4) return [group];
  let cut = 1;
  let gap = -1;
  for (let i = 1; i < group.length; i++) {
    const g = group[i].startS - group[i - 1].endS;
    if (g > gap && i >= 2 && group.length - i >= 2) {
      gap = g;
      cut = i;
    }
  }
  return [...splitLong(group.slice(0, cut), maxS), ...splitLong(group.slice(cut), maxS)];
}

/**
 * Notas → canción: frases separadas por silencios, secciones de N frases.
 * Se usa 60 pulsos por minuto para que un pulso sea un segundo (no hace falta detectar el tempo).
 */
export function notesToSong(notes: readonly TranscribedNote[], meta: { id: string; title: string }, options: Partial<PhraseOptions> = {}): Song {
  const o = { ...DEFAULT_PHRASES, ...options };
  const groups: TranscribedNote[][] = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && n.startS - g[g.length - 1].endS < o.phraseGapS) g.push(n);
    else groups.push([n]);
  }
  const phrases: SongPhrase[] = mergeShort(groups)
    .flatMap((g) => splitLong(g, o.maxPhraseS))
    .filter((g) => g.length >= 3 && g.reduce((a, n) => a + n.endS - n.startS, 0) >= 0.8)
    .map((g, i) => ({
      id: `p${i + 1}`,
      lyrics: `${clock(g[0].startS)} – ${clock(g[g.length - 1].endS)}`,
      notes: g.map(
        (n, j): MelodyNote => ({
          midi: n.midi,
          beats: n.endS - n.startS,
          restBefore: j ? Math.max(0, n.startS - g[j - 1].endS) : 0,
          syllable: '',
        }),
      ),
    }));

  const sections: SongSection[] = [];
  for (let i = 0; i < phrases.length; i += o.phrasesPerSection) {
    sections.push({ name: `Parte ${sections.length + 1}`, phrases: phrases.slice(i, i + o.phrasesPerSection) });
  }
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
