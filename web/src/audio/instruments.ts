import type { GuideEvent } from '../core/exercises/guide';
import { chordMidis, type TimedChord } from '../core/music/chords';
import { midiToFreq } from '../core/music/notes';

/**
 * Instrumentos sintetizados para la guía y las demostraciones. Todo se genera en el
 * dispositivo (Web Audio): sin muestras grabadas, sin descargas y sin derechos de terceros.
 */
export type InstrumentId = 'piano' | 'silbido' | 'flauta' | 'voz' | 'cuerdas';

export const INSTRUMENTS: { id: InstrumentId; name: string; description: string }[] = [
  { id: 'piano', name: 'Piano', description: 'Notas claras con cuerpo; ideal para oír cada nota.' },
  { id: 'voz', name: 'Voz «uuh»', description: 'Como un cantante en vocal «u»: fácil de imitar.' },
  { id: 'silbido', name: 'Silbido', description: 'Limpio y ligado, deja oír muy bien la melodía.' },
  { id: 'flauta', name: 'Flauta', description: 'Suave y ligada, con un poco de aire.' },
  { id: 'cuerdas', name: 'Cuerdas', description: 'Cálido y continuo, como una sección de violines.' },
];

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

interface Bus {
  input: GainNode;
  noise: AudioBuffer;
}

const buses = new WeakMap<BaseAudioContext, Bus>();

/** Salida común con reverberación de sala (respuesta al impulso generada, estéreo, ~1,6 s). */
function bus(ctx: BaseAudioContext): Bus {
  const cached = buses.get(ctx);
  if (cached) return cached;
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1;
  wet.gain.value = 0.22;
  const ir = ctx.createBuffer(2, Math.round(1.6 * ctx.sampleRate), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-5 * i) / d.length) * (i < 200 ? i / 200 : 1);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  input.connect(dry).connect(ctx.destination);
  input.connect(conv).connect(wet).connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const b = { input, noise };
  buses.set(ctx, b);
  return b;
}

type Nodes = AudioScheduledSourceNode[];

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
    n.buffer = bus(ctx).noise;
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
function runs(events: readonly GuideEvent[], start: number): { t: number; ev: Exclude<GuideEvent, { type: 'rest' }> }[][] {
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

const firstMidi = (ev: Exclude<GuideEvent, { type: 'rest' }>) => (ev.type === 'note' ? ev.midi : ev.fromMidi);
const lastMidi = (ev: Exclude<GuideEvent, { type: 'rest' }>) => (ev.type === 'note' ? ev.midi : ev.toMidi);

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
  h.buffer = bus(ctx).noise;
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

/** Toca la melodía con el instrumento elegido. Devuelve el instante en que termina. */
export function playMelody(ctx: BaseAudioContext, id: InstrumentId, events: readonly GuideEvent[], start: number, nodes: Nodes): number {
  const out = bus(ctx).input;
  const end = start + events.reduce((a, e) => a + e.durationS, 0);
  if (VOICES[id].legato) {
    playLegato(ctx, id, events, start, out, nodes);
  } else {
    let t = start;
    for (const ev of events) {
      if (ev.type !== 'rest') pianoNote(ctx, firstMidi(ev), lastMidi(ev), t, ev.durationS, out, nodes, VOICES.piano.level);
      t += ev.durationS;
    }
  }
  return end;
}

/**
 * Acompañamiento: acordes de piano (re-pulsados cada 2 s) o, con los instrumentos ligados,
 * un colchón suave de cuerdas. Más bajo que la melodía para no taparla.
 */
export function playChords(ctx: BaseAudioContext, id: InstrumentId, chords: readonly TimedChord[], start: number, nodes: Nodes): void {
  const out = bus(ctx).input;
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
