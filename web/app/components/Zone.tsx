import { CELL, PITCH_COLOR, type Pitch } from "@/content/at-bat";

// The strike zone as the app draws it: a 3x3 grid seen from the pitcher's side, the hitter's box on the left
// for a right-handed hitter. Earlier pitches of the at-bat are small pitch-colored chips with their code; the
// current one is the larger chip with its ring.
export function Zone({ pitches, current, size = "lg" }: { pitches: Pitch[]; current: number; size?: "lg" | "sm" }) {
  const at = (p: Pitch) => {
    const c = p.spot === "Chase" ? ([2.6, 2.6] as [number, number]) : CELL[p.spot];
    return { x: 30 + (c[0] + 0.5) * 60, y: 20 + (c[1] + 0.5) * 70 };
  };
  // Earlier chips sit in the corners of their cell so they never hide each other or the current target.
  const off = (i: number): [number, number] => [[-19, -25], [19, -25], [-19, 25], [19, 25]][i % 4] as [number, number];
  return (
    <svg className={`zone zone-${size}`} viewBox="0 0 240 250" role="img"
      aria-label={current >= 0 ? `Target: ${pitches[current].spot.toLowerCase()}` : "Strike zone"}>
      <rect className="zone-box" x="0" y="60" width="14" height="110" rx="7" />
      <rect className="zone-edge" x="30" y="20" width="180" height="210" rx="6" />
      <path className="zone-grid" d="M90 20V230M150 20V230M30 90H210M30 160H210" />
      {pitches.slice(0, Math.max(current, 0)).map((p, i) => {
        const { x, y } = at(p), [dx, dy] = off(i), c = PITCH_COLOR[p.pitch];
        return (
          <g key={i} className="zone-prev">
            <rect x={x + dx - 12} y={y + dy - 8} width="24" height="16" rx="4" fill={c.fill} />
            <text x={x + dx} y={y + dy} dy="0.35em">{c.code}</text>
          </g>
        );
      })}
      {current >= 0 && (() => {
        const p = pitches[current], { x, y } = at(p), c = PITCH_COLOR[p.pitch];
        return (
          <g className="zone-now" key={`now-${current}`}>
            <circle className="zone-ring" cx={x} cy={y} r="24" stroke={c.fill} />
            <rect x={x - 17} y={y - 12} width="34" height="24" rx="6" fill={c.fill} />
            <text x={x} y={y} dy="0.35em">{c.code}</text>
          </g>
        );
      })()}
    </svg>
  );
}
