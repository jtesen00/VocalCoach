import type { PitchStatus } from '../scoring/pitch-scoring';

export interface LiveRule {
  id: string;
  /** Estados que activan la regla. */
  when: readonly PitchStatus[];
  /** Tiempo continuo (s) que debe mantenerse la condición. */
  forS: number;
  message: string;
}

/**
 * Reglas del coach en vivo (spec §18: "si el pitch está por debajo durante más de 2 s…").
 * Son datos; el orden decide la prioridad si varias aplican.
 */
export const LIVE_RULES: readonly LiveRule[] = [
  { id: 'held-low', when: ['too_low'], forS: 2, message: 'Llevas un rato por debajo. Piensa la nota un poquito más arriba.' },
  { id: 'held-high', when: ['too_high'], forS: 2, message: 'Llevas un rato por encima. Canta más relajado y un poquito más abajo.' },
  { id: 'held-close', when: ['close'], forS: 2.5, message: 'Muy cerca. Busca el centro de la franja.' },
  { id: 'held-good', when: ['perfect'], forS: 3, message: '¡Muy bien! Así se sostiene una nota afinada.' },
];

/** Tiempo que el último consejo sigue visible tras romperse la condición. */
const LINGER_S = 1.5;

/**
 * Coach en vivo: recibe el estado instantáneo y devuelve el consejo activo, si lo hay.
 * Un frame suelto con otro estado no rompe la racha (tolerancia de 0,3 s).
 */
export class LiveCoach {
  private since = new Map<string, number>();
  private lastSeen = new Map<string, number>();
  private current: { rule: LiveRule; until: number } | null = null;

  constructor(private readonly rules: readonly LiveRule[] = LIVE_RULES, private readonly graceS = 0.3) {}

  reset(): void {
    this.since.clear();
    this.lastSeen.clear();
    this.current = null;
  }

  update(status: PitchStatus, t: number): LiveRule | null {
    for (const rule of this.rules) {
      if (rule.when.includes(status)) {
        const last = this.lastSeen.get(rule.id);
        if (last === undefined || t - last > this.graceS) this.since.set(rule.id, t);
        this.lastSeen.set(rule.id, t);
      }
    }

    const active = this.rules.find((r) => {
      const start = this.since.get(r.id);
      const last = this.lastSeen.get(r.id);
      return start !== undefined && last !== undefined && t - last <= this.graceS && t - start >= r.forS;
    });
    if (active) this.current = { rule: active, until: t + LINGER_S };
    else if (this.current && t > this.current.until) this.current = null;
    return this.current?.rule ?? null;
  }
}
