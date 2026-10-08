import { useCallback, useState } from 'react';
import type { InstrumentId } from '../audio/instruments';
import type { DetectorKind } from '../core/pitch/types';
import type { VocalRange } from '../core/range/vocal-range';
import type { OctaveMode, SkillLevel } from '../core/scoring/pitch-scoring';

export interface Settings {
  range: VocalRange | null;
  level: SkillLevel;
  octaveMode: OctaveMode;
  detector: DetectorKind;
  /** Muestra nombres de nota con octava, cents, Hz y diagnóstico. Por defecto, interfaz sencilla. */
  showDetails: boolean;
  /** Sonido de la guía y las demostraciones. */
  instrument: InstrumentId;
  /** Acompañamiento con acordes en las canciones. */
  accompaniment: boolean;
  /** En las canciones con letra, la guía la canta con la voz sintética (Fase 9). */
  singLyrics: boolean;
  /** Retraso medido con la calibración (ms), o null si no se ha medido. */
  latencyMs: number | null;
}

const DEFAULTS: Settings = {
  range: null,
  level: 'beginner',
  octaveMode: 'pitch-class',
  detector: 'mpm',
  showDetails: false,
  instrument: 'piano',
  accompaniment: true,
  singLyrics: false,
  latencyMs: null,
};
const KEY = 'vocalcoach.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Ajustes locales. En la Fase 5 pasan a IndexedDB junto con el progreso. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible: los ajustes duran la sesión */
      }
      return next;
    });
  }, []);
  return [settings, update];
}
