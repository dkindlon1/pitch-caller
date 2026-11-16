import "server-only";
import E from "./engine.js";
import data from "./engine_data_d3.json";
import { STORY_SIT, STORY_TOP, plainWhy, weigh, weighAtBat, watchWords, type Group, type Weighed } from "./story";
import { AT_BAT } from "@/content/at-bat";
import { STARTER } from "./demo";

// The film's story, run once through the real engine while the page is built. The film's frames say "FASTBALL /
// OUTSIDE"; if a later engine stops putting that group on top for this situation, the build stops here so the story
// gets a new true situation (or the film a new last frame) instead of quietly telling a false one.
let cached: Weighed | null = null;
export function story(): Weighed {
  if (cached) return cached;
  E.init(data);
  const w = weigh(E, STORY_SIT);
  if (w.groups[0].name !== STORY_TOP) {
    throw new Error(`PitchIQ site story is no longer true: engine ${w.version} puts "${w.groups[0].name}" on top for the story's situation, but the film shows "${STORY_TOP}". Pick a new situation in lib/story.ts (see docs/PLAN_site_v2_2026-11-16.md).`);
  }
  cached = w;
  return w;
}

// The at-bat strip: the captured at-bat's four calls, each with the watch's words for it and the mix the engine was
// choosing from at that count (replayed now, through the same engine).
const QUAD: Record<string, string> = { "Up and in": "up-in", "Up and away": "up-away", "Down and in": "down-in", "Down and away": "down-away", "Get it over": "middle", "Keep it down": "down-middle", Chase: "chase" };
const HEIGHT: Record<string, [string, number]> = { "up-in": ["letter high", 0.2], "up-away": ["letter high", 0.2], middle: ["belt high", 0.5], "down-in": ["at the knees", 0.8], "down-away": ["at the knees", 0.8], "down-middle": ["at the knees", 0.8], chase: ["off the plate", 0.9] };
export type AtBatPitch = { n: number; count: string; pitch: string; words: string[]; why: string; result: string; velo: number; height: string; h: number; mix: Group[]; share: number | null };
export function atBat(): AtBatPitch[] {
  E.init(data);
  const seen: Record<string, number> = {};
  let last: [string, string] | null = null;
  return AT_BAT.map((p, n) => {
    const quad = QUAD[p.spot], kind = STARTER.find((x) => x.name === p.pitch)!.kind;
    const mix = weighAtBat(E, { balls: p.balls, strikes: p.strikes, last, seen, n });
    const hit = mix.flatMap((g) => g.spots).find((s) => s.pitch === p.pitch && s.quad === quad);
    const out: AtBatPitch = { n: n + 1, count: `${p.balls}-${p.strikes}`, pitch: p.pitch, words: watchWords(quad, kind), why: plainWhy(p.why), result: p.result,
      velo: STARTER.find((x) => x.name === p.pitch)!.velo, height: HEIGHT[quad][0], h: HEIGHT[quad][1], mix: mix.slice(0, 3), share: hit ? hit.p : null };
    seen[p.pitch] = (seen[p.pitch] || 0) + 1; last = [p.pitch, quad];
    return out;
  });
}
