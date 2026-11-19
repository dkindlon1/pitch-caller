// While a report loads: the shape of the page (title, the line, a table, the map), shimmering in the portal's own
// skeleton style; never a sample number.
export function ReportSkeleton() {
  return (
    <div className="pq-skel" role="status" aria-label="Loading the report">
      <div className="sk h1" />
      <div className="sk" style={{ height: 88 }} />
      <div className="sk card" />
      <div className="sk" style={{ height: 340 }} />
    </div>
  );
}
