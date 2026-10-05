export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="stars-row" role="img" aria-label={`${label}: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= value ? 'on' : 'off'}>★</span>)}
    </span>
  );
}
