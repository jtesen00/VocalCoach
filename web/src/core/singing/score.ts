import type { ExercisePlan } from '../exercises/types';
import { parseSyllable, type Consonant, type Phone, type Vowel } from './phonemes';

/**
 * Partitura cantada (Fase 9): una frase con letra → qué sonido suena en cada instante.
 * Como hacen los cantantes, las consonantes de ataque se adelantan un poco para que la
 * vocal caiga en el pulso, y la vocal es lo que se sostiene durante la nota.
 */
export interface PhoneEvent {
  phone: Phone;
  startS: number;
  endS: number;
}

export interface SungScore {
  phones: PhoneEvent[];
  /** Alturas: las notas del plan (con sus deslizamientos). */
  pitch: { startS: number; endS: number; fromMidi: number; toMidi: number }[];
  durationS: number;
}

/** Duración típica de cada consonante cantada (s). */
export const CONSONANT_S: Record<Consonant, number> = {
  p: 0.06, t: 0.06, k: 0.065,
  b: 0.045, d: 0.04, g: 0.045,
  f: 0.09, s: 0.1, x: 0.09, ch: 0.1,
  y: 0.06, m: 0.07, n: 0.065, ny: 0.075,
  l: 0.06, r: 0.03, rr: 0.1,
};
const GLIDE_S = 0.05;
/** Lo que se adelanta el ataque respecto a la nota (fracción de su duración). */
const ANTICIPATION = 0.6;
/** La vocal ocupa al menos esta parte de la nota. */
const MIN_VOWEL = 0.55;

const sum = (cs: readonly Consonant[]) => cs.reduce((a, c) => a + CONSONANT_S[c], 0);

/** Encoge una lista de duraciones para que quepa en `max` s. */
function fit(cs: readonly Consonant[], max: number): number[] {
  const total = sum(cs);
  const k = total > max && total > 0 ? max / total : 1;
  return cs.map((c) => CONSONANT_S[c] * k);
}

/** ¿Tiene letra cantable la frase? (alguna sílaba con vocal). */
export function hasSingableLyrics(plan: ExercisePlan): boolean {
  return plan.segments.some((s) => s.label && parseSyllable(s.label));
}

/**
 * Plan de una frase (con las sílabas en `label`) → partitura cantada. Las notas sin sílaba
 * (melismas) alargan la vocal anterior; si la frase no tiene ninguna, se canta «u».
 */
export function sungScore(input: ExercisePlan, tempo = 1): SungScore {
  // `tempo` < 1 la hace más lenta (como en `guideEvents`).
  const plan = tempo === 1 ? input : { ...input, durationS: input.durationS / tempo, segments: input.segments.map((s) => ({ ...s, startS: s.startS / tempo, endS: s.endS / tempo })) };
  const phones: PhoneEvent[] = [];
  const push = (phone: Phone, startS: number, endS: number) => {
    const last = phones[phones.length - 1];
    const s = Math.max(startS, last?.endS ?? 0);
    if (endS - s > 1e-4) phones.push({ phone, startS: s, endS });
  };
  let lastVowel: Vowel = 'u';

  plan.segments.forEach((seg, i) => {
    const dur = seg.endS - seg.startS;
    const prev = plan.segments[i - 1];
    const legato = !!prev && seg.startS - prev.endS < 0.05;
    const syl = seg.label ? parseSyllable(seg.label) : null;

    if (!syl) {
      // Melisma: la vocal anterior sigue sonando en la nota nueva.
      const last = phones[phones.length - 1];
      if (last && legato && last.phone === lastVowel) last.endS = seg.endS;
      else push(lastVowel, seg.startS, seg.endS);
      return;
    }

    // Ataque: se adelanta sobre la nota anterior si van ligadas; si no, retrasa la vocal.
    const onsetMax = Math.min(0.2, 0.35 * dur + (legato ? 0.1 : 0));
    const onset = fit(syl.onset, onsetMax);
    const onsetTotal = onset.reduce((a, b) => a + b, 0);
    let t = legato ? seg.startS - ANTICIPATION * onsetTotal : seg.startS;
    const last = phones[phones.length - 1];
    if (last && last.endS > t) {
      // La nota anterior cede el final de su vocal a la consonante.
      last.endS = Math.max(last.startS + 0.04, t);
      t = last.endS;
    }
    syl.onset.forEach((c, k) => {
      push(c, t, t + onset[k]);
      t += onset[k];
    });
    for (const g of syl.glideIn) {
      push(g, t, t + GLIDE_S);
      t += GLIDE_S;
    }
    // Final de la nota: semivocales y consonantes de cierre, sin comerse la vocal.
    const tailMax = Math.max(0, (1 - MIN_VOWEL) * dur - (t - seg.startS));
    const coda = fit(syl.coda, Math.max(0, tailMax - syl.glideOut.length * GLIDE_S));
    const tail = coda.reduce((a, b) => a + b, 0) + syl.glideOut.length * GLIDE_S;
    const vowelEnd = Math.max(t + 0.04, seg.endS - tail);
    push(syl.main, t, vowelEnd);
    t = vowelEnd;
    for (const g of syl.glideOut) {
      push(g, t, t + GLIDE_S);
      t += GLIDE_S;
    }
    syl.coda.forEach((c, k) => {
      push(c, t, t + coda[k]);
      t += coda[k];
    });
    lastVowel = syl.glideOut.at(-1) ?? syl.main;
  });

  return {
    phones,
    pitch: plan.segments.map((s) => ({ startS: s.startS, endS: s.endS, fromMidi: s.fromMidi, toMidi: s.toMidi })),
    durationS: plan.durationS,
  };
}
