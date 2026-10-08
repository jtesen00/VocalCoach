interface Props {
  cents: number | null;
  perfectCents: number;
  toleranceCents: number;
  /** true: escala en cents; false: "más grave / más agudo". */
  detailed: boolean;
}

const RANGE = 60;

/** Aguja horizontal de ±60 cents con la zona "bien" marcada. */
export function CentsMeter({ cents, perfectCents, toleranceCents, detailed }: Props) {
  const pct = (c: number) => 50 + (Math.max(-RANGE, Math.min(RANGE, c)) / RANGE) * 50;
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-zone tolerance" style={{ left: `${pct(-toleranceCents)}%`, right: `${100 - pct(toleranceCents)}%` }} />
      <div className="meter-zone perfect" style={{ left: `${pct(-perfectCents)}%`, right: `${100 - pct(perfectCents)}%` }} />
      {detailed ? (
        [-50, -25, 0, 25, 50].map((c) => (
          <span key={c} className="meter-tick" style={{ left: `${pct(c)}%` }}>
            {c > 0 ? `+${c}` : c}
          </span>
        ))
      ) : (
        <>
          <span className="meter-tick start">◀ más grave</span>
          <span className="meter-tick" style={{ left: '50%' }}>bien</span>
          <span className="meter-tick end">más agudo ▶</span>
        </>
      )}
      {cents !== null && <div className="meter-needle" style={{ left: `${pct(cents)}%` }} />}
    </div>
  );
}
