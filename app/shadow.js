/*
 * Step 3: learner v2 in shadow. Reads a backup (Roster > Back up) and reports, without changing anything:
 *   - what v2 learns about each pitcher (talent, uncertainty, flags) and what it would serve the calls;
 *   - a game-by-game scoreboard: before each game, predict that game's pitches three ways and score them on what
 *     actually happened (surprise per pitch, lower is better):
 *       coach  his grades as entered;
 *       app    what the app actually served in that game (read from each logged pitch's arsenal): learner v1 for
 *              games charted before v2 was wired in, v2 after;
 *       v2     what v2 would have served, learning only from the games before it, stepping as serve() does.
 *     Only the engine's own calls are scored (the pitches the learners learn from). Where a game was located on 90%+
 *     of pitches, the location is scored with the result.
 * This is the job the server will run later.
 * Usage (from app/): node shadow.js <backup.json> [--level college_d3] [--json out.json]
 */
const fs = require("fs");
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const L2 = require("./learner.js"), L1 = require("./learn.js");

const args = process.argv.slice(2);
const file = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LEVEL = opt("--level", null), JSON_OUT = opt("--json", null);
if (!file) { console.error("usage: node shadow.js <backup.json> [--level L] [--json out.json]"); process.exit(2); }
const bk = JSON.parse(fs.readFileSync(file, "utf8"));
const st = bk.stores;
// v1.1: each pitcher's pitch types, so a game logged before the six kinds is read in v1.1 terms
const TYPES = new Map((st.pitchers || []).map((p) => [p.id, Object.fromEntries((p.pitches || []).filter((d) => d.type).map((d) => [d.name, d.type]))]));
const typeOf = (ev, x) => x.type || (TYPES.get(ev.pitcherId) || {})[x.name];
const gamesById = new Map((st.games || []).map((g) => [g.id, g]));
const LOCS = ["heart", "edge", "off", "noncomp"];

// probability of what happened under a given set of grades for every pitch in the logged arsenal
function surprise(ev, grades, withLoc) {
  const ars = ev.ars.map((x) => E.Pitch(Object.assign({}, x, grades[x.name] || {}, { traits: null, strike_rate: null, type: typeOf(ev, x) })));
  const name = ev.thrown || ev.pitchName, p = ars.find((x) => x.name === name);
  if (!p) return null;
  const s = E.Situation(ev.sit), bz = {};
  const P = E.outcomeProbs(p, ev.quad, s, ars, null, bz);
  const cat = L2.category(ev);
  const pick = (m) => (cat === "ball" ? m.ball + m.wp_ball : cat === "bip" ? m.weak + m.solid + m.hard : m[cat]);
  let pr;
  if (withLoc && LOCS.includes(ev.loc)) {
    const m = bz[ev.loc], tot = ["ball", "wp_ball", "hbp", "cstrike", "whiff", "foul", "weak", "solid", "hard"].reduce((a, k) => a + m[k], 0);
    pr = tot > 0 ? m.land * pick(m) / tot : 0;
  } else pr = pick(P);
  return -Math.log(Math.max(pr, 1e-9));
}

const report = { file, pitchers: [] };
for (const pitcher of st.pitchers || []) {
  const evsAll = (st.events || []).filter((e) => e.pitcherId === pitcher.id && !e.deletedAt && !e.legacy);
  if (!evsAll.length) continue;
  const games = L2.gamesOf(evsAll);
  const level = LEVEL || (gamesById.get(games[0].id) || {}).level || "college_d3";
  const pitches = (pitcher.pitches || []).filter((d) => d.active !== false);
  const coachGrades = {}; for (const d of pitches) coachGrades[d.name] = { command: +d.command, grade: +d.grade };
  // grades in effect at a time (the grade log, when he re-graded)
  const coachAt = (ts) => { const o = {}; for (const d of pitches) { let c = { command: +d.command, grade: +d.grade }; if (d.gradeLog && d.gradeLog.length) { const prior = d.gradeLog.filter((x) => x.ts <= ts); c = prior.length ? prior[prior.length - 1] : d.gradeLog[0]; } o[d.name] = { command: +c.command, grade: +c.grade }; } return o; };
  const rows = [];
  let v2prev = null;
  const tot = { coach: 0, v1: 0, v2: 0, n: 0 };
  for (let gi = 0; gi < games.length; gi++) {
    const G = games[gi];
    // v2: learn from the games before this one, then serve one step (as a game pack would before this game)
    let served = null;
    if (gi >= 1) {
      const prior = games.slice(0, gi).flatMap((g) => g.evs);
      const atPitcher = Object.assign({}, pitcher, { pitches: pitcher.pitches.map((d) => Object.assign({}, d, coachAt(G.ts)[d.name] || {})),
        changes: (pitcher.changes || []).filter((c) => c.ts <= G.ts) });
      const prof = L2.learnPitcher(E, atPitcher, prior, { level, now: G.ts, scoreboard: false });
      served = L2.serve(prof, atPitcher, v2prev);
      v2prev = served;
    }
    const v2g = {}; for (const d of pitches) { const s = served && served.pitches[d.id]; v2g[d.name] = s && s.learned ? { command: s.command, grade: s.grade } : coachAt(G.ts)[d.name]; }
    const cg = coachAt(G.ts);
    let c = 0, a = 0, b = 0, n = 0;
    for (const ev of G.evs) {
      if (!L2.usable(ev)) continue;
      const v1g = {}; for (const x of ev.ars) v1g[x.name] = { command: x.command, grade: x.grade };   // what the app used
      const sc = surprise(ev, cg, G.locOk), s1 = surprise(ev, v1g, G.locOk), s2 = surprise(ev, v2g, G.locOk);
      if (sc === null || s1 === null || s2 === null) continue;
      c += sc; a += s1; b += s2; n++;
    }
    const v1served = {}; const firstEng = G.evs.find((e) => e.ars); if (firstEng) for (const x of firstEng.ars) v1served[x.name] = { command: x.command, grade: x.grade };
    rows.push({ game: gi + 1, id: G.id, pitches: n, located: G.locOk, coach: n ? c / n : null, v1: n ? a / n : null, v2: n ? b / n : null, v1served, v2served: v2g });
    if (gi >= 3 && n) { tot.coach += c; tot.v1 += a; tot.v2 += b; tot.n += n; }
  }
  // the full profile on everything, with its own scoreboard and flags
  const prof = L2.learnPitcher(E, pitcher, evsAll, { level, scoreboard: true });
  report.pitchers.push({ id: pitcher.id, name: pitcher.name, level, games: games.length, rows, total: tot,
    profile: Object.fromEntries(Object.entries(prof.pitches).map(([id, p]) => [id, { name: p.name || ((pitcher.pitches || []).find((d) => d.id === id) || {}).name || id, n: p.n, talent: p.talent, sd: p.sd, traits: p.traits, score: p.score && { learned: p.score.learned, coach: p.score.coach, worse: p.score.worse } }])),
    flags: prof.flags });
}

const f3 = (x) => (x === null ? "  -  " : x.toFixed(3));
for (const P of report.pitchers) {
  console.log(`\n${P.name} (${P.level}), ${P.games} games`);
  console.log("game  pitches  located   coach    app      v2    | v2 serves (command/stuff per pitch)");
  for (const r of P.rows) console.log(`${String(r.game).padStart(4)}  ${String(r.pitches).padStart(7)}  ${r.located ? "  yes  " : "  no   "}  ${f3(r.coach)}  ${f3(r.v1)}  ${f3(r.v2)}  | ${Object.entries(r.v2served).map(([k, v]) => `${k} ${v.command}/${v.grade}`).join(", ")}`);
  const t = P.total;
  if (t.n) console.log(`from game 4 on, ${t.n} pitches: surprise per pitch  coach ${(t.coach / t.n).toFixed(4)}  app ${(t.v1 / t.n).toFixed(4)}  v2 ${(t.v2 / t.n).toFixed(4)}`);
  for (const [, p] of Object.entries(P.profile)) console.log(`  ${p.name}: learned command ${p.talent.command} ± ${p.sd.command}, stuff ${p.talent.grade} ± ${p.sd.grade} from ${p.n} pitches${p.score && p.score.learned !== null ? `; scoreboard learned ${p.score.learned.toFixed(3)} vs grades ${p.score.coach.toFixed(3)}${p.score.worse ? " (learning off)" : ""}` : ""}`);
  for (const f of P.flags) console.log(`  FLAG ${f.type}: ${f.text}`);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
