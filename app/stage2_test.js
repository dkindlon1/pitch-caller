/*
 * Plan Stage 2, the learner side that needs the engine: D5 (the safety switch trips on a noise-chasing learner),
 * D7 (bad rows skipped, not fatal), D10 (starved counts engine calls only), D12 (duplicates).
 * Run: node app/stage2_test.js   (a few minutes)
 */
const { season, E, L } = require("./worlds.js");
const PCDB = require("./db.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const C3 = { command: 3, grade: 3 };
const G3 = { Fastball: C3, Slider: C3, Changeup: C3 };
const pitcherOf = (entered) => ({ id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) });
const clone = (x) => JSON.parse(JSON.stringify(x));
const t0 = Date.now();

console.log("D5. The safety switch trips on a learner that chases noise");
{
  // The switch works per pitch: a season counts as caught if any pitch switched itself off. A retune (margin 0.012,
  // window 600) was tried on seeds 300+ and checked on held-out seeds 500-509: it caught 9/10 seasons against 8/10 for
  // the current setting, but also switched off one right-graded slider on a wrong-grades season (the current setting:
  // none), so the current setting stays.
  // Nov 6, single v0.9 engine: the old setting caught 2 of these 5; the switch was retuned (margin 0.015, 1.645 SE; see
  // learner.js) on seeds 300-309 and checked on held-out 500-509 and fresh 600-619, with no false switch-off in 40 seasons.
  const keep = clone({ drift: L.CFG.driftPerGame, caps: L.CFG.caps });
  const chase = (on) => { if (on) { L.CFG.driftPerGame = 1.2; Object.assign(L.CFG.caps, { step: 2, total: 3 }); } else { L.CFG.driftPerGame = keep.drift; Object.assign(L.CFG.caps, keep.caps); } };
  const off = (prof) => ["fb", "sl", "ch"].filter((k) => prof.pitches[k].score && prof.pitches[k].score.worse);
  const caught = [], falseOff = [];
  // Drew, Nov 10 (v1.0 Step 2): 40 seasons, same bars (caught in >= 80%, the old 4 of 5; false switch-offs at most 1
  // in 40). On 5 seasons the count moved 4/5 -> 2/5 when Step 2 re-rolled the simulated seasons, while 40 fresh seasons
  // (600-639) read 37/40 caught on the Step 1 engine and 38/40 on Step 2, each with 1 false switch-off.
  const SEASONS = 40;
  for (let r = 0; r < SEASONS; r++) {
    const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 16, pas: 22, seed: 500 + r, loc: true });
    chase(true); caught.push(off(L.learnPitcher(E, pitcherOf(G3), evs, { now: 1 }))); chase(false);
    falseOff.push(off(L.learnPitcher(E, pitcherOf(G3), evs, { now: 1 })));
  }
  const nC = caught.filter((x) => x.length).length, nF = falseOff.filter((x) => x.length).length;
  console.log(`     right grades, ${SEASONS} seasons: noise-chasing learner switched off in ${nC} | the real learner in ${nF}`);
  check(nC >= 0.8 * SEASONS, `the noise-chasing learner is switched off in at least 80% of seasons (${nC} of ${SEASONS})`);
  check(nF <= 1, `the real learner on the same seasons is switched off at most once (${nF} of ${SEASONS})`);
}

console.log("D7. A bad logged row is skipped, not fatal");
{
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 6, pas: 22, seed: 400, loc: true });
  const usable = evs.filter((e) => L.usable(e));
  const bad = clone(evs);
  const hit = [usable[5].id, usable[40].id, usable[90].id, usable[120].id];
  const b = (id) => bad.find((e) => e.id === id);
  // each of these crashed learning for the whole pitcher before (found by fuzzing the old learner)
  b(hit[0]).quad = null;                                               // no spot saved
  delete b(hit[1]).sit.bases;                                          // a situation saved without the runners
  b(hit[2]).ars = [null].concat(b(hit[2]).ars);                        // a hole in the arsenal snapshot
  Object.assign(b(hit[3]), { res: "play", contact: "mega" });          // a contact value the app doesn't have
  let oldErr = null;
  try {
    const OldL = (() => { const m = { exports: {} }; new Function("module", "exports", require("child_process").execSync("git show 8b3b4fc:app/learner.js", { cwd: __dirname }).toString())(m, m.exports); return m.exports; })();
    OldL.learnPitcher(E, pitcherOf(G3), bad, { now: 1, scoreboard: false });
  } catch (e) { oldErr = e.message; }
  console.log(`     the learner before this change on the same rows: ${oldErr ? "crashed (" + oldErr.slice(0, 60) + ")" : "did not crash"}`);
  check(!!oldErr, "(the setup: these rows crashed the learner before)");
  let prof = null, err = null;
  try { prof = L.learnPitcher(E, pitcherOf(G3), bad, { now: 1, scoreboard: false }); } catch (e) { err = e; }
  check(!err && prof, "learning finishes" + (err ? ": " + err.message : ""));
  check(prof && prof.skipped.n === 4 && hit.every((id) => prof.skipped.ids.includes(id)), `and reports the 4 skipped pitches (${prof && prof.skipped.n})`);
  const clean = L.learnPitcher(E, pitcherOf(G3), evs.filter((e) => !hit.includes(e.id)), { now: 1, scoreboard: false });
  check(prof && JSON.stringify(prof.pitches) === JSON.stringify(clean.pitches), "the result is exactly learning without those rows");
  check(L.learnPitcher(E, pitcherOf(G3), evs, { now: 1, scoreboard: false }).skipped.n === 0, "a clean season skips nothing");
}

console.log("D7 (review). The rows that still crashed, and rows with no id");
{
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 3, pas: 20, seed: 430, loc: true });
  const muts = [["a coach call saved without its arsenal", (e) => { delete e.ars; e.choice = "coach"; e.coach = true; }],
    ["a shake-off list with a hole in it", (e) => { e.shaken = [null]; }], ["a shake-off list of numbers", (e) => { e.shaken = [5]; }]];
  for (const [name, f] of muts) {
    const b = clone(evs); f(b.filter((e) => e.pitchName === "Fastball")[6]);
    let err = null, prof = null; try { prof = L.learnPitcher(E, pitcherOf(G3), b, { now: 1, scoreboard: false }); } catch (e) { err = e.message; }
    check(!err && prof.skipped.n === 1, `${name}: skipped, not fatal (${err || "skipped " + prof.skipped.n})`);
  }
  const noIds = clone(evs).map((e) => { delete e.id; return e; });
  noIds.filter((e) => e.pitchName === "Fastball")[3].quad = null;
  const a = L.learnPitcher(E, pitcherOf(G3), noIds, { now: 1, scoreboard: false });
  check(a.skipped.n === 1 && a.pitches.fb.n > 50, `one bad row with no id doesn't drop every row without an id (fastball rows learned: ${a.pitches.fb.n})`);
}

console.log("D8 (review). A blank grade in the grade history doesn't pull the fit to 0");
{
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 3, pas: 20, seed: 440, loc: true });
  const base = pitcherOf(G3); base.pitches[0].command = "";
  const withLog = clone(base); withLog.pitches[0].gradeLog = [{ ts: 0, command: "", grade: 3 }, { ts: evs[0].ts + 1, command: 0, grade: 3.5, sawLearned: false }];
  const noLog = clone(base); noLog.pitches[0].gradeLog = [{ ts: 0, command: "", grade: 3 }];
  const a = L.learnPitcher(E, withLog, evs, { now: 1, scoreboard: false }).pitches.fb.talent.command;
  const b = L.learnPitcher(E, noLog, evs, { now: 1, scoreboard: false }).pitches.fb.talent.command;
  check(Math.abs(a - b) < 0.05, `a logged 0 for a blank command isn't a re-grade to 0 (learned ${a} with it, ${b} without)`);
}

console.log("D10. The starved flag counts the engine's calls only");
{
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 8, pas: 22, seed: 410, loc: true });
  const eng = evs.filter((e) => L.usable(e));
  const chShare = eng.filter((e) => e.pitchName === "Changeup").length / eng.length;
  // the coach called a pile of extra fastballs himself: they don't change what the engine called
  const nCh = eng.filter((e) => e.pitchName === "Changeup").length, need = Math.ceil(nCh / 0.04) - evs.length;
  const fbs = evs.filter((e) => e.pitchName === "Fastball");
  const extra = Array.from({ length: need }, (_, i) => Object.assign(clone(fbs[i % fbs.length]), { id: "coach-" + i, choice: "coach", coach: true }));
  const prof = L.learnPitcher(E, pitcherOf(G3), evs.concat(extra), { now: 1, scoreboard: false });
  const allShare = eng.filter((e) => e.pitchName === "Changeup").length / evs.concat(extra).length;
  console.log(`     changeup: ${(100 * chShare).toFixed(1)}% of the engine's calls, ${(100 * allShare).toFixed(1)}% of all pitches once the coach's own calls are counted`);
  check(allShare < 0.05 && chShare >= 0.05, "(the setup: under 5% of all pitches, over 5% of the engine's calls)");
  check(!prof.flags.some((f) => f.type === "starved" && f.pitchId === "ch"), "no starved flag: the engine does call it");
  const starve = evs.map((e) => (e.pitchName === "Changeup" ? Object.assign(clone(e), { choice: "coach", coach: true }) : e));   // every changeup was his own call
  const p2 = L.learnPitcher(E, pitcherOf(G3), starve, { now: 1, scoreboard: false });
  check(p2.flags.some((f) => f.type === "starved" && f.pitchId === "ch"), "when only the coach calls it, it is flagged starved");
}

console.log("D12. Duplicates");
{
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 4, pas: 22, seed: 420, loc: true });
  const a = L.learnPitcher(E, pitcherOf(G3), evs, { now: 1, scoreboard: false }), b = L.learnPitcher(E, pitcherOf(G3), evs.concat(clone(evs)), { now: 1, scoreboard: false });
  check(JSON.stringify(a.pitches) === JSON.stringify(b.pitches), "the same pitches arriving twice (same ids) count once");
  // a game charted on two iPads: same pitches, new ids, a few charting differences on the second
  const g1 = evs.filter((e) => e.gameId === "g1");
  const twin = g1.map((e, i) => Object.assign(clone(e), { id: "twin-" + i, gameId: "g1b", res: i % 12 === 5 ? (e.res === "ball" ? "cstrike" : "ball") : e.res })).filter((e, i) => i % 25 !== 3);
  const other = evs.filter((e) => e.gameId === "g2").map((e) => Object.assign(clone(e), { gameId: "g2" }));
  const games = [{ id: "g1", date: "2026-03-01", opponentId: "t1", deviceId: "A", startedAt: 1 }, { id: "g1b", date: "2026-03-01", opponentId: "t1", deviceId: "B", startedAt: 2 },
    { id: "g2", date: "2026-03-01", opponentId: "t1", deviceId: "B", startedAt: 3 }];
  const byGame = { g1, g1b: twin, g2: other };
  const pairs = PCDB.likelyDuplicates(games, (id) => byGame[id]);
  check(pairs.length === 1 && pairs[0].keep === "g1" && pairs[0].drop === "g1b", `the twin is found, the fuller game kept (${JSON.stringify(pairs)})`);
  check(!pairs.some((p) => p.keep === "g2" || p.drop === "g2"), "a second game the same day (a doubleheader) isn't a duplicate");
  const sameDev = PCDB.likelyDuplicates([games[0], Object.assign({}, games[1], { deviceId: "A" })], (id) => byGame[id]);
  check(!sameDev.length, "two games from one iPad are never duplicates of each other");
  const said = PCDB.likelyDuplicates([games[0], Object.assign({}, games[1], { notDup: ["g1"] })], (id) => byGame[id]);
  check(!said.length, "once the coach says they're different games, they stay different");
  const otherDay = PCDB.likelyDuplicates([games[0], Object.assign({}, games[1], { date: "2026-03-02" })], (id) => byGame[id]);
  check(!otherDay.length, "different dates are never duplicates");
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(fails ? `${fails} stage 2 check(s) FAILED` : "all stage 2 checks passed");
process.exit(fails ? 1 : 0);
