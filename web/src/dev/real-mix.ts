/**
 * Mezcla "de canción" con instrumentos GRABADOS, para medir la extracción de melodía en
 * condiciones parecidas a un MP3 real (se ejecuta en el navegador, servido por Vite).
 *
 * - Cantante: grabación de voz «uuh», con lo que hace un cantante de verdad: entra algo bajo
 *   y sube a la nota (scoop), vibrato que aparece en las notas largas, pequeñas desafinaciones
 *   lentas y huecos breves entre sílabas.
 * - Banda: piano de cola acompañando en corcheas (izquierda), cuerdas (derecha), bajo de piano
 *   y batería sintetizada (bombo, caja y charles).
 * - Reverb de sala en todo, como en una producción.
 *
 * La melodía son las frases de «Luz de puerto» (canción original del catálogo).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { allPhrases, phrasePlan } from '../core/songs/melody';
import { SONGS } from '../core/songs/catalog';
import { chordMidis } from '../core/music/chords';
import { loadBank, pickNote, rateFor, type SampleBank } from '../audio/samples';
import type { TruthNote } from '../core/songs/test-mix';

export interface RealMixOptions {
  sampleRate?: number;
  /** Voz respecto a la banda (dB). */
  vocalDb?: number;
  stereo?: boolean;
  transpose?: number;
  /** Vibrato del cantante (centésimas). */
  vibrato?: number;
  /** Desafinación lenta máxima (centésimas). */
  drift?: number;
  seed?: number;
  /** Número de frases (por defecto, las 8 de la canción). */
  phrases?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function voiceNote(ctx: BaseAudioContext, bank: SampleBank, midi: number, t: number, dur: number, out: AudioNode, random: () => number, o: Required<RealMixOptions>) {
  const { note, base } = pickNote(bank, midi);
  const src = ctx.createBufferSource();
  src.buffer = bank.buffer;
  src.loop = true;
  src.loopStart = base + note.loop![0];
  src.loopEnd = base + note.loop![1];
  src.playbackRate.value = rateFor(note, midi);
  // Scoop: entra hasta 70 centésimas bajo y sube en ~80 ms; deriva lenta y vibrato.
  const scoop = -20 - random() * 50;
  const drift = (random() * 2 - 1) * o.drift;
  src.detune.setValueAtTime(scoop, t);
  src.detune.linearRampToValueAtTime(drift, t + 0.08);
  src.detune.linearRampToValueAtTime(-drift * 0.5, t + dur);
  if (o.vibrato && dur > 0.4) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2 + random() * 0.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + 0.2);
    depth.gain.linearRampToValueAtTime(o.vibrato, t + 0.6);
    lfo.connect(depth).connect(src.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + 0.03);
  g.gain.setValueAtTime(1, t + dur - 0.04);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(g).connect(out);
  src.start(t, base + 0.05);
  src.stop(t + dur + 0.05);
}

function pianoHit(ctx: BaseAudioContext, bank: SampleBank, midi: number, t: number, dur: number, vel: number, out: AudioNode) {
  const { note, base } = pickNote(bank, midi);
  const src = ctx.createBufferSource();
  src.buffer = bank.buffer;
  src.playbackRate.value = rateFor(note, midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.setValueAtTime(vel, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.08);
  src.connect(g).connect(out);
  src.start(t, base);
  src.stop(t + Math.min(dur + 0.5, 3.5));
}

function strings(ctx: BaseAudioContext, bank: SampleBank, midi: number, t0: number, t1: number, vel: number, out: AudioNode) {
  const { note, base } = pickNote(bank, midi);
  const src = ctx.createBufferSource();
  src.buffer = bank.buffer;
  src.loop = true;
  src.loopStart = base + note.loop![0];
  src.loopEnd = base + note.loop![1];
  src.playbackRate.value = rateFor(note, midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vel, t0 + 0.3);
  g.gain.setValueAtTime(vel, t1 - 0.1);
  g.gain.linearRampToValueAtTime(0, t1 + 0.3);
  src.connect(g).connect(out);
  src.start(t0, base);
  src.stop(t1 + 0.35);
}

function drums(ctx: BaseAudioContext, beatS: number, from: number, to: number, out: AudioNode, panHat: AudioNode, random: () => number) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = random() * 2 - 1;
  let beat = 0;
  for (let t = from; t < to; t += beatS / 2, beat++) {
    // Charles en corcheas.
    const h = ctx.createBufferSource();
    h.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.12, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    h.connect(hp).connect(hg).connect(panHat);
    h.start(t);
    h.stop(t + 0.06);
    if (beat % 2 !== 0) continue;
    const q = (beat / 2) % 4;
    if (q === 0 || q === 2) {
      // Bombo: seno que cae de 120 a 45 Hz.
      const k = ctx.createOscillator();
      k.frequency.setValueAtTime(120, t);
      k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      k.connect(kg).connect(out);
      k.start(t);
      k.stop(t + 0.32);
    } else {
      // Caja: ruido de banda media + tono.
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      bp.Q.value = 0.7;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.5, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      s.connect(bp).connect(sg).connect(out);
      s.start(t);
      s.stop(t + 0.2);
    }
  }
}

function impulse(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const len = Math.round(1.8 * ctx.sampleRate);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (random() * 2 - 1) * Math.exp((-4.5 * i) / len);
  }
  return ir;
}

export async function renderRealMix(options: RealMixOptions = {}): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number; melody: TruthNote[] }> {
  const o: Required<RealMixOptions> = { sampleRate: 22050, vocalDb: 0, stereo: true, transpose: 0, vibrato: 35, drift: 15, seed: 7, phrases: 8, ...options };
  const [voz, piano, cuerdas] = await Promise.all([loadBank('voz'), loadBank('piano'), loadBank('cuerdas')]);
  if (!voz || !piano || !cuerdas) throw new Error('no se cargaron las muestras');
  const random = rng(o.seed);
  const song = SONGS.find((s) => s.id === 'luz-de-puerto')!;
  const refs = allPhrases(song).slice(0, o.phrases);
  const beatS = 60 / song.bpm;

  // Tiempos: 2 compases de introducción y 1 pulso entre frases.
  const plans: { t: number; plan: ReturnType<typeof phrasePlan> }[] = [];
  let t = 4 * beatS;
  for (const r of refs) {
    const plan = phrasePlan(r, o.transpose);
    plans.push({ t, plan });
    t += plan.durationS + beatS;
  }
  const total = t + 2;
  const sr = o.sampleRate;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, random);
  const verbSend = ctx.createGain();
  verbSend.gain.value = 0.25;
  verb.connect(verbSend).connect(master);
  const bus = (pan: number, gain: number, wet = 0.4) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = o.stereo ? pan : 0;
    g.connect(p).connect(master);
    const s = ctx.createGain();
    s.gain.value = wet;
    p.connect(s).connect(verb);
    return g;
  };
  const vocal = bus(0, 0.9 * 10 ** (o.vocalDb / 20), 0.35);
  const pianoBus = bus(-0.45, 0.55);
  const stringsBus = bus(0.5, 0.45);
  const bassBus = bus(0, 0.7, 0.1);
  const drumBus = bus(0, 0.35, 0.15);
  const hatBus = bus(0.3, 0.35, 0.15);

  const melody: TruthNote[] = [];
  for (const { t: t0, plan } of plans) {
    for (const s of plan.segments) {
      // Hueco de consonante entre sílabas (30–70 ms) al final de cada nota.
      const gap = 0.03 + random() * 0.04;
      const start = t0 + s.startS;
      const end = t0 + s.endS - gap;
      voiceNote(ctx, voz, s.fromMidi, start, end - start, vocal, random, o);
      melody.push({ midi: s.fromMidi, startS: start, endS: end });
    }
    // Banda: acordes de la frase.
    for (const c of plan.chords ?? []) {
      const c0 = t0 + c.startS;
      const c1 = t0 + c.endS;
      const ms = chordMidis(c.chord);
      for (let b = c0; b < c1 - 0.01; b += beatS / 2) {
        const accent = Math.round((b - c0) / (beatS / 2)) % 2 === 0;
        ms.slice(1).forEach((m) => pianoHit(ctx, piano, m + 12, b, beatS / 2, accent ? 0.35 : 0.22, pianoBus));
      }
      for (let b = c0; b < c1 - 0.01; b += beatS) pianoHit(ctx, piano, ms[0] - 12 + (Math.round((b - c0) / beatS) % 2 ? 7 : 0), b, beatS * 0.9, 0.8, bassBus);
      ms.slice(1).forEach((m) => strings(ctx, cuerdas, m, c0, c1, 0.25, stringsBus));
    }
  }
  drums(ctx, beatS, 0, total - 1.5, drumBus, hatBus, random);
  const b = await ctx.startRendering();
  const left = b.getChannelData(0);
  const right = o.stereo ? b.getChannelData(1) : left;
  return { left, right, sampleRate: sr, melody };
}
