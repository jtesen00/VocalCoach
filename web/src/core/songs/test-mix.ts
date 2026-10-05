import { midiToFreq } from '../music/notes';
import { rng } from '../pitch/signals';

/**
 * Mezcla sintética "de canción" para medir la extracción de melodía con verdad conocida:
 * voz principal centrada (armónicos de voz, vibrato, ataques y pequeñas pausas entre sílabas),
 * piano a la izquierda, guitarra arpegiada a la derecha (en el MISMO registro que la voz),
 * bajo y batería al centro. Determinista (semilla).
 */

export interface TruthNote {
  midi: number;
  startS: number;
  endS: number;
}

export interface MixOptions {
  sampleRate?: number;
  /** Relación voz / acompañamiento en dB (0 = mismo nivel). */
  vocalDb?: number;
  /** false = mezcla en mono (sin información estéreo). */
  stereo?: boolean;
  seed?: number;
  /** Amplitud del vibrato en semitonos (0 = voz recta, típica del pop). */
  vibrato?: number;
  /** Transposición de la voz en semitonos (−12 = voz masculina grave). */
  transpose?: number;
  /** Multiplicador de la duración de las notas (0,6 = más rápido). */
  speed?: number;
}

export interface Mix {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  melody: TruthNote[];
  /** Altura real de la voz en el instante t (null si no canta). */
  truthAt: (t: number) => number | null;
}

/** Melodía de prueba: dos frases (estrofa media, estribillo más agudo con un salto). */
export const TEST_MELODY: [number, number][][] = [
  [[64, 0.45], [64, 0.45], [62, 0.45], [60, 0.45], [62, 0.45], [64, 0.45], [67, 1.2]],
  [[69, 0.45], [72, 0.45], [72, 0.45], [71, 0.45], [69, 0.45], [67, 0.45], [69, 1.4]],
];

// Progresión La menor – Fa – Do – Sol, 2 s por acorde (graves y medios, en el registro de la voz).
const CHORDS = [
  [45, [57, 60, 64]],
  [41, [53, 57, 60]],
  [48, [55, 60, 64]],
  [43, [55, 59, 62]],
] as const;

export function makeMix(options: MixOptions = {}): Mix {
  const sr = options.sampleRate ?? 22050;
  const stereo = options.stereo ?? true;
  const random = rng(options.seed ?? 3);
  const vocalGain = 10 ** ((options.vocalDb ?? 0) / 20);

  // Línea de la voz: 0,8 s de intro instrumental, frases separadas por 0,7 s.
  const melody: TruthNote[] = [];
  let t = 0.8;
  for (const phrase of TEST_MELODY) {
    for (const [midi, d0] of phrase) {
      const d = d0 * (options.speed ?? 1);
      melody.push({ midi: midi + (options.transpose ?? 0), startS: t, endS: t + d - 0.04 }); // pausa breve entre sílabas
      t += d;
    }
    t += 0.7;
  }
  const total = t + 0.6;
  const n = Math.round(total * sr);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const add = (i: number, v: number, pan: number) => {
    // pan: −1 izquierda … 0 centro … 1 derecha (ley de potencia constante simplificada)
    left[i] += v * (stereo ? Math.min(1, 1 - pan) : 1);
    right[i] += v * (stereo ? Math.min(1, 1 + pan) : 1);
  };

  // Voz: armónicos de vocal "a", vibrato de 5,5 Hz (±35 c) tras 0,2 s, envolvente de ataque.
  const VOICE = [1, 0.7, 0.55, 0.5, 0.35, 0.25, 0.22, 0.15, 0.12, 0.08];
  for (const note of melody) {
    let phase = 0;
    const i0 = Math.round(note.startS * sr);
    const i1 = Math.round(note.endS * sr);
    for (let i = i0; i < i1; i++) {
      const tt = (i - i0) / sr;
      const vib = tt > 0.2 ? (options.vibrato ?? 0.35) * Math.sin(2 * Math.PI * 5.5 * tt) : 0;
      phase += (2 * Math.PI * midiToFreq(note.midi + vib)) / sr;
      const env = Math.min(1, tt / 0.04) * Math.min(1, (i1 - i) / (0.03 * sr));
      let v = 0;
      for (let h = 0; h < VOICE.length; h++) v += VOICE[h] * Math.sin((h + 1) * phase);
      add(i, 0.09 * vocalGain * env * v, 0);
    }
  }

  // Piano (izquierda) y guitarra arpegiada (derecha), con caída exponencial.
  const pluck = (midi: number, start: number, dur: number, gain: number, pan: number, decay: number) => {
    const f = midiToFreq(midi);
    const i0 = Math.round(start * sr);
    const i1 = Math.min(n, Math.round((start + dur) * sr));
    for (let i = i0; i < i1; i++) {
      const tt = (i - i0) / sr;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * tt) / h ** 1.3;
      add(i, gain * Math.exp(-tt * decay) * Math.min(1, tt / 0.005) * v, pan);
    }
  };
  for (let c = 0; c * 2 < total; c++) {
    const [bass, triad] = CHORDS[c % CHORDS.length];
    const start = c * 2;
    for (const m of triad) pluck(m, start, 2, 0.07, -0.7, 1.2);
    for (let k = 0; k < 8; k++) pluck(triad[k % 3] + 12 * (k % 2), start + k * 0.25, 0.5, 0.06, 0.7, 4);
    // Bajo (centro): dos notas por compás.
    for (let k = 0; k < 2; k++) pluck(bass - 12, start + k, 1, 0.12, 0, 1.5);
    // Batería (centro): bombo y caja como ráfagas; charles a los lados.
    for (let k = 0; k < 4; k++) {
      const i0 = Math.round((start + k * 0.5) * sr);
      for (let i = i0; i < Math.min(n, i0 + 0.12 * sr); i++) {
        const tt = (i - i0) / sr;
        const kick = Math.sin(2 * Math.PI * 55 * tt) * Math.exp(-tt * 30) * (k % 2 === 0 ? 0.25 : 0);
        const snare = (random() * 2 - 1) * Math.exp(-tt * 25) * (k % 2 === 1 ? 0.12 : 0);
        add(i, kick + snare, 0);
        add(i, (random() * 2 - 1) * 0.03 * Math.exp(-tt * 60), k % 2 ? 0.5 : -0.5);
      }
    }
  }

  const truthAt = (time: number) => melody.find((m) => time >= m.startS && time < m.endS)?.midi ?? null;
  return { left, right, sampleRate: sr, melody, truthAt };
}

export interface ExtractionScore {
  /** % de frames con voz real en los que la altura estimada está a < 50 c (Raw Pitch Accuracy). */
  rawPitchAccuracy: number;
  /** % de frames con voz real que se marcaron como voz. */
  voicingRecall: number;
  /** % de frames sin voz real que se marcaron como voz (falsos positivos). */
  voicingFalseAlarm: number;
  /** % de notas reales recuperadas (misma nota y comienzo a < 150 ms). */
  noteRecall: number;
}

/**
 * Métricas de extracción de melodía (estilo MIREX), ignorando ±`collarS` alrededor de cada
 * comienzo y final de nota: la ventana de análisis (93 ms) emborrona los bordes, y eso no es
 * un error para practicar (como el margen de comienzo en la evaluación de transcripción).
 */
export function scoreExtraction(
  frames: readonly { t: number; midi: number | null }[],
  notes: readonly TruthNote[],
  mix: Pick<Mix, 'truthAt' | 'melody'>,
  collarS = 0.05,
): ExtractionScore {
  let voiced = 0, correct = 0, recalled = 0, unvoiced = 0, false_ = 0;
  const nearEdge = (t: number) => mix.melody.some((m) => Math.abs(t - m.startS) < collarS || Math.abs(t - m.endS) < collarS);
  for (const f of frames) {
    if (nearEdge(f.t)) continue;
    const truth = mix.truthAt(f.t);
    if (truth === null) {
      unvoiced++;
      if (f.midi !== null) false_++;
    } else {
      voiced++;
      if (f.midi !== null) {
        recalled++;
        if (Math.abs(f.midi - truth) < 0.5) correct++;
      }
    }
  }
  const found = mix.melody.filter((m) => notes.some((n) => n.midi === m.midi && Math.abs(n.startS - m.startS) < 0.15)).length;
  return {
    rawPitchAccuracy: voiced ? correct / voiced : 0,
    voicingRecall: voiced ? recalled / voiced : 0,
    voicingFalseAlarm: unvoiced ? false_ / unvoiced : 0,
    noteRecall: found / mix.melody.length,
  };
}
