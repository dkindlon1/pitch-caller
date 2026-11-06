// v1.0 tool: two JS engine files compared bit for bit on the v0.9 golden cases (Phase 2.4 checkpoint: no behavior change).
// node tools/js_same.js ENGINE_A ENGINE_B golden/golden_v09.json DATA_A DATA_B
// Bit-for-bit: two JS engine files on the v0.9 golden cases (tables, calls, why lines, probs).
const fs = require("fs"), path = require("path");
const [fa, fb, gold, dataA, dataB] = process.argv.slice(2);
function load(f, d) { delete require.cache[require.resolve(f)]; const E = require(f); E.init(JSON.parse(fs.readFileSync(d))); return E; }
const cases = JSON.parse(fs.readFileSync(gold));
function run(E) {
  const V = E.v08, out = [];
  for (const c of cases) {
    const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
    const sd = Object.assign({}, c.s); if (!sd.matchup) delete sd.matchup;
    let s = E.Situation(sd);
    if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
    const o = {};
    for (const key in c.out.probs) { const [n, q, a, b] = key.split("|"); o[key] = E.outcomeProbs(ars.find((x) => x.name === n), q, s, ars, null, null, a === "mix" ? null : ["pure", a, b]); }
    if (c.full) {
      const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
      const r = V.callV08(ars, s, { rng: () => 0.5, tab });
      o.V = tab.V; o.N = tab.N; o.sig = tab.sigma; o.h0 = tab.h0;
      o.dist = r.dist.map((d) => [d.pitch.name, d.quad, d.prob, d.cost]); o.rs = r.info.sigma;
      o.why = V.whyLine(ars, r.info.s, tab, r.pick, r.info); o.intent = V.intentLabel(ars, r.info.s, tab, r.pick, r.info);
    }
    out.push(JSON.stringify(o));
  }
  return out;
}
const A = run(load(path.resolve(fa), dataA)), B = run(load(path.resolve(fb), dataB));
let diff = 0; A.forEach((x, i) => { if (x !== B[i]) diff++; });
console.log(`${cases.length} cases: ${diff} differ (bit-for-bit, JSON of every output)`);
process.exit(diff ? 1 : 0);
