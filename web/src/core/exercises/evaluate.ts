import { median } from '../pitch/tracker';
import type { PitchFrame } from '../pitch/types';
import { centsVsTarget, classifyCents, DEFAULT_ATTACK_MS, type OctaveMode, type Tolerance } from '../scoring/pitch-scoring';
import { analyseStability, type Vibrato } from './stability';
import type { ExerciseKind, ExercisePlan, PlanSegment } from './types';

export type NoteStatus = 'perfect' | 'close' | 'too_high' | 'too_low' | 'unstable' | 'no_voice';

export interface EvaluationOptions {
  tolerance: Tolerance;
  octaveMode: OctaveMode;
  /** Instante (reloj del AudioContext) en que empieza el canto. */
  startT: number;
  /** Retardo entre el sonido y el `t` del frame (latencia de entrada + media ventana). */
  latencyS?: number;
  attackMs?: number;
}

export interface NoteEvaluation {
  index: number;
  targetMidi: number;
  status: NoteStatus;
  /** 0..100 */
  score: number;
  /** Frames afinados / frames con voz evaluados (sin ataque). */
  accuracy: number | null;
  medianCents: number | null;
  stability: number | null;
  vibrato: Vibrato | null;
  /** Fracción del tramo evaluado con voz. */
  voicedRatio: number;
  /** Mediana del último tercio − mediana del primer tercio (cents). Negativo = la nota cae. */
  endDriftCents: number | null;
  inTuneFrames: number;
  evaluatedFrames: number;
}

export interface SirenEvaluation {
  /** Fracción de semitonos del recorrido visitados. */
  coverage: number;
  /** Fracción de pasos en la dirección esperada. */
  direction: number;
  breaks: number;
  longestGapMs: number;
  reachedLowMidi: number | null;
  reachedHighMidi: number | null;
  /** Desplazamiento de octava aplicado (modo "cualquier octava"). */
  octaveShift: number;
}

export interface IntervalEvaluation {
  targetCents: number;
  sungCents: number | null;
  errorCents: number | null;
}

export interface ExerciseEvaluation {
  kind: ExerciseKind;
  /** 0..100 */
  score: number;
  /** Accuracy global ponderada por frames (null en sirenas). */
  accuracy: number | null;
  passed: boolean;
  notes: NoteEvaluation[];
  siren: SirenEvaluation | null;
  interval: IntervalEvaluation | null;
}

/** Umbral de superación (docs/planning/PLAN.md §2, punto 4). */
export const PASS_ACCURACY = 0.8;
/** Por debajo de esta estabilidad (y sin vibrato) la nota se marca como inestable. */
const UNSTABLE_BELOW = 0.35;
/** Por debajo de esta fracción de voz el tramo cuenta como "sin voz". */
const NO_VOICE_BELOW = 0.3;
/** Silencio mínimo dentro de una sirena para contar como corte. */
const SIREN_BREAK_MS = 150;

interface TimedFrame {
  rel: number;
  frame: PitchFrame;
}

function toRelative(frames: readonly PitchFrame[], opts: EvaluationOptions): TimedFrame[] {
  const offset = opts.startT + (opts.latencyS ?? 0);
  return frames.map((frame) => ({ rel: frame.t - offset, frame }));
}

function estimateFrameRate(frames: readonly TimedFrame[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].rel - frames[i - 1].rel;
    if (d > 0) diffs.push(d);
  }
  return diffs.length ? 1 / median(diffs) : 94;
}

function evaluateNote(index: number, seg: PlanSegment, frames: readonly TimedFrame[], frameRate: number, opts: EvaluationOptions): NoteEvaluation {
  const attackS = (opts.attackMs ?? DEFAULT_ATTACK_MS) / 1000;
  // Se evalúa desde el ataque hasta el final del tramo (el ataque cubre la transición entre notas).
  const from = seg.startS + Math.min(attackS, (seg.endS - seg.startS) / 2);
  const window = frames.filter((f) => f.rel >= from && f.rel < seg.endS);
  const cents = window
    .filter((f) => f.frame.voiced && f.frame.midi !== null)
    .map((f) => centsVsTarget(f.frame.midi!, seg.fromMidi, opts.octaveMode));
  const voicedRatio = window.length ? cents.length / window.length : 0;
  const inTune = cents.filter((c) => Math.abs(c) <= opts.tolerance.toleranceCents).length;

  const base = { index, targetMidi: seg.fromMidi, voicedRatio, inTuneFrames: inTune, evaluatedFrames: cents.length };
  if (voicedRatio < NO_VOICE_BELOW || cents.length === 0) {
    return { ...base, status: 'no_voice', score: 0, accuracy: null, medianCents: null, stability: null, vibrato: null, endDriftCents: null };
  }

  const accuracy = inTune / cents.length;
  const medianCents = median(cents);
  const stab = analyseStability(cents, frameRate);
  const third = Math.floor(cents.length / 3);
  const endDriftCents = third >= 5 ? median(cents.slice(-third)) - median(cents.slice(0, third)) : null;

  let status: NoteStatus;
  if (stab && !stab.vibrato && stab.stability < UNSTABLE_BELOW) status = 'unstable';
  else status = classifyCents(medianCents, opts.tolerance) as NoteStatus;

  const coverage = Math.min(1, voicedRatio / 0.6);
  const score = Math.round(100 * coverage * (0.75 * accuracy + 0.25 * (stab?.stability ?? accuracy)));
  return { ...base, status, score, accuracy, medianCents, stability: stab?.stability ?? null, vibrato: stab?.vibrato ?? null, endDriftCents };
}

function evaluateSiren(plan: ExercisePlan, frames: readonly TimedFrame[], opts: EvaluationOptions): SirenEvaluation {
  const inWindow = frames.filter((f) => f.rel >= 0 && f.rel <= plan.durationS + 0.3);
  const voiced = inWindow.filter((f) => f.frame.voiced && f.frame.midi !== null);
  const lo = Math.min(...plan.segments.map((s) => Math.min(s.fromMidi, s.toMidi)));
  const hi = Math.max(...plan.segments.map((s) => Math.max(s.fromMidi, s.toMidi)));

  if (voiced.length === 0) {
    return { coverage: 0, direction: 0, breaks: 0, longestGapMs: 0, reachedLowMidi: null, reachedHighMidi: null, octaveShift: 0 };
  }

  // En "cualquier octava" se desplaza la voz a la octava del recorrido.
  let shift = 0;
  if (opts.octaveMode === 'pitch-class') {
    const m = median(voiced.map((f) => f.frame.midi!));
    shift = -12 * Math.round((m - (lo + hi) / 2) / 12);
  }
  const midis = voiced.map((f) => f.frame.midi! + shift);

  const visited = new Set(midis.map((m) => Math.round(m)).filter((m) => m >= lo && m <= hi));
  const coverage = visited.size / (hi - lo + 1);

  // Dirección: pendiente de la voz suavizada frente a la del tramo de la guía.
  let agree = 0;
  let considered = 0;
  for (let i = 3; i < voiced.length; i++) {
    const seg = plan.segments.find((s) => voiced[i].rel >= s.startS && voiced[i].rel < s.endS);
    if (!seg || seg.toMidi === seg.fromMidi) continue;
    const step = midis[i] - midis[i - 3];
    if (Math.abs(step) < 0.05) continue;
    considered++;
    if (Math.sign(step) === Math.sign(seg.toMidi - seg.fromMidi)) agree++;
  }

  // Cortes: silencios dentro de la sirena (entre el primer y el último frame con voz).
  let breaks = 0;
  let longestGap = 0;
  for (let i = 1; i < voiced.length; i++) {
    const gap = voiced[i].rel - voiced[i - 1].rel;
    longestGap = Math.max(longestGap, gap);
    if (gap * 1000 >= SIREN_BREAK_MS) breaks++;
  }

  return {
    coverage,
    direction: considered ? agree / considered : 0,
    breaks,
    longestGapMs: Math.round(longestGap * 1000),
    reachedLowMidi: Math.min(...midis),
    reachedHighMidi: Math.max(...midis),
    octaveShift: shift,
  };
}

export function sirenScore(s: SirenEvaluation): number {
  const continuity = Math.max(0, 1 - 0.25 * s.breaks);
  return Math.round(100 * (0.5 * s.coverage + 0.3 * s.direction + 0.2 * continuity));
}

export function sirenPassed(s: SirenEvaluation): boolean {
  return s.coverage >= 0.8 && s.direction >= 0.7 && s.breaks <= 1;
}

/**
 * Evalúa un intento completo. Función pura: recibe los frames del motor de pitch
 * (con `t` en el reloj del AudioContext) y el plan del ejercicio.
 */
export function evaluateExercise(plan: ExercisePlan, frames: readonly PitchFrame[], opts: EvaluationOptions): ExerciseEvaluation {
  const timed = toRelative(frames, opts);
  const kind = plan.def.kind;

  if (kind === 'siren') {
    const siren = evaluateSiren(plan, timed, opts);
    return { kind, score: sirenScore(siren), accuracy: null, passed: sirenPassed(siren), notes: [], siren, interval: null };
  }

  const frameRate = estimateFrameRate(timed);
  const notes = plan.segments.map((seg, i) => evaluateNote(i, seg, timed, frameRate, opts));
  const inTune = notes.reduce((a, n) => a + n.inTuneFrames, 0);
  const evaluated = notes.reduce((a, n) => a + n.evaluatedFrames, 0);
  const accuracy = evaluated ? inTune / evaluated : null;
  const score = Math.round(notes.reduce((a, n) => a + n.score, 0) / notes.length);
  const passed = accuracy !== null && accuracy >= PASS_ACCURACY && notes.every((n) => n.status !== 'no_voice');

  let interval: IntervalEvaluation | null = null;
  if (kind === 'interval' && notes.length === 2) {
    const targetCents = (notes[1].targetMidi - notes[0].targetMidi) * 100;
    const [a, b] = notes;
    let sung: number | null = null;
    if (a.medianCents !== null && b.medianCents !== null) {
      sung = targetCents + b.medianCents - a.medianCents;
    }
    interval = { targetCents, sungCents: sung, errorCents: sung === null ? null : sung - targetCents };
  }

  return { kind, score, accuracy, passed, notes, siren: null, interval };
}
