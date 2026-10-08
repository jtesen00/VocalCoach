export function Stars({ value, label, max = 5 }: { value: number; label: string; max?: number }) {
  return (
    <span className="stars-row" role="img" aria-label={`${label}: ${value} de ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < value ? 'on' : 'off'}>★</span>)}
    </span>
  );
}
