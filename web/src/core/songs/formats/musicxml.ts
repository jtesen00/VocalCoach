import { child, children, parseXml, textOf, type XmlElement } from './xml';
import { MelodyFormatError, type ParsedMelody, type TimedNote } from './types';

/**
 * MusicXML "partwise" (exportado por MuseScore, Sibelius, Finale…). Se toma la parte con
 * letra (o la primera) y su voz 1; se respetan ligaduras, acordes (nota más aguda),
 * `backup`/`forward`, cambios de tempo y la letra con sus guiones de separación silábica.
 */
const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface PartNotes {
  name: string;
  notes: TimedNote[];
  hasLyrics: boolean;
}

function readPart(part: XmlElement, name: string, defaultTempo: number): PartNotes {
  let divisions = 1;
  let tempo = defaultTempo; // negras por minuto
  let timeS = 0; // inicio del compás en segundos
  const notes: TimedNote[] = [];
  let hasLyrics = false;
  let tiedFrom: TimedNote | null = null;
  let pendingHyphen = false;

  for (const measure of children(part, 'measure')) {
    let cursor = 0; // en divisiones, dentro del compás
    let measureLength = 0;
    let lastStart = 0;
    const toS = (div: number) => timeS + (div / divisions) * (60 / tempo);
    for (const el of measure.children) {
      if (el.name === 'attributes') {
        const d = Number(textOf(el, 'divisions'));
        if (d > 0) divisions = d;
      } else if (el.name === 'sound' || el.name === 'direction') {
        const sound = el.name === 'sound' ? el : child(el, 'sound');
        // Tempo: <sound tempo> o, si no, la indicación de metrónomo (en negras).
        const metronome = el.name === 'direction' ? child(child(el, 'direction-type'), 'metronome') : undefined;
        const unit = { half: 2, quarter: 1, eighth: 0.5 }[textOf(metronome, 'beat-unit') ?? 'quarter'] ?? 1;
        const t = Number(sound?.attrs.tempo) || Number(textOf(metronome, 'per-minute')) * unit;
        if (t > 0) tempo = t;
      } else if (el.name === 'backup') {
        cursor -= Number(textOf(el, 'duration')) || 0;
      } else if (el.name === 'forward') {
        cursor += Number(textOf(el, 'duration')) || 0;
        measureLength = Math.max(measureLength, cursor);
      } else if (el.name === 'note') {
        const duration = Number(textOf(el, 'duration')) || 0;
        const isChord = !!child(el, 'chord');
        const voice = textOf(el, 'voice') ?? '1';
        const grace = !!child(el, 'grace');
        const start = isChord ? lastStart : cursor;
        if (!isChord) {
          lastStart = cursor;
          cursor += duration;
          measureLength = Math.max(measureLength, cursor);
        }
        if (grace || voice !== '1' || child(el, 'rest')) continue;
        const pitch = child(el, 'pitch');
        if (!pitch) continue; // percusión o nota sin altura
        const midi = 12 * (Number(textOf(pitch, 'octave')) + 1) + STEP[textOf(pitch, 'step') ?? 'C'] + (Number(textOf(pitch, 'alter')) || 0);
        const startS = toS(start);
        const endS = toS(start + duration);
        const ties = children(el, 'tie').map((t) => t.attrs.type);
        const lyric = child(el, 'lyric');
        const syllableText = lyric ? children(lyric, 'text').map((t) => t.text).join('') : undefined;

        if (isChord) {
          // Acorde: se queda la nota más aguda en el mismo instante.
          const prev = notes[notes.length - 1];
          if (prev && Math.abs(prev.startS - startS) < 1e-6 && midi > prev.midi) prev.midi = midi;
          continue;
        }
        if (tiedFrom && ties.includes('stop') && tiedFrom.midi === midi) {
          tiedFrom.endS = endS; // continuación ligada: alarga la nota anterior
          if (!ties.includes('start')) tiedFrom = null;
          continue;
        }
        let syllable: string | undefined;
        if (syllableText) {
          hasLyrics = true;
          const syllabic = textOf(lyric, 'syllabic') ?? 'single';
          // Las sílabas que empiezan palabra llevan espacio delante (como en UltraStar).
          syllable = (pendingHyphen ? '' : ' ') + syllableText;
          pendingHyphen = syllabic === 'begin' || syllabic === 'middle';
        }
        const note: TimedNote = { startS, endS, midi, syllable };
        notes.push(note);
        tiedFrom = ties.includes('start') ? note : null;
      }
    }
    timeS = toS(measureLength);
  }
  return { name, notes, hasLyrics };
}

export function parseMusicXml(source: string): ParsedMelody {
  const doc = parseXml(source);
  const score = child(doc, 'score-partwise');
  if (!score) {
    if (child(doc, 'score-timewise')) throw new MelodyFormatError('MusicXML "timewise" no es compatible: expórtalo como "partwise" (lo habitual).');
    throw new MelodyFormatError('No es un archivo MusicXML.');
  }
  const names = new Map(children(child(score, 'part-list'), 'score-part').map((p) => [p.attrs.id, textOf(p, 'part-name') ?? p.attrs.id]));
  const parts = children(score, 'part').map((p) => readPart(p, names.get(p.attrs.id) ?? p.attrs.id ?? '', 120));
  const melody = parts.find((p) => p.hasLyrics && p.notes.length) ?? parts.find((p) => p.notes.length);
  if (!melody) throw new MelodyFormatError('El MusicXML no tiene notas.');
  const title = textOf(child(score, 'work'), 'work-title') ?? textOf(score, 'movement-title') ?? 'Canción importada';
  const creator = children(child(score, 'identification'), 'creator').find((c) => c.attrs.type === 'composer')?.text.trim();
  const warnings = parts.length > 1 ? [`Melodía tomada de la parte «${melody.name}».`] : [];
  return { title, artist: creator, notes: melody.notes.filter((n) => n.endS > n.startS), lineStartsS: [], warnings };
}
