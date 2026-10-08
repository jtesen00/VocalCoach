import { describe, expect, it } from 'vitest';
import { allPhrases } from '../core/songs/melody';
import { songFromBytes } from './melody-file';

const XML = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Comprimida</work-title></work>
<part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><part id="P1"><measure number="1">
<attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><lyric><syllabic>single</syllabic><text>Do</text></lyric></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><lyric><syllabic>single</syllabic><text>re</text></lyric></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><lyric><syllabic>single</syllabic><text>mi</text></lyric></note>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><lyric><syllabic>single</syllabic><text>fa</text></lyric></note>
</measure></part></score-partwise>`;

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Zip mínimo (como un .mxl de MuseScore): container.xml sin comprimir + partitura comprimida. */
async function mxl(): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const files = [
    { name: 'META-INF/container.xml', data: enc.encode('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'), method: 0 },
    { name: 'score.xml', data: enc.encode(XML), method: 8 },
  ];
  const local: number[] = [];
  const central: number[] = [];
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const body = f.method === 8 ? await deflateRaw(f.data) : f.data;
    const name = [...enc.encode(f.name)];
    const offset = local.length;
    local.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(f.method), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...name, ...body);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(f.method), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
  }
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(local.length), ...u16(0)];
  return new Uint8Array([...local, ...central, ...end]);
}

describe('MusicXML comprimido (.mxl)', () => {
  it('se descomprime, se lee la partitura que indica container.xml y sale con su letra', async () => {
    const song = await songFromBytes('cancion.mxl', await mxl());
    expect(song.title).toBe('Comprimida');
    expect(allPhrases(song).map((r) => r.phrase.lyrics).join(' ')).toBe('Do re mi fa');
    expect(song.source?.format).toBe('musicxml');
  });
});
