// Compare the JS engine against Python on the generated cases.
const fs = require("fs");
const E = require("./engine.js");
E.init(JSON.parse(fs.readFileSync(__dirname + "/engine_data.json")));
const cases = JSON.parse(fs.readFileSync(__dirname + "/parity_cases.json"));
let worst = { probs: 0, costs: 0, policy: 0, atbat: 0, dist: 0, conf: 0 }, fails = 0, n = { full: 0 };
for (const [i, c] of cases.entries()) {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const s = E.Situation(Object.assign({}, c.s));
  for (const p of ars) for (const q of E.QUADS) {
    const P = E.outcomeProbs(p, q, s, ars, null), Pp = c.probs[p.name + "|" + q];
    for (const k in Pp) worst.probs = Math.max(worst.probs, Math.abs(P[k] - Pp[k]));
    worst.costs = Math.max(worst.costs, Math.abs(E.cost(p, q, s, ars, null, null)[0] - c.costs[p.name + "|" + q]));
  }
  if (c.conf) for (const d of c.arsenal) for (const ev of ["ball", "cstrike", "whiff", "hard"]) {
    const q = E.Pitch(Object.assign({}, d)); E.updateConfidence(q, ev);
    worst.conf = Math.max(worst.conf, Math.abs(q.conf - c.conf[d.name + "|" + ev]));
  }
  const [pol] = E.mixedPolicy(ars, s);
  for (const k in c.policy) worst.policy = Math.max(worst.policy, Math.abs(pol[k] - c.policy[k]));
  if (c.atbat) {
    n.full++;
    const [rel] = E.atBatValues(ars, s);
    for (const k in c.atbat) worst.atbat = Math.max(worst.atbat, Math.abs(rel[k] - c.atbat[k]));
    const { dist } = E.callMixed(ars, s, { rng: () => 0.5 });
    const key = (d) => d.pitch.name + "|" + d.quad;
    const py = new Map(c.dist.map((d) => [d[2] + "|" + d[3], d[0]]));
    const js = new Map(dist.map((d) => [key(d), d.prob]));
    for (const k of new Set([...py.keys(), ...js.keys()])) {
      const dd = Math.abs((py.get(k) || 0) - (js.get(k) || 0));
      worst.dist = Math.max(worst.dist, dd);
      if (dd > 1e-6) { fails++; if (fails < 5) console.log("case", i, "option", k, "py", py.get(k), "js", js.get(k)); }
    }
  }
}
console.log(`${cases.length} cases (${n.full} with full calls). Largest differences:`);
for (const k in worst) console.log(`  ${k.padEnd(7)} ${worst[k].toExponential(2)}`);
const tol = Math.max(worst.probs, worst.costs, worst.policy, worst.atbat, worst.conf);
if (tol > 1e-9) fails++;
console.log(fails ? `FAIL: ${fails} differences` : "PASS: JS engine matches Python");
process.exit(fails ? 1 : 0);
