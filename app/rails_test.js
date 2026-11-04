/*
 * The learner's rails (plan Stage 2, D1 D2 D4 D6 D8): what the calls get, given what was learned and how the coach
 * answered. Pure serving, no engine runs, so it's quick. Run: node app/rails_test.js
 */
const L = require("./learner.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const T0 = 1_700_000_000_000, day = 864e5;
const games = (n) => Array.from({ length: n }, (_, i) => ({ id: "g" + (i + 1), ts: T0 + i * day }));
const ev = (n, d) => Object.fromEntries(games(n).map((g) => [g.id, [d, d]]));
const prof = (n, talent, evidence) => ({ at: T0, games: games(n), pitches: { fb: { n: 600, talent, sd: { command: 0.3, grade: 0.3 }, traits: {}, evidence: evidence || ev(n, 0.5) } } });
const pd = () => ({ id: "fb", name: "Fastball", kind: "FB", grade: 3, command: 4, gradeLog: [{ ts: T0 - day, command: 4, grade: 3 }] });
const run = (pit, talentAt, upto, from = 1) => { let sv = null; for (let n = from; n <= upto; n++) sv = L.serve(prof(n, talentAt(n)), pit, sv); return sv; };

console.log("D1. Keep mine holds his number");
{
  const pit = { id: "p1", pitches: [pd()] };
  const free = run(pit, () => ({ command: 1.6, grade: 3 }), 10);
  check(free.pitches.fb.command === 3, `without an answer the calls move to the ±1.0 limit (${free.pitches.fb.command})`);
  pit.flagState = { "fb|command": { how: "keep", learned: 1.6, ts: T0 + 10 * day } };
  const kept = L.serve(prof(10, { command: 1.6, grade: 3 }), pit, free);
  check(kept.pitches.fb.command === 4, `Keep mine: right away the calls use his 4, not ${free.pitches.fb.command} (same games, no new step)`);
  const later = run(pit, () => ({ command: 1.2, grade: 3 }), 20, 11);
  check(later.pitches.fb.command === 4, `and through 10 more games while the learned value keeps moving (${later.pitches.fb.command})`);
  check(L.clampServed(pit.pitches[0], pit, { command: 2.2, grade: 3 }).command === 4, "the final clamp gives his number too, whatever the served value says");
  check(L.serve(prof(20, { command: 1.2, grade: 3 }), pit, later).pitches.fb.grade === 3, "stuff, which he didn't answer, still learns");
}

console.log("D2. Accept: the value at that moment, over 3 games, then the limit around it");
{
  const p = pd(), pit = { id: "p1", pitches: [p] };
  const before = run(pit, () => ({ command: 1.6, grade: 3 }), 10);
  const accTs = T0 + 9.5 * day;
  pit.accepted = { fb: { command: { ts: accTs, from: before.pitches.fb.command, to: 1.6 } } };
  pit.flagState = { "fb|command": { how: "accept", ts: accTs } };
  const steps = []; let sv = before;
  for (let n = 11; n <= 13; n++) { sv = L.serve(prof(n, { command: 1.6, grade: 3 }), pit, sv); steps.push(sv.pitches.fb.command); }
  check(steps[0] < 3 && steps[0] > 1.6 && steps[2] === 1.6, `phases in from ${before.pitches.fb.command} to 1.6 over 3 games (${steps.join(", ")})`);
  for (let n = 14; n <= 30; n++) sv = L.serve(prof(n, { command: 3.9, grade: 3 }), pit, sv);
  check(sv.pitches.fb.command === 2.6, `not permanent: if what it learns later swings to 3.9, the calls stop 1.0 from the accepted 1.6 (${sv.pitches.fb.command})`);
  for (let n = 31; n <= 50; n++) sv = L.serve(prof(n, { command: 0.2, grade: 3 }), pit, sv);
  check(sv.pitches.fb.command === 1, `and the other way, never under 1 on the scale (${sv.pitches.fb.command})`);
  // flags are written by learnPitcher; check the reference it would use
  const R = L.railsFor(p, pit, "command");
  check(R.center === 1.6 && R.acc && R.coach === 4, "later flags are measured against the accepted 1.6, not his old 4");
  p.command = 3; p.gradeLog.push({ ts: accTs + 40 * day, command: 3, grade: 3 });
  const R2 = L.railsFor(p, pit, "command");
  check(R2.center === 3 && !R2.acc, "a re-grade after he accepted replaces it: his new number is the centre again");
  const p2 = pd(); p2.gradeLog.push({ ts: accTs + 40 * day, command: 4, grade: 3.5 }); p2.grade = 3.5;
  check(L.railsFor(p2, { pitches: [p2], accepted: pit.accepted, flagState: pit.flagState }, "command").center === 1.6, "a re-grade of stuff only leaves an accepted command alone");
}

console.log("D4. The final clamp where the calls build his arsenal");
{
  const p = pd(), pit = { id: "p1", pitches: [p] };
  const sv = run(pit, () => ({ command: 1.6, grade: 3 }), 10);
  p.command = 2; // re-graded from 4 to 2 while learning ran in the worker; the stored served value is from before
  const c = L.clampServed(p, pit, sv.pitches.fb);
  check(sv.pitches.fb.command === 3 && c.command === 3, `served 3 from the old grade is still within 1.0 of the new 2 (${c.command})`);
  p.command = 1;
  check(L.clampServed(p, pit, sv.pitches.fb).command === 2, `re-graded to 1: the calls use at most 2, not the stale 3 (${L.clampServed(p, pit, sv.pitches.fb).command})`);
  p.command = 5;
  check(L.clampServed(p, pit, { command: 2.2, grade: 3 }).command === 4, "and from above: re-graded to 5, a stale 2.2 is lifted to 4");
}

console.log("D6. Evidence-weighted steps (switched off by default after d6_test.js; the mechanism is checked here switched on)");
{
  const was = L.CFG.caps.evidence; L.CFG.caps.evidence = true;
  const pit = { id: "p1", pitches: [pd()] };
  const one = (d) => L.serve(prof(1, { command: 1.6, grade: 3 }, { g1: [d, d] }), pit, null).pitches.fb.command;
  check(one(0.01) === 3.99, `an outing that barely moved the estimate (0.01) barely moves the calls (${one(0.01)})`);
  check(one(0.5) === 3.85, `a long, clearly disagreeing outing moves the full cap (${one(0.5)})`);
  check(one(0.075) === 3.93, `in between, in proportion (0.075 -> ${one(0.075)})`);
  const none = L.serve(prof(2, { command: 1.6, grade: 3 }, { g1: [0.5, 0.5] }), pit, L.serve(prof(1, { command: 1.6, grade: 3 }, { g1: [0.5, 0.5] }), pit, null)).pitches.fb.command;
  check(none === 3.85, `a game he didn't throw the pitch in moves nothing (${none})`);
  L.CFG.caps.evidence = false;
  check(one(0.01) === 3.85, "switched off, the flat step comes back");
  L.CFG.caps.evidence = was;
  check(was === false, "and off is the default in use");
}

console.log("D8. A blank grade is the level average, marked not graded");
{
  const p = pd(); p.command = ""; const pit = { id: "p1", pitches: [p] };
  check(L.coachValue(p, "command") === 3 && !L.graded(p, "command") && L.graded(p, "grade"), "blank command -> 3, not graded; stuff still graded");
  const sv = L.serve({ at: T0, pitches: { fb: { n: 0 } } }, pit, null);
  check(sv.pitches.fb.command === 3, `with nothing learned the calls use 3, not 0 (${sv.pitches.fb.command})`);
  check(L.clampServed(p, pit, null).command === 3, "and the final clamp agrees");
}

console.log(fails ? `\n${fails} rails check(s) FAILED` : "\nall rails checks passed");
process.exit(fails ? 1 : 0);
