import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// The site's demo loads lib/engine_data_d3.json (scripts/trim-engine-data.cjs): the engine data with the win-expectancy
// tables cut to college D3. This checks it calls exactly what the full data calls, across counts, outs, runners,
// innings and scores, with the same seeded draws.
const require = createRequire(import.meta.url);
const fresh = () => { const p = require.resolve("./engine.js"); delete require.cache[p]; return require("./engine.js"); };
const STARTER = [
  { name: "Fastball", kind: "FB", grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 },
  { name: "Slider", kind: "SL", grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 },
  { name: "Changeup", kind: "CH", grade: 3, command: 2, feel: 0.6, shape: "fade", velo: 77 },
];

function calls(data: unknown) {
  const E = fresh();
  E.init(data);
  const ars = STARTER.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape, velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
  const out: string[] = [];
  let seed = 11;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [b, k] of [[0, 0], [1, 1], [2, 2], [3, 2], [0, 2], [3, 1]])
    for (const outs of [0, 2])
      for (const bases of [[false, false, false], [false, true, false], [true, true, true]])
        for (const [inning, margin] of [[1, 0], [8, -1], [9, 1]]) {
          const s = E.Situation({ balls: b, strikes: k, outs, bases, inning, margin, pitch_count: 40, batters_faced: 12, level: "college_d3", same_side: true, last: ["Fastball", "up-away"], hitter_seen: { Fastball: 1 }, usage_this_count: {} });
          const r = E.callV08(ars, s, { rng });
          out.push(`${r.pick.pitch.name}|${r.pick.quad}|${r.dist.map((d: { pitch: { name: string }; quad: string; prob: number }) => `${d.pitch.name}:${d.quad}:${d.prob.toFixed(9)}`).join(",")}`);
        }
  return out;
}

test("the trimmed data calls exactly what the full data calls at college D3", () => {
  const full = calls(require("./engine_data.json")), d3 = calls(require("./engine_data_d3.json"));
  assert.equal(full.length, 108);
  assert.deepEqual(d3, full);
});
