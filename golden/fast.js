// Fast live Python-vs-JS parity harness, JS side (v1.0 Step 0b).
// The JS twin of golden/cases.py's compute(), modeled on golden/golden_v09.js. Runs on the first N cases of
// golden/golden_v10.json (v1.0 Step 7: its inputs carry the Step 7 coverage) and diffs against the live Python side, tolerance 1e-9, non-zero exit on any mismatch.
//   node golden/fast.js N         -> compute both sides, diff, exit non-zero on any mismatch
//   node golden/fast.js --emit N  -> print this side's results as JSON (used by golden/fast.py)
const fs = require("fs"), path = require("path");
const { execFileSync } = require("child_process");
const HERE = __dirname, ROOT = path.join(HERE, "..");
const E = require(path.join(ROOT, "app", "engine.js"));
E.init(JSON.parse(fs.readFileSync(path.join(ROOT, "app", "engine_data.json"))));
const V = E.v08;
const TOL = 1e-9;

const plain = (x) => x instanceof Map ? Object.fromEntries([...x].map(([k, v]) => [k, plain(v)]))
  : Array.isArray(x) ? x.map(plain)
  : (x && typeof x === "object") ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]))
  : x;

function compute(c) {
  const ars = c.arsenal.map((d) => E.Pitch(Object.assign({}, d)));
  const sd = Object.assign({}, c.s);
  if (!sd.matchup) delete sd.matchup;                       // v0.9: matchup applies only when non-empty
  const s = E.Situation(sd);
  const sw = (s.home !== null && s.home !== undefined) ? Object.assign({}, s, { win: V.winConstants(s) }) : s;
  const r = { probs: {} };
  ars.forEach((p, i) => {
    const kk = c.pure[i];
    for (const q of E.QUADS) for (const sit of [null, ["pure", kk[0], kk[1]]]) {
      const key = p.name + "|" + q + "|" + (sit === null ? "mix" : kk[0] + "|" + kk[1]);
      r.probs[key] = plain(E.outcomeProbs(p, q, sw, ars, null, null, sit));
    }
  });
  if (sw.win) { r.win = {}; for (const k of ["omega", "WE0", "m0", "LI"]) r.win[k] = sw.win[k]; }
  r.conf = {};     // v1.0 #18: confidence after each event (retiring app/parity.js)
  for (const d of c.arsenal) for (const ev of ["ball", "cstrike", "whiff", "hard", "shakeoff"]) {
    const p = E.Pitch(Object.assign({}, d)); E.updateConfidence(p, ev); r.conf[d.name + "|" + ev] = p.conf;
  }
  if (!c.full) return r;
  const tab = V.solveTable(ars, Object.assign({}, sw, { balls: 0, strikes: 0, last: null }));
  r.table = { h0: Array.from(tab.h0), sweeps: tab.sweeps, V: plain(tab.V), N: plain(tab.N), sigma: plain(tab.sigma) };
  const res = V.callV08(ars, sw, { rng: () => 0.5, tab });
  const dist = {};
  for (const d of res.dist) dist[d.pitch.name + "|" + d.quad] = [d.prob, d.cost];
  r.call = { pick: [res.pick.pitch.name, res.pick.quad], prob: res.pick.prob, cost: res.pick.cost,
             dist, sigma: plain(res.info.sigma), residual: res.info.residual };
  const [line, deltas] = V.whyLine(ars, res.info.s, tab, res.pick, res.info);
  r.why = { line, deltas: plain(deltas) };
  r.intent = plain(V.intentLabel(ars, res.info.s, tab, res.pick, res.info));   // v1.0 Step 4: compared live too
  {   // v1.0 #18: the learning-mode grade (retiring app/parity.js), compared live
    const g = V.gradeCall(ars, sw, ars[ars.length - 1].name, E.targets(s.balls, s.strikes).slice(-1)[0], tab, { rng: () => 0.5 });
    r.gradecall = plain(g);
  }
  const p0 = ars[0], q0 = E.targets(s.balls, s.strikes)[0];
  r.take = Array.from(V.takeStats(p0, q0, sw, ars));
  const g = V.gradeStats(p0, q0, sw, ars, null, c.s.grades);
  r.grade = {};
  for (const k in g) r.grade[k] = Array.from(g[k]);
  r.walk = Array.from(V.walkSuggestion(ars, sw, tab));     // v1.0 Step 7 coverage, as golden_v10.py
  if (c.exclude) {
    const x = V.callV08(ars, sw, { rng: () => 0.5, tab, exclude: c.exclude }), xd = {};
    for (const d of x.dist) xd[d.pitch.name + "|" + d.quad] = [d.prob, d.cost];
    const [xl, xdel] = V.whyLine(ars, x.info.s, tab, x.pick, x.info, c.exclude);
    r.shaken = { pick: [x.pick.pitch.name, x.pick.quad], prob: x.pick.prob, cost: x.pick.cost, dist: xd, why: xl,
                 deltas: plain(xdel), intent: plain(V.intentLabel(ars, x.info.s, tab, x.pick, x.info, c.exclude)) };
  }
  r.ump = { u: V.umpEstimate(c.takes, s.level),
            g: Array.from(V.gradeEstimate(c.takes, 3, 2.5, 3.0, c.takes.length + 20)) };
  return r;
}

// the JS twin of cases.py's flat()
function flat(r, pre, out) {
  if (r !== null && typeof r === "object" && !Array.isArray(r)) {
    for (const k in r) flat(r[k], pre + k + ".", out);
  } else if (Array.isArray(r)) {
    r.forEach((v, i) => flat(v, `${pre}${i}.`, out));
  } else {
    out[pre.replace(/\.+$/, "")] = r;
  }
  return out;
}

function pySide(n) {
  const cands = process.env.PYTHON ? [process.env.PYTHON] : ["python3", "python"];
  let last;
  for (const py of cands) {
    try {
      return JSON.parse(execFileSync(py, [path.join(HERE, "fast.py"), "--emit", String(n)],
        { cwd: ROOT, maxBuffer: 1 << 30, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    } catch (err) { last = err; }
  }
  console.error(`Python side failed: ${last && (last.stderr || last.message)}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--emit");
  const emit = process.argv.includes("--emit");
  const n = args.length ? parseInt(args[0], 10) : 40;
  const all = JSON.parse(fs.readFileSync(path.join(HERE, "golden_v10.json")));
  if (n > all.length) { console.error(`only ${all.length} golden cases available, asked for ${n}`); process.exit(1); }
  const cases = all.slice(0, n);
  if (emit) { process.stdout.write(JSON.stringify(cases.map(compute))); return; }
  let t0 = Date.now(); const js = cases.map(compute); const tJs = (Date.now() - t0) / 1000;
  t0 = Date.now(); const py = pySide(n); const tPy = (Date.now() - t0) / 1000;
  const bad = [], worst = {}; let cmp = 0;
  for (let i = 0; i < n; i++) {
    const wj = flat(js[i], "", {}), wp = flat(py[i], "", {});
    for (const k of Object.keys(wp)) if (!(k in wj)) bad.push(`case ${i} ${k}: only in Python`);
    for (const k of Object.keys(wj)) if (!(k in wp)) bad.push(`case ${i} ${k}: only in JS`);
    for (const k of Object.keys(wj)) {
      if (!(k in wp)) continue;
      const a = wp[k], b = wj[k];
      cmp++;
      if (typeof a === "number" && typeof b === "number") {
        const d = Math.abs(a - b), grp = k.split(".")[0];
        if (d > (worst[grp] || 0)) worst[grp] = d;
        if (!(d <= TOL)) bad.push(`case ${i} ${k}: py ${a} js ${b} (diff ${d.toExponential(3)})`);
      } else if (JSON.stringify(a) !== JSON.stringify(b)) {
        bad.push(`case ${i} ${k}: py ${JSON.stringify(a)} js ${JSON.stringify(b)}`);
      }
    }
  }
  console.log(`${n} cases (${cases.filter((c) => c.full).length} with full solves), ${cmp} values compared, tolerance ${TOL}`);
  console.log(`  js ${tJs.toFixed(2)}s   python ${tPy.toFixed(2)}s`);
  console.log("Largest Python-vs-JS differences:");
  for (const k of Object.keys(worst).sort((a, b) => worst[b] - worst[a])) {
    console.log(`  ${k.padEnd(11)} ${worst[k].toExponential(2)}`);
  }
  for (const b of bad.slice(0, 10)) console.log("  " + b);
  console.log(bad.length ? `FAIL: ${bad.length} mismatches` : "PASS: 0 mismatches");
  process.exit(bad.length ? 1 : 0);
}

main();
