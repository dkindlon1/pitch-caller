// v1.1 goldens (Nov 12): the JS engine against golden/golden_<tag>.json (python3 golden/golden_v11.py make --tag <tag>).
// node golden/golden_v11.js [v11a]   (continuous values to 1e-12; picks, sweeps, why lines and flags exactly)
// Step 7 coverage (Nov 11): quad-keyed hitter damage (in the inputs), the walk suggestion, and a shake-off list.
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "..", "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "engine_data.json"))));
const V = E.v08;
const TOL = 1e-12;
const TAG = process.argv[2] || "v11a";
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, `golden_${TAG}.json`)));
const worst = {}; let bad = 0; const notes = [];
const note = (m) => { bad++; if (notes.length < 10) notes.push(m); };
const num = (i, grp, k, want, got) => {
  const d = Math.abs((got === undefined || got === null ? NaN : got) - want);
  if (!(d <= TOL)) note(`case ${i} ${grp}.${k}: golden ${want} js ${got}`);
  if (d > (worst[grp] || 0)) worst[grp] = d;
};
const same = (i, k, want, got) => { if (JSON.stringify(want) !== JSON.stringify(got)) note(`case ${i} ${k}: golden ${JSON.stringify(want)} js ${JSON.stringify(got)}`); };

cases.forEach((c, i) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s); if (!sd.matchup) delete sd.matchup;
  let s = E.Situation(sd);
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  const o = c.out;
  if (o.win) for (const k in o.win) num(i, "win", k, o.win[k], s.win[k]);
  for (const key in o.probs) {
    const [n, q, a, b] = key.split("|");
    const P = E.outcomeProbs(ars.find((x) => x.name === n), q, s, ars, null, null, a === "mix" ? null : ["pure", a, b]);
    for (const k in o.probs[key]) num(i, "probs", key + "." + k, o.probs[key][k], P[k]);
  }
  if (!c.full) return;
  const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  for (let j = 0; j < o.table.h0.length; j++) num(i, "h0", j, o.table.h0[j], tab.h0[j]);
  same(i, "sweeps", o.table.sweeps, tab.sweeps);
  for (const cnt in o.table.V) for (const bn in o.table.V[cnt]) {
    num(i, "tableV", cnt + "." + bn, o.table.V[cnt][bn], (tab.V[cnt] || {})[bn]);
    num(i, "tableN", cnt + "." + bn, o.table.N[cnt][bn], (tab.N[cnt] || {})[bn]);
  }
  for (const cnt in o.table.sigma) for (const k in o.table.sigma[cnt]) num(i, "tableSigma", cnt + "." + k, o.table.sigma[cnt][k], (tab.sigma[cnt] || {})[k]);
  const r = V.callV08(ars, s, { rng: () => 0.5, tab });
  same(i, "pick", o.call.pick, [r.pick.pitch.name, r.pick.quad]);
  num(i, "pick", "prob", o.call.prob, r.pick.prob); num(i, "pick", "cost", o.call.cost, r.pick.cost);
  const js = {}; for (const d of r.dist) js[d.pitch.name + "|" + d.quad] = d;
  for (const k of new Set([...Object.keys(o.call.dist), ...Object.keys(js)])) {
    if (!o.call.dist[k] || !js[k]) { note(`case ${i} dist ${k}: only in ${o.call.dist[k] ? "golden" : "JS"}`); continue; }
    num(i, "dist", k, o.call.dist[k][0], js[k].prob); num(i, "distCost", k, o.call.dist[k][1], js[k].cost);
  }
  for (const k in o.call.sigma) num(i, "rootSigma", k, o.call.sigma[k], r.info.sigma[k]);
  num(i, "residual", "", o.call.residual, r.info.residual);
  const [line, deltas] = V.whyLine(ars, r.info.s, tab, r.pick, r.info);
  same(i, "intent", o.intent, V.intentLabel(ars, r.info.s, tab, r.pick, r.info));
  same(i, "why", o.why.line, line);
  for (const k in o.why.deltas) num(i, "whyDelta", k, o.why.deltas[k], deltas[k]);
  const p0 = ars[0], q0 = E.targets(s.balls, s.strikes)[0];
  const t = V.takeStats(p0, q0, s, ars); o.take.forEach((v, j) => num(i, "take", j, v, t[j]));
  const g = V.gradeStats(p0, q0, s, ars, null, c.s.grades);
  for (const k in o.grade) o.grade[k].forEach((v, j) => num(i, "grade", k + "." + j, v, g[k][j]));
  const w = V.walkSuggestion(ars, s, tab);
  same(i, "walk.suggest", o.walk[0], w[0]); num(i, "walk", "vWalk", o.walk[1], w[1]); num(i, "walk", "vPa", o.walk[2], w[2]);
  if (c.exclude) {
    const x = V.callV08(ars, s, { rng: () => 0.5, tab, exclude: c.exclude }), sh = o.shaken;
    same(i, "shaken.pick", sh.pick, [x.pick.pitch.name, x.pick.quad]);
    num(i, "shaken", "prob", sh.prob, x.pick.prob); num(i, "shaken", "cost", sh.cost, x.pick.cost);
    const xd = {}; for (const d of x.dist) xd[d.pitch.name + "|" + d.quad] = d;
    for (const k of new Set([...Object.keys(sh.dist), ...Object.keys(xd)])) {
      if (!sh.dist[k] || !xd[k]) { note(`case ${i} shaken.dist ${k}: only in ${sh.dist[k] ? "golden" : "JS"}`); continue; }
      num(i, "shaken", "dist." + k, sh.dist[k][0], xd[k].prob); num(i, "shaken", "distCost." + k, sh.dist[k][1], xd[k].cost);
    }
    const [xl, xdel] = V.whyLine(ars, x.info.s, tab, x.pick, x.info, c.exclude);
    same(i, "shaken.why", sh.why, xl);
    for (const k in sh.deltas) num(i, "shaken", "delta." + k, sh.deltas[k], xdel[k]);
    same(i, "shaken.intent", sh.intent, V.intentLabel(ars, x.info.s, tab, x.pick, x.info, c.exclude));
  }
  num(i, "ump", "u", o.ump.u, V.umpEstimate(c.takes, s.level));
  const ge = V.gradeEstimate(c.takes, 3, 2.5, 3.0, c.takes.length + 20);
  num(i, "gradeEst", 0, o.ump.g[0], ge[0]); num(i, "gradeEst", 1, o.ump.g[1], ge[1]); same(i, "gradeEst.flag", o.ump.g[2], ge[2]);
});
console.log(`${cases.length} ${TAG} golden cases (${cases.filter((c) => c.full).length} with full solves). Largest JS-vs-golden differences:`);
for (const k in worst) console.log(`  ${k.padEnd(11)} ${worst[k].toExponential(2)}`);
for (const n of notes) console.log("  " + n);
console.log(bad ? `FAIL: ${bad} differences` : `PASS: JS engine reproduces ${TAG}`);
process.exit(bad ? 1 : 0);
