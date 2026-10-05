import type { ExerciseEvaluation } from '../exercises/evaluate';
import type { VocalRange } from '../range/vocal-range';
import { diagnose, POSITIVE, type DiagnosisId } from '../teacher/diagnose';
import type { OctaveMode } from '../scoring/pitch-scoring';

/** Estadística acumulada de una nota objetivo (MIDI entero). */
export interface NoteStat {
  /** Intentos distintos (ejercicios o frases) en los que apareció la nota. */
  seen: number;
  /** Apariciones (una frase puede repetir la nota). */
  attempts: number;
  accuracySum: number;
  stabilitySum: number;
  stabilityN: number;
}

/** Estadística de un salto (en semitonos, con signo): ¿se acertó la nota de llegada? */
export interface IntervalStat {
  attempts: number;
  hits: number;
}

/**
 * Perfil vocal dinámico (spec §4). Se aprende intento a intento: nunca se decide
 * el rango por una nota aislada. Serializable (se guarda en local).
 */
export interface VocalProfile {
  version: 1;
  /** Medición de "Mi voz": primera estimación de la zona cómoda. */
  calibrated: VocalRange | null;
  /** Extremos que la voz ha producido alguna vez (sin juzgar la calidad). */
  detectedLow: number | null;
  detectedHigh: number | null;
  notes: Record<string, NoteStat>;
  intervals: Record<string, IntervalStat>;
  errors: Partial<Record<DiagnosisId, number>>;
  attempts: number;
}

export interface ProfileRanges {
  /** Notas que tu voz ha producido alguna vez. */
  detected: VocalRange | null;
  /** Notas que aciertas a menudo (≥ 60 %). */
  reliable: VocalRange | null;
  /** Notas que cantas afinadas y estables (≥ 80 %), o la medición inicial si aún no hay datos. */
  comfortable: VocalRange | null;
}

/** Peso del conocimiento previo frente a los datos (en "intentos equivalentes"). */
const PRIOR_WEIGHT = 2;
const COMFORT_ACCURACY = 0.8;
const RELIABLE_ACCURACY = 0.6;

export function emptyProfile(): VocalProfile {
  return { version: 1, calibrated: null, detectedLow: null, detectedHigh: null, notes: {}, intervals: {}, errors: {}, attempts: 0 };
}

function widen(p: VocalProfile, midi: number): Pick<VocalProfile, 'detectedLow' | 'detectedHigh'> {
  return {
    detectedLow: p.detectedLow === null ? midi : Math.min(p.detectedLow, midi),
    detectedHigh: p.detectedHigh === null ? midi : Math.max(p.detectedHigh, midi),
  };
}

export function recordCalibration(p: VocalProfile, range: VocalRange): VocalProfile {
  const a = { ...p, ...widen(p, range.lowMidi) };
  return { ...a, ...widen(a, range.highMidi), calibrated: range };
}

/** Incorpora un intento (ejercicio o frase de canción). Inmutable. */
export function recordEvaluation(p: VocalProfile, e: ExerciseEvaluation, octaveMode: OctaveMode): VocalProfile {
  let next: VocalProfile = { ...p, notes: { ...p.notes }, intervals: { ...p.intervals }, errors: { ...p.errors }, attempts: p.attempts + 1 };

  if (e.siren) {
    if (e.siren.reachedLowMidi !== null && e.siren.reachedHighMidi !== null) {
      next = { ...next, ...widen(next, Math.round(e.siren.reachedLowMidi - e.siren.octaveShift)) };
      next = { ...next, ...widen(next, Math.round(e.siren.reachedHighMidi - e.siren.octaveShift)) };
    }
  }

  const seen = new Set<string>();
  e.notes.forEach((n, i) => {
    if (n.accuracy === null || n.medianCents === null) return;
    const key = String(Math.round(n.targetMidi));
    const s = next.notes[key] ?? { seen: 0, attempts: 0, accuracySum: 0, stabilitySum: 0, stabilityN: 0 };
    next.notes[key] = {
      seen: s.seen + (seen.has(key) ? 0 : 1),
      attempts: s.attempts + 1,
      accuracySum: s.accuracySum + n.accuracy,
      stabilitySum: s.stabilitySum + (n.stability ?? 0),
      stabilityN: s.stabilityN + (n.stability === null ? 0 : 1),
    };
    seen.add(key);
    // La voz produjo esta altura (aunque no fuera la pedida).
    if (Math.abs(n.medianCents) <= 300 || octaveMode === 'exact') {
      next = { ...next, ...widen(next, Math.round(n.targetMidi + n.medianCents / 100)) };
    }
    const prev = e.notes[i - 1];
    if (prev && prev.accuracy !== null) {
      const d = Math.round(n.targetMidi - prev.targetMidi);
      if (d !== 0) {
        const k = String(d);
        const st = next.intervals[k] ?? { attempts: 0, hits: 0 };
        next.intervals[k] = { attempts: st.attempts + 1, hits: st.hits + (n.accuracy >= RELIABLE_ACCURACY ? 1 : 0) };
      }
    }
  });

  for (const d of diagnose(e, octaveMode)) {
    if (!POSITIVE.has(d.id) && d.id !== 'almost') next.errors[d.id] = (next.errors[d.id] ?? 0) + 1;
  }
  return next;
}

function meanAccuracy(s: NoteStat | undefined): number | null {
  return s && s.attempts ? s.accuracySum / s.attempts : null;
}

/** Rangos detectado, fiable y cómodo (spec §4). */
export function profileRanges(p: VocalProfile): ProfileRanges {
  const detected = p.detectedLow !== null && p.detectedHigh !== null ? { lowMidi: p.detectedLow, highMidi: p.detectedHigh } : null;
  const stats = Object.entries(p.notes).map(([k, s]) => ({ midi: Number(k), acc: meanAccuracy(s)!, stab: s.stabilityN ? s.stabilitySum / s.stabilityN : 0, n: s.seen }));
  const good = stats.filter((s) => s.n >= 2 && s.acc >= COMFORT_ACCURACY && s.stab >= 0.6).map((s) => s.midi);

  let comfortable: VocalRange | null = p.calibrated ? { ...p.calibrated } : good.length ? { lowMidi: Math.min(...good), highMidi: Math.max(...good) } : null;
  if (comfortable) {
    // Se amplía hacia notas que se cantan bien de forma repetida…
    const above = good.filter((m) => m > comfortable!.highMidi);
    const below = good.filter((m) => m < comfortable!.lowMidi);
    if (above.length) comfortable.highMidi = Math.max(...above);
    if (below.length) comfortable.lowMidi = Math.min(...below);
    // …y se recorta en los bordes que fallan una y otra vez.
    const bad = (m: number) => {
      const s = p.notes[String(m)];
      return !!s && s.seen >= 3 && meanAccuracy(s)! < 0.5;
    };
    while (comfortable.highMidi - comfortable.lowMidi > 4 && bad(comfortable.highMidi)) comfortable.highMidi--;
    while (comfortable.highMidi - comfortable.lowMidi > 4 && bad(comfortable.lowMidi)) comfortable.lowMidi++;
  }

  const ok = stats.filter((s) => s.acc >= RELIABLE_ACCURACY).map((s) => s.midi);
  let reliable: VocalRange | null = comfortable ? { ...comfortable } : null;
  if (ok.length) {
    reliable = {
      lowMidi: Math.min(reliable?.lowMidi ?? Infinity, ...ok),
      highMidi: Math.max(reliable?.highMidi ?? -Infinity, ...ok),
    };
  }
  return { detected, reliable, comfortable };
}

/** Probabilidad a priori de acertar una nota según la zona en que cae (sin datos de esa nota). */
export function zonePrior(midi: number, r: ProfileRanges): number {
  const inside = (x: VocalRange | null) => !!x && midi >= x.lowMidi && midi <= x.highMidi;
  if (inside(r.comfortable)) return 0.85;
  if (inside(r.reliable)) return 0.65;
  if (inside(r.detected)) return 0.4;
  const ref = r.detected ?? r.reliable ?? r.comfortable;
  if (!ref) return 0.6; // sin información: neutral
  const out = midi > ref.highMidi ? midi - ref.highMidi : ref.lowMidi - midi;
  return Math.max(0.02, 0.3 - 0.07 * out);
}

/**
 * Éxito esperado (0..1) en una nota: combina la zona (a priori) con lo que el usuario
 * ha hecho de verdad en esa nota (precisión y estabilidad), con suavizado bayesiano.
 */
export function noteSuccess(p: VocalProfile, midi: number, r: ProfileRanges = profileRanges(p)): number {
  const prior = zonePrior(midi, r);
  const s = p.notes[String(Math.round(midi))];
  if (!s || !s.attempts) return prior;
  // La estabilidad solo matiza lo acertado: estable pero desafinado no es éxito.
  const stability = s.stabilityN ? s.stabilitySum / s.stabilityN : 1;
  const observed = s.accuracySum * (0.8 + 0.2 * stability);
  return (prior * PRIOR_WEIGHT + observed) / (PRIOR_WEIGHT + s.attempts);
}

/** Acierto esperado en un salto de `semitones` (con signo); 0,9 a priori. */
export function intervalSuccess(p: VocalProfile, semitones: number): number {
  const s = p.intervals[String(Math.round(semitones))];
  const prior = Math.abs(semitones) >= 5 ? 0.85 : 0.95;
  if (!s) return prior;
  return (prior * PRIOR_WEIGHT + s.hits) / (PRIOR_WEIGHT + s.attempts);
}

export interface RegisterStat {
  name: 'grave' | 'media' | 'aguda';
  range: VocalRange;
  accuracy: number | null;
  stability: number | null;
  attempts: number;
}

/** Rendimiento por registro: tercios de la zona fiable (o cómoda). */
export function registerStats(p: VocalProfile, r: ProfileRanges = profileRanges(p)): RegisterStat[] {
  const base = r.reliable ?? r.comfortable;
  if (!base) return [];
  const span = base.highMidi - base.lowMidi + 1;
  const cut1 = base.lowMidi + Math.floor(span / 3);
  const cut2 = base.lowMidi + Math.floor((2 * span) / 3);
  const zones: [RegisterStat['name'], number, number][] = [
    ['grave', base.lowMidi, cut1 - 1],
    ['media', cut1, cut2 - 1],
    ['aguda', cut2, base.highMidi],
  ];
  return zones.map(([name, lo, hi]) => {
    let n = 0, acc = 0, stab = 0, stabN = 0;
    for (let m = lo; m <= hi; m++) {
      const s = p.notes[String(m)];
      if (!s) continue;
      n += s.attempts;
      acc += s.accuracySum;
      stab += s.stabilitySum;
      stabN += s.stabilityN;
    }
    return { name, range: { lowMidi: lo, highMidi: hi }, accuracy: n ? acc / n : null, stability: stabN ? stab / stabN : null, attempts: n };
  });
}

/** Errores más frecuentes. */
export function commonErrors(p: VocalProfile, max = 3): DiagnosisId[] {
  return (Object.entries(p.errors) as [DiagnosisId, number][]).sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

/** Saltos que más cuestan (≥ 2 intentos y < 60 % de acierto). */
export function difficultIntervals(p: VocalProfile): { semitones: number; rate: number }[] {
  return Object.entries(p.intervals)
    .filter(([, s]) => s.attempts >= 2 && s.hits / s.attempts < RELIABLE_ACCURACY)
    .map(([k, s]) => ({ semitones: Number(k), rate: s.hits / s.attempts }))
    .sort((a, b) => a.rate - b.rate);
}
