// v1.0 parity (PLAN_v1.0.md 1.3): the JS engine against the Python engine on app/parity_v10_cases.json
// (python3 app/make_parity_v10.py). Every continuous value within 1e-9; call sets, sweeps and plan picks exactly.
// node app/parity_v10.js
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "engine_data.json"))));
const V = E.v08;
const TOL = 1e-9;
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, "parity_v10_cases.json")));
const worst = {}; let bad = 0; const notes = [];
const note = (m) => { bad++; if (notes.length < 12) notes.push(m); };
const num = (i, grp, k, want, got) => {
  const d = Math.abs((got === undefined || got === null ? NaN : got) - want);
  if (!(d <= TOL)) note(`case ${i} ${grp}.${k}: python ${want} js ${got}`);
  if (d > (worst[grp] || 0)) worst[grp] = d;
};
const same = (i, k, want, got) => { if (JSON.stringify(want) !== JSON.stringify(got)) note(`case ${i} ${k}: python ${JSON.stringify(want)} js ${JSON.stringify(got)}`); };
const keysEq = (i, k, a, b) => {
  const x = Object.keys(a).sort(), y = Object.keys(b || {}).sort();
  if (JSON.stringify(x) !== JSON.stringify(y)) note(`case ${i} ${k} keys: python ${x.join(",")} js ${y.join(",")}`);
};

doc.cases.forEach((c, i) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s);
  if (c.history.length) {
    sd.last = c.history[c.history.length - 1].slice(0, 3);
    if (doc.has_history) sd.history = c.history.map((h) => h.slice());
  }
  let s = E.Situation(sd);
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  const t0 = Object.assign({}, s, { balls: 0, strikes: 0, last: null }, doc.has_history ? { history: [] } : {});
  const tab = V.solveTable(ars, t0);
  s = Object.assign({}, s, { look: tab.h0 });
  s = Object.assign({}, s, { b_h: V.leanBh(ars, s) });
  const o = c.out;
  same(i, "sweeps", o.sweeps, tab.sweeps);
  o.h0.forEach((v, j) => num(i, "h0", j, v, tab.h0[j]));
  keysEq(i, "b_h", o.b_h, s.b_h);
  for (const k in o.b_h) num(i, "b_h", k, o.b_h[k], s.b_h[k]);
  for (const cnt in o.table) {
    for (const bn in o.table[cnt].V) num(i, "tableV", cnt + "." + bn, o.table[cnt].V[bn], (tab.V[cnt] || {})[bn]);
    for (const k in o.table[cnt].sigma) num(i, "tableSigma", cnt + "." + k, o.table[cnt].sigma[k], (tab.sigma[cnt] || {})[k]);
  }
  const r = V.callV08(ars, s, { rng: () => 0.5, tab, exclude: c.exclude.length ? c.exclude : undefined });
  const js = {}; for (const d of r.dist) js[d.pitch.name + "|" + d.quad] = d;
  keysEq(i, "dist", o.dist, js);
  for (const k in o.dist) if (js[k]) { num(i, "dist", k, o.dist[k][0], js[k].prob); num(i, "distCost", k, o.dist[k][1], js[k].cost); }
  for (const k in o.sigma) num(i, "rootSigma", k, o.sigma[k], r.info.sigma[k]);
  const rc = V.rootCosts(ars, s, tab);
  keysEq(i, "rootCosts", o.root_costs, rc);
  for (const k in o.root_costs) num(i, "rootCosts", k, o.root_costs[k], rc[k]);
  // The rule notes and the why line, which the numeric comparison above never looks at. Compared in the
  // engine's own order, because engine.py sorts (name, target) tuples and this engine sorts the joined strings.
  if (o.rules) same(i, "rules", o.rules, r.info.rules || {});
  if (o.why !== undefined) {
    let w = null;
    try { w = V.whyLine(ars, r.info.s, tab, r.pick, r.info)[0]; } catch (err) { w = "ERROR: " + err.message; }
    same(i, "why", o.why, w);
  }
  if (o.plan) {
    if (!V.atBatPlan) { note(`case ${i}: python has an at-bat plan, JS has no atBatPlan`); return; }
    const p = V.atBatPlan(tab);
    for (const k in o.plan.reach) num(i, "planReach", k, o.plan.reach[k], p.reach[k]);
    for (const k in o.plan.visits) num(i, "planVisits", k, o.plan.visits[k], p.visits[k]);
    for (const k in o.plan.ends) num(i, "planEnds", k, o.plan.ends[k], p.ends[k]);
    same(i, "planOpener", o.plan.opener.map((x) => x.slice(0, 2)), p.opener.map((x) => x.slice(0, 2)));
    o.plan.opener.forEach((x, j) => num(i, "planOpener", j, x[2], (p.opener[j] || [])[2]));
    same(i, "planPutaway", o.plan.putaway, p.putaway);
    same(i, "planPutawaySpot", o.plan.putaway_spot, p.putaway_spot);
    same(i, "planLine", o.plan.line, p.line);
    for (const cnt in o.plan.behind) {
      same(i, "planBehind." + cnt, o.plan.behind[cnt].map((x) => x.slice(0, 2)), (p.behind[cnt] || []).map((x) => x.slice(0, 2)));
      o.plan.behind[cnt].forEach((x, j) => num(i, "planBehind", cnt + "." + j, x[2], ((p.behind[cnt] || [])[j] || [])[2]));
    }
  }
});
console.log(`${doc.cases.length} v1.0 parity cases (history input: ${doc.has_history}). Largest JS-vs-Python differences:`);
for (const k in worst) console.log(`  ${k.padEnd(11)} ${worst[k].toExponential(2)}`);
for (const n of notes) console.log("  " + n);
console.log(bad ? `FAIL: ${bad} differences (tolerance ${TOL})` : `PASS: JS matches Python within ${TOL}`);
process.exit(bad ? 1 : 0);
