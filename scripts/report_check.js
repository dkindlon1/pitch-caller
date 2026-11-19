/*
 * Build 1 proof 2: every number on every report, recomputed straight from the raw events by a separate code path, must
 * match exactly. This script shares no code with web/lib/report_data.ts or report_outcomes.ts: it reads the events
 * from Postgres directly (not through PostgREST or report_fetch.ts) and counts with its own rules, written from the
 * plan's definitions, using different methods where there's a choice:
 *   - ball four from the at-bat's end (paEnd "walk" on a ball), not from the count before the pitch;
 *   - outs from the running game state across every event in order (pitches and plays), not from each pitch's snapshot;
 *   - the count group from a table of the 12 counts, the called cell from a table of spots;
 *   - the pitch a result belongs to from the pitcher record by name and id.
 *
 * Two comparisons:
 *   1. the data layer's output (what the pages render) for every outing, game summary, recap and hitter in the season;
 *   2. with --site: every number on every rendered report page (each carries data-k / data-v), signed in as the head
 *      coach, as a pitcher (his own reports) and signed out (a public recap).
 * Usage (repo root): node scripts/report_check.js [C:/dev/pitch-caller-logs/season.json] [--site]
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const args = process.argv.slice(2), SITE_MODE = args.includes("--site");
const SEASON = args.find((a) => !a.startsWith("--")) || "C:/dev/pitch-caller-logs/season.json";
const season = JSON.parse(fs.readFileSync(SEASON, "utf8"));
let fails = 0, checks = 0;
const failures = [];
const check = (ok, msg) => { checks++; if (!ok) { fails++; if (failures.length < 60) failures.push(msg); } };
const same = (label, a, b) => check(JSON.stringify(a) === JSON.stringify(b), `${label}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- the rules, written again from the plan
const HIT = { "1B": 1, "2B": 1, "3B": 1, HR: 1 };
function judge(e) {
  // strike / ball, positive / negative / neither (PLAN_reports_recap 2, "Outcome definitions", with the plan defaults)
  const r = e.res;
  const strike = r === "cstrike" || r === "whiff" || r === "foul" || r === "play";
  let pos = false, neg = false;
  switch (r) {
    case "whiff": case "cstrike": case "foul": pos = true; break;          // every foul: 2 strikes by the rule, fewer by the plan default
    case "hbp": neg = true; break;
    case "ball": neg = e.paEnd === "walk"; break;                          // ball four: the pitch that ended the at-bat in a walk
    case "play": {
      const c = e.contact === "weak" || e.contact === "solid" || e.contact === "hard" ? e.contact : null;
      if (c === "weak") pos = true; else if (c === "hard") neg = true; else if (HIT[e.out]) neg = true; else pos = true;
      break;
    }
  }
  return { strike, pos, neg, hit: r === "play" && !!HIT[e.out], hard: r === "play" && e.contact === "hard" };
}
const GROUP = { "0-0": "0-0", "0-1": "ahead", "1-1": "even", "1-0": "behind", "2-0": "behind", "2-1": "behind", "0-2": "two", "1-2": "two", "2-2": "two", "3-0": "three", "3-1": "three", "3-2": "three" };
const FB = { FB: 1, SI: 1, FC: 1 };
function called(quad, kind, side) {
  const L = side === "L";
  const t = { middle: [2, 2], "down-middle": [3, 2], "up-in": [1, L ? 3 : 1], "up-away": [1, L ? 1 : 3], "down-in": [3, L ? 3 : 1], "down-away": [3, L ? 1 : 3], chase: FB[kind] ? [0, 2] : [4, 2] }[quad];
  return t ? t.join(",") : null;
}
function landed(c) {
  if (!Array.isArray(c)) return null;
  const [r, k] = c;
  if (r >= 0 && r <= 4 && k >= 0 && k <= 4) return `${r},${k}`;
  return ["-1,2", "2,-1", "2,5", "5,2"].includes(`${r},${k}`) ? `${r},${k}` : null;
}
function sideOf(e, hand) {
  if (e.bs === "L" || e.bs === "R") return e.bs;
  const ss = e.sit && e.sit.same_side, h = e.ph || hand;
  if (typeof ss !== "boolean" || !h) return null;
  return ss ? h : h === "R" ? "L" : "R";
}
const pct = (num, den, n) => (den > 0 && n >= 10 ? num / den : null);

// ---------------------------------------------------------------- the raw data
async function load(db, team) {
  const evs = (await db.query("select game_id, doc from public.events where program_id = $1 and deleted_at is null", [team])).rows.map((r) => r.doc);
  const games = (await db.query("select id, doc from public.games where program_id = $1 and deleted_at is null", [team])).rows
    .filter((g) => !g.doc.dupOf && /^\d{4}-\d{2}-\d{2}$/.test(g.doc.date || "")).map((g) => ({ id: g.id, date: g.doc.date, opp: g.doc.opponentId || null, level: g.doc.level || null }));
  const pitchers = Object.fromEntries((await db.query("select id, doc from public.pitchers where program_id = $1", [team])).rows.map((r) => [r.id, r.doc]));
  const names = Object.fromEntries((await db.query("select id, doc from public.teams where program_id = $1", [team])).rows.map((r) => [r.id, r.doc.name]));
  const seasons = (await db.query("select id, name, start_date::text s, end_date::text e from public.seasons where program_id = $1", [team])).rows;
  const frozen = (await db.query("select season_id, pitcher_id, version, data from public.recap_versions where program_id = $1", [team])).rows;
  return { evs, games, pitchers, names, seasons, frozen };
}
const isPitch = (e) => (e.type === undefined || e.type === null || e.type === "pitch") && !e.legacy && ["ball", "cstrike", "whiff", "foul", "play", "hbp"].includes(e.res);
function pitchOf(e, pitcher) {
  // the pitch thrown (a cross-up's results are the thrown pitch's); its id from the pitcher record when the event has none
  const crossed = e.thrown && e.thrown !== e.pitchName;
  const name = crossed ? e.thrown : e.pitchName;
  const rec = ((pitcher && pitcher.pitches) || []).find((p) => (crossed ? (e.thrownId ? p.id === e.thrownId : p.name === name) : (e.pitchId ? p.id === e.pitchId : p.name === name)));
  return { key: crossed ? (e.thrownId || "name:" + name) : (e.pitchId || "name:" + name), name: rec ? rec.name : name, kind: rec ? rec.kind : crossed ? ((e.ars || []).find((a) => a.name === name) || {}).kind || "?" : e.kind };
}

// outs credited to each pitcher in one game: walk every event (pitches and plays) in the order they were logged and
// take each one's change in the game's outs (back to 0 when the inning turns over)
function outsByPitcher(gameEvs) {
  const list = gameEvs.filter((e) => !e.deletedAt).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0) || (a.n || 0) - (b.n || 0));
  const out = {};
  let inning = null, cur = 0;
  for (const e of list) {
    if (e.inning !== inning) { inning = e.inning; cur = 0; }
    if (typeof e.outs !== "number") continue;
    const pitchOk = e.type === "play" ? ["cs", "pickoff", "out_on_bases"].includes(e.play) : isPitch(e);
    const d = e.outs - cur;
    if (pitchOk && d > 0 && e.pitcherId) out[e.pitcherId] = (out[e.pitcherId] || 0) + d;
    cur = e.outs >= 3 ? 3 : e.outs;
  }
  return out;
}

function lineOf(ps, outs) {
  const L = { pitches: ps.length, strikes: 0, k: 0, bb: 0, hbp: 0, h: 0, hard: 0, bf: 0, runs: 0, whiffs: 0, swings: 0, positive: 0, negative: 0, firstPitches: 0, firstStrikes: 0, outs };
  for (const e of ps) {
    const j = judge(e);
    if (j.strike) L.strikes++;
    if (e.paEnd === "k") L.k++; if (e.paEnd === "walk") L.bb++; if (e.paEnd === "hbp") L.hbp++; if (e.paEnd) L.bf++;
    if (j.hit) L.h++; if (j.hard) L.hard++; L.runs += e.runs || 0;
    if (e.res === "whiff") L.whiffs++; if (["whiff", "foul", "play"].includes(e.res)) L.swings++;
    if (j.pos) L.positive++; if (j.neg) L.negative++;
    if (e.count === "0-0") { L.firstPitches++; if (j.strike) L.firstStrikes++; }
  }
  L.ip = `${Math.floor(outs / 3)}.${outs % 3}`;
  return L;
}
function mixOf(ps, pitcher) {
  const by = {};
  for (const e of ps) {
    const p = pitchOf(e, pitcher), j = judge(e), r = by[p.key] || (by[p.key] = { name: p.name, n: 0, strikes: 0, whiffs: 0, swings: 0, bipContact: 0, hard: 0, positive: 0, negative: 0 });
    r.n++; if (j.strike) r.strikes++; if (e.res === "whiff") r.whiffs++; if (["whiff", "foul", "play"].includes(e.res)) r.swings++;
    if (e.res === "play" && ["weak", "solid", "hard"].includes(e.contact)) r.bipContact++;
    if (j.hard) r.hard++; if (j.pos) r.positive++; if (j.neg) r.negative++;
  }
  for (const r of Object.values(by)) { r.strikePct = pct(r.strikes, r.n, r.n); r.whiffPct = pct(r.whiffs, r.swings, r.n); r.hardPct = pct(r.hard, r.bipContact, r.n); r.share = ps.length ? r.n / ps.length : null; }
  return by;
}
function heatOf(ps, pitcher) {
  const H = {};
  const put = (f, view, cell, j) => {
    const g = ((H[f] = H[f] || { n: 0 })[view] = H[f][view] || { counted: 0, left: 0, cells: {} });
    if (!cell) { g.left++; return; }
    const c = g.cells[cell] || (g.cells[cell] = { n: 0, strike: 0, ball: 0, positive: 0, negative: 0 });
    g.counted++; c.n++; if (j.strike) c.strike++; else c.ball++; if (j.pos) c.positive++; if (j.neg) c.negative++;
  };
  for (const e of ps) {
    const p = pitchOf(e, pitcher), j = judge(e), side = sideOf(e, pitcher && pitcher.hand);
    for (const f of ["all", p.key]) { H[f] = H[f] || { n: 0 }; H[f].n++; put(f, "called", called(e.quad, e.kind, side), j); put(f, "landed", landed(e.locCell), j); }
  }
  return H;
}

(async () => {
  const db = new Client({ connectionString: process.env.PGURL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const D = await load(db, season.team);
  const R = await import(path.join(__dirname, "../web/lib/report_data.ts").replace(/\\/g, "/").replace(/^([A-Z]):/, "file:///$1:"));
  const pitcherInfo = (id) => { const d = D.pitchers[id] || {}; return { id, name: d.name || "Unknown pitcher", hand: d.hand || null, pitches: d.pitches || [] }; };
  let outings = 0, summaries = 0, recaps = 0, hitters = 0;

  // ---------------------------------------------------------------- every outing and game summary
  for (const g of D.games) {
    const gEvs = D.evs.filter((e) => e.gameId === g.id);
    const ps = gEvs.filter((e) => isPitch(e) && !e.deletedAt);
    if (!ps.length) continue;
    const outs = outsByPitcher(gEvs);
    const meta = { id: g.id, date: g.date, opponent: g.opp ? D.names[g.opp] : null, level: g.level };
    const pids = [...new Set(ps.map((e) => e.pitcherId).filter(Boolean))];
    for (const pid of pids) {
      const mine = ps.filter((e) => e.pitcherId === pid), info = pitcherInfo(pid);
      const rep = R.buildOuting(gEvs.filter((e) => e.pitcherId === pid), meta, pid, info.pitches, "staff", info.hand);
      const want = lineOf(mine, outs[pid] || 0), L = rep.line, tag = `${g.date} ${info.name}`;
      for (const k of ["pitches", "strikes", "k", "bb", "hbp", "h", "hard", "bf", "runs", "whiffs", "swings", "positive", "negative", "firstPitches", "firstStrikes", "outs", "ip"]) same(`${tag} line.${k}`, want[k], L[k]);
      // pitch mix, every pitch, overall and in every count group and side
      const wm = mixOf(mine, D.pitchers[pid]);
      same(`${tag} mix pitches`, Object.keys(wm).sort(), rep.mix.all.rows.map((r) => r.key).sort());
      for (const r of rep.mix.all.rows) {
        const w = wm[r.key]; if (!w) continue;
        same(`${tag} mix ${r.name}`, [w.name, w.n, w.strikes, w.whiffs, w.swings, w.hard, w.bipContact, w.positive, w.negative, w.strikePct, w.whiffPct, w.hardPct, w.share],
          [r.name, r.n, r.strikes.num, r.whiffs.num, r.whiffs.den, r.hard.num, r.hard.den, r.positive, r.negative, r.strikes.pct, r.whiffs.pct, r.hard.pct, r.share.pct]);
      }
      for (const grp of ["0-0", "ahead", "even", "behind", "two", "three"]) {
        const sub = mine.filter((e) => GROUP[e.count] === grp), wg = mixOf(sub, D.pitchers[pid]), rg = rep.mix.byGroup[grp];
        same(`${tag} group ${grp} n`, sub.length, rg.n);
        for (const r of rg.rows) { const w = wg[r.key]; same(`${tag} group ${grp} ${r.name}`, w && [w.n, w.strikes, w.whiffs, w.swings, w.hard, w.strikePct, w.whiffPct, w.hardPct], [r.n, r.strikes.num, r.whiffs.num, r.whiffs.den, r.hard.num, r.strikes.pct, r.whiffs.pct, r.hard.pct]); }
      }
      for (const sd of ["L", "R"]) {
        const sub = mine.filter((e) => sideOf(e, info.hand) === sd), ws = mixOf(sub, D.pitchers[pid]), rs = rep.mix.bySide[sd];
        same(`${tag} side ${sd} n`, sub.length, rs.n);
        for (const r of rs.rows) { const w = ws[r.key]; same(`${tag} side ${sd} ${r.name}`, w && [w.n, w.strikes, w.whiffs, w.hard], [r.n, r.strikes.num, r.whiffs.num, r.hard.num]); }
      }
      // heat maps: every filter, both views, every cell, every layer, and the left-out counts
      const wh = heatOf(mine, D.pitchers[pid]);
      same(`${tag} heat filters`, Object.keys(wh).sort(), rep.heat.filters.map((f) => f.key).sort());
      for (const f of rep.heat.filters) for (const view of ["called", "landed"]) {
        const w = wh[f.key][view] || { counted: 0, left: 0, cells: {} }, r = f[view];
        same(`${tag} heat ${f.name} ${view} counted/left`, [w.counted, w.left], [r.counted, r.left]);
        check(r.counted + r.left === f.n, `${tag} heat ${f.name} ${view}: counted + left = every pitch`);
        same(`${tag} heat ${f.name} ${view} cells`, Object.keys(w.cells).sort().map((k) => [k, w.cells[k]]), Object.keys(r.cells).sort().map((k) => [k, r.cells[k]]));
      }
      // at-bats: count, each one's pitches and result
      const abEnds = mine.filter((e) => e.paEnd).length;
      same(`${tag} at-bats ended`, abEnds, rep.atBats.filter((a) => a.ended).length);
      same(`${tag} at-bat pitches`, mine.length, rep.atBats.reduce((a, b) => a + b.pitches.length, 0));
      for (const a of rep.atBats) for (const p of a.pitches) { const e = mine.find((x) => x.n === p.n), j = judge(e); same(`${tag} pitch ${p.n} outcome`, [j.pos, j.neg, j.strike], [p.positive, p.negative, p.strike]); }
      // overrides: every coach call, re-call after a shake-off and cross-up
      const wOv = mine.flatMap((e) => [...(e.choice === "coach" || (e.choice === undefined && e.coach) ? ["coach"] : e.choice === "recall" ? ["shake"] : []), ...(e.thrown && e.thrown !== e.pitchName ? ["cross"] : [])].map((k) => `${e.n}:${k}`));
      same(`${tag} overrides`, wOv.sort(), rep.overrides.map((o) => `${o.n}:${o.kind}`).sort());
      outings++;
    }
    // the game summary: each pitcher's line and the staff line
    const sum = R.buildGameSummary(gEvs, meta, pids.map(pitcherInfo));
    same(`${g.date} summary staff pitches/outs`, [ps.length, Object.values(outs).reduce((a, b) => a + b, 0)], [sum.staff.pitches, sum.staff.outs]);
    for (const row of sum.pitchers) { const w = lineOf(ps.filter((e) => e.pitcherId === row.pitcherId), outs[row.pitcherId] || 0); same(`${g.date} summary ${row.name}`, [w.pitches, w.strikes, w.k, w.bb, w.h, w.ip], [row.line.pitches, row.line.strikes, row.line.k, row.line.bb, row.line.h, row.line.ip]); }
    summaries++;
  }

  // ---------------------------------------------------------------- recaps: the frozen ones, and the season so far
  const LEVEL = { college_d3: { K: 0.162, BB: 0.114, AVG: 0.295 } };
  const recapWant = (pid, from, to) => {
    const gs = D.games.filter((g) => g.date >= from && (!to || g.date <= to));
    const ids = new Set(gs.map((g) => g.id));
    const mine = D.evs.filter((e) => ids.has(e.gameId) && e.pitcherId === pid && isPitch(e) && !e.deletedAt);
    let outs = 0; for (const g of gs) outs += outsByPitcher(D.evs.filter((e) => e.gameId === g.id))[pid] || 0;
    const L = lineOf(mine, outs);
    const ab = L.bf - L.bb - L.hbp;
    return { L, mine, gs: gs.filter((g) => mine.some((e) => e.gameId === g.id)), k: L.bf ? L.k / L.bf : null, bb: L.bf ? L.bb / L.bf : null, avg: ab ? L.h / ab : null, ab };
  };
  for (const fz of D.frozen) {
    const s = D.seasons.find((x) => x.id === fz.season_id), w = recapWant(fz.pitcher_id, s.s, s.e), d = fz.data, tag = `recap ${s.name} ${pitcherInfo(fz.pitcher_id).name} v${fz.version}`;
    for (const k of ["pitches", "strikes", "k", "bb", "hbp", "h", "hard", "bf", "outs", "ip", "whiffs", "swings", "positive", "negative"]) same(`${tag} line.${k}`, w.L[k], d.line[k]);
    same(`${tag} outings`, w.gs.length, d.meta.outings);
    same(`${tag} comparison`, [w.k, w.bb, w.avg, w.ab, LEVEL.college_d3.K, LEVEL.college_d3.BB, LEVEL.college_d3.AVG], [d.comparison.k.pct, d.comparison.bb.pct, d.comparison.avg.pct, d.comparison.ab, d.comparison.levelK, d.comparison.levelBB, d.comparison.levelAVG]);
    const wm = mixOf(w.mine, D.pitchers[fz.pitcher_id]);
    for (const r of d.pitchMix.all.rows) { const x = wm[r.key]; same(`${tag} mix ${r.name}`, x && [x.n, x.strikes, x.whiffs, x.swings, x.hard, x.strikePct, x.whiffPct], [r.n, r.strikes.num, r.whiffs.num, r.whiffs.den, r.hard.num, r.strikes.pct, r.whiffs.pct]); }
    const wh = heatOf(w.mine, D.pitchers[fz.pitcher_id]);
    for (const f of d.heat.filters) for (const view of ["called", "landed"]) same(`${tag} heat ${f.name} ${view}`, [wh[f.key][view].counted, wh[f.key][view].left, Object.keys(wh[f.key][view].cells).length], [f[view].counted, f[view].left, Object.keys(f[view].cells).length]);
    for (const t of d.trends.rows) { const ge = w.mine.filter((e) => e.gameId === t.game), st = ge.filter((e) => judge(e).strike).length; same(`${tag} trend ${t.date}`, [ge.length, st], [t.pitches, t.strikePct.num]); }
    check(d.outings.every((o) => !("opponent" in o)), `${tag}: frozen with no opponents`);
    recaps++;
  }
  const soFar = (() => { const last = D.seasons.map((s) => s.e).sort().pop(); if (!last) return "0000-00-00"; const x = new Date(last + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); })();
  for (const pid of Object.keys(D.pitchers)) {
    const w = recapWant(pid, soFar, null);
    if (!w.mine.length) continue;
    const metas = D.games.map((g) => ({ id: g.id, date: g.date, opponent: g.opp ? D.names[g.opp] : null, level: g.level }));
    const rc = R.buildRecap(D.evs.filter((e) => e.pitcherId === pid && w.gs.some((g) => g.id === e.gameId)), metas, pitcherInfo(pid), { name: "Season so far", final: false }, "pitcher", "college_d3");
    for (const k of ["pitches", "strikes", "k", "bb", "h", "outs", "ip"]) same(`season so far ${pitcherInfo(pid).name} line.${k}`, w.L[k], rc.line[k]);
    recaps++;
  }

  // ---------------------------------------------------------------- hitters: every at-bat across seasons
  for (const [tn, o] of Object.entries(season.opponents)) for (const hid of o.hitters) {
    const mine = D.evs.filter((e) => e.hitterId === hid && isPitch(e) && !e.deletedAt);
    const abs = R.buildHitterAtBats(D.evs, D.games.map((g) => ({ id: g.id, date: g.date })), Object.keys(D.pitchers).map(pitcherInfo), hid);
    same(`hitter ${tn} ${hid} at-bats ended / pitches`, [mine.filter((e) => e.paEnd).length, mine.length], [abs.filter((a) => a.ended).length, abs.reduce((a, b) => a + b.pitches.length, 0)]);
    hitters++;
  }

  // ---------------------------------------------------------------- the rendered pages
  if (SITE_MODE) {
    const pages = require("./report_check_pages.js");
    const r = await pages.run(season, D, { judge, lineOf, outsByPitcher, mixOf, heatOf, isPitch, pitchOf, recapWant, check, same });
    console.log(`pages: ${r.pages} pages, ${r.numbers} numbers read`);
  }

  await db.end();
  console.log(`checked ${outings} outings, ${summaries} game summaries, ${recaps} recaps, ${hitters} hitters: ${checks - fails}/${checks} checks agree`);
  if (fails) { for (const f of failures) console.log("  MISMATCH " + f); console.log(`${fails} number(s) differ`); process.exit(1); }
  console.log("report check: every number matches");
})().catch((e) => { console.error(e); process.exit(1); });
