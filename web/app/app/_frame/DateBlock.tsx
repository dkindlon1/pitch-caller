// The calendar block on the next-game ticket: the month in seam red, the day large, the weekday (or "Today") under it.
// With no date it shows an empty day, so the card keeps its shape.
export function DateBlock({ date, today }: { date?: string | null; today?: string }) {
  if (!date) return <div className="pq-date empty" aria-hidden="true"><span className="m">Next</span><b>–</b><span className="d">No game</span></div>;
  const d = new Date(date + "T12:00:00");
  return (
    <div className="pq-date" aria-hidden="true">
      <span className="m">{d.toLocaleDateString("en-US", { month: "short" })}</span>
      <b>{d.getDate()}</b>
      <span className="d">{date === today ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}</span>
    </div>
  );
}
// the same block for a player: his number where the day would be
export function NumberBlock({ number, sub }: { number?: string; sub: string }) {
  return <div className="pq-date" aria-hidden="true"><span className="m">Pitcher</span><b>{number ? `#${number}` : "–"}</b><span className="d">{sub}</span></div>;
}
