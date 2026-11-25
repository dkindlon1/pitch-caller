// Sim speed option (a), measurement only: time the JS twin's solveTable on the golden parity cases that carry a full
// solve (golden/golden_v10.json, every case set to LEVEL) and emit the solved tables for an exactness check against Python.
//   node hitter_data/sim_speed_js.js LEVEL K   -> JSON {secs: [...], tables: [...]} on stdout
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const E = require(path.join(ROOT, "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(ROOT, "app", "engine_data.json"))));
const V = E.v08;
const [level, K] = [process.argv[2], parseInt(process.argv[3], 10)];
const plain = (x) => x instanceof Map ? Object.fromEntries([...x].map(([k, v]) => [k, plain(v)]))
  : Array.isArray(x) ? x.map(plain)
  : (x && typeof x === "object") ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)])) : x;
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, "golden", "golden_v10.json"))).filter((c) => c.full).slice(0, K);
const secs = [], tables = [];
for (const c of cases) {
  c.s.level = level;
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s);
  if (!sd.matchup) delete sd.matchup;
  const s = E.Situation(sd);
  const sw = (s.home !== null && s.home !== undefined) ? Object.assign({}, s, { win: V.winConstants(s) }) : s;
  const t = process.hrtime.bigint();
  const tab = V.solveTable(ars, Object.assign({}, sw, { balls: 0, strikes: 0, last: null }));
  secs.push(Number(process.hrtime.bigint() - t) / 1e9);
  tables.push({ h0: Array.from(tab.h0), sweeps: tab.sweeps, V: plain(tab.V), N: plain(tab.N) });
}
process.stdout.write(JSON.stringify({ secs, tables }));
