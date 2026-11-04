/*
 * Learner v2 checks against simulated worlds with a known truth (spec section 13, Phase 1).
 * Each world plays full seasons pitch by pitch with live in-game state. Pass criteria are fixed here, before results.
 * Run: node worlds_test.js [reps]       (about 5-10 minutes at the default)
 */
const { season, E, L } = require("./worlds.js");
const V1 = require("./learn.js");
const REPS = +(process.argv[2] || 5);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const grades = (fb, sl, ch) => ({ Fastball: fb, Slider: sl, Changeup: ch });
const pitcherOf = (entered, extra = {}) => Object.assign({ id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) }, extra);
const flat = (t) => () => t;
const C3 = { command: 3, grade: 3 };
const t0 = Date.now();
const GATED = L.ACTIVE_TRAITS.slice();   // the traits switched on in use (the gate's result), before the tests turn all on
L.ACTIVE_TRAITS.push(...L.ALL_TRAITS.filter((k) => !L.ACTIVE_TRAITS.includes(k)));   // test the full trait machinery, even though the gate keeps them off in use

console.log("1. Steady pitcher, right grades: holds still, no false flags");
{
  const entered = grades(C3, C3, C3), errs = [], gradeFlags = [], changeFlags = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 10 + r, loc: true }), { scoreboard: false });
    for (const k of ["fb", "sl"]) errs.push(prof.pitches[k].talent.command - 3, prof.pitches[k].talent.grade - 3);
    gradeFlags.push(prof.flags.filter((f) => f.type === "grade").length); changeFlags.push(prof.flags.filter((f) => f.type === "change").length);
  }
  console.log(`     average learned minus truth ${mean(errs).toFixed(3)}, average size ${mean(errs.map(Math.abs)).toFixed(2)}; grade flags ${gradeFlags.join(",")}; change suggestions ${changeFlags.join(",")}`);
  check(Math.abs(mean(errs)) < 0.15, "no drift on average (within ±0.15)");
  check(gradeFlags.every((x) => x === 0), "no grade flags");
  check(changeFlags.filter((x) => x > 0).length <= Math.max(1, Math.round(REPS / 10)), "change suggestions in at most 1 in 10 seasons");
}

console.log("2. Wrong grades: moves toward the truth and flags it");
{
  const entered = grades({ command: 4, grade: 3 }, { command: 3, grade: 3 }, C3), truth = flat(grades({ command: 2, grade: 3 }, { command: 3, grade: 4.2 }, C3));
  const fbC = [], slG = [], flagged = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 20 + r, loc: true }), { scoreboard: false });
    fbC.push(prof.pitches.fb.talent.command); slG.push(prof.pitches.sl.talent.grade);
    flagged.push(prof.flags.some((f) => f.type === "grade" && f.pitchId === "fb" && f.dim === "command"));
  }
  console.log(`     fastball command: entered 4, truth 2, learned ${mean(fbC).toFixed(2)} | slider stuff: entered 3, truth 4.2, learned ${mean(slG).toFixed(2)} | fastball flagged ${flagged.filter(Boolean).length}/${REPS}`);
  check(Math.abs(mean(fbC) - 2) < 0.5 * 2, "fastball command error cut by half or more");
  check(Math.abs(mean(slG) - 4.2) < 0.5 * 1.2, "slider stuff error cut by half or more");
  check(flagged.filter(Boolean).length >= Math.ceil(REPS / 2), "the fastball command disagreement is flagged in most seasons");
}

console.log("3. The in-game leak: a low-command pitcher, in-game state live (v1 learner vs v2 on the same seasons)");
{
  const entered = grades({ command: 3.5, grade: 3 }, C3, C3), truth = flat(grades({ command: 2, grade: 3 }, C3, C3));
  const v2 = [], v1 = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 30 + r, loc: true });
    v2.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.command);
    v1.push(V1.pitcherModel(E, { id: "p1", pitches: pitcherOf(entered).pitches }, evs).pitches.fb.fit.command);
  }
  console.log(`     truth 2: v1 learned ${mean(v1).toFixed(2)}, v2 learned ${mean(v2).toFixed(2)}`);
  check(Math.abs(mean(v2) - 2) < 0.2, "v2 within 0.2 of the truth");
  check(Math.abs(mean(v2) - 2) <= Math.abs(mean(v1) - 2) + 0.02, "v2 at least as close as v1");
}

console.log("4. Sudden change (injury at game 12: command 3 -> 1.8): with the coach's mark vs without");
{
  const entered = grades(C3, C3, C3), truth = (g) => grades(g < 12 ? C3 : { command: 1.8, grade: 3 }, C3, C3);
  const marked = [], unmarked = [], suggested = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 40 + r, loc: true });
    const upTo15 = evs.filter((e) => +e.gameId.slice(1) < 15), markTs = evs.find((e) => e.gameId === "g12").ts;
    marked.push(L.learnPitcher(E, pitcherOf(entered, { changes: [{ pitchId: "fb", ts: markTs, source: "coach" }] }), upTo15, { scoreboard: false }).pitches.fb.talent.command);
    unmarked.push(L.learnPitcher(E, pitcherOf(entered), upTo15, { scoreboard: false }).pitches.fb.talent.command);
    suggested.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).flags.some((f) => f.type === "change" && f.pitchId === "fb"));
  }
  console.log(`     3 games after: with the mark ${mean(marked).toFixed(2)}, without ${mean(unmarked).toFixed(2)} (truth 1.8) | suggested by game 20 without a mark: ${suggested.filter(Boolean).length}/${REPS}`);
  check(Math.abs(mean(marked) - 1.8) < 0.5, "with the mark, within 0.5 three games later");
  check(Math.abs(mean(marked) - 1.8) < Math.abs(mean(unmarked) - 1.8), "the mark makes it faster");
  console.log(`     (results-only suggestion is low-power by design; reported, not required: ${suggested.filter(Boolean).length}/${REPS})`);
}

console.log("5. Charter mistakes (10% of results and locations wrong), right grades: stays put, no false grade flags");
{
  const entered = grades(C3, C3, C3), errs = [], flags = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 50 + r, loc: true, charterError: 0.1 }), { scoreboard: false });
    errs.push(prof.pitches.fb.talent.command - 3, prof.pitches.fb.talent.grade - 3); flags.push(prof.flags.filter((f) => f.type === "grade").length);
  }
  console.log(`     fastball learned minus truth ${mean(errs).toFixed(2)} on average; grade flags ${flags.join(",")}`);
  check(mean(errs.map(Math.abs)) < 0.6, "stays within 0.6 of the truth on average");
  check(flags.every((x) => x === 0), "no false grade flags");
}

console.log("6. Selective logging (hard contact always logged, the rest 40%): the 90% rule keeps stuff honest");
{
  const entered = grades(C3, C3, C3), withRule = [], without = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 60 + r, loc: true, contact: "selective" });
    withRule.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.grade);
    const keep = L.CFG.completeness; L.CFG.completeness = 0;
    without.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.grade);
    L.CFG.completeness = keep;
  }
  console.log(`     fastball stuff, truth 3: with the rule ${mean(withRule).toFixed(2)}, without it ${mean(without).toFixed(2)}`);
  check(Math.abs(mean(withRule) - 3) < 0.25, "with the rule, within 0.25");
  check(Math.abs(mean(withRule) - 3) < Math.abs(mean(without) - 3), "the rule removes the bias");
}

console.log("7. Coach calls driven by unlogged feel: excluding them keeps stuff honest");
{
  const entered = grades(C3, C3, C3), excl = [], incl = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 70 + r, loc: true, formSd: 0.6, coachCalls: { name: "Changeup" } });
    excl.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.ch.talent.grade);
    incl.push(L.learnPitcher(E, pitcherOf(entered), evs.map((e) => Object.assign({}, e, { choice: "engine", coach: false })), { scoreboard: false }).pitches.ch.talent.grade);
  }
  console.log(`     changeup stuff, truth 3 on average: excluding coach calls ${mean(excl).toFixed(2)}, including them ${mean(incl).toFixed(2)}`);
  check(Math.abs(mean(excl) - 3) < 0.3, "excluded: within 0.3");
}

console.log("8. Population honesty: grades off by coach-typical amounts; truth inside ±1 sd how often?");
{
  let inside = 0, n = 0;
  const g = (r) => (r() + r() + r() + r() - 2) * 1.22 * 0.7;
  for (let r = 0; r < REPS * 2; r++) {
    const rr = require("./worlds.js").rng(800 + r), tr = {};
    for (const p of P3) tr[p.name] = { command: Math.min(4.8, Math.max(1.2, 3 + g(rr))), grade: Math.min(4.8, Math.max(1.2, 3 + g(rr))) };
    const prof = L.learnPitcher(E, pitcherOf(grades(C3, C3, C3)), season({ pitches: P3, entered: grades(C3, C3, C3), truth: flat(tr), games: 15, pas: 22, seed: 80 + r, loc: true }), { scoreboard: false });
    for (const p of P3) for (const dim of ["command", "grade"]) { n++; if (Math.abs(prof.pitches[p.id].talent[dim] - tr[p.name][dim]) <= prof.pitches[p.id].sd[dim]) inside++; }
  }
  console.log(`     truth within ±1 sd: ${inside} of ${n} (${Math.round((100 * inside) / n)}%)`);
  check(inside / n >= 0.6 && inside / n <= 0.9, "between 60% and 90% (68% is exact)");
}

console.log("9. Replay determinism, renames and cross-ups");
{
  const entered = grades(C3, C3, C3), evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 8, pas: 22, seed: 90, loc: true });
  const a = JSON.stringify(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false, now: 1 }));
  const b = JSON.stringify(L.learnPitcher(E, pitcherOf(entered), evs.slice().reverse(), { scoreboard: false, now: 1 }));
  check(a === b, "same events in any order give the identical profile");
  // rename the slider to "Sweepy" halfway: its history must follow its id
  const renamed = evs.map((e) => { if (+e.gameId.slice(1) < 4) return e; const f = JSON.parse(JSON.stringify(e)); if (f.pitchName === "Slider") f.pitchName = "Sweepy";
    f.ars.forEach((x) => { if (x.name === "Slider") x.name = "Sweepy"; }); if (f.sit.last && f.sit.last[0] === "Slider") f.sit.last[0] = "Sweepy"; return f; });
  const p2 = pitcherOf(entered); p2.pitches[1].name = "Sweepy";
  const nA = L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.sl.n, nB = L.learnPitcher(E, p2, renamed, { scoreboard: false }).pitches.sl.n;
  check(nA === nB && nA > 0, `a renamed pitch keeps its history (${nA} vs ${nB} pitches)`);
  // a cross-up: called slider, threw fastball -> counts for the fastball, not the slider
  const ev = evs.find((e) => e.pitchName === "Slider" && e.choice === "engine");
  const crossed = evs.map((e) => (e === ev ? Object.assign({}, e, { thrown: "Fastball" }) : e));
  const before = L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }), after = L.learnPitcher(E, pitcherOf(entered), crossed, { scoreboard: false });
  check(after.pitches.sl.n === before.pitches.sl.n - 1 && after.pitches.fb.n === before.pitches.fb.n + 1, "a cross-up counts as the pitch actually thrown");
  // soft-deleted (undone) pitches are skipped
  const del = evs.map((e) => (e === ev ? Object.assign({}, e, { deletedAt: 5 }) : e));
  check(L.learnPitcher(E, pitcherOf(entered), del, { scoreboard: false }).pitches.sl.n === before.pitches.sl.n - 1, "an undone pitch is skipped");
}

console.log("10. What the engine gets: caps, steps, phase-in, learning off");
{
  const pd = { id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, grade: 3, command: 4 };
  const pit = { id: "p1", pitches: [pd] };
  const prof = { at: Date.now(), pitches: { fb: { n: 600, talent: { command: 1.6, grade: 3.4 }, sd: { command: 0.3, grade: 0.4 }, traits: { side_cmd: -0.9, miss_heart: 0.2 }, changeAt: [] } } };
  let sv = L.serve(prof, pit, null);
  check(sv.pitches.fb.command === 3.85 && sv.pitches.fb.grade === 3.15, `first game moves at most 0.15 (command ${sv.pitches.fb.command}, stuff ${sv.pitches.fb.grade})`);
  for (let i = 0; i < 30; i++) sv = L.serve(prof, pit, sv);
  check(sv.pitches.fb.command === 3 && Math.abs(sv.pitches.fb.grade - 3.4) < 1e-9, `never more than 1.0 from his grade without his OK (command ${sv.pitches.fb.command})`);
  check(sv.pitches.fb.traits.side_cmd === -0.5, "traits capped at ±0.5");
  // D2: Accept stores the learned value at that moment ("to"); it phases in over 3 games (detail in rails_test.js)
  const acc = Object.assign({}, pit, { accepted: { fb: { command: { ts: prof.at, from: sv.pitches.fb.command, to: 1.6 } } } });
  const s1 = L.serve(prof, acc, sv), s2 = L.serve(prof, acc, s1), s3 = L.serve(prof, acc, s2);
  check(s1.pitches.fb.command < 3 && s3.pitches.fb.command === 1.6, `after he accepts, it phases in over 3 games (${s1.pitches.fb.command}, ${s2.pitches.fb.command}, ${s3.pitches.fb.command})`);
  // bound to games: serving again with no new game moves nothing; a new game moves one step; a re-grade carries over
  const pg = (ids) => Object.assign({}, prof, { games: ids.map((id, i) => ({ id, ts: prof.at + i })) });
  const a1 = L.serve(pg(["g1"]), pit, null), a2 = L.serve(pg(["g1"]), pit, a1), a3 = L.serve(pg(["g1"]), pit, a2), a4 = L.serve(pg(["g1", "g2"]), pit, a3);
  const regraded = { id: "p1", pitches: [Object.assign({}, pd, { command: 3.5 })] }, a5 = L.serve(pg(["g1", "g2"]), regraded, a4);
  check(a1.pitches.fb.command === 3.85 && a3.pitches.fb.command === 3.85 && a4.pitches.fb.command === 3.7 && a5.pitches.fb.command === 3.2,
    `one step per game: same games served three times ${a1.pitches.fb.command}, ${a2.pitches.fb.command}, ${a3.pitches.fb.command}; a new game ${a4.pitches.fb.command}; re-graded 4 -> 3.5 with no new game ${a5.pitches.fb.command}`);
  const worse = { at: prof.at, pitches: { fb: Object.assign({}, prof.pitches.fb, { score: { worse: true } }) } };
  check(L.serve(worse, pit, sv).pitches.fb.learned === false && L.serve(worse, pit, sv).pitches.fb.command === 4, "learning off: back to his grades");
  check(L.serve(prof, Object.assign({}, pit, { useLearned: false }), sv).pitches.fb.command === 4, "the coach's off switch: his grades");
}

console.log("11. Hitter memory: a hitter who only faced an ace isn't marked as weak");
{
  const ace = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 92, usage: 0.6 }, { id: "sl", name: "Slider", kind: "SL", shape: "sweeper", velo: 84, usage: 0.4 }];
  const g5 = { Fastball: { command: 4.5, grade: 5 }, Slider: { command: 4, grade: 5 } };
  const evs = season({ pitches: ace, entered: g5, truth: flat(g5), games: 6, pas: 27, seed: 95, loc: true }).map((e) => Object.assign({}, e, { hitterId: "h1" }));
  const v1 = V1.hitterModel({ id: "h1" }, evs, "college_d3"), v2 = L.hitterModel(E, { id: "h1" }, evs, "college_d3");
  console.log(`     an average hitter facing an ace: v1 fastball score ${v1.damage.FB[0]}, v2 ${v2.damage.FB[0]} (0 = average)`);
  check(Math.abs(v2.damage.FB[0]) < Math.abs(v1.damage.FB[0]) && Math.abs(v2.damage.FB[0]) < 0.1, "v2 within 0.1 of average");
}

console.log("12. Scoreboard (scored before each game): learning beats wrong grades, and doesn't switch itself off on right ones");
{
  const wrong = grades({ command: 4.2, grade: 2 }, C3, C3), right = grades(C3, C3, C3);
  const pw = L.learnPitcher(E, pitcherOf(wrong), season({ pitches: P3, entered: wrong, truth: flat(grades({ command: 2, grade: 3.5 }, C3, C3)), games: 14, pas: 22, seed: 97, loc: true }));
  // the switch-off question is about learning as it runs in use, so this side uses the gated trait list
  const pr = L.learnPitcher(E, pitcherOf(right), season({ pitches: P3, entered: right, truth: flat(right), games: 14, pas: 22, seed: 98, loc: true }), { traits: GATED });
  const s = pw.pitches.fb.score, s2 = pr.pitches.fb.score;
  console.log(`     wrong grades: surprise per pitch learned ${s.learned.toFixed(4)} vs his grades ${s.coach.toFixed(4)} over ${s.rows} | right grades: ${s2.learned.toFixed(4)} vs ${s2.coach.toFixed(4)}`);
  check(s.learned < s.coach, "beats wrong grades");
  check(!s2.worse && !pr.flags.some((f) => f.type === "learningOff"), "no false switch-off on right grades");
}

console.log("13. The learner's fast strike-rate table matches the exact calculation");
{
  let worst = 0;
  for (const kind of [["FB", "ride", 86], ["SL", "sweeper", 79], ["CH", "fade", 78], ["CB", "loopy", 72]])
    for (const c of [1.2, 2.3, 3.6, 4.7]) for (const g of [1.4, 3.1, 4.9]) for (const t of [null, { behind_cmd: -0.4, stretch_cmd: -0.3 }, { miss_heart: 0.4, side_cmd: 0.3 }]) {
      const sp = { name: "x", kind: kind[0], shape: kind[1], velo: kind[2], command: c, grade: g, traits: t };
      worst = Math.max(worst, Math.abs(L.strikeRate(E, sp, "hs") - L.strikeRateFast(E, sp, "hs")));
    }
  check(worst < 0.01, `largest difference ${worst.toFixed(4)} (must be under 0.01)`);
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s, ${REPS} seasons per world`);
console.log(fails ? `${fails} check(s) failed` : "all worlds checks passed");
process.exit(fails ? 1 : 0);
