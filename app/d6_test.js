/*
 * D6: evidence-weighted serving vs today's flat 0.15 step, on simulated seasons with a known truth.
 * Run: node app/d6_test.js [reps]    (several minutes)
 *
 * Measure: the scoreboard's surprise per pitch (lower is better), scored before each game with what the calls would
 * actually have used, over every scored game of the season. Same seasons for both rules (paired).
 *
 * Decision, fixed before the first run: evidence weighting stays on only if, pooled over all seasons, its paired
 * surprise per pitch is no worse than flat (mean difference <= 0), AND no single world is worse by more than 2 standard
 * errors of its paired difference. Otherwise CFG.caps.evidence goes back to false.
 */
const { season, E, L } = require("./worlds.js");
const REPS = +(process.argv[2] || 6);
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const grades = (fb, sl, ch) => ({ Fastball: fb, Slider: sl, Changeup: ch });
const pitcherOf = (entered, extra = {}) => Object.assign({ id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) }, extra);
const C3 = { command: 3, grade: 3 };
const flat = (t) => () => t;
const worlds = [
  { name: "right grades, starter", entered: grades(C3, C3, C3), truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 600 },
  { name: "wrong grades, starter", entered: grades({ command: 4, grade: 3 }, C3, C3), truth: flat(grades({ command: 2, grade: 3 }, { command: 3, grade: 4.2 }, C3)), games: 20, pas: 22, seed: 700 },
  { name: "change at game 12, marked", entered: grades(C3, C3, C3), truth: (g) => grades(g < 12 ? C3 : { command: 1.8, grade: 3 }, C3, C3), games: 20, pas: 22, seed: 800, mark: 12 },
  { name: "right grades, short relief outings", entered: grades(C3, C3, C3), truth: flat(grades(C3, C3, C3)), games: 45, pas: 4, seed: 900 },
  { name: "wrong grades, short relief outings", entered: grades({ command: 4, grade: 3 }, C3, C3), truth: flat(grades({ command: 2, grade: 3 }, C3, C3)), games: 45, pas: 4, seed: 1000 },
];
const t0 = Date.now(), DEFAULT = L.CFG.caps.evidence;
const pooled = [];
const lines = [];
for (const w of worlds) {
  const diffs = [];
  let nE = 0, sE = 0, sF = 0, sC = 0;
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered: w.entered, truth: w.truth, games: w.games, pas: w.pas, seed: w.seed + r, loc: true });
    const extra = w.mark ? { changes: [{ pitchId: "fb", ts: evs.find((e) => e.gameId === "g" + w.mark).ts, source: "coach" }] } : {};
    const run = (on) => { L.CFG.caps.evidence = on; return L.learnPitcher(E, pitcherOf(w.entered, extra), evs, { now: 1 }); };
    const ev = run(true), fl = run(false);
    for (const id of ["fb", "sl", "ch"]) {
      const a = ev.pitches[id].score, b = fl.pitches[id].score;
      if (!a || !b || !a.all || !a.all.n) continue;
      // per-pitch difference, weighted by the pitches scored
      diffs.push({ d: a.all.learned - b.all.learned, n: a.all.n });
      nE += a.all.n; sE += a.all.learned * a.all.n; sF += b.all.learned * b.all.n; sC += a.all.coach * a.all.n;
    }
  }
  L.CFG.caps.evidence = DEFAULT;
  const N = diffs.reduce((a, x) => a + x.n, 0);
  const mean = diffs.reduce((a, x) => a + x.d * x.n, 0) / N;
  const se = Math.sqrt(diffs.reduce((a, x) => a + x.n * (x.d - mean) ** 2, 0) / N / Math.max(1, diffs.length - 1));
  pooled.push(...diffs);
  const line = `${w.name.padEnd(36)} evidence ${(sE / nE).toFixed(4)}  flat ${(sF / nE).toFixed(4)}  his grades ${(sC / nE).toFixed(4)}  | evidence - flat ${mean >= 0 ? "+" : ""}${mean.toFixed(4)} (se ${se.toFixed(4)}, ${diffs.length} pitch-seasons, ${N} pitches)`;
  lines.push({ w: w.name, mean, se, line });
  console.log(line);
}
const N = pooled.reduce((a, x) => a + x.n, 0), m = pooled.reduce((a, x) => a + x.d * x.n, 0) / N;
const seP = Math.sqrt(pooled.reduce((a, x) => a + x.n * (x.d - m) ** 2, 0) / N / Math.max(1, pooled.length - 1));
const worst = lines.reduce((a, x) => (x.mean - 2 * x.se > a.mean - 2 * a.se ? x : a));
const keep = m <= 0 && lines.every((x) => x.mean <= 2 * x.se);
console.log(`\npooled: evidence - flat ${m >= 0 ? "+" : ""}${m.toFixed(4)} surprise per pitch (se ${seP.toFixed(4)}, ${N} pitches)`);
console.log(`worst world: ${worst.w} (${worst.mean >= 0 ? "+" : ""}${worst.mean.toFixed(4)}, 2 se = ${(2 * worst.se).toFixed(4)})`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s, ${REPS} seasons per world`);
console.log(keep ? "DECISION: keep evidence-weighted serving (no worse pooled, no world worse by more than 2 se)" : "DECISION: back to the flat step (evidence weighting predicted worse)");
console.log(`(in use now: CFG.caps.evidence = ${DEFAULT})`);
process.exit(0);
