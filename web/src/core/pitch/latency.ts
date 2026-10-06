/**
 * Calibración del retraso (Fase 8b): la app toca clics por el altavoz y el micro los oye.
 * El retraso de cada clic es el tiempo entre que se programó y el primer frame en que el
 * nivel sube claramente; se usa la mediana. Incluye salida, aire, entrada y análisis: lo
 * que hay que descontar para comparar la voz con la melodía en el tiempo.
 */
export interface LevelFrame {
  t: number;
  levelDb: number;
}

export interface LatencyEstimate {
  latencyS: number;
  /** Clics detectados / clics tocados. */
  detected: number;
  total: number;
  /** Dispersión entre clics (s): si es grande, la medida no es fiable. */
  spreadS: number;
}

export function estimateLatency(frames: readonly LevelFrame[], clickTimes: readonly number[], options: { riseDb?: number; maxS?: number } = {}): LatencyEstimate | null {
  const rise = options.riseDb ?? 15;
  const maxS = options.maxS ?? 0.6;
  const delays: number[] = [];
  for (const click of clickTimes) {
    // Nivel de fondo: los 150 ms antes del clic.
    const before = frames.filter((f) => f.t >= click - 0.15 && f.t < click).map((f) => f.levelDb).sort((a, b) => a - b);
    if (!before.length) continue;
    const floor = before[before.length >> 1];
    const hit = frames.find((f) => f.t >= click && f.t <= click + maxS && f.levelDb >= floor + rise);
    if (hit) delays.push(hit.t - click);
  }
  if (delays.length < Math.ceil(clickTimes.length / 2)) return null;
  delays.sort((a, b) => a - b);
  const median = delays[delays.length >> 1];
  const spreadS = delays[delays.length - 1] - delays[0];
  return { latencyS: median, detected: delays.length, total: clickTimes.length, spreadS };
}
