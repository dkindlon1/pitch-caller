// The marketing site's one engine run. The film's story (stops 2 to 6) and the playground under it are both made by
// weigh() below, from the same situation, through the game app's own engine (lib/engine.js). The page runs it once
// when it is built (lib/story_server.ts) and again in the browser when the visitor changes the situation, so the two
// can't disagree; lib/story.test.ts holds them to that.
// The film's watch reads "FASTBALL / OUTSIDE", so the story is told by pitch and side of the plate (plan, option A):
// "Fastball, outside" is the engine's low-and-outside and high-and-outside fastballs added together.
import type { EPitch, Pick } from "./engine";
import { STARTER } from "./demo.ts";

type Engine = typeof import("./engine").default;

export type Sit = { b: number; s: number; outs: number; bases: [boolean, boolean, boolean]; inn: number; sameSide: boolean };
// 2-2, one out, runner on third, third inning of a tied game; a same-side hitter who just saw a slider low and outside
export const STORY_SIT: Sit = { b: 2, s: 2, outs: 1, bases: [false, false, true], inn: 3, sameSide: true };
export const STORY_TOP = "Fastball, outside";      // what the film's watch says; the build fails if the engine stops agreeing
export const STORY_LAST: [string, string] = ["Slider", "down-away"];
export const STORY_PITCHES = 45, STORY_BATTERS = 14;

export type Spot = { pitch: string; kind: EPitch["kind"]; quad: string; p: number; words: string[]; phrase: string };
export type Group = { key: string; name: string; pitch: string; side: string; p: number; spots: Spot[] };
export type Weighed = { groups: Group[]; top: Spot; why: string; version: string };

// the watch's own words for each spot (app/watch.js): chase goes high for fastballs, low for the soft stuff
const OFF = ["SL", "CB", "CH"];
export function watchWords(quad: string, kind: string): string[] {
  const m: Record<string, string[]> = {
    "up-in": ["HIGH AND", "INSIDE"], "up-away": ["HIGH AND", "OUTSIDE"], "down-in": ["LOW AND", "INSIDE"], "down-away": ["LOW AND", "OUTSIDE"],
    "down-middle": ["LOW"], middle: [], chase: OFF.includes(kind) ? ["CHASE", "LOW"] : ["CHASE", "HIGH"],
  };
  return m[quad] || [];
}
const spotPhrase = (w: string[]) => (w.length ? w.join(" ").toLowerCase() : "get it over");
// The engine's reason line, made unambiguous for a reader who hasn't seen it before. "He's sitting slider (47%)" is the
// engine's read of the HITTER (how likely he is looking for that pitch), not how often the pitch gets thrown.
export function plainWhy(why: string): string {
  const m = /^He's sitting (\w+) \((\d+)%\)\.?$/.exec(why.trim());
  return m ? `He's probably looking for a ${m[1]}. The engine's read of him: ${m[2]}% likely.` : why;
}
export const sideOf = (quad: string) => (/away/.test(quad) ? "outside" : /-in$/.test(quad) ? "inside" : quad === "chase" ? "chase" : "over the plate");
export const pct = (p: number) => Math.round(p * 100);

export function makeArsenal(E: Engine): EPitch[] {
  return STARTER.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape,
    velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
}

export function groupMix(dist: Pick[]): Group[] {
  const by = new Map<string, Group>();
  for (const d of dist) {
    const side = sideOf(d.quad), name = `${d.pitch.name}, ${side}`, words = watchWords(d.quad, d.pitch.kind);
    let g = by.get(name);
    if (!g) { g = { key: name, name, pitch: d.pitch.name, side, p: 0, spots: [] }; by.set(name, g); }
    g.p += d.prob;
    g.spots.push({ pitch: d.pitch.name, kind: d.pitch.kind, quad: d.quad, p: d.prob, words, phrase: spotPhrase(words) });
  }
  const groups = [...by.values()].sort((a, b) => b.p - a.p);
  for (const g of groups) g.spots.sort((a, b) => b.p - a.p);
  return groups;
}

// the whole mix for one situation: grouped by pitch and side, with the single most likely call (what the watch shows)
// and the engine's own reason line for it
export function weigh(E: Engine, sit: Sit): Weighed {
  const ars = makeArsenal(E);
  const S = E.Situation({ balls: sit.b, strikes: sit.s, outs: sit.outs, bases: sit.bases.slice(), inning: sit.inn, margin: 0, pitch_count: STORY_PITCHES,
    batters_faced: STORY_BATTERS, level: "college_d3", same_side: sit.sameSide, last: STORY_LAST.slice(), hitter_seen: { [STORY_LAST[0]]: 1 }, usage_this_count: {} });
  const r = E.callV08(ars, S, { rng: () => 0.001 });
  const dist = r.dist.slice().sort((x, y) => y.prob - x.prob);
  let why = "";
  try { const w = E.whyLine(ars, r.info.s, r.tab, dist[0], r.info); why = Array.isArray(w) && typeof w[0] === "string" ? w[0] : ""; } catch { why = ""; }
  const t = dist[0], words = watchWords(t.quad, t.pitch.kind);
  return { groups: groupMix(dist), top: { pitch: t.pitch.name, kind: t.pitch.kind, quad: t.quad, p: t.prob, words, phrase: spotPhrase(words) }, why: plainWhy(why), version: E.VERSION };
}

export const sameSit = (a: Sit, b: Sit) => a.b === b.b && a.s === b.s && a.outs === b.outs && a.inn === b.inn && a.sameSide === b.sameSide && a.bases.every((x, i) => x === b.bases[i]);

// the inputs the film's ledger lists at stops 2 and 3, read off the same situation and arsenal the engine was given
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export function ledger(sit: Sit) {
  const on = ["first", "second", "third"].filter((_, i) => sit.bases[i]);
  const outs = ["No outs", "One out", "Two outs"][sit.outs];
  return {
    situation: [
      { k: "Count", v: `${sit.b}-${sit.s}` },
      { k: "Outs", v: outs },
      { k: "Runners", v: on.length ? `On ${on.join(" and ")}` : "Bases empty" },
      { k: "Inning", v: `${ORD[sit.inn]}, tied` },
    ],
    pitcher: STARTER.map((p) => ({ k: p.name, v: `${p.velo} mph`, feel: p.feel })),
    hitter: [
      { k: "Hitter", v: sit.sameSide ? "Same side" : "Opposite side" },
      { k: "Last pitch", v: "Slider, low and outside" },
    ],
  };
}

// The at-bat section: the captured at-bat (content/at-bat.ts) replayed through the same engine, pitch by pitch, to get
// the mix the engine was choosing from at each count. Each pitch carries what the hitter has seen so far.
export type AtBatStep = { balls: number; strikes: number; last: [string, string] | null; seen: Record<string, number>; n: number };
export function weighAtBat(E: Engine, st: AtBatStep): Group[] {
  const ars = makeArsenal(E);
  const S = E.Situation({ balls: st.balls, strikes: st.strikes, outs: 0, bases: [false, false, false], inning: 1, margin: 0, pitch_count: st.n, batters_faced: 0,
    level: "college_d3", same_side: true, last: st.last, hitter_seen: { ...st.seen }, usage_this_count: {} });
  return groupMix(E.callV08(ars, S, { rng: () => 0.001 }).dist.slice().sort((x, y) => y.prob - x.prob));
}
