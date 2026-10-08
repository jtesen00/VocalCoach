import type { ExercisePlan } from '../core/exercises/types';
import { voiceTypeFor, type VoiceType } from '../core/singing/formants';
import { hasSingableLyrics, sungScore, type SungScore } from '../core/singing/score';

/**
 * Guía cantada con la letra (Fase 9): la partitura y el tipo de voz, o `undefined` si la frase
 * no tiene letra (entonces suena el instrumento). La voz se elige por la altura de la melodía
 * (ya en el tono del usuario): grave si su centro queda bajo Sol3–La3.
 */
export function sungGuide(plan: ExercisePlan, tempo = 1): { score: SungScore; voice: VoiceType } | undefined {
  if (!hasSingableLyrics(plan)) return undefined;
  const midis = plan.segments.map((s) => s.fromMidi).sort((a, b) => a - b);
  const mid = midis[Math.floor(midis.length / 2)];
  return { score: sungScore(plan, tempo), voice: voiceTypeFor({ lowMidi: mid, highMidi: mid }) };
}
