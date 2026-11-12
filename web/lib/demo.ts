// The marketing site's live demo: the game app's own engine (lib/engine.js, identical to app/engine.js) calling a
// scripted lineup, with the visitor saying what happened after each pitch. The arsenal is the app's sample starter
// (app/index.src.html, sampleSetup); the game state follows the app's rules for counts, walks, strikeouts and outs.
import type { EPitch, Pick } from "./engine";

type Engine = typeof import("./engine").default;
export type Result = "ball" | "cstrike" | "whiff" | "foul" | "out" | "hit" | "hbp";
export type Spot = "Up and in" | "Up and away" | "Down and in" | "Down and away" | "Get it over" | "Chase" | "Keep it down";
export const SPOT: Record<string, Spot> = { "up-in": "Up and in", "up-away": "Up and away", "down-in": "Down and in", "down-away": "Down and away", middle: "Get it over", chase: "Chase", "down-middle": "Keep it down" };
export const SIGN: Record<string, number> = { FB: 1, CB: 2, SL: 3, CH: 4 };
export const RESULT_LABEL: Record<Result, string> = { ball: "Ball", cstrike: "Called strike", whiff: "Swing and miss", foul: "Foul", out: "In play, out", hit: "Base hit", hbp: "Hit by pitch" };

export const STARTER = [
  { name: "Fastball", kind: "FB" as const, grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 },
  { name: "Slider", kind: "SL" as const, grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 },
  { name: "Changeup", kind: "CH" as const, grade: 3, command: 2, feel: 0.6, shape: "fade", velo: 77 },
];
// nine hitters, the app's sample lineup: who bats which way
export const LINEUP: ("R" | "L" | "S")[] = ["R", "R", "L", "R", "L", "R", "R", "L", "S"];
const HAND = "R";

export type Call = { pitch: string; kind: EPitch["kind"]; quad: string; spot: Spot; sign: number; prob: number; mix: { pitch: string; spot: Spot; prob: number }[]; why: string | null; ms: number };
export type Logged = { balls: number; strikes: number; call: Call; result: Result };
export type Game = {
  inning: number; outs: number; balls: number; strikes: number; bases: [boolean, boolean, boolean]; runs: number; batter: number; pitches: number;
  last: [string, string] | null; seen: Record<string, number>; usage: Record<string, Record<string, number>>; atBat: Logged[]; ended: string[];
};
export const newGame = (): Game => ({ inning: 1, outs: 0, balls: 0, strikes: 0, bases: [false, false, false], runs: 0, batter: 0, pitches: 0,
  last: null, seen: {}, usage: {}, atBat: [], ended: [] });

export function bats(g: Game): "R" | "L" {
  const h = LINEUP[g.batter % LINEUP.length];
  return h === "S" ? (HAND === "R" ? "L" : "R") : h;     // a switch hitter bats opposite the pitcher
}

export function makeArsenal(E: Engine): EPitch[] {
  return STARTER.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape,
    velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
}

export function call(E: Engine, ars: EPitch[], g: Game, rng?: () => number): Call {
  const s = E.Situation({ balls: g.balls, strikes: g.strikes, outs: g.outs, bases: g.bases.slice(), inning: g.inning, margin: 0, pitch_count: g.pitches,
    batters_faced: g.batter, level: "college_d3", same_side: bats(g) === HAND, last: g.last, hitter_seen: { ...g.seen },
    usage_this_count: { ...(g.usage[`${g.balls}-${g.strikes}`] || {}) } });
  const t0 = performance.now();
  const r = E.callV08(ars, s, rng ? { rng } : {});     // the app's one engine
  const ms = performance.now() - t0;
  // the engine's own reason for the call, the line the app shows under it
  let why: string | null = null;
  try { const w = E.whyLine(ars, r.info.s, r.tab, r.pick, r.info); why = Array.isArray(w) && typeof w[0] === "string" ? w[0] : null; } catch { why = null; }
  const top = (d: Pick) => ({ pitch: d.pitch.name, spot: SPOT[d.quad], prob: d.prob });
  return { pitch: r.pick.pitch.name, kind: r.pick.pitch.kind, quad: r.pick.quad, spot: SPOT[r.pick.quad], sign: SIGN[r.pick.pitch.kind], prob: r.pick.prob,
    mix: r.dist.slice(0, 4).map(top), why, ms };
}

// a plain explanation of the call (app/index.src.html, callPanel): how often the mix picks it here and where
// to aim, then what else is in the mix
export function reason(c: Call, g: Game): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const others = c.mix.filter((m) => !(m.pitch === c.pitch && m.spot === c.spot)).slice(0, 2);
  let s = `Picked at random from the mix, where it comes up ${pct(c.prob)} of the time.`;
  if (c.quad === "middle") s += " Aim at the heart of the plate."; else if (c.quad === "down-middle") s += " Knee-high, over the plate."; else if (c.quad === "chase") s += " Just off the plate, not in the dirt.";
  if (others.length) s += ` Also in the mix: ${others.map((m) => `${m.pitch.toLowerCase()} ${m.spot.toLowerCase()} (${pct(m.prob)})`).join(", ")}.`;
  if (g.balls === 3 && g.strikes < 2) s += " No chase pitch at 3-0 or 3-1.";
  return s;
}

// what happened: the count, the at-bat, the inning, as the app keeps them
export function record(E: Engine, ars: EPitch[], g0: Game, c: Call, result: Result): Game {
  const g: Game = { ...g0, bases: [...g0.bases] as Game["bases"], seen: { ...g0.seen }, usage: { ...g0.usage }, atBat: [...g0.atBat, { balls: g0.balls, strikes: g0.strikes, call: c, result }], ended: [] };
  const uk = `${g.balls}-${g.strikes}`;
  g.usage[uk] = { ...(g.usage[uk] || {}), [c.pitch]: ((g.usage[uk] || {})[c.pitch] || 0) + 1 };
  g.seen[c.pitch] = (g.seen[c.pitch] || 0) + 1;
  g.pitches++; g.last = [c.pitch, c.quad];
  const p = ars.find((x) => x.name === c.pitch);
  if (p) {
    if (result === "ball" || result === "hbp") E.updateConfidence(p, "ball");
    else if (result === "cstrike") E.updateConfidence(p, "cstrike");
    else if (result === "whiff") E.updateConfidence(p, "whiff");
  }
  const walk = () => { const b = g.bases; if (b[0] && b[1] && b[2]) g.runs++; g.bases = [true, b[0] || b[1], b[2] || (b[0] && b[1])]; };
  let end: string | null = null;
  if (result === "ball") { g.balls++; if (g.balls === 4) { walk(); end = "Walk"; } }
  else if (result === "hbp") { walk(); end = "Hit by pitch"; }
  else if (result === "cstrike" || result === "whiff") { g.strikes++; if (g.strikes === 3) { g.outs++; end = result === "whiff" ? "Strikeout swinging" : "Strikeout looking"; } }
  else if (result === "foul") { if (g.strikes < 2) g.strikes++; }
  else if (result === "out") { g.outs++; end = "Out in play"; }
  else if (result === "hit") { const b = g.bases; g.runs += b[2] ? 1 : 0; g.bases = [true, b[0], b[1]]; end = "Single"; }
  if (end) {
    g.ended = [end];
    g.balls = 0; g.strikes = 0; g.batter++; g.seen = {}; g.atBat = [];
    if (g.outs >= 3) { g.inning++; g.outs = 0; g.bases = [false, false, false]; g.ended.push(`Side retired. Inning ${g.inning}.`); }
  }
  return g;
}

// where a spot sits in the 3x3 zone for a right-handed hitter, catcher's view: [column, row]; null for a chase pitch
const CELLS: Record<string, [number, number]> = { "Up and in": [0, 0], "Up and away": [2, 0], "Get it over": [1, 1], "Down and in": [0, 2], "Down and away": [2, 2] };
export const CELL_OF = (spot: string): [number, number] | null => CELLS[spot] ?? null;
