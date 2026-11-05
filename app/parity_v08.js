// v0.8 parity: the JS engine in v0.8 mode against Python on app/parity_v08_cases.json (node app/parity_v08.js)
const fs = require("fs");
const E = require("./engine.js");
E.init(JSON.parse(fs.readFileSync(__dirname + "/engine_data.json")));
const MODE = process.env.PARITY_FLAGS || "v08";     // v09: FLAGS_V09 against app/parity_v09_cases.json
E.setFlags({ v08: E.FLAGS_V08, v09: Object.assign({}, E.FLAGS_V09, { inside_v09: true }) }[MODE]);   // every v0.9 term
const V = E.v08;
const cases = JSON.parse(fs.readFileSync(__dirname + `/parity_${MODE}_cases.json`));
const worst = {}; let fails = 0; const notes = [];
const upd = (k, d) => { worst[k] = Math.max(worst[k] || 0, Math.abs(d)); };
for (const [i, c] of cases.entries()) {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  let s = E.Situation(Object.assign({}, c.s));
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  if (c.win) for (const k of ["omega", "WE0", "m0", "LI"]) upd("win", s.win[k] - c.win[k]);
  for (const key in c.probs) {
    const [n, q, a, b] = key.split("|");
    const p = ars.find((x) => x.name === n);
    const sit = a === "mix" ? null : ["pure", a, b];
    const P = E.outcomeProbs(p, q, s, ars, null, null, sit);
    for (const k in c.probs[key]) upd("probs", P[k] - c.probs[key][k]);
  }
  if (!c.table) continue;
  const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  upd("h0", tab.h0[0] - c.table.h0[0]);
  if (tab.sweeps !== c.table.sweeps) { fails++; notes.push(`case ${i}: sweeps ${tab.sweeps} vs ${c.table.sweeps}`); }
  for (const cnt in c.table.V) for (const bn in c.table.V[cnt]) { upd("tableV", tab.V[cnt][bn] - c.table.V[cnt][bn]); upd("tableN", tab.N[cnt][bn] - c.table.N[cnt][bn]); }
  for (const cnt in c.table.sigma) for (const k in c.table.sigma[cnt]) upd("tableSigma", tab.sigma[cnt][k] - c.table.sigma[cnt][k]);
  const r = V.callV08(ars, s, { rng: () => 0.5, tab });
  const py = new Map(c.call.dist.map((d) => [d[0] + "|" + d[1], d])), js = new Map(r.dist.map((d) => [d.pitch.name + "|" + d.quad, d]));
  for (const k of new Set([...py.keys(), ...js.keys()])) {
    if (!py.has(k) || !js.has(k)) { const pr = (py.get(k) || [0, 0, 0])[2], jr = js.has(k) ? js.get(k).prob : 0; upd("dist", pr - jr); if (Math.abs(pr - jr) > 1e-6) { fails++; notes.push(`case ${i}: call ${k} only in ${py.has(k) ? "Python" : "JS"} (${Math.max(pr, jr).toExponential(2)})`); } continue; }
    upd("dist", py.get(k)[2] - js.get(k).prob); upd("cost", py.get(k)[3] - js.get(k).cost);
  }
  if (r.pick.pitch.name !== c.call.pick[0] || r.pick.quad !== c.call.pick[1]) { fails++; notes.push(`case ${i}: pick differs`); }
  for (const k in c.call.sigma) upd("rootSigma", r.info.sigma[k] - c.call.sigma[k]);
  upd("residual", r.info.residual - c.call.residual);
  const [line, deltas] = V.whyLine(ars, r.info.s, tab, r.pick, r.info);
  if (line !== c.why.line) { fails++; notes.push(`case ${i}: why "${line}" vs "${c.why.line}"`); }
  for (const k in c.why.deltas) upd("whyDelta", deltas[k] - c.why.deltas[k]);
  const p0 = ars[0], q0 = E.targets(s.balls, s.strikes)[0];
  const t = V.takeStats(p0, q0, s, ars); upd("take", t[0] - c.take[0]); upd("take", t[1] - c.take[1]);
  const g = V.gradeStats(p0, q0, s, ars, null, c.s.grades);
  for (const k in c.grade) { upd("grade", g[k][0] - c.grade[k][0]); upd("grade", g[k][1] - c.grade[k][1]); }
  upd("ump", V.umpEstimate(c.ump.takes, s.level) - c.ump.u);
  const ge = V.gradeEstimate(c.ump.takes, 3, 2.5, 3.0, c.ump.takes.length + 20);
  upd("gradeEst", ge[1] - c.ump.g[1]);
}
console.log(`${cases.length} v0.8 cases (${cases.filter((c) => c.table).length} with full solves). Largest differences:`);
for (const k in worst) console.log(`  ${k.padEnd(10)} ${worst[k].toExponential(2)}`);
for (const n of notes.slice(0, 10)) console.log("  " + n);
const tol = Math.max(...Object.values(worst));
if (tol > 1e-9) { fails++; console.log(`largest continuous difference ${tol.toExponential(2)} > 1e-9`); }
console.log(fails ? `FAIL: ${fails} differences` : "PASS: JS v0.8 engine matches Python");
process.exit(fails ? 1 : 0);
