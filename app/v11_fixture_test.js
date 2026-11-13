/*
 * v1.1 Step 5 replay and migration proof (docs/PLAN_v1.1_2026-11-12.md, Step 5): app/fixtures/v10_kinds_backup.json is a
 * backup made by the real v1.0 app (git archive b318098, `node sim_backup.js ... kinds 3 5`): one pitcher with a
 * four-seam, two-seam, sinker, cutter, 12-6 curve and splitter stored in v1.0's four kinds, 3 games, 287 pitches, with
 * kind-keyed matchup memory in the event snapshots.
 *   1. It is a v1.0 backup (four kinds, v1.0 tags, no kindsV).
 *   2. The migration (app/db.js migratePitcherV11 with the engine's table, what the app runs on load) changes each of the
 *      six pitches and logs every change; a pitch whose kind moves keeps its v1.0 sign.
 *   3. It replays exactly through Step 1's code (replay_check.js at commit 9e2f41e: confidence, landing today, pitch count).
 *   4. Through this build: confidence and pitch counts exact; landing-today keys and strike / pitch counts exact; only
 *      the expected-strike sums move (Step 1b on: sinkers and cutters have their own movement and location model).
 *   5. Kind-keyed hitter memory still reads: every key is a fastball-class key or an off-speed kind, and SI / FC read FB.
 * Run from app/: node v11_fixture_test.js
 */
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const D = require("./db.js");
const FIX = path.join(__dirname, "fixtures/v10_kinds_backup.json");
const bk = JSON.parse(fs.readFileSync(FIX, "utf8")), st = bk.stores;
let fails = 0, n = 0;
const check = (ok, msg) => { n++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const p0 = st.pitchers.find((x) => x.id === bk.sim.pitcherId);

console.log("1. A v1.0 backup");
check(bk.sim.scenario === "kinds" && p0.kindsV === undefined && p0.pitches.every((d) => ["FB", "SL", "CB", "CH"].includes(d.kind)),
  `made by v1.0's app: ${p0.pitches.map((d) => `${d.type} ${d.kind}/${d.shape}`).join(", ")}`);

console.log("2. The migration changes every one of the six and logs it");
const p = JSON.parse(JSON.stringify(p0)), log = D.migratePitcherV11(p, E.migratePitch);
const got = log.map((x) => `${x.pitch}: ${x.from} -> ${x.to}${x.sign == null ? "" : ` (sign ${x.sign})`}`);
const want = ["Fastball: FB/ride -> FB/rides", "Two-seam: FB/run -> SI/two-seam (sign 1)", "Sinker: FB/sink -> SI/run (sign 1)", "Cutter: FB/cut -> FC/ (sign 1)",
  "Curve: CB/sharp -> CB/12-6", "Splitter: CH/drop -> CH/split"];
check(JSON.stringify(got) === JSON.stringify(want), `the log: ${got.join("; ")}`);
check(p.kindsV === 11 && D.migratePitcherV11(p, E.migratePitch).length === 0, "marked migrated; running it again changes nothing");

console.log("3. Exact replay through Step 1's code (commit 9e2f41e)");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v11s1-"));
try {
  const tar = execFileSync("git", ["archive", "--format=tar", "9e2f41e", "app/replay_check.js", "app/engine.js", "app/engine_data.json", "app/learner.js", "app/learn.js"], { cwd: path.join(__dirname, ".."), maxBuffer: 64 << 20 });
  execFileSync("tar", ["-x", "-f", "-", "-C", tmp], { input: tar, maxBuffer: 64 << 20 });
  const out = execFileSync("node", [path.join(tmp, "app/replay_check.js"), FIX], { cwd: path.join(tmp, "app"), encoding: "utf8" }).trim();
  check(/-> PASS$/.test(out), out);
} catch (e) { check(false, `replay at Step 1 failed: ${String(e.stderr || e.message || "").trim().split("\n").pop().slice(0, 300)}`); }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log("4. Replay through this build: only the expected-strike sums move");
const L2 = require("./learner.js");
const TYPES = new Map(st.pitchers.map((x) => [x.id, Object.fromEntries((x.pitches || []).filter((d) => d.type).map((d) => [d.name, d.type]))]));
let confWorst = 0, pcBad = 0, keyBad = 0, cntBad = 0, expWorst = 0, pitches = 0;
for (const g of st.games) {
  const evs = st.events.filter((e) => e.gameId === g.id && !e.deletedAt && !e.legacy && e.type !== "play").sort((a, b) => a.n - b.n);
  for (const pid of new Set(evs.map((e) => e.pitcherId))) {
    const mine = evs.filter((e) => e.pitcherId === pid), G = L2.gamesOf(mine)[0];
    for (const pd of st.pitchers.find((x) => x.id === pid).pitches) {
      const thrown = mine.filter((e) => (e.thrown || e.pitchName) === pd.name);
      if (!thrown.length) continue;
      const { script, base } = L2._pitchGame(G, pd, () => pd.name);
      const snap0 = mine.map((e) => e.ars.find((x) => x.name === pd.name)).find(Boolean);
      const cp = L2._confPath(E, pd.kind, base, script, snap0 && snap0.strike_rate != null ? snap0.strike_rate : null, snap0 && snap0.strike_ref != null ? snap0.strike_ref : null);
      thrown.forEach((e, k) => { confWorst = Math.max(confWorst, Math.abs(cp[k] - e.ars.find((x) => x.name === pd.name).conf)); });
    }
    const land = {};
    mine.forEach((e, i) => {
      pitches++;
      if (e.pcRaw !== i || e.sit.pitch_count !== e.pcRaw + e.fatigueShift) pcBad++;
      const a = e.sit.landing_today || {};
      if (Object.keys(a).sort().join() !== Object.keys(land).sort().join()) keyBad++;
      else for (const k of Object.keys(a)) { if (a[k][0] !== land[k][0] || a[k][a[k].length - 1] !== land[k][land[k].length - 1]) cntBad++; expWorst = Math.max(expWorst, Math.abs(a[k][1] - land[k][1])); }
      const t = e.thrown || e.pitchName;
      if (e.quad !== "chase") {
        const arsE = e.ars.map((x) => E.Pitch(Object.assign({}, x, { type: x.type || (TYPES.get(e.pitcherId) || {})[x.name] })));
        land[t] = E.landingRecord(land[t], !(e.res === "ball" || e.res === "hbp"), E.expectedStrike(arsE.find((x) => x.name === t), e.quad, E.Situation(e.sit), arsE));
      }
    });
  }
}
check(pitches === 287 && confWorst === 0 && pcBad === 0, `${pitches} pitches: confidence largest difference ${confWorst}, pitch-count mismatches ${pcBad}`);
check(keyBad === 0 && cntBad === 0, `landing today: keys and strike / pitch counts exact (${keyBad} key, ${cntBad} count mismatches)`);
check(expWorst > 0 && expWorst < 2, `expected-strike sums move by at most ${expWorst.toFixed(3)} over a game (the v1.1 model's strike expectation; exact at Step 1, check 3)`);

console.log("5. Kind-keyed hitter memory still reads");
const keys = new Set();
for (const e of st.events) for (const k of Object.keys((e.sit && e.sit.matchup) || {})) keys.add(k.split("|")[1]);
check(keys.size > 0 && [...keys].every((k) => ["FB", "SL", "CB", "CH"].includes(k)) && E.keyKind("SI") === "FB" && E.keyKind("FC") === "FB" && E.keyKind("CB") === "CB",
  `matchup keys by ${[...keys].sort().join(", ")}; a sinker or cutter reads the fastball's (keyKind)`);

console.log(fails ? `\n${fails} of ${n} check(s) FAILED` : `\nall ${n} v1.0 fixture checks passed`);
process.exit(fails ? 1 : 0);
