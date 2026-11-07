/*
 * v1.0 Phase 7: tune the learner's safety switch on fresh seasons (PLAN_v1.0.md Phase 7).
 *   tuning set   seeds 700-759: noise-chasing learner (catches) and the real learner (false switch-offs), right grades
 *   held-out     seeds 800-829: noise-chasing learner, must catch >= 25 of 30
 *   false-off    seeds 900-929: the real learner on right grades, at most 1 of 30 switched off
 * Search (tuning set only): scoreMargin {0.008, 0.010, 0.012, 0.015} x scoreZ {1.282, 1.645} x scoreWindow {300, 450, 600}.
 * Seasons are the stage2 D5 setup (three pitches, right grades, 16 games x 22 PAs, locations logged). Each season runs
 * once; the switch is evaluated for every setting from its per-game scores (learner.js keepScored), exactly as learner.js
 * decides it. A season counts as caught / switched off if any pitch is.
 * Run from app/: node learner_tune.js [--jobs 4]   -> results/learner_tune.json and .md
 */
const path = require("path"), fs = require("fs"), { execFileSync, spawn } = require("child_process");
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const C3 = { command: 3, grade: 3 };
const G3 = { Fastball: C3, Slider: C3, Changeup: C3 };
const MARGINS = [0.008, 0.010, 0.012, 0.015], ZS = [1.282, 1.645], WINDOWS = [300, 450, 600];

function worker(seed, mode) {
  const { season, E, L } = require("./worlds.js");
  const pitcher = { id: "p1", pitches: P3.map((p) => Object.assign({}, p, G3[p.name])) };
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 16, pas: 22, seed, loc: true });
  if (mode === "chase") { L.CFG.driftPerGame = 1.2; Object.assign(L.CFG.caps, { step: 2, total: 3 }); }
  const prof = L.learnPitcher(E, pitcher, evs, { now: 1, keepScored: true });
  const out = {};
  for (const k of ["fb", "sl", "ch"]) out[k] = prof.pitches[k].score ? prof.pitches[k].score.scored.map((g) => [g.n, g.l, g.c]) : null;
  return { seed, mode, minRows: L.CFG.flags.scoreMinRows, pitches: out, worseNow: ["fb", "sl", "ch"].filter((k) => prof.pitches[k].score && prof.pitches[k].score.worse) };
}

function worse(scored, minRows, margin, z, window) {   // learner.js scoreboard's decision
  if (!scored) return false;
  let nAcc = 0, lL = 0, cL = 0; const win = [];
  for (let i = scored.length - 1; i >= 0 && nAcc < window; i--) { const [n, l, c] = scored[i]; lL += l; cL += c; nAcc += n; win.push(scored[i]); }
  if (!nAcc) return false;
  const gap = (cL - lL) / nAcc;
  const se = Math.sqrt(win.reduce((a, [n, l, c]) => a + ((c - l) - gap * n) ** 2, 0)) / nAcc;
  return nAcc >= minRows && gap > margin && gap > z * se;
}
const seasonOff = (r, m, z, w) => ["fb", "sl", "ch"].some((k) => worse(r.pitches[k], r.minRows, m, z, w));

async function runAll(tasks, jobs) {
  const res = [];
  let next = 0;
  const one = () => new Promise((resolve) => {
    if (next >= tasks.length) return resolve();
    const [seed, mode] = tasks[next++];
    const ch = spawn(process.execPath, [__filename, "--worker", String(seed), mode], { cwd: __dirname });
    let buf = "";
    ch.stdout.on("data", (d) => { buf += d; });
    ch.stderr.on("data", (d) => process.stderr.write(d));
    ch.on("close", (code) => {
      if (code !== 0) throw new Error(`worker ${seed} ${mode} exited ${code}`);
      res.push(JSON.parse(buf.trim().split("\n").pop()));
      if (res.length % 20 === 0) console.log(`  ${res.length}/${tasks.length} seasons`);
      resolve(one());
    });
  });
  await Promise.all(Array.from({ length: jobs }, one));
  return res;
}

async function main() {
  const jobs = process.argv.includes("--jobs") ? +process.argv[process.argv.indexOf("--jobs") + 1] : 4;
  const t0 = Date.now();
  const tasks = [];
  for (let s = 700; s < 760; s++) { tasks.push([s, "chase"]); tasks.push([s, "real"]); }
  for (let s = 800; s < 830; s++) tasks.push([s, "chase"]);
  for (let s = 900; s < 930; s++) tasks.push([s, "real"]);
  console.log(`${tasks.length} seasons, ${jobs} jobs`);
  const all = await runAll(tasks, jobs);
  const pick = (lo, hi, mode) => all.filter((r) => r.seed >= lo && r.seed <= hi && r.mode === mode);
  const tuneC = pick(700, 759, "chase"), tuneR = pick(700, 759, "real"), held = pick(800, 829, "chase"), fresh = pick(900, 929, "real");
  const { L } = require("./worlds.js");
  const cur = L.CFG.flags;
  const grid = [];
  for (const m of MARGINS) for (const z of ZS) for (const w of WINDOWS) {
    grid.push({ margin: m, z, window: w, tuneCatch: tuneC.filter((r) => seasonOff(r, m, z, w)).length, tuneFalse: tuneR.filter((r) => seasonOff(r, m, z, w)).length,
      heldCatch: held.filter((r) => seasonOff(r, m, z, w)).length, freshFalse: fresh.filter((r) => seasonOff(r, m, z, w)).length });
  }
  // choose on the tuning set only: no false switch-off there, then the most catches; ties: larger margin, larger z, smaller window (more conservative)
  const ok = grid.filter((g) => g.tuneFalse === 0);
  ok.sort((a, b) => b.tuneCatch - a.tuneCatch || b.margin - a.margin || b.z - a.z || a.window - b.window);
  const chosen = ok[0] || null;
  const current = grid.find((g) => g.margin === cur.scoreMargin && g.z === cur.scoreZ && g.window === cur.scoreWindow);
  const pass = (g) => g && g.heldCatch >= 25 && g.freshFalse <= 1;
  const nowCheck = { tuneCatch: tuneC.filter((r) => r.worseNow.length).length, tuneFalse: tuneR.filter((r) => r.worseNow.length).length,
    heldCatch: held.filter((r) => r.worseNow.length).length, freshFalse: fresh.filter((r) => r.worseNow.length).length };
  const out = { seconds: Math.round((Date.now() - t0) / 1000), current: { margin: cur.scoreMargin, z: cur.scoreZ, window: cur.scoreWindow, ...current },
    currentFromLearner: nowCheck, chosen, chosenPasses: pass(chosen), grid };
  fs.writeFileSync(path.join(__dirname, "..", "results", "learner_tune.json"), JSON.stringify(out, null, 1));
  const L_ = ["# v1.0 Phase 7: learner safety switch (app/learner_tune.js)", "",
    `Seasons: tuning 700-759 (60 noise-chasing, 60 real learner), held-out 800-829 (30 noise-chasing), false-off 900-929 (30 real learner, right grades). ${out.seconds} s.`,
    "", `Current setting (margin ${cur.scoreMargin}, z ${cur.scoreZ}, window ${cur.scoreWindow}): tuning catches ${current.tuneCatch}/60, false ${current.tuneFalse}/60; held-out catches ${current.heldCatch}/30; fresh false ${current.freshFalse}/30 (learner.js's own flag agrees: ${JSON.stringify(nowCheck)}).`,
    "", chosen ? `Chosen on the tuning set: margin ${chosen.margin}, z ${chosen.z}, window ${chosen.window}: tuning ${chosen.tuneCatch}/60 caught, ${chosen.tuneFalse}/60 false; held-out ${chosen.heldCatch}/30 caught (need 25); fresh ${chosen.freshFalse}/30 false (max 1): ${pass(chosen) ? "PASS" : "FAIL"}` : "No setting has zero false switch-offs on the tuning set.",
    "", "| margin | z | window | tuning caught /60 | tuning false /60 | held-out caught /30 | fresh false /30 |", "|---|---|---|---|---|---|---|",
    ...grid.map((g) => `| ${g.margin} | ${g.z} | ${g.window} | ${g.tuneCatch} | ${g.tuneFalse} | ${g.heldCatch} | ${g.freshFalse} |`)];
  fs.writeFileSync(path.join(__dirname, "..", "results", "learner_tune.md"), L_.join("\n") + "\n");
  console.log(L_.slice(2, 7).join("\n"));
}

if (process.argv[2] === "--worker") console.log(JSON.stringify(worker(+process.argv[3], process.argv[4])));
else main();
