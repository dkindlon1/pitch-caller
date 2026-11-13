// Captures content/mix.ts: one real call mix from the engine (lib/engine.js) for the site's "the mix" panel.
// Run from web/: node scripts/capture-mix.cjs > content/mix.ts
const E = require("../lib/engine.js");
E.init(require("../lib/engine_data.json"));
const { STARTER_JS } = { STARTER_JS: [
  { name: "Fastball", kind: "FB", grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 },
  { name: "Slider", kind: "SL", grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 },
  { name: "Changeup", kind: "CH", grade: 3, command: 2, feel: 0.6, shape: "fade", velo: 77 }] };   // lib/demo.ts STARTER
const ars = STARTER_JS.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape, velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
const sit = { balls: 1, strikes: 2, outs: 1, bases: [false, true, false], inning: 5, margin: 0, pitch_count: 61, batters_faced: 17, level: "college_d3", same_side: true, last: ["Fastball", "up-away"], hitter_seen: { Fastball: 2, Slider: 1 }, usage_this_count: {} };
const r = E.callV08(ars, E.Situation(sit), {});
const SPOT = { "up-in": "Up and in", "up-away": "Up and away", "down-in": "Down and in", "down-away": "Down and away", middle: "Get it over", chase: "Chase", "down-middle": "Keep it down" };
const dist = r.dist.map((d) => ({ pitch: d.pitch.name, spot: SPOT[d.quad], prob: Math.round(d.prob * 1000) / 1000 })).filter((d) => d.prob >= 0.005);
console.log(`// One real call mix from the PitchIQ engine (lib/engine.js, version ${E.VERSION}), captured by scripts/capture-mix.cjs.
// The app's sample right-hander (fastball 86, slider 78, changeup 77) at college D3: 1-2 count, runner on second, one out,
// fifth inning, tie game, the hitter has seen two fastballs and a slider, the last pitch was a fastball up and away.
// Regenerate with the script rather than editing these numbers.
export const MIX_ENGINE = ${JSON.stringify(E.VERSION)};
export const MIX_SITUATION = "1-2 count, runner on second, one out, fifth inning, tie game";
export const MIX: { pitch: "Fastball" | "Slider" | "Changeup"; spot: string; prob: number }[] = ${JSON.stringify(dist, null, 2)};`);
