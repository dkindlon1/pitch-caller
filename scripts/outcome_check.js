/*
 * Build 3 proof (PLAN_outcome_tracking 5, "numbers checked"): every outcome-tracking number, recomputed from the raw
 * events by a separate code path, must match. Shares no code with app/peak.js or web/lib/outcome.ts: reads Postgres
 * directly and recomputes with its own implementation of the plan's definitions, using different methods where there's
 * a choice:
 *   - the normal: per-pitch weighted sums built game by game in date order (newest first), not by sorting a list;
 *   - p-values from erfc by a high-precision series/continued fraction, not Abramowitz-Stegun;
 *   - the drift chance by numerical integration of the Beta density (Simpson, 20000 steps), not the incomplete-beta
 *     continued fraction; BH by step-up from the largest p, not by a forward scan.
 * Compared: (1) every outing's findings (cells tested, the ones shown with their level, counts, normal and chart) and
 * drift log; (2) every pitcher's season-so-far findings; (3) the rows the report job stored (outcome_findings);
 * (4) with --site: the numbers on the rendered pages (data-k oc.* / ocs.* / drift.*), as the head coach and as Ace.
 * The level priors and thresholds are the plan's numbers, written again here.
 * Usage (repo root): node scripts/outcome_check.js [C:/dev/pitch-caller-logs/season.json] [--site]
 */
const { Client } = require("pg");
const fs = require("fs");
const args = process.argv.slice(2), SITE_MODE = args.includes("--site");
const season = JSON.parse(fs.readFileSync(args.find((a) => !a.startsWith("--")) || "C:/dev/pitch-caller-logs/season.json", "utf8"));
let fails = 0, checks = 0; const failures = [];
const check = (ok, msg) => { checks++; if (!ok) { fails++; if (failures.length < 60) failures.push(msg); } };
const same = (label, a, b) => check(JSON.stringify(a) === JSON.stringify(b), `${label}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- the plan's numbers
const LEVEL = { whiff: { FB: 0.19, SI: 0.14, FC: 0.22, SL: 0.31, CB: 0.29, CH: 0.30 }, strike: { FB: 0.64, SI: 0.63, FC: 0.63, SL: 0.60, CB: 0.57, CH: 0.58 }, hard: { FB: 0.38, SI: 0.33, FC: 0.35, SL: 0.30, CB: 0.30, CH: 0.31 } };
const LEVEL_ANY = { whiff: 0.22, strike: 0.61, hard: 0.34 }, BAD = { whiff: 0.06, strike: 0.45, hard: 0.65 };
const PRIOR_N = 15, RECENT = 5, FADE = 0.8, OTHER_SEASON = 0.5, MIN_CELL = 8, Q_CLEAR = 0.05, Q_EARLY = 0.2, SHOW = 5;
const DRIFT_MIN = 8, DRIFT_SHARE = 0.35, DRIFT_PRIOR = 4, SE_SHIFT = 0.5, EARLY_LOOK = 0.08;
const RATES = [["whiff", "whiff", "swing", -1], ["strike", "strike", "pitch", -1], ["hard", "hard", "bip", 1]];   // [metric, num, den, bad direction]
const SITS = {
  tto: [["1st", "2nd", "3rd+"], (e) => { const bf = e.sit ? Number(e.sit.batters_faced) : NaN; if (!Number.isFinite(bf)) return null; return bf < 9 ? "1st" : bf < 18 ? "2nd" : "3rd+"; }],
  pc: [["0-25", "26-50", "51-75", "76+"], (e) => { const c = e._pc; return c > 75 ? "76+" : c > 50 ? "51-75" : c > 25 ? "26-50" : "0-25"; }],
  runners: [["empty", "on"], (e) => (e.sit && Array.isArray(e.sit.bases) ? (e.sit.bases.filter(Boolean).length ? "on" : "empty") : null)],
  side: [["same", "opp"], (e) => (e.sit && e.sit.same_side === true ? "same" : e.sit && e.sit.same_side === false ? "opp" : null)],
  approach: [["aggressive", "patient"], (e) => { const a = e.sit && e.sit.hitter_tags ? e.sit.hitter_tags.approach : null; return a === "aggressive" || a === "patient" ? a : null; }],
};
const RESULTS = new Set(["ball", "cstrike", "whiff", "foul", "play", "hbp"]);
const counted = (e) => (e.type == null || e.type === "pitch") && !e.legacy && !e.deletedAt && RESULTS.has(e.res);
function tally(e) {
  const swing = ["whiff", "foul", "play"].includes(e.res), bip = e.res === "play" && ["weak", "solid", "hard"].includes(e.contact);
  return { pitch: 1, strike: swing || e.res === "cstrike" ? 1 : 0, swing: swing ? 1 : 0, whiff: e.res === "whiff" ? 1 : 0, bip: bip ? 1 : 0, hard: bip && e.contact === "hard" ? 1 : 0 };
}
const thrownKey = (e) => (e.thrown && e.thrown !== e.pitchName ? [e.thrownId || "name:" + e.thrown, e.thrown] : [e.pitchId || "name:" + e.pitchName, e.pitchName]);

// ---------------------------------------------------------------- statistics, by other methods
function erfc(x) {   // Numerical Recipes erfc via Chebyshev (relative error < 1.2e-7) is not used; this is a series / Lentz CF to 1e-14
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) { let s = 0, t = x, n = 0; do { s += t / (2 * n + 1); n++; t *= -x * x / n; } while (Math.abs(t) > 1e-17 * Math.abs(s) && n < 200); return 1 - (2 / Math.sqrt(Math.PI)) * s; }
  let f = x, C = x, D = 0; for (let n = 1; n < 300; n++) { const a = n / 2; D = x + a * D; D = 1 / D; C = x + a / C; const d = C * D; f *= d; if (Math.abs(d - 1) < 1e-15) break; }
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}
const pTwoSided = (z) => erfc(Math.abs(z) / Math.SQRT2);
function lnGamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61563141, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
function betaBelow(x, a, b) {   // P(X < x) by Simpson's rule on the density
  if (x <= 0) return 0; if (x >= 1) return 1;
  const lB = lnGamma(a) + lnGamma(b) - lnGamma(a + b), N = 20000;
  let f, U;
  if (a >= 1) { U = x; f = (t) => (t <= 0 ? (a === 1 ? 1 : 0) : Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t))); }
  else {   // a < 1: the density is infinite at 0; with u = t^a, t^(a-1) dt = du / a and the integrand is smooth
    U = Math.pow(x, a); f = (u) => (u <= 0 ? 1 : Math.pow(1 - Math.pow(u, 1 / a), b - 1)) / a;
  }
  let s = f(0) + f(U); for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * f((U * i) / N);
  return Math.min(1, (s * U) / (3 * N) / Math.exp(lB));
}

// ---------------------------------------------------------------- his normal, findings, drift
function normal(outings, curSeason, flat, kinds) {
  const acc = {};
  const order = outings.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (let i = 0; i < order.length; i++) {
    const o = order[i];
    let w = 1;
    if (!flat) { if (i >= RECENT) w = Math.pow(FADE, i - RECENT + 1); if (curSeason && o.season && o.season !== curSeason) w *= OTHER_SEASON; }
    for (const e of o.ps) {
      const [key, name] = thrownKey(e), t = tally(e);
      const a = acc[key] || (acc[key] = { name, kind: kinds[key] || e.kind || "?", w: {}, raw: { pitch: 0, swing: 0, bip: 0 } });
      for (const k of Object.keys(t)) a.w[k] = (a.w[k] || 0) + w * t[k];
      a.raw.pitch += t.pitch; a.raw.swing += t.swing; a.raw.bip += t.bip;
    }
  }
  const out = {};
  for (const [key, a] of Object.entries(acc)) {
    out[key] = { name: a.name, pitches: a.raw.pitch, m: {} };
    for (const [mk, num, den] of RATES) {
      const pr = (LEVEL[mk][a.kind] ?? LEVEL_ANY[mk]), n = a.w[den] || 0, p = ((a.w[num] || 0) + PRIOR_N * pr) / (n + PRIOR_N);
      out[key].m[mk] = { p, se: Math.sqrt((p * (1 - p)) / (n + PRIOR_N)), raw: a.raw[den] };
    }
  }
  return out;
}
const priorOnly = (kind) => Object.fromEntries(RATES.map(([mk]) => { const p = LEVEL[mk][kind] ?? LEVEL_ANY[mk]; return [mk, { p, se: Math.sqrt((p * (1 - p)) / PRIOR_N), raw: 0 }]; }));

function look(ps, norm, kinds) {
  const cells = [], groups = {};
  for (const e of ps) { const [key, name] = thrownKey(e); (groups[key] = groups[key] || { name, list: [] }).list.push(e); }
  for (const [key, g] of Object.entries(groups)) {
    const kind = kinds[key] || g.list[0].kind || "?", m = (norm[key] && norm[key].m) || priorOnly(kind);
    for (const [vk, [order, of]] of Object.entries(SITS)) {
      const by = {}; for (const b of order) by[b] = { pitch: 0, strike: 0, swing: 0, whiff: 0, bip: 0, hard: 0 };
      for (const e of g.list) { const b = of(e); if (b == null || !by[b]) continue; const t = tally(e); for (const k of Object.keys(t)) by[b][k] += t[k]; }
      for (const [mk, num, den] of RATES) {
        const p0 = m[mk].p, chart = order.map((b) => `${b}:${by[b][num]}/${by[b][den]}`);
        for (const b of order) {
          const k = by[b][num], n = by[b][den]; if (n < MIN_CELL) continue;
          const z = (k - n * p0) / Math.sqrt(n * p0 * (1 - p0));
          cells.push({ id: `${key}|${vk}|${b}|${mk}|${k}/${n}|${p0.toFixed(4)}`, p: pTwoSided(z), z, chart });
        }
      }
    }
  }
  // Benjamini-Hochberg step-up: from the largest p down, the first rank whose p clears its line sets the cut
  const s = cells.slice().sort((a, b) => a.p - b.p), m = s.length;
  const cutAt = (q) => { for (let i = m - 1; i >= 0; i--) if (s[i].p <= ((i + 1) * q) / m) return i; return -1; };
  const c1 = cutAt(Q_CLEAR), c2 = cutAt(Q_EARLY);
  s.forEach((c, i) => { c.level = i <= c1 ? "clear" : i <= c2 ? "early" : "noise"; });
  const shown = s.filter((c) => c.level !== "noise").sort((a, b) => (a.level !== b.level ? (a.level === "clear" ? -1 : 1) : Math.abs(b.z) - Math.abs(a.z))).slice(0, SHOW);
  return { tested: m, shown };
}
function driftLog(ps, norm, kinds) {
  const fired = new Set(), log = [], run = {};
  ps.forEach((e, i) => {
    const [key] = thrownKey(e), t = tally(e), r = run[key] || (run[key] = { n: 0, s: { pitch: 0, strike: 0, swing: 0, whiff: 0, bip: 0, hard: 0 }, kind: kinds[key] || e.kind || "?" });
    r.n++; for (const k of Object.keys(t)) r.s[k] += t[k];
    // a note can only start on a pitch of its own kind of pitch: other pitches don't change its numbers
    if (r.n < DRIFT_MIN) return;
    const m = (norm[key] && norm[key].m) || priorOnly(r.kind);
    for (const [mk, num, den, dir] of RATES) {
      const k = r.s[num], n = r.s[den]; if (n < DRIFT_MIN || fired.has(key + "|" + mk)) continue;
      const p0 = m[mk].p, se0 = m[mk].se, bad = BAD[mk];
      const line = dir < 0 ? p0 - SE_SHIFT * se0 - DRIFT_SHARE * Math.max(0, p0 - bad) : p0 + SE_SHIFT * se0 + DRIFT_SHARE * Math.max(0, bad - p0);
      const below = betaBelow(line, k + DRIFT_PRIOR * p0, n - k + DRIFT_PRIOR * (1 - p0)), prob = dir < 0 ? below : 1 - below;
      const need = Math.min(0.99, 0.9 + EARLY_LOOK * Math.max(0, (20 - n) / 12));
      if (prob >= need) { fired.add(key + "|" + mk); log.push(`${key}|${mk}|${k}/${n}|${i + 1}`); }
    }
  });
  return log;
}

// ---------------------------------------------------------------- the season's data
(async () => {
  const db = new Client({ connectionString: process.env.PGURL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const T = season.team;
  const evs = (await db.query("select doc from public.events where program_id = $1 and deleted_at is null", [T])).rows.map((r) => r.doc).filter(counted);
  const games = (await db.query("select id, doc from public.games where program_id = $1 and deleted_at is null", [T])).rows
    .filter((g) => !g.doc.dupOf && /^\d{4}-\d{2}-\d{2}$/.test(g.doc.date || "")).map((g) => ({ id: g.id, date: g.doc.date }));
  const pitchers = Object.fromEntries((await db.query("select id, doc from public.pitchers where program_id = $1", [T])).rows.map((r) => [r.id, r.doc]));
  const seasons = (await db.query("select name, start_date::text s, end_date::text e from public.seasons where program_id = $1", [T])).rows;
  const seasonOf = (d) => (seasons.find((x) => d >= x.s && d <= x.e) || { name: "so far" }).name;
  const stored = new Map((await db.query("select game_id, pitcher_id, data from public.outcome_findings where program_id = $1", [T])).rows.map((r) => [`${r.game_id}|${r.pitcher_id}`, r.data]));
  const gameById = new Map(games.map((g) => [g.id, g]));
  // each pitcher's pitches by game, in order, each with his pitch count in that game before it
  const his = {};
  for (const e of evs) { if (!e.pitcherId || !gameById.has(e.gameId)) continue; ((his[e.pitcherId] = his[e.pitcherId] || {})[e.gameId] = his[e.pitcherId][e.gameId] || []).push(e); }
  for (const byGame of Object.values(his)) for (const list of Object.values(byGame)) { list.sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0)); list.forEach((e, i) => { e._pc = typeof e.pcRaw === "number" ? e.pcRaw : i; }); }
  const kindsOf = (pid) => Object.fromEntries(((pitchers[pid] || {}).pitches || []).filter((p) => p.id).map((p) => [p.id, p.kind || "?"]));
  const want = {}; let outings = 0, nStored = 0;
  for (const [pid, byGame] of Object.entries(his)) {
    const kinds = kindsOf(pid), gl = Object.keys(byGame).map((id) => gameById.get(id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    gl.forEach((g, i) => {
      const prior = gl.slice(0, i).map((x) => ({ date: x.date, season: seasonOf(x.date), ps: byGame[x.id] }));
      const norm = normal(prior, seasonOf(g.date), false, kinds), f = look(byGame[g.id], norm, kinds), d = driftLog(byGame[g.id], norm, kinds);
      want[`${g.id}|${pid}`] = { f, d }; outings++;
      const st = stored.get(`${g.id}|${pid}`);
      check(!!st, `stored outcome row for ${g.date} ${pitchers[pid] && pitchers[pid].name}`);
      if (st) {
        nStored++;
        same(`stored ${g.date} ${pid.slice(-5)} tested`, f.tested, st.findings.tested);
        same(`stored ${g.date} ${pid.slice(-5)} shown`, f.shown.map((c) => `${c.level}|${c.id}`), st.findings.shown.map((c) => `${c.level}|${c.pitch}|${c.variable}|${c.bucket}|${c.metric}|${c.k}/${c.n}|${c.base.toFixed(4)}`));
        same(`stored ${g.date} ${pid.slice(-5)} drift`, d, st.drift.map((n) => `${n.pitch}|${n.metric}|${n.k}/${n.n}|${n.at}`));
      }
    });
    // season so far: every game of his after the last marked season, his season's normal flat-weighted
    const last = seasons.map((s) => s.e).sort().pop() || "0000-00-00";
    const sf = gl.filter((g) => g.date > last);
    const outs = sf.map((g) => ({ date: g.date, ps: byGame[g.id] }));
    want[`season|${pid}`] = { f: look(outs.flatMap((o) => o.ps), normal(outs, null, true, kinds), kinds) };
  }
  let pages = 0, numbers = 0;
  if (SITE_MODE) {
    const { chromium } = require("playwright"), browser = await chromium.launch(), SITE = season.site;
    const signIn = async (who) => { const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 }); return { ctx, page }; };
    const visit = async (page, url, w, label, withDrift) => {
      const r = await page.goto(SITE + url, { waitUntil: "networkidle" }); pages++;
      check(r && r.status() === 200, `${label}: opens`);
      const vals = Object.fromEntries(await page.evaluate(() => [...document.querySelectorAll("[data-k]")].map((el) => [el.getAttribute("data-k"), el.getAttribute("data-v")])));
      const pre = url.includes("/recap") ? "ocs" : "oc";
      w.f.shown.forEach((c, i) => {
        same(`${label} ${pre}.${i}.cell`, c.id, vals[`${pre}.${i}.cell`]); same(`${label} ${pre}.${i}.level`, c.level, vals[`${pre}.${i}.level`]); numbers += 2;
        for (const b of c.chart) { const [bk, kv] = b.split(":"); const [k, n] = kv.split("/"); if (+n) { same(`${label} ${pre}.${i}.chart.${bk}`, kv, vals[`${pre}.${i}.chart.${bk}`]); numbers++; } }
      });
      check(vals[`${pre}.${w.f.shown.length}.cell`] === undefined, `${label}: no extra findings shown`);
      if (withDrift) { w.d.forEach((x, i) => { same(`${label} drift.${i}`, x, vals[`drift.${i}`]); numbers++; }); check(vals[`drift.${w.d.length}`] === undefined, `${label}: no extra drift notes`); }
    };
    const coach = await signIn("coach");
    for (const [pid, byGame] of Object.entries(his)) {
      for (const gid of Object.keys(byGame)) await visit(coach.page, `/app/t/${T}/reports/${gid}/${pid}`, want[`${gid}|${pid}`], `outing ${gameById.get(gid).date} ${pitchers[pid] && pitchers[pid].name}`, true);
      await visit(coach.page, `/app/t/${T}/roster/${pid}/recap`, want[`season|${pid}`], `season so far ${pitchers[pid] && pitchers[pid].name}`, false);
    }
    await coach.ctx.close();
    const pid = season.pitchers.Ace, me = await signIn("ace");
    for (const gid of Object.keys(his[pid] || {})) {
      await visit(me.page, `/app/me/${T}/${pid}/outings/${gid}`, want[`${gid}|${pid}`], `ace's own ${gameById.get(gid).date}`, false);
      const html = await me.page.content(); check(!/Drift notes in the game/.test(html), `ace's own ${gameById.get(gid).date}: no staff drift notes`);
    }
    await visit(me.page, `/app/me/${T}/${pid}/recap`, want[`season|${pid}`], "ace's own season so far", false);
    await me.ctx.close(); await browser.close();
  }
  await db.end();
  const shownTotal = Object.values(want).reduce((a, w) => a + w.f.shown.length, 0), driftTotal = Object.values(want).reduce((a, w) => a + ((w.d && w.d.length) || 0), 0);
  console.log(`checked ${outings} outings (${nStored} stored rows), ${Object.keys(his).length} season-so-far views: ${shownTotal} findings shown, ${driftTotal} drift notes` + (SITE_MODE ? `; ${pages} pages, ${numbers} numbers on them` : ""));
  for (const f of failures) console.log("  FAIL " + f);
  console.log(fails ? `${fails} of ${checks} outcome checks FAILED` : `${checks}/${checks} outcome checks agree`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
