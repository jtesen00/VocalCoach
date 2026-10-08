import type { ExercisePlan, PlanSegment } from '../exercises/types';
import type { TimedChord } from '../music/chords';
import { allPhrases, phrasePlan, secondsPerBeat } from './melody';
import type { Song } from './types';

/**
 * Canción entera en el tiempo, para cantarla de corrido (modo karaoke, Fase 8b).
 * Cada frase conserva su plan (para evaluarla al terminar) y su lugar en la canción:
 * en las importadas, el segundo de la original (`originS`); en las del catálogo, una tras
 * otra con dos pulsos de respiro.
 */
export interface KaraokePhrase {
  index: number;
  plan: ExercisePlan;
  lyrics: string;
  /** Inicio y fin en la canción (s). */
  startS: number;
  endS: number;
  /** Sílaba de cada nota con su tiempo absoluto, para resaltar la letra. */
  syllables: { text: string; startS: number; endS: number }[];
}

export interface KaraokeTimeline {
  phrases: KaraokePhrase[];
  /** Plan de toda la canción (para la guía sonora de una sola vez). */
  plan: ExercisePlan;
  durationS: number;
}

export function karaokeTimeline(song: Song, transpose: number): KaraokeTimeline {
  const refs = allPhrases(song);
  const gap = 2 * secondsPerBeat(song);
  const phrases: KaraokePhrase[] = [];
  let cursor = refs[0]?.phrase.originS ?? 0;
  for (const ref of refs) {
    const plan = phrasePlan(ref, transpose);
    const startS = ref.phrase.originS ?? cursor;
    phrases.push({
      index: ref.index,
      plan,
      lyrics: ref.phrase.lyrics,
      startS,
      endS: startS + plan.durationS,
      syllables: plan.segments.map((s, i) => ({ text: ref.phrase.notes[i]?.syllable ?? '', startS: startS + s.startS, endS: startS + s.endS })),
    });
    cursor = startS + plan.durationS + gap;
  }
  // La canción empieza en la primera frase (sin la intro instrumental de la original).
  const zero = phrases[0]?.startS ?? 0;
  const shifted = phrases.map((p) => ({
    ...p,
    startS: p.startS - zero,
    endS: p.endS - zero,
    syllables: p.syllables.map((s) => ({ ...s, startS: s.startS - zero, endS: s.endS - zero })),
  }));
  const segments: PlanSegment[] = shifted.flatMap((p) => p.plan.segments.map((s) => ({ ...s, startS: s.startS + p.startS, endS: s.endS + p.startS })));
  const chords: TimedChord[] = shifted.flatMap((p) => (p.plan.chords ?? []).map((c) => ({ ...c, startS: c.startS + p.startS, endS: c.endS + p.startS })));
  const durationS = shifted.at(-1)?.endS ?? 0;
  const first = shifted[0]?.plan;
  return {
    phrases: shifted,
    durationS,
    plan: {
      def: { ...(first?.def ?? { id: song.id, kind: 'sequence', title: song.title, summary: '', instructions: '', level: 'intermediate', notes: [] }), id: `${song.id}/karaoke`, title: song.title },
      rootMidi: first?.rootMidi ?? 60,
      segments,
      durationS,
      chords: chords.length ? chords : undefined,
    },
  };
}

/** Frase activa en el instante `t` (la que suena, o la próxima si estamos en un silencio). */
export function phraseAt(timeline: KaraokeTimeline, t: number): KaraokePhrase | null {
  return timeline.phrases.find((p) => t < p.endS + 0.3) ?? null;
}

/** Desplazamiento de la canción original respecto a la timeline: la intro de la original (s). */
export function originOffset(song: Song): number {
  return allPhrases(song)[0]?.phrase.originS ?? 0;
}
