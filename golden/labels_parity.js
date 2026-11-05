// v0.9 Step 4: the JS intent labels against Python on golden/labels_parity.json (python3 tests_v09_step4.py writes it).
// node golden/labels_parity.js   (pick, label, mechanism and line must match exactly)
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "..", "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "engine_data.json"))));
E.setFlags(E.FLAGS_V08);
const V = E.v08;
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "labels_parity.json")));
let bad = 0; const notes = [];
cases.forEach((c, i) => {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  let s = E.Situation(Object.assign({}, c.s));
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: V.winConstants(s) });
  const tab = V.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  const r = V.callV08(ars, s, { rng: () => 0.5, tab });
  const [label, mech, line] = V.intentLabel(ars, r.info.s, tab, r.pick, r.info);
  const got = JSON.stringify([r.pick.pitch.name, r.pick.quad, label, mech, line]);
  const want = JSON.stringify([c.pick[0], c.pick[1], c.label, c.mech, c.line]);
  if (got !== want) { bad++; if (notes.length < 8) notes.push(`case ${i}: js ${got} vs py ${want}`); }
});
for (const n of notes) console.log("  " + n);
console.log(bad ? `FAIL: ${bad} of ${cases.length} differ` : `PASS: JS intent labels match Python on ${cases.length} cases`);
process.exit(bad ? 1 : 0);
