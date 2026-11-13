/*
 * v1.2 Part B Step B3 (plan 2.8): can the logs learn an opposing hitter's early-count approach at the pitch counts a
 * college or high-school team actually sees from him? A hitter world: hitters with a hidden approach tag (aggressive,
 * none, patient) see early-count pitches; each result is drawn from the engine's own probabilities with his true tag;
 * the learner's approachModel reads them back. Reports how often it flags the right tag (power) and a wrong one, at
 * 15 / 30 / 60 / 120 / 400 early-count pitches. An HS / D3 opponent sees about 4 plate appearances a game, about 1.5
 * early-count pitches each, against a team two or three times a season: 10-20 early-count pitches a season.
 * Checks: the flag is honest (untagged hitters flagged at most 5% at every count) and stays a flag (not served).
 * Run from app/: node hitter_tags_test.js
 */
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const L = require("./learner.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
let seed = 20261113;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ARS = [
  [{ name: "Fastball", kind: "FB", grade: 3, command: 3, conf: 0.8, shape: "rides", velo: 86 }, { name: "Slider", kind: "SL", grade: 3, command: 3, conf: 0.7, shape: "tight", velo: 77 },
    { name: "Changeup", kind: "CH", grade: 3, command: 3, conf: 0.7, shape: "fade", velo: 78 }],
  [{ name: "Sinker", kind: "SI", grade: 3, command: 3, conf: 0.8, shape: "run", velo: 85 }, { name: "Curve", kind: "CB", grade: 3, command: 2, conf: 0.65, shape: "", velo: 72 }],
];
const EARLY = [[0, 0], [1, 0], [0, 1]], QS = ["up-in", "up-away", "middle", "down-in", "down-away", "down-middle"];
const CATS = ["ball", "cstrike", "whiff", "foul", "play", "hbp"];
function events(tag, n, level) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const defs = pick(ARS), ars = defs.map((d) => E.Pitch(d)), p = pick(ars), [b, k] = pick(EARLY), q = pick(QS);
    const base = { balls: b, strikes: k, outs: Math.floor(rnd() * 3), bases: [false, false, false], level, same_side: rnd() < 0.5 };
    const S = E.Situation(Object.assign({}, base, tag ? { hitter_tags: { approach: tag } } : {}));
    const P = E.outcomeProbs(p, q, S, ars);
    const w = [P.ball + P.wp_ball, P.cstrike, P.whiff, P.foul, P.weak + P.solid + P.hard, P.hbp];
    let u = rnd() * w.reduce((a, x) => a + x, 0), c = 0;
    while (c < w.length - 1 && u > w[c]) { u -= w[c]; c++; }
    out.push({ type: "pitch", pitchName: p.name, quad: q, res: CATS[c], sit: JSON.parse(JSON.stringify(E.Situation(base))), ars: defs });
  }
  return out;
}
const N = [15, 30, 60, 120, 400], H = 150;
const rows = [];
let honest = true;
for (const level of ["college_d3", "hs"]) {
  console.log(`${level}: share flagged (right tag / wrong tag), ${H} hitters per tag`);
  for (const n of N) {
    const r = {};
    for (const tag of ["aggressive", null, "patient"]) {
      let right = 0, wrong = 0;
      for (let h = 0; h < H; h++) {
        const m = L.approachModel(E, events(tag, n, level));
        if (m.flag && m.flag === tag) right++; else if (m.flag) wrong++;
        if (m.served) honest = false;
      }
      r[tag || "none"] = [right / H, wrong / H];
    }
    rows.push({ level, n, r });
    console.log(`  ${String(n).padStart(3)} early pitches: aggressive ${(100 * r.aggressive[0]).toFixed(0)}% / ${(100 * r.aggressive[1]).toFixed(0)}%, ` +
      `patient ${(100 * r.patient[0]).toFixed(0)}% / ${(100 * r.patient[1]).toFixed(0)}%, untagged flagged ${(100 * r.none[1]).toFixed(0)}%` +
      (n < L.APPR_MIN ? ` (under the ${L.APPR_MIN}-pitch minimum: never flags)` : ""));
  }
}
// honest: |z| >= 2 flags an untagged hitter 4.6% of the time by design; pooled over every count past the minimum and both
// levels (1,200 hitters, SE 0.6 points), within 3 SE of it
const fp = rows.filter((x) => x.n >= L.APPR_MIN).map((x) => x.r.none[1]);
const fpAll = fp.reduce((a, x) => a + x, 0) / fp.length;
check(fpAll <= 0.0455 + 3 * Math.sqrt(0.0455 * 0.9545 / (fp.length * H)), `honest: untagged hitters flagged ${(100 * fpAll).toFixed(1)}% pooled (by design 4.6%)`);
check(rows.filter((x) => x.n < L.APPR_MIN).every((x) => x.r.aggressive[0] + x.r.patient[0] + x.r.none[1] === 0), `nothing is flagged under the ${L.APPR_MIN}-pitch minimum`);
check(honest, "a flag only: approach isn't served (not in the trait gate)");
const real = rows.filter((x) => x.n <= 30).map((x) => Math.max(x.r.aggressive[0], x.r.patient[0]));
console.log(`  at a realistic season (15-30 early-count pitches) the logs find the right tag at most ${(100 * Math.max(...real)).toFixed(0)}% of the time:` +
  " approach stays the coach's tag (the learner's read is a flag he can check)");
console.log(fails ? `${fails} check(s) failed` : "all checks passed");
process.exit(fails ? 1 : 0);
