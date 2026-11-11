// Captures content/candidates.ts for the site's "Inside the call" sequence: every call the engine could make in one
// situation (each pitch at each spot), what each is expected to cost in runs, and the share of the final mix each one
// gets. Same situation as content/mix.ts. Run from web/: node scripts/capture-candidates.cjs > content/candidates.ts
const E = require("../lib/engine.js");
E.init(require("../lib/engine_data.json"));
const STARTER = [
  { name: "Fastball", kind: "FB", grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 },
  { name: "Slider", kind: "SL", grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 },
  { name: "Changeup", kind: "CH", grade: 3, command: 2, feel: 0.6, shape: "fade", velo: 77 }];   // lib/demo.ts STARTER
const ars = STARTER.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape, velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
const sit = E.Situation({ balls: 1, strikes: 2, outs: 1, bases: [false, true, false], inning: 5, margin: 0, pitch_count: 61, batters_faced: 17, level: "college_d3", same_side: true, last: ["Fastball", "up-away"], hitter_seen: { Fastball: 2, Slider: 1 }, usage_this_count: {} });
// one fixed draw, so the capture is repeatable
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r = E.callV08(ars, sit, { rng });
const costs = E.v08.rootCosts(ars, sit, r.tab, r.info.sigma);
const share = {}; for (const d of r.dist) share[`${d.pitch.name}|${d.quad}`] = d.prob;
const SPOT = { "up-in": "Up and in", "up-away": "Up and away", "down-in": "Down and in", "down-away": "Down and away", middle: "Get it over", chase: "Chase" };
const out = Object.entries(costs).map(([k, c]) => {
  const i = k.lastIndexOf("|"), pitch = k.slice(0, i), quad = k.slice(i + 1);
  return { pitch, quad, spot: SPOT[quad] || quad, cost: Math.round(c * 10000) / 10000, share: Math.round((share[`${pitch}|${quad}`] || 0) * 1000) / 1000 };
}).sort((a, b) => a.cost - b.cost);
console.log(`// Every call the PitchIQ engine (lib/engine.js, version ${E.VERSION}) could make in one situation, captured by
// scripts/capture-candidates.cjs: the app's sample right-hander at college D3, 1-2 count, runner on second, one out, fifth
// inning, tie game (the same spot as content/mix.ts). cost is the expected runs the rest of the inning after that call
// (lower is better); share is its part of the final mix (0 = left out). Regenerate with the script; don't edit by hand.
export const CAND_ENGINE = ${JSON.stringify(E.VERSION)};
export const CAND_PICK = ${JSON.stringify({ pitch: r.pick.pitch.name, quad: r.pick.quad, spot: SPOT[r.pick.quad] })};
export const CANDIDATES: { pitch: "Fastball" | "Slider" | "Changeup"; quad: string; spot: string; cost: number; share: number }[] = ${JSON.stringify(out, null, 2)};`);
