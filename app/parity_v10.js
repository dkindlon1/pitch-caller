// v1.0 Phase 1.3: Python/JS parity on the SHIPPED call path (the old app/parity.js checks the v0.7c functions that
// Phase 2 deletes). Recomputes every case from app/parity_v10_cases.json with the JS engine and compares at 1e-9:
// the solved table at 0-0 and 1-1, the root policy, the root costs, the hitter's sit mix and the residual.
//   python3 app/make_parity_v10.py 200 && node app/parity_v10.js
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "engine_data.json"))));
const V = E.v08;
const TOL = 1e-9;

const CASES = path.join(__dirname, "parity_v10_cases.json");
if (!fs.existsSync(CASES)) {
  console.error("no app/parity_v10_cases.json; run: python3 app/make_parity_v10.py 200");
  process.exit(1);
}
const cases = JSON.parse(fs.readFileSync(CASES));

const worst = {};
let bad = 0;
const notes = [];
const note = (m) => { bad++; if (notes.length < 10) notes.push(m); };
const num = (i, grp, k, want, got) => {
  const d = Math.abs((got === undefined || got === null ? NaN : got) - want);
  if (!(d <= TOL)) note(`case ${i} ${grp}.${k}: py ${want} js ${got}`);
  if (!(d <= (worst[grp] || 0))) worst[grp] = d;
};
const same = (i, k, want, got) => {
  if (JSON.stringify(want) !== JSON.stringify(got)) note(`case ${i} ${k}: py ${JSON.stringify(want)} js ${JSON.stringify(got)}`);
};
// every key on either side, so a call present in one engine and missing in the other is caught
const keys = (a, b) => new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

cases.forEach((c, i) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s);
  if (!sd.matchup) delete sd.matchup;
  let s = E.Situation(sd);
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  const o = c.out;

  const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  for (let j = 0; j < o.h0.length; j++) num(i, "h0", j, o.h0[j], tab.h0[j]);
  same(i, "sweeps", o.sweeps, tab.sweeps);
  for (const cnt in o.tableV) {
    for (const bn of keys(o.tableV[cnt], tab.V[cnt])) {
      num(i, "tableV", `${cnt}.${bn}`, o.tableV[cnt][bn], (tab.V[cnt] || {})[bn]);
      num(i, "tableN", `${cnt}.${bn}`, o.tableN[cnt][bn], (tab.N[cnt] || {})[bn]);
    }
  }

  if (s.look === null || s.look === undefined) s = Object.assign({}, s, { look: tab.h0 });
  const [pi, sg, full, res, M] = V.rootCall(ars, s, tab);
  for (const k of keys(o.policy, pi)) num(i, "policy", k, o.policy[k] || 0, pi[k] || 0);
  for (const k of keys(o.full, full)) num(i, "full", k, o.full[k], full[k]);
  for (const k of keys(o.sigma, sg)) num(i, "sigma", k, o.sigma[k], sg[k]);
  num(i, "residual", "", o.residual, res);

  const rc = V.rootCosts(ars, s, tab);
  for (const k of keys(o.root_costs, rc)) num(i, "rootCosts", k, o.root_costs[k], rc[k]);

  same(i, "allowed", o.allowed, V.allowedCalls(ars, s).slice().sort());
});

console.log(`${cases.length} v1.0 parity cases. Largest Python-vs-JS differences:`);
for (const k of Object.keys(worst).sort((a, b) => worst[b] - worst[a])) {
  console.log(`  ${k.padEnd(11)} ${worst[k].toExponential(2)}`);
}
for (const n of notes) console.log("  " + n);
console.log(bad ? `FAIL: ${bad} differences (tolerance ${TOL})` : `PASS: JS matches Python within ${TOL}`);
process.exit(bad ? 1 : 0);
