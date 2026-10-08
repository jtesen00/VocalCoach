import { formantsFor, noiseShape, VOICING, type VoiceType } from '../core/singing/formants';
import type { SungScore } from '../core/singing/score';
import { midiToFreq } from '../core/music/notes';
import { mix } from './mix';
import type { Nodes } from './synth';

/**
 * Voz sintética que canta la letra (Fase 9, primer peldaño del ADR-008: sin IA ni voces de
 * terceros). Síntesis por formantes, como los primeros sintetizadores de canto:
 *  - fuente: pulso glótico (oscilador con armónicos que caen) + un poco de aire;
 *  - filtro: 5 formantes en paralelo que se mueven de un sonido al siguiente;
 *  - consonantes: cortes de la voz, nasales y líquidas con su propio filtro, y ruido filtrado
 *    para s, f, j, ch y las explosiones de p, t, k;
 *  - altura con ligado entre notas, vibrato que aparece en las notas largas y, en las notas
 *    agudas, F1 que sube con la fundamental (como hacen los cantantes).
 */

const waves = new WeakMap<BaseAudioContext, PeriodicWave>();

/** Pulso glótico: armónicos con caída de ~7 dB por octava. */
function glottalWave(ctx: BaseAudioContext): PeriodicWave {
  const cached = waves.get(ctx);
  if (cached) return cached;
  const n = 80;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = 1 / k ** 1.15;
  const wave = ctx.createPeriodicWave(real, imag);
  waves.set(ctx, wave);
  return wave;
}

const TC = 0.018; // constante de tiempo de las transiciones entre sonidos (coarticulación)
const LEVEL = 2.6; // nivel de salida, igualado al de los instrumentos grabados
const dbToGain = (db: number) => 10 ** (db / 20);

/** Canta la partitura empezando en `start`. Devuelve el instante en que termina. */
export function playSung(ctx: BaseAudioContext, score: SungScore, voice: VoiceType, start: number, nodes: Nodes, out: AudioNode = mix(ctx).melody): number {
  const end = start + score.durationS;
  if (!score.phones.length) return end;
  const stopAt = end + 0.4;

  // Fuente sonora.
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(glottalWave(ctx));
  const voiced = ctx.createGain();
  voiced.gain.value = 0;
  osc.connect(voiced);
  // Aire: un poco de ruido mezclado con la voz (suena menos a máquina).
  const noiseBuf = mix(ctx).noise;
  const air = ctx.createBufferSource();
  air.buffer = noiseBuf;
  air.loop = true;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.02;
  air.connect(airGain).connect(voiced);

  // Formantes en paralelo.
  const bank = ctx.createGain();
  const filters = Array.from({ length: 5 }, () => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const g = ctx.createGain();
    voiced.connect(bp).connect(g).connect(bank);
    return { bp, g };
  });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = voice === 'aguda' ? 6500 : 5500;
  const master = ctx.createGain();
  master.gain.value = LEVEL;
  bank.connect(lp).connect(master).connect(out);

  // Ruido de las consonantes.
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  const hissBp = ctx.createBiquadFilter();
  hissBp.type = 'bandpass';
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0;
  hiss.connect(hissBp).connect(hissGain).connect(master);

  // Altura: notas ligadas con un deslizamiento corto; vibrato en las notas que duran.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.4;
  const depth = ctx.createGain();
  depth.gain.value = 0;
  lfo.connect(depth).connect(osc.detune);
  let prev: (typeof score.pitch)[number] | null = null;
  for (const p of score.pitch) {
    const t0 = start + p.startS;
    const t1 = start + p.endS;
    const f0 = midiToFreq(p.fromMidi);
    if (prev && p.startS - prev.endS < 0.06) {
      const from = midiToFreq(prev.toMidi);
      osc.frequency.setValueAtTime(from, Math.max(start, t0 - 0.03));
      osc.frequency.exponentialRampToValueAtTime(f0, t0 + 0.05);
    } else {
      osc.frequency.setValueAtTime(f0, Math.max(start, t0 - 0.15));
    }
    if (p.toMidi !== p.fromMidi) osc.frequency.exponentialRampToValueAtTime(midiToFreq(p.toMidi), t1);
    const dur = p.endS - p.startS;
    depth.gain.setValueAtTime(0, t0);
    if (dur > 0.5 && p.toMidi === p.fromMidi) {
      depth.gain.setValueAtTime(0, t0 + 0.28);
      depth.gain.linearRampToValueAtTime(28, t0 + Math.min(0.7, dur * 0.7));
      depth.gain.linearRampToValueAtTime(0, t1);
    }
    prev = p;
  }

  const midiAt = (s: number) => {
    const p = score.pitch.find((x) => s >= x.startS - 0.06 && s < x.endS) ?? score.pitch[score.pitch.length - 1];
    return p.fromMidi;
  };

  // Sonido a sonido: formantes, cuánta voz y cuánto ruido.
  score.phones.forEach((ph, i) => {
    const t0 = start + ph.startS;
    const t1 = start + ph.endS;
    const next = score.phones[i + 1];
    const fs = formantsFor(ph.phone, voice, midiToFreq(midiAt(ph.startS)));
    filters.forEach(({ bp, g }, k) => {
      bp.frequency.setTargetAtTime(fs.f[k], t0, TC);
      bp.Q.setTargetAtTime(fs.f[k] / fs.bw[k], t0, TC);
      g.gain.setTargetAtTime(dbToGain(fs.gainDb[k]), t0, TC);
    });

    const v = VOICING[ph.phone];
    const prevEnd = i ? start + score.phones[i - 1].endS : -Infinity;
    if (t0 - prevEnd > 0.02) voiced.gain.setValueAtTime(0, Math.max(start, t0 - 0.001));
    voiced.gain.setTargetAtTime(v, t0, v === 0 ? 0.006 : 0.015);
    if (ph.phone === 'r') {
      // Vibrante simple: un toque breve de la lengua.
      const mid = (t0 + t1) / 2;
      voiced.gain.setTargetAtTime(0.15, mid - 0.01, 0.004);
      voiced.gain.setTargetAtTime(v, mid + 0.01, 0.004);
    } else if (ph.phone === 'rr') {
      for (let t = t0 + 0.015; t < t1 - 0.02; t += 0.04) {
        voiced.gain.setTargetAtTime(0.12, t, 0.004);
        voiced.gain.setTargetAtTime(v, t + 0.018, 0.004);
      }
    }

    const ns = noiseShape(ph.phone, voice);
    if (ns) {
      hissBp.frequency.setValueAtTime(ns.hz, t0);
      hissBp.Q.setValueAtTime(ns.q, t0);
      if (ns.burst) {
        // Oclusiva: silencio y explosión breve al soltar.
        const b = Math.max(t0, t1 - 0.015);
        hissGain.gain.setValueAtTime(0, t0);
        hissGain.gain.setValueAtTime(ns.level, b);
        hissGain.gain.setTargetAtTime(0, b + 0.004, 0.008);
      } else {
        hissGain.gain.setTargetAtTime(ns.level, t0, 0.01);
        hissGain.gain.setTargetAtTime(0, t1 - 0.01, 0.012);
      }
    }

    // Respiración: tras el último sonido de un tramo, la voz se apaga.
    if (!next || next.startS - ph.endS > 0.02) voiced.gain.setTargetAtTime(0, t1, 0.03);
  });

  for (const src of [osc, air, hiss, lfo]) {
    src.start(start);
    src.stop(stopAt);
    nodes.push(src);
  }
  return end;
}
