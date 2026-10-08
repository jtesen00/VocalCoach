import { describe, expect, it } from 'vitest';
import { allPhrases } from '../melody';
import { parseMidi } from './midi';
import { parseMusicXml } from './musicxml';
import { parseUltraStar } from './ultrastar';
import { parseMelodyFile, songFromMelodyFile } from './index';
import { melodyToSong } from './to-song';

// Canción de prueba original («Luz de puerto», del catálogo de la app).
const ULTRASTAR = `#TITLE:Luz de puerto
#ARTIST:Vocal Coach
#BPM:300
#GAP:1000
: 0 4 0 Luz
: 4 4 2  de
: 8 8 4  puer
: 16 8 2 to~
- 28
: 32 4 4 bri
* 36 4 5 lla
F 40 2 0  (¡eh!)
: 44 12 7  ya
E
`;

describe('UltraStar', () => {
  it('lee cabecera, tiempos, alturas, letra y saltos de línea', () => {
    const m = parseUltraStar(ULTRASTAR);
    expect(m.title).toBe('Luz de puerto');
    expect(m.artist).toBe('Vocal Coach');
    // Un pulso = 60 / (300 × 4) = 0,05 s; GAP 1 s.
    expect(m.notes[0]).toEqual({ startS: 1, endS: 1.2, midi: 60, syllable: 'Luz' });
    expect(m.notes[3]).toMatchObject({ startS: 1.8, endS: 2.2, midi: 62 });
    expect(m.notes.map((n) => n.midi)).toEqual([60, 62, 64, 62, 64, 65, 67]);
    expect(m.lineStartsS).toEqual([1, 2.6]);
    // La sílaba hablada (F) no tiene nota: su texto pasa a la nota anterior.
    expect(m.notes[5].syllable).toBe('lla (¡eh!)');
    expect(m.warnings.join(' ')).toMatch(/habladas/);
  });

  it('modo relativo: los pulsos cuentan desde el inicio de cada línea', () => {
    const rel = `#TITLE:x\n#BPM:300\n#GAP:0\n#RELATIVE:yes\n: 0 4 0 a\n- 8 8\n: 0 4 2 b\nE\n`;
    const m = parseUltraStar(rel);
    expect(m.notes.map((n) => n.startS)).toEqual([0, 0.4]);
  });

  it('sin #BPM da un error claro', () => {
    expect(() => parseUltraStar('#TITLE:x\n: 0 4 0 a\n')).toThrow(/BPM/);
  });

  it('canción: una frase por línea, con su letra y sílabas', () => {
    const song = melodyToSong(parseUltraStar(ULTRASTAR), { id: 's', format: 'ultrastar' });
    const phrases = allPhrases(song).map((r) => r.phrase);
    expect(phrases.map((p) => p.lyrics)).toEqual(['Luz de puerto', 'brilla (¡eh!) ya']);
    expect(phrases[0].notes.map((n) => n.syllable)).toEqual(['Luz', 'de', 'puer', 'to']);
    expect(phrases[0].originS).toBe(1);
    expect(song.source?.format).toBe('ultrastar');
    expect(song.license).toBe('user-provided');
  });
});

/** Escribe un MIDI tipo 1 mínimo: pista 0 con tempo; pistas con notas (y letra opcional). */
function midiFile(tracks: { name: string; notes: [number, number, number][]; lyrics?: [number, string][]; channel?: number }[], usPerQuarter = 500_000, division = 480): Uint8Array {
  const vlq = (n: number) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const text = (s: string) => [...new TextEncoder().encode(s)];
  const chunk = (id: string, body: number[]) => [...text(id), (body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255, ...body];
  const tempoTrack = [0, 0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255, 0, 0xff, 0x2f, 0];
  const trackChunks = tracks.map((t) => {
    const ch = t.channel ?? 0;
    const events: { tick: number; bytes: number[] }[] = [{ tick: 0, bytes: [0xff, 0x03, ...vlq(text(t.name).length), ...text(t.name)] }];
    for (const [tick, dur, key] of t.notes) {
      events.push({ tick, bytes: [0x90 | ch, key, 100] });
      events.push({ tick: tick + dur, bytes: [0x80 | ch, key, 0] });
    }
    for (const [tick, s] of t.lyrics ?? []) events.push({ tick, bytes: [0xff, 0x05, ...vlq(text(s).length), ...text(s)] });
    events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0));
    const body: number[] = [];
    let last = 0;
    for (const e of events) {
      body.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', body);
  });
  return new Uint8Array([...chunk('MThd', [0, 1, 0, tracks.length + 1, (division >> 8) & 255, division & 255]), ...chunk('MTrk', tempoTrack), ...trackChunks.flat()]);
}

describe('MIDI', () => {
  const q = 480; // una negra a 120 bpm = 0,5 s
  const melody: [number, number, number][] = [[0, q, 60], [q, q, 62], [2 * q, 2 * q, 64], [4 * q, q, 65], [5 * q, q, 67], [6 * q, q, 65], [7 * q, q, 64], [8 * q, 2 * q, 62]];
  const chords: [number, number, number][] = [0, 1, 2, 3].flatMap((b) => [[b * 2 * q, 2 * q, 48], [b * 2 * q, 2 * q, 52], [b * 2 * q, 2 * q, 55]] as [number, number, number][]);

  it('elige la pista con letra y la pasa a segundos con el tempo', () => {
    const bytes = midiFile([
      { name: 'Piano', notes: chords, channel: 1 },
      { name: 'Cantante', notes: melody, lyrics: [[0, 'Luz '], [q, 'de '], [2 * q, 'puer'], [4 * q, 'to\n'], [5 * q, 'bri'], [6 * q, 'lla '], [7 * q, 'ya'], [8 * q, '!']] },
    ]);
    const m = parseMidi(bytes, 'luz.kar');
    expect(m.title).toBe('luz');
    expect(m.notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 65, 64, 62]);
    expect(m.notes[2]).toMatchObject({ startS: 1, endS: 2, syllable: 'puer' });
    expect(m.lineStartsS).toEqual([0, 2.5]);
    expect(m.warnings[0]).toMatch(/Cantante/);
  });

  it('sin letra: elige la pista más cantable (no la de acordes ni la batería)', () => {
    const bytes = midiFile([
      { name: 'Acordes', notes: chords, channel: 1 },
      { name: 'Batería', notes: melody.map(([t, d]) => [t, d, 36] as [number, number, number]), channel: 9 },
      { name: 'Flauta', notes: melody, channel: 2 },
    ]);
    expect(parseMidi(bytes).notes.map((n) => n.midi)).toEqual(melody.map((n) => n[2]));
  });

  it('acordes en la pista elegida: se queda la nota más aguda', () => {
    const bytes = midiFile([{ name: 'Melodía', notes: [...melody, ...melody.map(([t, d, k]) => [t, d, k - 12] as [number, number, number])] }]);
    expect(parseMidi(bytes).notes.map((n) => n.midi)).toEqual(melody.map((n) => n[2]));
  });

  it('tempo distinto y archivo no MIDI', () => {
    const slow = parseMidi(midiFile([{ name: 'v', notes: melody }], 1_000_000));
    expect(slow.notes[1].startS).toBeCloseTo(1); // negra a 60 bpm = 1 s
    expect(() => parseMidi(new TextEncoder().encode('hola'))).toThrow();
  });
});

const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Luz de puerto</work-title></work>
  <part-list><score-part id="P1"><part-name>Voz</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><lyric><syllabic>single</syllabic><text>Luz</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><lyric><syllabic>single</syllabic><text>de</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><tie type="start"/><lyric><syllabic>begin</syllabic><text>puer</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><tie type="stop"/></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><lyric><syllabic>end</syllabic><text>to</text></lyric></note>
      <note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note><rest/><duration>2</duration><voice>1</voice></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><lyric><syllabic>single</syllabic><text>ya &amp; ya</text></lyric></note>
    </measure>
  </part>
  <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note></measure></part>
</score-partwise>`;

describe('MusicXML', () => {
  it('lee la parte con letra: ligaduras, acordes, silencios, voz 1 y tempo', () => {
    const m = parseMusicXml(MUSICXML);
    expect(m.title).toBe('Luz de puerto');
    expect(m.notes.map((n) => n.midi)).toEqual([60, 62, 64, 69, 67]);
    // Negra = 1 s (metrónomo a 60). La nota ligada dura dos negras.
    expect(m.notes[2]).toMatchObject({ startS: 2, endS: 4 });
    expect(m.notes[3]).toMatchObject({ startS: 4, endS: 5 }); // acorde: la más aguda (La4)
    expect(m.notes[4]).toMatchObject({ startS: 6, endS: 8 }); // tras el silencio
    expect(m.notes.map((n) => n.syllable)).toEqual([' Luz', ' de', ' puer', 'to', ' ya & ya']);
    expect(m.warnings[0]).toMatch(/Voz/);
  });

  it('canción con letra unida por palabras', () => {
    const song = melodyToSong(parseMusicXml(MUSICXML), { id: 'x', format: 'musicxml' });
    expect(allPhrases(song).map((r) => r.phrase.lyrics).join(' ')).toBe('Luz de puerto ya & ya');
  });
});

describe('reconocer el formato por el contenido', () => {
  it('UltraStar, MusicXML y MIDI; y un error claro si no es ninguno', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(parseMelodyFile('a.txt', enc(ULTRASTAR)).format).toBe('ultrastar');
    expect(parseMelodyFile('a.xml', enc(MUSICXML)).format).toBe('musicxml');
    expect(parseMelodyFile('a.mid', midiFile([{ name: 'v', notes: [[0, 480, 60], [480, 480, 62], [960, 480, 64], [1440, 480, 65], [1920, 480, 67], [2400, 480, 69], [2880, 480, 71], [3360, 480, 72]] }])).format).toBe('midi');
    expect(() => parseMelodyFile('notas.txt', enc('hola mundo'))).toThrow(/No reconocemos/);
  });

  it('UltraStar en Windows-1252 (archivos antiguos) se lee con sus tildes', () => {
    const latin = new Uint8Array([...new TextEncoder().encode('#TITLE:Canci'), 0xf3, ...new TextEncoder().encode('n\n#BPM:300\n#GAP:0\n: 0 4 0 a\nE\n')]);
    expect(songFromMelodyFile('a.txt', latin, 'id').title).toBe('Canción');
  });
});
