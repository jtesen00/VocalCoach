import { useEffect, useState, useSyncExternalStore } from 'react';
import { audioEngine, type EngineSnapshot } from '../../audio/engine';
import type { PitchFrame } from '../../core/pitch/types';

export function useEngineSnapshot(): EngineSnapshot {
  return useSyncExternalStore(audioEngine.subscribeSnapshot, audioEngine.getSnapshot);
}

/**
 * Último frame, muestreado a `hz` para la UI de texto. El audio llega a ~94 frames/s;
 * React no necesita renderizar a esa frecuencia (el canvas va aparte).
 */
export function useSampledFrame(hz = 15): PitchFrame | null {
  const [frame, setFrame] = useState<PitchFrame | null>(null);
  useEffect(() => {
    let latest: PitchFrame | null = null;
    const off = audioEngine.onFrame((f) => (latest = f));
    const id = setInterval(() => setFrame(latest), 1000 / hz);
    return () => {
      off();
      clearInterval(id);
    };
  }, [hz]);
  return frame;
}
