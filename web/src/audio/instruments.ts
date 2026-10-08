import type { GuideEvent } from '../core/exercises/guide';
import { chordMidis, type TimedChord } from '../core/music/chords';
import { mix } from './mix';
import { getBank, loadBank, pickNote, rateFor, type SampleBank, type SampleNote } from './samples';
import { firstMidi, lastMidi, runs, synthChords, synthMelody, type Nodes } from './synth';

/**
 * Instrumentos de la guía y las demostraciones: grabaciones reales nota a nota
 * (piano de cola, voz, silbido, flauta y cuerdas), afinadas y tocadas ligadas.
 * Mientras cargan, o si no se pueden cargar, suenan versiones sintetizadas.
 */
export type InstrumentId = 'piano' | 'silbido' | 'flauta' | 'voz' | 'cuerdas';

export const INSTRUMENTS: { id: InstrumentId; name: string; description: string }[] = [
  { id: 'piano', name: 'Piano', description: 'Piano de cola grabado: cada nota clara y definida.' },
  { id: 'voz', name: 'Voz «uuh»', description: 'Voces cantando «uuh»: la referencia más fácil de imitar.' },
  { id: 'silbido', name: 'Silbido', description: 'Silbido real, ligado: la melodía se oye muy limpia.' },
  { id: 'flauta', name: 'Flauta', description: 'Flauta travesera, suave y ligada.' },
  { id: 'cuerdas', name: 'Cuerdas', description: 'Sección de violines: cálido y continuo.' },
];

/** Instrumento del acompañamiento: piano con el piano; colchón de cuerdas con los demás. */
const padFor = (id: InstrumentId): InstrumentId => (id === 'piano' ? 'piano' : 'cuerdas');

/** Descarga las grabaciones del instrumento (y de su acompañamiento). `true` si están listas. */
export async function loadInstrument(id: InstrumentId): Promise<boolean> {
  const [a, b] = await Promise.all([loadBank(id), loadBank(padFor(id))]);
  return a !== null && b !== null;
}

export function instrumentReady(id: InstrumentId): boolean {
  return getBank(id) !== null;
}

interface Style {
  level: number;
  /** Deslizamiento entre notas ligadas (s). */
  glide: number;
  /** Profundidad del vibrato (centésimas) y frecuencia (Hz). */
  vibrato: number;
  vibratoHz: number;
  release: number;
}

const STYLE: Record<InstrumentId, Style> = {
  piano: { level: 0.9, glide: 0, vibrato: 0, vibratoHz: 0, release: 0.25 },
  voz: { level: 1.0, glide: 0.08, vibrato: 18, vibratoHz: 5.3, release: 0.2 },
  silbido: { level: 0.85, glide: 0.06, vibrato: 0, vibratoHz: 5.6, release: 0.12 },
  flauta: { level: 0.95, glide: 0.04, vibrato: 10, vibratoHz: 5.2, release: 0.15 },
  cuerdas: { level: 0.9, glide: 0.06, vibrato: 0, vibratoHz: 5.5, release: 0.3 },
};

/** Solape entre una nota ligada y la siguiente (s). */
const XFADE = 0.07;
/** Las notas ligadas empiezan tras su ataque: suena una sola línea continua, sin re-atacar. */
const LEGATO_OFFSET = 0.12;

function source(ctx: BaseAudioContext, bank: SampleBank, midi: number, t: number, offset: number, nodes: Nodes) {
  const { note, base } = pickNote(bank, midi);
  const src = ctx.createBufferSource();
  src.buffer = bank.buffer;
  src.playbackRate.setValueAtTime(rateFor(note, midi), t);
  if (note.loop) {
    src.loop = true;
    src.loopStart = base + note.loop[0];
    src.loopEnd = base + note.loop[1];
  }
  src.start(t, base + offset);
  nodes.push(src);
  return { src, note, base };
}

/** Línea ligada con un instrumento sostenido: cada nota se funde con la siguiente y la altura se desliza. */
function playSustained(ctx: BaseAudioContext, id: InstrumentId, bank: SampleBank, events: readonly GuideEvent[], start: number, out: AudioNode, nodes: Nodes, gainScale = 1) {
  const st = STYLE[id];
  const L = st.level * gainScale;
  for (const run of runs(events, start)) {
    const runEnd = run[run.length - 1].t + run[run.length - 1].ev.durationS;
    const lfo = st.vibrato ? ctx.createOscillator() : null;
    if (lfo) {
      lfo.frequency.value = st.vibratoHz;
      lfo.start(run[0].t);
      lfo.stop(runEnd + st.release * 3);
      nodes.push(lfo);
    }
    let prev: { src: AudioBufferSourceNode; g: GainNode; note: SampleNote; midi: number; glide: boolean } | null = null;
    run.forEach(({ t, ev }, i) => {
      const from = firstMidi(ev);
      const to = lastMidi(ev);
      const end = t + ev.durationS;
      const first = i === 0;
      const t0 = first ? t : t - XFADE / 2;
      const { src, note } = source(ctx, bank, (from + to) / 2, t0, first ? 0 : LEGATO_OFFSET, nodes);
      const g = ctx.createGain();
      src.connect(g).connect(out);

      // Altura: deslizamiento desde la nota anterior; las sirenas se deslizan enteras.
      const r = (m: number) => rateFor(note, m);
      if (ev.type === 'glide') {
        src.playbackRate.setValueAtTime(r(from), t);
        src.playbackRate.exponentialRampToValueAtTime(r(to), end);
      } else if (prev && !prev.glide && st.glide > 0) {
        const gl = Math.min(st.glide, ev.durationS / 3);
        src.playbackRate.setValueAtTime(r(prev.midi), t0);
        src.playbackRate.exponentialRampToValueAtTime(r(from), t0 + gl);
        // La nota que se va también se desliza hacia la nueva mientras se apaga.
        const pr = (m: number) => rateFor(prev!.note, m);
        prev.src.playbackRate.setValueAtTime(pr(prev.midi), t0);
        prev.src.playbackRate.exponentialRampToValueAtTime(pr(from), t0 + gl);
      } else {
        src.playbackRate.setValueAtTime(r(from), t0);
      }

      // Volumen: entra suave (o con su ataque natural si es la primera) y se funde con la siguiente.
      g.gain.setValueAtTime(first ? L : 0, t0);
      if (!first) g.gain.linearRampToValueAtTime(L, t0 + XFADE);
      // Frase musical: las notas largas crecen un poco y se relajan al final.
      if (ev.durationS > 0.9) {
        g.gain.linearRampToValueAtTime(L * 1.12, t + ev.durationS * 0.55);
        g.gain.linearRampToValueAtTime(L, end - 0.05);
      }
      if (prev) {
        prev.g.gain.cancelScheduledValues(t0);
        prev.g.gain.setValueAtTime(L, t0);
        prev.g.gain.linearRampToValueAtTime(0, t0 + XFADE);
        prev.src.stop(t0 + XFADE + 0.02);
      }
      if (i === run.length - 1) {
        g.gain.setValueAtTime(L, end);
        g.gain.setTargetAtTime(0, end, st.release / 3);
        src.stop(end + st.release * 2);
      }

      // Vibrato: aparece poco a poco en las notas que duran.
      if (lfo && src.detune && ev.type === 'note' && ev.durationS > 0.35) {
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(0, t + 0.25);
        depth.gain.linearRampToValueAtTime(st.vibrato, t + 0.6);
        lfo.connect(depth).connect(src.detune);
      }
      prev = { src, g, note, midi: to, glide: ev.type === 'glide' };
    });
  }
}

/** Nota de piano grabada; con `toMidi` distinto se desliza (sirenas). */
function pianoNote(ctx: BaseAudioContext, bank: SampleBank, midi: number, toMidi: number, t: number, dur: number, out: AudioNode, nodes: Nodes, velocity: number) {
  const { src, note } = source(ctx, bank, midi, t, 0, nodes);
  const rate = rateFor(note, midi);
  if (toMidi !== midi) src.playbackRate.exponentialRampToValueAtTime(rateFor(note, toMidi), t + dur);
  const g = ctx.createGain();
  // Los pianos suenan más brillantes cuanto más fuerte se toca.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500 + velocity * 9000;
  src.connect(lp).connect(g).connect(out);
  g.gain.setValueAtTime(velocity, t);
  // Apagador al soltar la tecla; la ranura grabada dura `slot` s.
  const maxEnd = t + (bank.slot - 0.05) / rate;
  const release = Math.min(t + dur, maxEnd - 0.3);
  g.gain.setValueAtTime(velocity, release);
  g.gain.setTargetAtTime(0, release, 0.09);
  src.stop(Math.min(maxEnd, release + 0.6));
}

/** Toca la melodía con el instrumento elegido. Devuelve el instante en que termina. */
export function playMelody(ctx: BaseAudioContext, id: InstrumentId, events: readonly GuideEvent[], start: number, nodes: Nodes): number {
  const out = mix(ctx).melody;
  const end = start + events.reduce((a, e) => a + e.durationS, 0);
  const bank = getBank(id);
  if (!bank) {
    synthMelody(ctx, id, events, start, out, nodes);
    return end;
  }
  if (bank.sustain) {
    playSustained(ctx, id, bank, events, start, out, nodes);
  } else {
    let t = start;
    for (const ev of events) {
      if (ev.type !== 'rest') pianoNote(ctx, bank, firstMidi(ev), lastMidi(ev), t, ev.durationS, out, nodes, STYLE.piano.level);
      t += ev.durationS;
    }
  }
  return end;
}

/**
 * Acompañamiento: acordes de piano (re-tocados cada ~2 s, con el bajo un poco más fuerte)
 * o un colchón de cuerdas. Va por el bus de acompañamiento: más bajo y sin agudos.
 */
export function playChords(ctx: BaseAudioContext, id: InstrumentId, chords: readonly TimedChord[], start: number, nodes: Nodes): void {
  const out = mix(ctx).accomp;
  const padId = padFor(id);
  const bank = getBank(padId);
  if (!bank) {
    synthChords(ctx, id, chords, start, out, nodes);
    return;
  }
  for (const c of chords) {
    const t0 = start + c.startS;
    const t1 = start + c.endS;
    const midis = chordMidis(c.chord);
    if (!bank.sustain) {
      for (let t = t0; t < t1 - 0.2; t += 2) {
        const d = Math.min(2, t1 - t);
        midis.forEach((m, i) => pianoNote(ctx, bank, m, m, t + i * 0.015, d, out, nodes, i === 0 ? 0.55 : 0.38));
      }
    } else {
      for (const [i, m] of midis.entries()) {
        const { src } = source(ctx, bank, m, t0, 0, nodes);
        const g = ctx.createGain();
        const level = i === 0 ? 0.42 : 0.3;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(level, t0 + 0.2);
        g.gain.setValueAtTime(level, Math.max(t0 + 0.2, t1 - 0.05));
        g.gain.linearRampToValueAtTime(0, t1 + 0.35);
        src.connect(g).connect(out);
        src.stop(t1 + 0.4);
      }
    }
  }
}
