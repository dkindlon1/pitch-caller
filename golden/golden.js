// v0.8 step 0: the JS engine with every flag at v0.7c must reproduce the Python v0.7c golden outputs.
// node golden/golden.js   (tolerance 1e-12, as the spec's golden test)
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "..", "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "engine_data.json"))));
E.setFlags(E.FLAGS_V07);
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "golden_v07c.json")));
let worst = 0, bad = 0;
const chk = (i, k, want, got) => {
  const d = Math.abs((got === undefined ? NaN : got) - want);
  if (!(d <= 1e-12)) { bad++; if (bad < 6) console.log(`case ${i} ${k}: golden ${want} js ${got}`); }
  if (d > worst) worst = d;
};
cases.forEach((c, i) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const s = E.Situation(Object.assign({}, c.s));
  for (const p of ars) for (const q of E.QUADS) {
    const P = E.outcomeProbs(p, q, s, ars, null), want = c.out.probs[p.name + "|" + q];
    for (const k in want) chk(i, "probs." + p.name + "|" + q + "." + k, want[k], P[k]);
    chk(i, "cost." + p.name + "|" + q, c.out.costs[p.name + "|" + q], E.cost(p, q, s, ars, null, null)[0]);
  }
  const [pol, , temp] = E.mixedPolicy(ars, s);
  for (const k in c.out.policy) chk(i, "policy." + k, c.out.policy[k], pol[k]);
  chk(i, "temp", c.out.temp, temp);
  if (c.full) {
    const [rel] = E.atBatValues(ars, s);
    for (const k in c.out.atbat) chk(i, "atbat." + k, c.out.atbat[k], rel[k]);
    const { dist } = E.callMixed(ars, s, { rng: () => 0.5 });
    const js = {}; for (const d of dist) js[d.pitch.name + "|" + d.quad] = d.prob;
    for (const k of new Set([...Object.keys(js), ...Object.keys(c.out.dist)])) chk(i, "dist." + k, c.out.dist[k] || 0, js[k] || 0);
  }
});
console.log(`${cases.length} cases, largest JS-vs-Python difference ${worst.toExponential(2)}`);
console.log(bad ? `FAIL: ${bad} differences` : "PASS: JS engine reproduces v0.7c");
process.exit(bad ? 1 : 0);
