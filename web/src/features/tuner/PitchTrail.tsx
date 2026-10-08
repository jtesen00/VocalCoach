import { useEffect, useRef } from 'react';
import { audioEngine } from '../../audio/engine';
import { displayNote } from '../../shared/labels';
import { centsVsTarget, type OctaveMode, type Tolerance } from '../../core/scoring/pitch-scoring';
import type { PitchFrame } from '../../core/pitch/types';

interface Props {
  /** Nota central del gráfico (objetivo). */
  centerMidi: number;
  tolerance: Tolerance;
  octaveMode: OctaveMode;
  showTarget: boolean;
  detailed: boolean;
}

const SECONDS = 6;
const SEMITONES = 7;

/**
 * Trayectoria de pitch en Canvas con requestAnimationFrame.
 * Recibe los frames directamente del motor, sin pasar por el estado de React.
 */
export function PitchTrail({ centerMidi, tolerance, octaveMode, showTarget, detailed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ centerMidi, tolerance, octaveMode, showTarget, detailed });
  propsRef.current = { centerMidi, tolerance, octaveMode, showTarget, detailed };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    const frames: PitchFrame[] = [];
    const off = audioEngine.onFrame((f) => {
      frames.push(f);
      const cutoff = f.t - SECONDS;
      while (frames.length && frames[0].t < cutoff) frames.shift();
    });

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
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
      const { centerMidi: center, tolerance: tol, octaveMode: mode, showTarget: target, detailed: tech } = propsRef.current;
      const yOf = (cents: number) => h / 2 - (cents / (SEMITONES * 100)) * (h / 2);

      // Banda de tolerancia del objetivo.
      if (target) {
        g.fillStyle = color('--trail-band');
        g.fillRect(0, yOf(tol.toleranceCents), w, yOf(-tol.toleranceCents) - yOf(tol.toleranceCents));
      }

      // Rejilla de semitonos con nombres de nota.
      g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.textBaseline = 'middle';
      for (let s = -SEMITONES + 1; s < SEMITONES; s++) {
        const y = Math.round(yOf(s * 100)) + 0.5;
        g.strokeStyle = s === 0 && target ? color('--trail-target') : color('--trail-grid');
        g.lineWidth = s === 0 && target ? 1.5 : 1;
        g.beginPath();
        g.moveTo(36, y);
        g.lineTo(w, y);
        g.stroke();
        // Modo sencillo: solo se nombra la nota central (la que hay que cantar).
        if (tech || s === 0) {
          g.fillStyle = s === 0 ? color('--ink') : color('--muted');
          g.fillText(displayNote(center + s, tech), 4, y);
        }
      }

      // Trayectoria: segmentos solo entre frames con voz consecutivos.
      if (!frames.length) return;
      const now = frames[frames.length - 1].t;
      const xOf = (t: number) => 36 + ((t - (now - SECONDS)) / SECONDS) * (w - 36);
      g.strokeStyle = color('--trail-line');
      g.lineWidth = 2.5;
      g.lineJoin = 'round';
      g.beginPath();
      let drawing = false;
      for (const f of frames) {
        if (!f.voiced || f.midi === null) {
          drawing = false;
          continue;
        }
        const cents = centsVsTarget(f.midi, center, mode);
        const y = Math.min(h - 2, Math.max(2, yOf(cents)));
        if (drawing) g.lineTo(xOf(f.t), y);
        else g.moveTo(xOf(f.t), y);
        drawing = true;
      }
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, []);

  return <canvas ref={canvasRef} className="trail" role="img" aria-label="Tu voz en los últimos 6 segundos: la línea debe quedarse en la franja de la nota" />;
}
