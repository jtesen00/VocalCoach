import { DEFAULT_DETECTOR_OPTIONS } from '../core/pitch/detector';
import { PitchTracker } from '../core/pitch/tracker';
import type { DetectorKind, PitchFrame } from '../core/pitch/types';
import { checkBluetooth, type BluetoothCheck } from './devices';
import type { PitchProcessorOptions, WorkletMessage } from './pitch-worklet';
import { scheduleClick, type GuideEvent } from './guide';
import { playChords, playMelody, type InstrumentId } from './instruments';
import type { TimedChord } from '../core/music/chords';
import workletUrl from './pitch-worklet.ts?worker&url';

export type EngineStatus = 'idle' | 'starting' | 'running' | 'error';

export interface EngineDiagnostics {
  sampleRate: number;
  windowSize: number;
  hopSize: number;
  detector: DetectorKind;
  /** Media ventana: retardo inherente del análisis. */
  algorithmicLatencyMs: number;
  /** Latencia de entrada informada por el navegador (Chrome), si existe. */
  inputLatencyMs: number | null;
  baseLatencyMs: number | null;
  /** Retardo medio worklet → hilo principal. */
  transportMs: number;
  processMs: number | null;
  framesPerSecond: number;
  noiseFloorDb: number;
  deviceLabel: string;
  /** Lo que el navegador aplicó realmente; debería ser false en los tres. */
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  bluetooth: BluetoothCheck;
}

export interface EngineSnapshot {
  status: EngineStatus;
  error: string | null;
  /** true mientras suena la nota de referencia: no se analiza la voz. */
  referencePlaying: boolean;
  diagnostics: EngineDiagnostics | null;
}

type FrameListener = (frame: PitchFrame) => void;

/** Tiempo tras la referencia en que se sigue ignorando el micro (reverberación de la sala). */
const REFERENCE_TAIL_S = 0.15;

/**
 * Orquesta micrófono → AudioWorklet → PitchTracker. Independiente de React:
 * la UI se suscribe a los frames (alta frecuencia) y al snapshot (baja frecuencia).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private tracker = new PitchTracker();
  private frameListeners = new Set<FrameListener>();
  private snapshotListeners = new Set<() => void>();
  private suppressUntil = 0;
  private guideNodes: AudioScheduledSourceNode[] = [];
  private instrument: InstrumentId = 'piano';
  private stats = { transport: 0, process: null as number | null, count: 0, windowStart: 0, fps: 0 };
  private snapshot: EngineSnapshot = { status: 'idle', error: null, referencePlaying: false, diagnostics: null };
  private detector: DetectorKind = 'mpm';

  getSnapshot = (): EngineSnapshot => this.snapshot;

  subscribeSnapshot = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Debe llamarse desde un gesto del usuario (requisito de iOS/Chrome para AudioContext). */
  async start(deviceId?: string): Promise<void> {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'starting') return;
    this.update({ status: 'starting', error: null });
    try {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      // iOS Safari 17+: evita que el switch de silencio y la reproducción corten la captura.
      const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (audioSession) audioSession.type = 'play-and-record';

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      await this.ctx.audioWorklet.addModule(workletUrl);
      await this.ctx.resume();

      const processorOptions: PitchProcessorOptions = { detector: this.detector, ...DEFAULT_DETECTOR_OPTIONS };
      this.node = new AudioWorkletNode(this.ctx, 'pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions,
      });
      this.node.port.onmessage = (e: MessageEvent<WorkletMessage>) => this.handle(e.data);

      // La salida va a una ganancia 0 para que el grafo procese el nodo sin oírse el micro.
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      this.ctx.createMediaStreamSource(this.stream).connect(this.node).connect(mute).connect(this.ctx.destination);

      this.tracker = new PitchTracker();
      this.suppressUntil = 0;
      this.stats = { transport: 0, process: null, count: 0, windowStart: performance.now(), fps: 0 };
      this.update({ status: 'running', diagnostics: this.buildDiagnostics() });
    } catch (err) {
      await this.stop();
      this.update({ status: 'error', error: describeError(err) });
    }
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.update({ status: 'idle', referencePlaying: false, diagnostics: null });
  }

  setDetector(kind: DetectorKind): void {
    this.detector = kind;
    this.node?.port.postMessage({ detector: kind });
    this.tracker.reset();
    if (this.snapshot.diagnostics) this.update({ diagnostics: { ...this.snapshot.diagnostics, detector: kind } });
  }

  /** Reloj del AudioContext (s), o null si el micrófono no está activo. */
  now(): number | null {
    return this.ctx?.currentTime ?? null;
  }

  /** Retardo estimado entre el sonido y el `t` de los frames: media ventana + latencia de entrada. */
  latencyS(): number {
    const d = this.snapshot.diagnostics;
    if (!d) return 0;
    return (d.algorithmicLatencyMs + (d.inputLatencyMs ?? 0)) / 1000;
  }

  /**
   * Llamada y respuesta: suena la guía y, mientras tanto, se ignora el micro
   * para no detectar la propia referencia. `done` se resuelve cuando el usuario puede cantar.
   */
  /** Instrumento de la guía y las demostraciones. */
  setInstrument(id: InstrumentId): void {
    this.instrument = id;
  }

  playGuide(events: readonly GuideEvent[], chords?: readonly TimedChord[]): { startT: number; endT: number; done: Promise<void> } {
    const ctx = this.ctx;
    if (!ctx) return { startT: 0, endT: 0, done: Promise.resolve() };
    const startT = ctx.currentTime + 0.08;
    this.guideNodes = this.guideNodes.filter((n) => n.context === ctx);
    const endT = playMelody(ctx, this.instrument, events, startT, this.guideNodes);
    if (chords?.length) playChords(ctx, this.instrument, chords, startT, this.guideNodes);
    return { startT, endT, done: this.suppressUntilTime(endT + REFERENCE_TAIL_S) };
  }

  /** Corta la guía que esté sonando (p. ej. al escuchar una melodía larga). */
  stopGuide(): void {
    const ctx = this.ctx;
    for (const n of this.guideNodes) {
      try {
        n.stop();
      } catch {
        /* ya parado */
      }
    }
    this.guideNodes = [];
    if (ctx) this.suppressUntil = ctx.currentTime;
  }

  playReference(midi: number, durationS = 1.2): Promise<void> {
    return this.playGuide([{ type: 'note', midi, durationS }]).done;
  }

  /**
   * Cuenta atrás con claqueta. Devuelve el instante (reloj del contexto) en que empieza
   * el canto, un pulso después del último clic. El micro se ignora durante los clics.
   */
  countdown(beats: number, beatS: number): { singT: number; beatTimes: number[] } {
    const ctx = this.ctx;
    if (!ctx) return { singT: 0, beatTimes: [] };
    const first = ctx.currentTime + 0.1;
    const beatTimes = Array.from({ length: beats }, (_, i) => first + i * beatS);
    let lastEnd = first;
    beatTimes.forEach((t, i) => (lastEnd = scheduleClick(ctx, t, i === 0)));
    void this.suppressUntilTime(lastEnd + 0.1);
    return { singT: first + beats * beatS, beatTimes };
  }

  private suppressUntilTime(until: number): Promise<void> {
    const ctx = this.ctx!;
    this.suppressUntil = Math.max(this.suppressUntil, until);
    this.update({ referencePlaying: true });
    return new Promise((resolve) => {
      const check = () => {
        if (this.ctx !== ctx) return resolve();
        // setTimeout y el reloj de audio derivan unos ms: se reintenta hasta cumplir ambos plazos.
        const remaining = Math.max(until, this.suppressUntil) - ctx.currentTime;
        if (remaining > 0.005) {
          setTimeout(check, remaining * 1000 + 5);
          return;
        }
        this.tracker.reset();
        this.update({ referencePlaying: false });
        resolve();
      };
      check();
    });
  }

  private handle(msg: WorkletMessage): void {
    if (!this.ctx) return;
    const suppressed = msg.t < this.suppressUntil;
    const frame = suppressed
      ? { t: msg.t, f0: null, midi: null, clarity: 0, levelDb: msg.levelDb, voiced: false }
      : this.tracker.push(msg);

    const s = this.stats;
    const transportMs = Math.max(0, (this.ctx.currentTime - msg.t) * 1000);
    s.transport = s.count === 0 ? transportMs : s.transport * 0.95 + transportMs * 0.05;
    if (msg.processMs !== null) s.process = s.process === null ? msg.processMs : s.process * 0.95 + msg.processMs * 0.05;
    s.count++;
    const now = performance.now();
    if (now - s.windowStart >= 1000) {
      s.fps = (s.count * 1000) / (now - s.windowStart);
      s.count = 0;
      s.windowStart = now;
      this.update({ diagnostics: this.buildDiagnostics() });
    }

    for (const l of this.frameListeners) l(frame);
  }

  private buildDiagnostics(): EngineDiagnostics {
    const ctx = this.ctx!;
    const track = this.stream!.getAudioTracks()[0];
    const settings = track.getSettings() as MediaTrackSettings & { latency?: number };
    return {
      sampleRate: ctx.sampleRate,
      windowSize: DEFAULT_DETECTOR_OPTIONS.windowSize,
      hopSize: DEFAULT_DETECTOR_OPTIONS.hopSize,
      detector: this.detector,
      algorithmicLatencyMs: (DEFAULT_DETECTOR_OPTIONS.windowSize / 2 / ctx.sampleRate) * 1000,
      inputLatencyMs: typeof settings.latency === 'number' ? settings.latency * 1000 : null,
      baseLatencyMs: typeof ctx.baseLatency === 'number' ? ctx.baseLatency * 1000 : null,
      transportMs: this.stats.transport,
      processMs: this.stats.process,
      framesPerSecond: this.stats.fps,
      noiseFloorDb: this.tracker.noiseFloorDb,
      deviceLabel: track.label,
      echoCancellation: settings.echoCancellation ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
      autoGainControl: settings.autoGainControl ?? null,
      bluetooth: checkBluetooth(track),
    };
  }

  private update(patch: Partial<EngineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.snapshotListeners) l();
  }
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador.';
    if (err.name === 'NotFoundError') return 'No se encontró ningún micrófono.';
    if (err.name === 'NotReadableError') return 'El micrófono está en uso por otra aplicación.';
  }
  if (!window.isSecureContext) return 'El micrófono requiere HTTPS (o localhost).';
  return err instanceof Error ? err.message : String(err);
}

/** Instancia única: hay un solo micrófono y un solo AudioContext por página. */
export const audioEngine = new AudioEngine();
