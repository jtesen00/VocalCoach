import { useEffect, useRef, type RefObject } from 'react';
import { audioEngine } from '../../audio/engine';
import { displayNote } from '../../shared/labels';
import { chordName } from '../../core/music/chords';
import { planMidiRange, targetAt } from '../../core/exercises/plan';
import type { ExercisePlan } from '../../core/exercises/types';
import { median } from '../../core/pitch/tracker';
import type { PitchFrame } from '../../core/pitch/types';
import type { OctaveMode, Tolerance } from '../../core/scoring/pitch-scoring';
import type { RunPhase, RunTiming } from './useExerciseRun';

interface Props {
  plan: ExercisePlan;
  phase: RunPhase;
  framesRef: RefObject<PitchFrame[]>;
  timingRef: RefObject<RunTiming>;
  tolerance: Tolerance;
  octaveMode: OctaveMode;
  detailed: boolean;
}

const LABEL_W = 40;
const MARGIN_SEMITONES = 3;

/**
 * Línea de tiempo del ejercicio en Canvas (requestAnimationFrame, fuera de React):
 * barras objetivo con su tolerancia, guía de la sirena, voz del usuario y cursor.
 */
export function ExerciseTimeline({ plan, phase, framesRef, timingRef, tolerance, octaveMode, detailed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ plan, phase, tolerance, octaveMode, detailed });
  live.current = { plan, phase, tolerance, octaveMode, detailed };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { plan: p, phase: ph, tolerance: tol, octaveMode: mode, detailed: tech } = live.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(canvas);
      const color = (name: string) => css.getPropertyValue(name).trim();

      const [lo, hi] = planMidiRange(p);
      const top = hi + MARGIN_SEMITONES;
      const bottom = lo - MARGIN_SEMITONES;
      const total = p.durationS + 0.3;
      const xOf = (s: number) => LABEL_W + (s / total) * (w - LABEL_W - 6);
      const yOf = (midi: number) => ((top - midi) / (top - bottom)) * h;
      const band = tol.toleranceCents / 100;

      // Rejilla de semitonos; se nombran las notas del ejercicio y los Do.
      const targets = new Set(p.segments.flatMap((s) => [s.fromMidi, s.toMidi]));
      g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.textBaseline = 'middle';
      for (let m = Math.ceil(bottom); m <= Math.floor(top); m++) {
        const y = Math.round(yOf(m)) + 0.5;
        g.strokeStyle = color('--trail-grid');
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(LABEL_W, y);
        g.lineTo(w, y);
        g.stroke();
        // Modo sencillo: solo las notas del ejercicio, en solfeo.
        if (targets.has(m) || (tech && m % 12 === 0)) {
          g.fillStyle = targets.has(m) ? color('--ink') : color('--muted');
          g.fillText(displayNote(m, tech), 4, y);
        }
      }

      // Objetivo: banda de tolerancia + línea central (barras en notas, rampas en sirenas).
      for (const s of p.segments) {
        const x0 = xOf(s.startS), x1 = xOf(s.endS);
        g.fillStyle = color('--trail-band');
        g.beginPath();
        g.moveTo(x0, yOf(s.fromMidi + band));
        g.lineTo(x1, yOf(s.toMidi + band));
        g.lineTo(x1, yOf(s.toMidi - band));
        g.lineTo(x0, yOf(s.fromMidi - band));
        g.closePath();
        g.fill();
        g.strokeStyle = color('--trail-target');
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0 + 1, yOf(s.fromMidi));
        g.lineTo(x1 - 1, yOf(s.toMidi));
        g.stroke();
        // Letra: cada sílaba bajo su nota.
        if (s.label) {
          g.fillStyle = color('--ink');
          g.textBaseline = 'alphabetic';
          g.font = '12px system-ui, sans-serif';
          g.fillText(s.label, x0 + 2, Math.min(h - 4, yOf(s.fromMidi - band) + 14));
          g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
          g.textBaseline = 'middle';
        }
      }

      // Acordes encima de la melodía, como en un karaoke.
      if (p.chords?.length) {
        g.font = '600 12px system-ui, sans-serif';
        g.textBaseline = 'top';
        for (const c of p.chords) {
          const x = xOf(c.startS);
          g.fillStyle = color('--accent');
          g.fillText(chordName(c.chord, tech), x + 2, 3);
          g.strokeStyle = color('--trail-grid');
          g.beginPath();
          g.moveTo(Math.round(x) + 0.5, 0);
          g.lineTo(Math.round(x) + 0.5, 16);
          g.stroke();
        }
        g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        g.textBaseline = 'middle';
      }

      const timing = timingRef.current;
      const now = audioEngine.now();

      // Voz del usuario, en tiempo del ejercicio (descontando la latencia).
      const frames = framesRef.current;
      if (frames.length && Number.isFinite(timing.singT)) {
        g.strokeStyle = color('--trail-line');
        g.lineWidth = 2.5;
        g.lineJoin = 'round';
        g.beginPath();
        // Sirenas: un único desplazamiento de octava (como el evaluador); notas: plegado por nota.
        let sirenShift = 0;
        if (mode === 'pitch-class' && p.def.kind === 'siren') {
          const voiced = frames.filter((f) => f.voiced && f.midi !== null).map((f) => f.midi!);
          if (voiced.length) sirenShift = -12 * Math.round((median(voiced) - (lo + hi) / 2) / 12);
        }
        let drawing = false;
        for (const f of frames) {
          const rel = f.t - timing.singT - timing.latencyS;
          if (!f.voiced || f.midi === null || rel < 0 || rel > total) {
            drawing = false;
            continue;
          }
          let midi = f.midi + sirenShift;
          if (mode === 'pitch-class' && p.def.kind !== 'siren') {
            const target = targetAt(p, rel) ?? (lo + hi) / 2;
            midi -= 12 * Math.round((midi - target) / 12);
          }
          const x = xOf(rel);
          const y = Math.min(h - 2, Math.max(2, yOf(midi)));
          if (drawing) g.lineTo(x, y);
          else g.moveTo(x, y);
          drawing = true;
        }
        g.stroke();
      }

      // Cursor: durante la guía recorre el ejercicio a la velocidad de la guía; al cantar, en tiempo real.
      let head: number | null = null;
      if (now !== null && ph === 'listening') head = ((now - timing.guideStartT) / timing.guideDurationS) * p.durationS;
      if (now !== null && ph === 'singing') head = now - timing.singT;
      if (head !== null && head >= 0 && head <= total) {
        g.strokeStyle = color('--accent');
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(xOf(head), 0);
        g.lineTo(xOf(head), h);
        g.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [framesRef, timingRef]);

  return (
    <canvas
      ref={canvasRef}
      className="timeline"
      role="img"
      aria-label={`Línea de tiempo: notas a cantar ${plan.segments.map((s) => displayNote(s.fromMidi, detailed)).join(', ')} y tu voz`}
    />
  );
}
