// gradeAll (the "Call my own" picker's grades for every pitch and spot) must match E.gradeCall exactly, call by call.
// usage (from app/): node grade_all_test.js
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const { gradeAll } = require("./grade_all.js");

let fails = 0, checked = 0;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const KIT = [
  ["Fastball", "FB", "ride"], ["Slider", "SL", "tight"], ["Curveball", "CB", "loopy"], ["Changeup", "CH", "fade"], ["Sinker", "FB", "sink"],
];
for (let t = 0; t < 14; t++) {
  const n = 2 + Math.floor(rnd() * 3);
  const ars = KIT.slice(0, n).map(([name, kind, shape]) => {
    const conf = 0.35 + rnd() * 0.6;
    return E.Pitch({ name, kind, shape, grade: 1 + Math.floor(rnd() * 5), command: 1 + Math.floor(rnd() * 5), conf, base_conf: Math.min(0.95, conf + rnd() * 0.2), velo: 70 + Math.floor(rnd() * 20) });
  });
  const level = pick(["hs", "college_d3", "college_d1", "mlb"]);
  const s = E.Situation({ balls: Math.floor(rnd() * 4), strikes: Math.floor(rnd() * 3), outs: Math.floor(rnd() * 3), bases: [rnd() < 0.4, rnd() < 0.3, rnd() < 0.2],
    inning: 1 + Math.floor(rnd() * 7), margin: Math.floor(rnd() * 7) - 3, level, same_side: rnd() < 0.5, pitch_count: Math.floor(rnd() * 100), batters_faced: Math.floor(rnd() * 25) });
  const all = gradeAll(E, ars, s);
  for (const p of ars) for (const q of E.QUADS) {
    const a = all[p.name][q], b = E.gradeCall(ars, s, p.name, q);
    checked++;
    const same = Math.abs(a.runs_vs_best - b.runs_vs_best) < 1e-12 && a.allowed === b.allowed && a.verdict === b.verdict && Math.abs(a.engine_prob - b.engine_prob) < 1e-12;
    if (!same) { fails++; if (fails < 6) console.log("FAIL", level, `${s.balls}-${s.strikes}`, p.name, q, JSON.stringify(a), JSON.stringify({ r: b.runs_vs_best, allowed: b.allowed, verdict: b.verdict, p: b.engine_prob })); }
  }
}
console.log(`${checked} calls compared`);
console.log(fails ? `\n${fails} grade checks FAILED` : "all grade checks passed");
process.exit(fails ? 1 : 0);
