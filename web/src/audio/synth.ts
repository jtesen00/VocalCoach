import type { GuideEvent } from '../core/exercises/guide';
import { chordMidis, type TimedChord } from '../core/music/chords';
import { midiToFreq } from '../core/music/notes';
import { mix } from './mix';
import type { InstrumentId } from './instruments';

/**
 * Instrumentos sintetizados con osciladores. Solo se usan como respaldo mientras cargan
 * las muestras grabadas (o si no se pueden descargar).
 */
interface Voice {
  /** Instrumentos que sostienen el sonido: una sola voz por frase que se desliza entre notas. */
  legato: boolean;
  level: number;
  attack: number;
  release: number;
  /** Tiempo de deslizamiento entre notas (s). */
  glide: number;
  vibratoCents: number;
}

const VOICES: Record<InstrumentId, Voice> = {
  piano: { legato: false, level: 0.32, attack: 0.003, release: 0.12, glide: 0, vibratoCents: 0 },
  voz: { legato: true, level: 0.3, attack: 0.08, release: 0.15, glide: 0.09, vibratoCents: 22 },
  silbido: { legato: true, level: 0.22, attack: 0.05, release: 0.1, glide: 0.07, vibratoCents: 14 },
  flauta: { legato: true, level: 0.24, attack: 0.06, release: 0.12, glide: 0.05, vibratoCents: 12 },
  cuerdas: { legato: true, level: 0.13, attack: 0.15, release: 0.25, glide: 0.08, vibratoCents: 9 },
};

export type Nodes = AudioScheduledSourceNode[];

/** Fuente de sonido de un instrumento legato, conectada a `out`; devuelve sus parámetros de frecuencia. */
function legatoSource(ctx: BaseAudioContext, id: InstrumentId, out: AudioNode, start: number, end: number, nodes: Nodes): { freqs: AudioParam[]; detunes: AudioParam[] } {
  const freqs: AudioParam[] = [];
  const detunes: AudioParam[] = [];
  const osc = (type: OscillatorType | PeriodicWave, detune = 0) => {
    const o = ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.detune.value = detune;
    freqs.push(o.frequency);
    detunes.push(o.detune);
    o.start(start);
    o.stop(end);
    nodes.push(o);
    return o;
  };
  const breath = (hz: number, q: number, gain: number) => {
    const n = ctx.createBufferSource();
    n.buffer = mix(ctx).noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    n.connect(bp).connect(g).connect(out);
    n.start(start);
    n.stop(end);
    nodes.push(n);
  };

  switch (id) {
    case 'silbido':
      osc('sine').connect(out);
      breath(3200, 1.2, 0.05);
      break;
    case 'flauta': {
      const real = new Float32Array([0, 1, 0.42, 0.16, 0.07, 0.03]);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4500;
      osc(ctx.createPeriodicWave(real, new Float32Array(real.length))).connect(lp).connect(out);
      breath(1800, 0.8, 0.04);
      break;
    }
    case 'voz': {
      // Diente de sierra (cuerdas vocales) a través de formantes de la vocal «u/o».
      const mix = ctx.createGain();
      osc('sawtooth', -5).connect(mix);
      osc('sawtooth', 5).connect(mix);
      for (const [hz, q, g] of [[400, 5, 1], [850, 7, 0.45], [2700, 9, 0.12]] as const) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = hz;
        bp.Q.value = q;
        const gn = ctx.createGain();
        gn.gain.value = g * 3;
        mix.connect(bp).connect(gn).connect(out);
      }
      break;
    }
    case 'cuerdas': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.Q.value = 0.6;
      for (const d of [-8, 0, 8]) osc('sawtooth', d).connect(lp);
      lp.connect(out);
      break;
    }
    default:
      break;
  }
  return { freqs, detunes };
}

/** Grupos de eventos seguidos, sin silencio entre ellos (cada grupo se toca ligado). */
export function runs(events: readonly GuideEvent[], start: number): { t: number; ev: Exclude<GuideEvent, { type: 'rest' }> }[][] {
  const out: { t: number; ev: Exclude<GuideEvent, { type: 'rest' }> }[][] = [];
  let t = start;
  let cur: { t: number; ev: Exclude<GuideEvent, { type: 'rest' }> }[] = [];
  for (const ev of events) {
    if (ev.type === 'rest') {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ t, ev });
    t += ev.durationS;
  }
  if (cur.length) out.push(cur);
  return out;
}

export const firstMidi = (ev: Exclude<GuideEvent, { type: 'rest' }>) => (ev.type === 'note' ? ev.midi : ev.fromMidi);
export const lastMidi = (ev: Exclude<GuideEvent, { type: 'rest' }>) => (ev.type === 'note' ? ev.midi : ev.toMidi);

function playLegato(ctx: BaseAudioContext, id: InstrumentId, events: readonly GuideEvent[], start: number, out: AudioNode, nodes: Nodes, gainScale = 1) {
  const v = VOICES[id];
  for (const run of runs(events, start)) {
    const t0 = run[0].t;
    const last = run[run.length - 1];
    const t1 = last.t + last.ev.durationS;
    const env = ctx.createGain();
    env.connect(out);
    const { freqs, detunes } = legatoSource(ctx, id, env, t0, t1 + v.release + 0.05, nodes);

    // Envolvente: ataque, pequeñas re-articulaciones entre notas y caída final.
    const L = v.level * gainScale;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(L, t0 + v.attack);
    for (const { t, ev } of run.slice(1)) {
      if (ev.type === 'note' && ev.durationS > 0.15 && t - 0.05 > t0 + v.attack) {
        env.gain.setValueAtTime(L, t - 0.05);
        env.gain.linearRampToValueAtTime(L * 0.72, t - 0.005);
        env.gain.linearRampToValueAtTime(L, t + 0.06);
      }
    }
    env.gain.setValueAtTime(L, Math.max(t0 + v.attack, t1 - 0.02));
    env.gain.linearRampToValueAtTime(0, t1 + v.release);

    // Altura: deslizamiento breve hacia cada nota nueva; las sirenas se deslizan enteras.
    for (const f of freqs) {
      f.setValueAtTime(midiToFreq(firstMidi(run[0].ev)), t0);
      run.forEach(({ t, ev }, i) => {
        if (ev.type === 'glide') {
          f.setValueAtTime(midiToFreq(ev.fromMidi), t);
          f.exponentialRampToValueAtTime(midiToFreq(ev.toMidi), t + ev.durationS);
        } else if (i > 0) {
          const prevEv = run[i - 1].ev;
          const g = Math.min(v.glide, prevEv.durationS / 3);
          f.setValueAtTime(midiToFreq(lastMidi(prevEv)), Math.max(t0, t - g));
          f.exponentialRampToValueAtTime(midiToFreq(ev.midi), t);
        }
      });
    }

    // Vibrato (se nota en las notas largas).
    if (v.vibratoCents) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.4;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t0);
      depth.gain.linearRampToValueAtTime(v.vibratoCents, t0 + 0.6);
      lfo.connect(depth);
      for (const d of detunes) depth.connect(d);
      lfo.start(t0);
      lfo.stop(t1 + v.release + 0.05);
      nodes.push(lfo);
    }
  }
}

/** Nota de piano: parciales con la inarmonicidad de una cuerda, ataque de martillo y caída natural. */
function pianoNote(ctx: BaseAudioContext, midi: number, toMidi: number, t: number, dur: number, out: AudioNode, nodes: Nodes, level: number) {
  const f = midiToFreq(midi);
  const decay = Math.max(0.35, Math.min(2.4, 2.2 * Math.sqrt(220 / f)));
  const end = t + dur;
  const B = 0.0003;
  for (let n = 1; n <= 8; n++) {
    const ratio = n * Math.sqrt(1 + B * n * n);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * ratio, t);
    if (toMidi !== midi) o.frequency.exponentialRampToValueAtTime(midiToFreq(toMidi) * ratio, end);
    const g = ctx.createGain();
    const a = (level / n ** 1.5) * (n === 2 ? 0.7 : 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.003);
    g.gain.setTargetAtTime(a * 0.0005, t + 0.003, decay / (1 + 0.5 * (n - 1)));
    g.gain.setTargetAtTime(0, end, 0.08);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(end + 0.5);
    nodes.push(o);
  }
  // Martillo: un golpe breve de ruido filtrado.
  const h = ctx.createBufferSource();
  h.buffer = mix(ctx).noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(6000, f * 8);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(level * 0.12, t);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  h.connect(lp).connect(hg).connect(out);
  h.start(t);
  h.stop(t + 0.04);
  nodes.push(h);
}

/** Melodía sintetizada (respaldo si no hay muestras grabadas). */
export function synthMelody(ctx: BaseAudioContext, id: InstrumentId, events: readonly GuideEvent[], start: number, out: AudioNode, nodes: Nodes): void {
  if (VOICES[id].legato) {
    playLegato(ctx, id, events, start, out, nodes);
  } else {
    let t = start;
    for (const ev of events) {
      if (ev.type !== 'rest') pianoNote(ctx, firstMidi(ev), lastMidi(ev), t, ev.durationS, out, nodes, VOICES.piano.level);
      t += ev.durationS;
    }
  }
}

/** Acordes sintetizados (respaldo): piano re-pulsado cada 2 s o colchón de cuerdas. */
export function synthChords(ctx: BaseAudioContext, id: InstrumentId, chords: readonly TimedChord[], start: number, out: AudioNode, nodes: Nodes): void {
  for (const c of chords) {
    const t0 = start + c.startS;
    const t1 = start + c.endS;
    const midis = chordMidis(c.chord);
    if (id === 'piano') {
      for (let t = t0; t < t1 - 0.2; t += 2) {
        const d = Math.min(2, t1 - t);
        midis.forEach((m, i) => pianoNote(ctx, m, m, t + i * 0.012, d, out, nodes, i === 0 ? 0.13 : 0.08));
      }
    } else {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(0.03, t0 + 0.25);
      env.gain.setValueAtTime(0.03, Math.max(t0 + 0.25, t1 - 0.1));
      env.gain.linearRampToValueAtTime(0, t1 + 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.connect(env).connect(out);
      for (const m of midis) {
        for (const d of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiToFreq(m);
          o.detune.value = d;
          o.connect(lp);
          o.start(t0);
          o.stop(t1 + 0.4);
          nodes.push(o);
        }
      }
    }
  }
}
