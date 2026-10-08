/**
 * Instrumentos grabados (muestras reales) para la guía. Cada instrumento es un único MP3
 * con una nota cada 3 semitonos (C2…C7) en ranuras de duración fija; `manifest.json` dice
 * la afinación medida de cada nota y, en los sostenidos, el bucle para notas largas.
 * Se generan con `scripts/build-samples.py`. Créditos y licencias: `public/samples/CREDITS.md`.
 *
 * Se descargan del propio servidor de la app la primera vez que hacen falta y se guardan
 * en memoria. Si no se pueden cargar, la guía usa los instrumentos sintetizados.
 */
export type SampledId = 'piano' | 'voz' | 'silbido' | 'flauta' | 'cuerdas';

export interface SampleNote {
  midi: number;
  /** Afinación medida de la grabación, en centésimas (se corrige al tocar). */
  tune: number;
  /** Bucle [inicio, fin] en segundos dentro de la ranura (solo instrumentos sostenidos). */
  loop?: [number, number];
}

interface ManifestEntry {
  file: string;
  slot: number;
  sustain: boolean;
  preRoll: number;
  notes: SampleNote[];
}

export interface SampleBank {
  buffer: AudioBuffer;
  slot: number;
  sustain: boolean;
  notes: SampleNote[];
  /** Retardo que haya añadido el decodificador al principio del MP3 (s). */
  offset: number;
}

const BASE = `${import.meta.env.BASE_URL}samples/`;
let manifest: Promise<Record<SampledId, ManifestEntry>> | null = null;
const banks = new Map<SampledId, SampleBank>();
const loading = new Map<SampledId, Promise<SampleBank | null>>();

function getManifest() {
  manifest ??= fetch(`${BASE}manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json();
    })
    .then((m) => (m as { instruments: Record<SampledId, ManifestEntry> }).instruments)
    .catch((e) => {
      manifest = null;
      throw e;
    });
  return manifest;
}

/** Algunos decodificadores añaden silencio al principio del MP3: se mide en la primera nota. */
function decoderOffset(buffer: AudioBuffer, preRoll: number): number {
  const d = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const end = Math.min(d.length, Math.round(0.3 * sr));
  let peak = 0;
  for (let i = 0; i < end; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = 0.02 * peak;
  let i = 0;
  while (i < end && Math.abs(d[i]) <= thr) i++;
  return Math.max(0, Math.min(0.1, i / sr - preRoll));
}

export function loadBank(id: SampledId): Promise<SampleBank | null> {
  const ready = banks.get(id);
  if (ready) return Promise.resolve(ready);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      try {
        const entry = (await getManifest())[id];
        const res = await fetch(BASE + entry.file);
        if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
        const data = await res.arrayBuffer();
        // Un AudioBuffer sirve en cualquier contexto: se decodifica en uno propio, sin micrófono.
        const decoder = new OfflineAudioContext(1, 1, 44100);
        const buffer = await decoder.decodeAudioData(data);
        const bank: SampleBank = { buffer, slot: entry.slot, sustain: entry.sustain, notes: entry.notes, offset: decoderOffset(buffer, entry.preRoll) };
        banks.set(id, bank);
        return bank;
      } catch {
        loading.delete(id);
        return null;
      }
    })();
    loading.set(id, p);
  }
  return p;
}

export function getBank(id: SampledId): SampleBank | null {
  return banks.get(id) ?? null;
}

/** Nota grabada más cercana y su posición en el MP3. */
export function pickNote(bank: SampleBank, midi: number): { note: SampleNote; base: number } {
  let best = 0;
  for (let i = 1; i < bank.notes.length; i++) {
    if (Math.abs(bank.notes[i].midi - midi) < Math.abs(bank.notes[best].midi - midi)) best = i;
  }
  return { note: bank.notes[best], base: best * bank.slot + bank.offset };
}

/** Velocidad de reproducción para que `note` suene en `midi`, con su afinación corregida. */
export function rateFor(note: SampleNote, midi: number): number {
  return 2 ** ((midi - note.midi - note.tune / 100) / 12);
}
