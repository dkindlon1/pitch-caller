// Outing reports and the season recap (docs/PLAN_reports_recap_2026-11-18.md 2): the one place the outcome definitions
// live. Every report, layer and count reads them from here. Pure: report_outcomes.test.ts has a test per result type.
//
// A pitch event is the raw doc the game app logs (app/index.src.html record()): `count` is the count before the pitch,
// `res` the result (ball, cstrike, whiff, foul, play, hbp), `out` the play result (OUT, E, 1B, 2B, 3B, HR), `contact`
// the contact quality when it was logged (weak, solid, hard), `quad` the called spot, `locCell` the 5x5 grid cell
// (catcher's view) where it ended up, or one ring outside it for "way off".

export type Res = "ball" | "cstrike" | "whiff" | "foul" | "play" | "hbp";
export type Contact = "weak" | "solid" | "hard";
export type Outcome = { strike: boolean; ball: boolean; positive: boolean; negative: boolean; neither: boolean; ballFour: boolean; hit: boolean; hard: boolean };

export const MIN_SAMPLE = 10;   // a per-pitch rate on fewer than 10 of that pitch shows only the counts (the portal's rule)
export const HITS = new Set(["1B", "2B", "3B", "HR"]);
const RESULTS = new Set<string>(["ball", "cstrike", "whiff", "foul", "play", "hbp"]);

// Plan default: a foul with fewer than 2 strikes counts as positive too, since it adds a strike.
export const FOUL_UNDER_TWO_POSITIVE = true;

/** The count before the pitch, from the logged "b-s" (else the situation snapshot). */
export function countOf(e: { count?: unknown; sit?: { balls?: unknown; strikes?: unknown } | null }): { balls: number; strikes: number } | null {
  const m = String(e.count ?? "").match(/^([0-3])-([0-2])$/);
  if (m) return { balls: +m[1], strikes: +m[2] };
  const b = Number(e.sit?.balls), s = Number(e.sit?.strikes);
  return Number.isInteger(b) && Number.isInteger(s) && b >= 0 && b <= 3 && s >= 0 && s <= 2 ? { balls: b, strikes: s } : null;
}

export const isResult = (r: unknown): r is Res => RESULTS.has(String(r));
const contactOf = (c: unknown): Contact | null => (c === "weak" || c === "solid" || c === "hard" ? c : null);

/**
 * The outcome of one pitch (plan 2, "Outcome definitions"):
 * - Strike: called strike, swinging strike, foul, or ball in play. Ball: any ball (ball four included), HBP.
 * - Positive: whiff, called strike, a foul (with 2 strikes; with fewer too, plan default), weak contact, an out in play.
 * - Negative: hard contact, a hit, ball four, HBP.
 * - Neither: a ball that isn't ball four.
 * Ball in play, when contact quality was logged, it decides first: weak = positive (even a bloop hit), hard = negative
 * (even a hard out); solid falls to the result (out or error = positive, hit = negative). When contact wasn't logged:
 * an out in play = positive, a hit = negative (plan default). Reached on error counts as an out in play.
 */
export function outcome(e: { res?: unknown; out?: unknown; contact?: unknown; count?: unknown; sit?: { balls?: unknown; strikes?: unknown } | null }): Outcome | null {
  if (!isResult(e.res)) return null;
  const res = e.res, c = countOf(e), contact = res === "play" ? contactOf(e.contact) : null;
  const hit = res === "play" && HITS.has(String(e.out));
  const hard = contact === "hard";
  const ballFour = res === "ball" && !!c && c.balls === 3;
  const strike = res === "cstrike" || res === "whiff" || res === "foul" || res === "play";
  let positive = false, negative = false;
  if (res === "whiff" || res === "cstrike") positive = true;
  else if (res === "foul") positive = (c ? c.strikes === 2 : false) || FOUL_UNDER_TWO_POSITIVE;
  else if (res === "hbp") negative = true;
  else if (res === "ball") negative = ballFour;
  else if (res === "play") {
    if (contact === "weak") positive = true;
    else if (contact === "hard") negative = true;
    else if (hit) negative = true;            // solid or unlogged contact: the result decides
    else positive = true;                     // an out in play (or reached on error)
  }
  return { strike, ball: !strike, positive, negative, neither: !positive && !negative, ballFour, hit, hard };
}

// ---------------------------------------------------------------- count groups and hitter side
// The six count groups, as one partition (each count in exactly one, first match wins): 0-0; any 3-ball count; any
// 2-strike count; ahead (more strikes than balls: 0-1); behind (more balls: 1-0, 2-0, 2-1); even (1-1).
export const COUNT_GROUPS = ["0-0", "ahead", "even", "behind", "two", "three"] as const;
export type CountGroup = (typeof COUNT_GROUPS)[number];
export const COUNT_GROUP_LABEL: Record<CountGroup, string> = { "0-0": "0-0", ahead: "Ahead", even: "Even", behind: "Behind", two: "Two strikes", three: "3 balls" };
export const COUNT_GROUP_HINT: Record<CountGroup, string> = { "0-0": "First pitch", ahead: "0-1", even: "1-1", behind: "1-0, 2-0, 2-1", two: "0-2, 1-2, 2-2", three: "3-0, 3-1, 3-2" };
export function countGroup(c: { balls: number; strikes: number }): CountGroup {
  if (c.balls === 0 && c.strikes === 0) return "0-0";
  if (c.balls === 3) return "three";
  if (c.strikes === 2) return "two";
  if (c.strikes > c.balls) return "ahead";
  if (c.balls > c.strikes) return "behind";
  return "even";
}

/** The side the hitter hit from: logged (bs) on v1.2+ events; older ones from the same-side flag and the pitcher's hand. */
export function hitterSide(e: { bs?: unknown; ph?: unknown; sit?: { same_side?: unknown } | null }, pitcherHand?: string | null): "L" | "R" | null {
  if (e.bs === "L" || e.bs === "R") return e.bs;
  const ss = e.sit?.same_side, hand = e.ph === "L" || e.ph === "R" ? e.ph : pitcherHand === "L" || pitcherHand === "R" ? pitcherHand : null;
  if (typeof ss !== "boolean" || !hand) return null;
  return ss ? hand : hand === "R" ? "L" : "R";
}

// ---------------------------------------------------------------- the pitch a result belongs to
// On a cross-up the catcher called one pitch and he threw another: every result follows the pitch actually thrown
// (the app's own rule). Keyed by pitch id (history follows ids, LEARNING_SPEC 4.3), by name only when there's no id.
export function thrownKey(e: { pitchId?: unknown; pitchName?: unknown; thrown?: unknown; thrownId?: unknown }): string {
  if (e.thrown && e.thrown !== e.pitchName) return e.thrownId ? String(e.thrownId) : "name:" + String(e.thrown);
  return e.pitchId ? String(e.pitchId) : "name:" + String(e.pitchName ?? "?");
}
export const thrownName = (e: { pitchName?: unknown; thrown?: unknown }) => String((e.thrown && e.thrown !== e.pitchName ? e.thrown : e.pitchName) ?? "Unknown");

// ---------------------------------------------------------------- the heat map grid (catcher's view)
// 5x5: row 0 is the top, column 0 the catcher's left (a right-handed hitter's inside). The ring outside the grid holds
// the four "way off" cells the app logs: [2,-1] left, [-1,2] high, [5,2] in the dirt, [2,5] right.
export const WAY_CELLS: [number, number][] = [[-1, 2], [2, -1], [2, 5], [5, 2]];
export const cellKey = (r: number, c: number) => `${r},${c}`;
export function zoneOfCell(r: number, c: number): "heart" | "edge" | "off" | "way" {
  if (r < 0 || r > 4 || c < 0 || c > 4) return "way";
  return r === 0 || r === 4 || c === 0 || c === 4 ? "off" : r === 2 && c === 2 ? "heart" : "edge";
}
const FASTBALL_KINDS = new Set(["FB", "SI", "FC"]);
/**
 * The called spot as a grid cell: the inverse of the engine's own locQuad (app/engine.js), so "called" and "landed"
 * share one grid. Inside is the hitter's side (a right-handed hitter's inside is the catcher's left); a chase pitch is
 * up for a fastball and in the dirt for anything else, as the engine reads it. The called pitch's kind decides that.
 */
export function calledCell(quad: unknown, kind: unknown, side: "L" | "R" | null): [number, number] | null {
  const q = String(quad ?? "");
  const inC = side === "L" ? 3 : 1, awC = side === "L" ? 1 : 3;   // unknown side: drawn as a right-handed hitter
  switch (q) {
    case "middle": return [2, 2];
    case "down-middle": return [3, 2];
    case "up-in": return [1, inC];
    case "up-away": return [1, awC];
    case "down-in": return [3, inC];
    case "down-away": return [3, awC];
    case "chase": return FASTBALL_KINDS.has(String(kind)) ? [0, 2] : [4, 2];
    default: return null;
  }
}
/** Where it ended up, when logged at grid resolution (in the 5x5 or one of the way-off cells); else null. */
export function landedCell(locCell: unknown): [number, number] | null {
  if (!Array.isArray(locCell) || locCell.length < 2) return null;
  const r = Number(locCell[0]), c = Number(locCell[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  if (r >= 0 && r <= 4 && c >= 0 && c <= 4) return [r, c];
  return WAY_CELLS.some(([a, b]) => a === r && b === c) ? [r, c] : null;
}

// ---------------------------------------------------------------- rates with the sample rule
export type Rate = { num: number; den: number; pct: number | null };
/** num of den, as a share only when the slice has at least MIN_SAMPLE pitches of that pitch (n) and den > 0. */
export function rate(num: number, den: number, n: number): Rate {
  return { num, den, pct: den > 0 && n >= MIN_SAMPLE ? num / den : null };
}
/** A rate with no per-pitch sample rule (a whole outing's strike share, a season's K rate): shown whenever den > 0. */
export function share(num: number, den: number): Rate {
  return { num, den, pct: den > 0 ? num / den : null };
}
export const pctText = (r: Rate | null | undefined, digits = 0) => (r && r.pct !== null ? (100 * r.pct).toFixed(digits) + "%" : "–");
export function ipText(outs: number) { return `${Math.floor(outs / 3)}.${outs % 3}`; }
