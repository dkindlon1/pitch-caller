// Sample data for the uploads section: a made-up 120-pitch bullpen shaped like the app's sample starter (fastball 86
// with ride, slider 78 tight, changeup 77 with fade). It is not anyone's real file and the page says so. A fixed seed
// keeps the server's static plot and the browser's 3D cloud the same points.
export type MovePoint = { kind: "FB" | "SL" | "CH"; velo: number; hb: number; ivb: number };   // hb: inches, arm side positive

export const MOVE_TYPES = [
  { kind: "FB" as const, name: "Fastball", n: 60, velo: [86, 1.1], hb: [8, 2.2], ivb: [18, 2.0], color: "#FF5A4E" },
  { kind: "SL" as const, name: "Slider", n: 35, velo: [78, 1.2], hb: [-5, 2.0], ivb: [3, 2.2], color: "#FFD43B" },
  { kind: "CH" as const, name: "Changeup", n: 25, velo: [77, 1.3], hb: [15, 2.4], ivb: [7, 2.6], color: "#3FE08C" },
];

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const MOVE_POINTS: MovePoint[] = (() => {
  const r = rng(20261105);
  const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const round = (x: number) => Math.round(x * 10) / 10;
  return MOVE_TYPES.flatMap((t) => Array.from({ length: t.n }, () => ({
    kind: t.kind, velo: round(t.velo[0] + t.velo[1] * normal()), hb: round(t.hb[0] + t.hb[1] * normal()), ivb: round(t.ivb[0] + t.ivb[1] * normal()),
  })));
})();

// the plot's ranges, shared by the flat plot and the 3D cloud
export const RANGE = { hb: [-12, 24] as const, ivb: [-5, 25] as const, velo: [74, 90] as const };
