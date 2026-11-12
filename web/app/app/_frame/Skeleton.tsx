// What's coming, shimmering in its own shape while the data loads: a heading, the game card and the tiles for the
// launcher; a heading and rows for a list.
export function LauncherSkeleton() {
  return (
    <div className="pq-skel" role="status" aria-label="Loading the team">
      <div className="sk h1" />
      <div className="sk card" />
      <div className="sk-tiles">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sk tile" />)}</div>
    </div>
  );
}
export function ListSkeleton({ label = "Loading", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="pq-skel" role="status" aria-label={label}>
      <div className="sk h1" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk row" />)}
    </div>
  );
}
export function SheetSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="pq-skel" role="status" aria-label={label}>
      <div className="sk h1" />
      <div className="sk card" style={{ height: 420 }} />
    </div>
  );
}
