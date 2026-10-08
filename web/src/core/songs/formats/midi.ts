import { decodeText } from './ultrastar';
import { MelodyFormatError, type ParsedMelody, type TimedNote } from './types';

/**
 * MIDI estándar (.mid) y karaoke (.kar). Se elige la pista de la melodía:
 *  1. la que trae letra (eventos de letra o texto de .kar);
 *  2. si no, la que se llama voz / vocal / melodía / canto / lead;
 *  3. si no, la más "cantable": en el registro de la voz, con pocas notas simultáneas.
 * Después se deja una sola nota a la vez (la más aguda) y se pasa a segundos con el mapa de tempo.
 */
interface RawNote {
  tick: number;
  endTick: number;
  midi: number;
  channel: number;
}

interface Track {
  name: string;
  notes: RawNote[];
  lyrics: { tick: number; text: string }[];
}

class Reader {
  pos = 0;
  constructor(readonly bytes: Uint8Array) {}

  u8() {
    if (this.pos >= this.bytes.length) throw new MelodyFormatError('El archivo MIDI está incompleto.');
    return this.bytes[this.pos++];
  }

  u16() {
    return (this.u8() << 8) | this.u8();
  }

  u32() {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }

  vlq() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new MelodyFormatError('Número variable no válido en el MIDI.');
  }

  text(n: number) {
    const s = decodeText(this.bytes.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

function parseTrack(r: Reader, end: number, tempos: { tick: number; usPerQuarter: number }[]): Track {
  const track: Track = { name: '', notes: [], lyrics: [] };
  const open = new Map<number, { tick: number; channel: number }[]>(); // (canal*128+nota) → inicios
  let tick = 0;
  let running = 0;
  while (r.pos < end) {
    tick += r.vlq();
    let status = r.u8();
    if (status < 0x80) {
      r.pos--; // running status
      status = running;
    } else if (status < 0xf0) {
      running = status;
    }
    if (status === 0xff) {
      const type = r.u8();
      const len = r.vlq();
      if (type === 0x51 && len === 3) {
        tempos.push({ tick, usPerQuarter: (r.u8() << 16) | (r.u8() << 8) | r.u8() });
      } else if (type === 0x03) {
        track.name ||= r.text(len);
      } else if (type === 0x05 || type === 0x01) {
        const text = r.text(len);
        // .kar: los textos que empiezan por @ son cabeceras (título, idioma…).
        if (!text.startsWith('@')) track.lyrics.push({ tick, text });
      } else {
        r.pos += len;
      }
      if (type === 0x2f) break;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      r.pos += r.vlq();
      continue;
    }
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const a = r.u8();
    const b = kind === 0xc0 || kind === 0xd0 ? 0 : r.u8();
    const key = channel * 128 + a;
    if (kind === 0x90 && b > 0) {
      const list = open.get(key) ?? [];
      list.push({ tick, channel });
      open.set(key, list);
    } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
      const start = open.get(key)?.shift();
      if (start && tick > start.tick) track.notes.push({ tick: start.tick, endTick: tick, midi: a, channel });
    }
  }
  r.pos = end;
  return track;
}

/** Puntuación de "cantabilidad": registro de voz, poca polifonía y bastantes notas. */
function singability(t: Track): number {
  const notes = t.notes.filter((n) => n.channel !== 9);
  if (notes.length < 8) return -Infinity;
  const inRange = notes.filter((n) => n.midi >= 48 && n.midi <= 84).length / notes.length;
  let overlaps = 0;
  const sorted = [...notes].sort((x, y) => x.tick - y.tick);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].tick < sorted[i - 1].endTick - 1) overlaps++;
  const mono = 1 - overlaps / notes.length;
  return inRange * 2 + mono * 3 + Math.min(1, notes.length / 200);
}

export function parseMidi(bytes: Uint8Array, fileName = 'Canción importada'): ParsedMelody {
  const r = new Reader(bytes);
  if (r.text(4) !== 'MThd') throw new MelodyFormatError('No es un archivo MIDI.');
  const headerLen = r.u32();
  const format = r.u16();
  const ntracks = r.u16();
  const division = r.u16();
  r.pos = 8 + headerLen;
  if (division & 0x8000) throw new MelodyFormatError('MIDI con tiempo SMPTE: no compatible.');
  if (format > 1) throw new MelodyFormatError('MIDI de formato 2: no compatible.');

  const tempos: { tick: number; usPerQuarter: number }[] = [];
  const tracks: Track[] = [];
  for (let i = 0; i < ntracks && r.pos < bytes.length; i++) {
    const id = r.text(4);
    const len = r.u32();
    const end = Math.min(bytes.length, r.pos + len);
    if (id !== 'MTrk') {
      r.pos = end;
      continue;
    }
    tracks.push(parseTrack(r, end, tempos));
  }

  // Formato 0: todo en una pista; se separa por canal para poder elegir la melodía.
  const candidates: Track[] =
    format === 0 && tracks[0]
      ? [...new Set(tracks[0].notes.map((n) => n.channel))].map((ch) => ({ name: `canal ${ch + 1}`, notes: tracks[0].notes.filter((n) => n.channel === ch), lyrics: tracks[0].lyrics }))
      : tracks;

  const warnings: string[] = [];
  const named = /voc|voice|voz|melod|canto|lead|sing|lyric/i;
  const withLyrics = candidates.filter((t) => t.lyrics.length >= 4 && t.notes.length);
  let melody =
    withLyrics.sort((a, b) => singability(b) - singability(a))[0] ??
    candidates.find((t) => named.test(t.name) && t.notes.length >= 8) ??
    [...candidates].sort((a, b) => singability(b) - singability(a))[0];
  if (!melody || !melody.notes.length) throw new MelodyFormatError('El MIDI no tiene notas.');
  // En los .kar la letra suele ir en una pista propia sin notas: se usa con la pista elegida.
  const lyricTrack = melody.lyrics.length ? melody : tracks.find((t) => t.lyrics.length >= 4);
  if (lyricTrack && lyricTrack !== melody) melody = { ...melody, lyrics: lyricTrack.lyrics };
  warnings.push(`Melodía tomada de la pista «${melody.name || 'sin nombre'}».`);

  // Tiempo: mapa de tempo (por defecto 120 bpm).
  tempos.sort((a, b) => a.tick - b.tick);
  const seconds = (tick: number) => {
    let s = 0;
    let lastTick = 0;
    let us = 500_000;
    for (const t of tempos) {
      if (t.tick >= tick) break;
      s += ((t.tick - lastTick) * us) / division / 1e6;
      lastTick = t.tick;
      us = t.usPerQuarter;
    }
    return s + ((tick - lastTick) * us) / division / 1e6;
  };

  // Una nota a la vez: en cada inicio gana la más aguda; la anterior se corta.
  const sorted = melody.notes.filter((n) => n.channel !== 9).sort((a, b) => a.tick - b.tick || b.midi - a.midi);
  const mono: RawNote[] = [];
  for (const n of sorted) {
    const prev = mono[mono.length - 1];
    if (prev && n.tick === prev.tick) continue; // acorde: se queda la más aguda
    if (prev && n.tick < prev.endTick) prev.endTick = n.tick;
    mono.push({ ...n });
  }
  if (sorted.length - mono.length > 0.1 * sorted.length) warnings.push('La pista tenía acordes: se toma la nota más aguda.');

  const notes: TimedNote[] = mono.map((n) => ({ startS: seconds(n.tick), endS: seconds(n.endTick), midi: n.midi }));
  // Letra: cada sílaba a la nota que empieza en su instante (o la más cercana después).
  const lineStarts: number[] = [];
  let newLine = true;
  for (const l of [...melody.lyrics].sort((a, b) => a.tick - b.tick)) {
    let text = l.text.replace(/\r/g, '');
    if (/^[\\/]/.test(text)) {
      newLine = true;
      text = text.slice(1);
    }
    if (text.endsWith('\n')) text = text.slice(0, -1);
    if (!text.trim() && !newLine) continue;
    const t = seconds(l.tick);
    const idx = notes.findIndex((n) => n.startS >= t - 0.02);
    if (idx < 0) continue;
    if (newLine) {
      lineStarts.push(notes[idx].startS);
      newLine = false;
    }
    notes[idx].syllable = (notes[idx].syllable ?? '') + text;
    if (l.text.endsWith('\n') || l.text.endsWith('\r')) newLine = true;
  }

  return { title: fileName.replace(/\.(mid|midi|kar)$/i, ''), notes, lineStartsS: lineStarts, warnings };
}
