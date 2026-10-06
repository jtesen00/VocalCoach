import { songFromMelodyFile } from '../core/songs/formats';
import type { Song } from '../core/songs/types';

/**
 * Lee un archivo de melodía (UltraStar, MIDI, MusicXML o .mxl comprimido) del usuario.
 * Todo ocurre en el dispositivo.
 */
export async function importMelodyFile(file: File): Promise<Song> {
  return songFromBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}

export async function songFromBytes(name: string, bytes: Uint8Array): Promise<Song> {
  if (name.toLowerCase().endsWith('.mxl') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const xml = await musicXmlFromMxl(bytes);
    bytes = new TextEncoder().encode(xml.text);
    name = xml.name;
  }
  return songFromMelodyFile(name, bytes, `file-${Date.now().toString(36)}`);
}

/** .mxl = zip con el MusicXML dentro (META-INF/container.xml indica cuál). */
async function musicXmlFromMxl(zip: Uint8Array): Promise<{ name: string; text: string }> {
  const entries = readZip(zip);
  const container = entries.find((e) => e.name === 'META-INF/container.xml');
  let target = container ? /full-path="([^"]+)"/.exec(new TextDecoder().decode(await inflate(container)))?.[1] : undefined;
  target ??= entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith('META-INF/'))?.name;
  const entry = entries.find((e) => e.name === target);
  if (!entry) throw new Error('El archivo .mxl no contiene una partitura MusicXML.');
  return { name: entry.name, text: new TextDecoder().decode(await inflate(entry)) };
}

interface ZipEntry {
  name: string;
  method: number;
  data: Uint8Array;
}

/** Lector zip mínimo por el directorio central (sin cifrado ni zip64). */
function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo .mxl está dañado.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.push({ name, method, data: bytes.subarray(dataStart, dataStart + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(entry: ZipEntry): Promise<Uint8Array> {
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) throw new Error('Compresión de .mxl no compatible.');
  const stream = new Blob([entry.data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
