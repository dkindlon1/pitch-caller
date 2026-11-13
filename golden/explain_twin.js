// v1.1 Step 3: the JS side of tests_v11_explain.py's parity section.
// node golden/explain_twin.js N  -> JSON: for the first N full-solve cases of golden_v10.json, the why line and intent, once
// as called and once with the drawn pitch shaken off (exclude path). With cases on stdin ({arsenal, s} list, the setup
// cases built by the Python side), the same for each of them instead.
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "..", "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "engine_data.json"))));
const V = E.v08;
const n = parseInt(process.argv[2] || "20", 10);
const stdin = process.argv[3] === "-" ? JSON.parse(fs.readFileSync(0, "utf8")) : null;
const cases = stdin || JSON.parse(fs.readFileSync(path.join(__dirname, "golden_v10.json"))).filter((c) => c.full).slice(0, n);
const out = cases.map((c) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s); if (!sd.matchup) delete sd.matchup;
  let s = E.Situation(sd);
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null, pa_log: [] }));
  const one = (exclude) => {
    const r = V.callV08(ars, s, { rng: () => 0.5, tab, exclude });
    return { pick: [r.pick.pitch.name, r.pick.quad], why: V.whyLine(ars, r.info.s, tab, r.pick, r.info, exclude)[0],
             intent: V.intentLabel(ars, r.info.s, tab, r.pick, r.info, exclude) };
  };
  const a = one([]);
  return { plain: a, shaken: ars.length > 1 ? one([a.pick[0]]) : null };
});
process.stdout.write(JSON.stringify(out));
