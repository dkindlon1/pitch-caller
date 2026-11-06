// The count as the app shows it: a light for each ball and strike.
export function Lights({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className="lights" role="img" aria-label={`${n} ${n === 1 ? label.replace(/s$/, "") : label}`}>
      <span aria-hidden="true">{label[0].toUpperCase()}</span>
      {Array.from({ length: of }, (_, k) => <i key={k} className={k < n ? "on" : ""} />)}
    </span>
  );
}
