/*
 * A rich, realistic demo data set for the PitchIQ portal in the LOCAL Supabase, for screenshots and design review.
 * Resets the local database (like the e2e tests), then creates: two organizations, two teams, staff, nine pitchers, three
 * opponents, upcoming and finished games with logged pitches, TrackMan uploads, invites, a lapsed organization, a
 * super admin. Writes web/tests/screens/app_seed.json (the ids web/tests/app_shots.js needs).
 * Run from the repo root with `npx supabase@2.122.1 start` running, and the site up (default http://localhost:3111; the two
 * uploads go through the player's own browser session so the proposals are made the way the site makes them):
 *   node web/tests/app_seed.js [--url http://localhost:3111]
 * Refuses to run unless the Supabase API is on 127.0.0.1 or localhost.
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), fs = require("fs"), os = require("os"), { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), CLI = ["-y", "supabase@2.122.1"];
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const SITE = arg("url", "http://localhost:3111").replace(/\/$/, "");
const PASS = "test-pass-1234";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const npx = (args, o = {}) => execFileSync("npx", [...CLI, ...args], { cwd: ROOT, shell: process.platform === "win32", ...o });
const status = () => JSON.parse(npx(["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString());
const local = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u) || /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(u);

// a small seeded random, so the demo data is the same every run
let seed = 20261117;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wpick = (items, w) => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

(async () => {
  let S = status();
  if (!local(S.API_URL) || !local(S.DB_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  console.log("(resetting the local database: migrations applied fresh)");
  npx(["db", "reset", "--local"], { stdio: ["ignore", "ignore", "inherit"] });
  S = status();
  if (!local(S.API_URL) || !local(S.DB_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  const API = S.API_URL, PUB = S.PUBLISHABLE_KEY, SECRET = S.SECRET_KEY;
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  const http = async (method, url, { key = PUB, token, body } = {}) => {
    for (let i = 0; ; i++) {
      const res = await fetch(API + url, { method, headers: { apikey: key, authorization: `Bearer ${token || key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => null);
      if ((res.status === 503 || res.status === 502) && i < 30) { await wait(500); continue; }
      if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
      return json;
    }
  };
  const skipped = [], U = {}, tokens = {};
  for (const n of ["coach", "asst", "viewer", "player", "lapsed", "new", "admin"]) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => tokens[n] || (tokens[n] = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token);
  const rpc = async (n, fn, args = {}) => { tokens[n] = null; return http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args }); };
  // everyone has agreed to the current Terms, so the portal opens straight away
  const ver = (fs.readFileSync(path.join(__dirname, "../lib/legal.ts"), "utf8").match(/LEGAL_VERSION = "([^"]+)"/) || [])[1];
  if (ver) for (const id of Object.values(U)) for (const d of ["terms", "privacy"]) await db.query("insert into public.legal_acceptances (user_id, doc, version, via) values ($1, $2, $3, 'portal') on conflict do nothing", [id, d, ver]);
  else skipped.push({ item: "terms acceptance", reason: "LEGAL_VERSION not found in web/lib/legal.ts" });

  // ---------------------------------------------------------------- organizations and teams
  const org = await rpc("coach", "pc_create_org", { name: "Ridgeview Baseball", level: "hs" });
  const tV = await rpc("coach", "pc_create_team", { org, name: "Ridgeview Varsity", level: "hs", timezone: "America/New_York", join_as: "head" });
  const tJ = await rpc("coach", "pc_create_team", { org, name: "Ridgeview JV", level: "hs", timezone: "America/New_York", join_as: "head" });
  const inAYear = new Date(Date.now() + 300 * 86400000).toISOString();
  await db.query("update public.organizations set billing_status = 'active', subscription_status = 'active', subscription_quantity = 2, stripe_customer_id = 'cus_demo_ridgeview', stripe_subscription_id = 'sub_demo_ridgeview', period_ends_at = $2 where id = $1", [org, inAYear]);
  await db.query("update public.programs set status = 'active' where org_id = $1", [org]);
  const orgL = await rpc("lapsed", "pc_create_org", { name: "Lakeside Legion", level: "travel" });
  const tL = await rpc("lapsed", "pc_create_team", { org: orgL, name: "Lakeside Legion 16U", level: "travel", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'locked', billing_changed_at = now() - interval '4 days', subscription_status = 'past_due', subscription_quantity = 1, stripe_customer_id = 'cus_demo_lakeside', stripe_subscription_id = 'sub_demo_lakeside' where id = $1", [orgL]);
  await db.query("update public.programs set status = 'active' where org_id = $1", [orgL]);
  await db.query("insert into public.platform_admins (user_id, note) values ($1, 'Demo admin')", [U.admin]);

  // ---------------------------------------------------------------- staff and invites
  const invite = (who, team, role, o = {}) => rpc(who, "pc_invite", { p: team, member_role: role, pitcher: o.pitcher || null, invite_email: o.email || null, under13: false });
  await rpc("asst", "pc_accept_invite", { tok: await invite("coach", tV, "pitching") });
  await rpc("viewer", "pc_accept_invite", { tok: await invite("coach", tV, "viewer") });
  const pendingStaffTok = await invite("coach", tV, "caller", { email: "volunteer@test.local" });
  const joinTok = await invite("coach", tV, "caller");   // unused: the join page's valid token

  // ---------------------------------------------------------------- the team's records, the way the iPad and portal write them
  const t0 = Date.now();
  const push = async (who, team, tbl, rows) => {
    for (let i = 0; i < rows.length; i += 100) {
      const r = await http("POST", "/rest/v1/rpc/pc_push", { token: await tokenOf(who), body: { p: team, tbl, rows: rows.slice(i, i + 100).map((x) => ({ createdAt: t0, updatedAt: t0, ...x })) } });
      if (r.rejected && r.rejected.length) throw new Error(`${tbl}: ${JSON.stringify(r.rejected)}`);
    }
  };
  const ID = (prefix, n) => `${prefix}_${n}`.padEnd(30, "0").slice(0, 30);
  const OURS = ID("tea_ours", 1), OPPS = [ID("tea_hillcrest", 1), ID("tea_lakemont", 2), ID("tea_stonebridge", 3)];
  await push("coach", tV, "teams", [
    { id: OURS, name: "Ridgeview Varsity", isOurs: true, level: "hs", pitchRule: { preset: "ps-17-18" } },
    { id: OPPS[0], name: "Hillcrest Hawks", isOurs: false, level: "hs", notes: "Aggressive early in the count. Their 3-4 hitters can hurt you." },
    { id: OPPS[1], name: "Lakemont Lions", isOurs: false, level: "hs", notes: "" },
    { id: OPPS[2], name: "Stonebridge Academy", isOurs: false, level: "hs", notes: "New on the schedule, no scouting yet." }]);
  await push("coach", tJ, "teams", [{ id: ID("tea_jv", 1), name: "Ridgeview JV", isOurs: true, level: "hs" }]);

  const TYPES = {
    FB: { type: "Four-seam", name: "Fastball", shape: "rides" }, SI: { type: "Sinker", name: "Sinker", shape: "run" }, FC: { type: "Cutter", name: "Cutter", shape: "hard" },
    SL: { type: "Slider", name: "Slider", shape: "tight" }, CB: { type: "Curveball", name: "Curveball", shape: "12-6" }, CH: { type: "Changeup", name: "Changeup", shape: "fade" } };
  const TYPICAL = { FB: [88, 16, 8, 2200], SI: [86, 6, 15, 2050], FC: [84, 8, -2, 2350], SL: [78, 1, -6, 2450], CB: [72, -9, -7, 2600], CH: [79, 8, 14, 1700] };
  // [key, name, number, hand, role, slot, height, arsenal: kind -> [grade, command, usage weight]]
  const ROSTER = [
    ["brooks", "Ethan Brooks", "21", "R", "SP", "three-quarter", 6.2, { FB: [4, 4, 0.5], SL: [4, 3, 0.2], CB: [3, 3, 0.16], CH: [3, 3, 0.14] }],
    ["delgado", "Marcus Delgado", "11", "L", "SP", "high three-quarter", 6.0, { FB: [4, 3, 0.46], SI: [3, 4, 0.16], SL: [3, 3, 0.2], CH: [4, 3, 0.18] }],
    ["nguyen", "Tyler Nguyen", "34", "R", "RP", "over the top", 6.4, { FB: [5, 3, 0.4], FC: [3, 3, 0.05], SL: [4, 2, 0.25], CB: [3, 3, 0.14], CH: [3, 4, 0.16] }],
    ["whitaker", "Owen Whitaker", "8", "R", "SP", "low three-quarter", 5.11, { FB: [3, 4, 0.42], SI: [4, 4, 0.34], CB: [3, 3, 0.24] }],
    ["foster", "Caleb Foster", "17", "L", "RP", "sidearm", 5.10, { FB: [3, 3, 0.5], SL: [4, 3, 0.3], CH: [2, 3, 0.2] }],
    ["hernandez", "Luke Hernandez", "30", "R", "RP", "three-quarter", 6.1, { FB: [3, 3, 0.5], FC: [4, 3, 0.28], SL: [3, 2, 0.22] }],
    ["patel", "Noah Patel", "4", "R", "SP", "three-quarter", 6.0, { FB: [3, 3, 0.36], SI: [3, 3, 0.18], SL: [3, 3, 0.18], CH: [3, 3, 0.14], CB: [2, 3, 0.14] }],
    ["reyes", "Dylan Reyes", "27", "L", "RP", "three-quarter", 5.9, { FB: [3, 3, 0.7], CB: [2, 2, 0.3] }],
    ["kelly", "Mason Kelly", "15", "R", "RP", "high three-quarter", 6.3, { FB: [2, 3, 0.6], SL: [2, 2, 0.2], CH: [2, 2, 0.2] }],
  ];
  const P = {};   // key -> pitcher doc
  const pitchers = ROSTER.map(([key, name, number, hand, role, slot, height, ars], idx) => {
    const id = ID(`pit_${key}`, idx + 1);
    const pitches = Object.entries(ars).map(([kind, [grade, command, usage]], j) => {
      const [v, ivb, hb] = TYPICAL[kind], t = TYPES[kind], side = hand === "L" ? -1 : 1, bump = (grade - 3) * 1.4 + (role === "RP" ? 1 : 0);
      return { id: `pt_${key}_${kind}`, type: t.type, name: t.name, kind, shape: t.shape, grade, command, feel: 0.6 + 0.05 * j, usage,
        velo: Math.round(v + bump), ivb: ivb, hb: hb * side, spin: TYPICAL[kind][3] + idx * 15, active: true };
    }).map(({ usage, ...p }) => p);
    return (P[key] = { id, teamId: OURS, name, number, hand, role, slot, height_ft: height, gradYear: String(2026 + (idx % 3)), pitchLimit: "", useLearned: true,
      notes: idx === 0 ? "Gets stronger as the game goes. Loves to finish hitters with the slider." : "", pitches, _usage: ars });
  });
  await push("coach", tV, "pitchers", pitchers.map(({ _usage, ...d }) => d));

  // opponents' hitters: two with nine, one (Stonebridge) with none
  const HIT = [
    ["Hillcrest Hawks", ["Jackson Reed R", "Eli Carter L", "Aaron Briggs R", "Mateo Vargas S", "Cole Mercer R", "Jaden Hughes L", "Brandon Cho R", "Devin Ortiz L", "Tristan Wells R"]],
    ["Lakemont Lions", ["Ryan Fischer L", "Isaac Dunn R", "Gavin Powell R", "Landon Pierce S", "Hunter Cruz R", "Nolan Baptiste L", "Sawyer Keane R", "Micah Tran R", "Julian Moss L"]]];
  const hitters = {};
  for (const [oi, [, list]] of HIT.entries()) hitters[oi] = list.map((x, i) => {
    const parts = x.split(" "), bats = parts.pop(), name = parts.join(" ");
    return { id: ID(`hit_o${oi}`, i + 1), teamId: OPPS[oi], name, number: String([3, 7, 12, 21, 24, 5, 9, 14, 30][i]), bats, pos: ["CF", "SS", "1B", "3B", "C", "LF", "RF", "2B", "DH"][i], stats: {}, tags: [], notes: i === 3 ? "Dangerous from either side. Pitch him away." : "" };
  });
  await push("coach", tV, "hitters", [...hitters[0], ...hitters[1]]);
  await push("coach", tV, "catchers", [{ id: ID("cat_vega", 1), teamId: OURS, name: "Vega", block: 4 }, { id: ID("cat_lindqvist", 2), teamId: OURS, name: "Lindqvist", block: 3 }]);
  const CAT = [ID("cat_vega", 1), ID("cat_lindqvist", 2)];

  // ---------------------------------------------------------------- games
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const bats = (oi) => hitters[oi].map((h) => ({ hitterId: h.id, name: h.name, hand: h.bats }));
  const gameBase = (id, n, o) => ({ id, date: day(n), level: "hs", inputs: 3, logLoc: false, radar: false, catcherId: CAT[0], deviceId: null, time: "16:00", plannedBy: "coach@test.local", plannedAt: t0,
    setup: { engine: "v09", home: true, innings: 7, extrasRunner: false, umpSeed: "normal" }, ...o });
  const G = { today: ID("gam_today", 1), noplan: ID("gam_noplan", 2), f1: ID("gam_final", 3), f2: ID("gam_final", 4), f3: ID("gam_final", 5) };
  const games = [
    gameBase(G.today, 0, { time: "16:00", opponentId: OPPS[0], staffIds: [P.brooks.id, P.nguyen.id, P.foster.id], starterId: P.brooks.id, lineup: bats(0), status: "planned" }),
    gameBase(G.noplan, 4, { time: null, opponentId: OPPS[1], staffIds: [], starterId: null, lineup: [], catcherId: null, status: "planned", setup: { engine: "v09", home: null, innings: null, extrasRunner: false, umpSeed: "normal" } }),
  ];
  // finished games, with every pitch logged the way the game app logs it
  let evN = 0; const events = [];
  const simGame = (gid, gday, oi, plan) => {
    let n = 0, inning = 1, outs = 0, bi = 0, hrs = 0;
    for (const [key, batters] of plan) {
      const pd = P[key], kinds = pd.pitches.map((p) => p.kind), w = pd.pitches.map((p) => pd._usage[p.kind][2]);
      for (let b = 0; b < batters; b++) {
        const h = hitters[oi][bi++ % 9]; let balls = 0, strikes = 0, done = false;
        while (!done) {
          const two = strikes === 2, kind = wpick(kinds, w.map((x, i) => (two && kinds[i] !== "FB" ? x * 1.5 : x)));
          const p = pd.pitches.find((x) => x.kind === kind);
          const res = wpick(["ball", "cstrike", "whiff", "foul", "play", "hbp"], [0.35, 0.17, 0.12, 0.16, 0.19, 0.01]);
          const count = `${balls}-${strikes}`; n++; evN++;
          const ev = { id: ID(`ev_${gid.slice(4, 9)}`, evN), type: "pitch", gameId: gid, n, ts: t0 - (200 - n) * 20000, pitcherId: pd.id, pitchId: p.id, pitchName: p.name, kind, hitterId: h.id,
            ph: pd.hand, bs: h.bats === "S" ? (pd.hand === "R" ? "L" : "R") : h.bats, inning, outs, count, res };
          let end = false;
          if (res === "ball") { balls++; if (balls === 4) { end = true; ev.paEnd = "walk"; } }
          else if (res === "hbp") { end = true; ev.paEnd = "hbp"; }
          else if (res === "cstrike" || res === "whiff") { strikes++; if (strikes === 3) { end = true; outs++; ev.paEnd = "k"; } }
          else if (res === "foul") { if (strikes < 2) strikes++; }
          else {
            const contact = wpick(["weak", "solid", "hard"], [0.3, 0.4, 0.3]); ev.contact = contact;
            const hit = rnd() < (contact === "hard" ? 0.6 : contact === "solid" ? 0.3 : 0.12);
            if (hit) { ev.out = wpick(["1B", "2B", "3B", "HR"], [0.7, 0.2, 0.02, 0.08]); if (ev.out === "HR") hrs++; ev.paEnd = contact === "hard" || ev.out !== "1B" ? "hard" : "hit"; }
            else { ev.out = "OUT"; outs++; ev.paEnd = "out"; }
            end = true;
          }
          ev.end = end; ev.runs = 0; events.push(ev);
          if (end) { done = true; if (outs >= 3) { outs = 0; inning++; } }
        }
      }
    }
  };
  const FIN = [[G.f1, -14, 0, [["brooks", 19], ["nguyen", 9]], [P.brooks.id, P.nguyen.id], CAT[0]], [G.f2, -8, 1, [["delgado", 20], ["foster", 7], ["hernandez", 5]], [P.delgado.id, P.foster.id, P.hernandez.id], CAT[1]],
    [G.f3, -3, 0, [["brooks", 17], ["nguyen", 8], ["patel", 4]], [P.brooks.id, P.nguyen.id, P.patel.id], CAT[0]]];
  for (const [gid, n, oi, plan, staff, cat] of FIN) {
    simGame(gid, n, oi, plan);
    games.push(gameBase(gid, n, { opponentId: OPPS[oi], staffIds: staff, starterId: staff[0], lineup: bats(oi), catcherId: cat, status: "final", deviceId: "dev_demo_ipad_0001", time: "15:30",
      setup: { engine: "v09", home: n % 2 === 0, innings: 7, extrasRunner: false, umpSeed: "normal" } }));
  }
  await push("coach", tV, "games", games);
  await push("coach", tV, "events", events);
  const pitchCounts = {};
  for (const e of events) { const k = `${Object.values(P).find((x) => x.id === e.pitcherId).name} ${e.kind}`; pitchCounts[k] = (pitchCounts[k] || 0) + 1; }
  const perGame = Object.fromEntries([G.f1, G.f2, G.f3].map((g) => [g, events.filter((e) => e.gameId === g).length]));
  // what the engine learned about his pitches (the learned page)
  const learnedPitches = {};
  for (const p of P.brooks.pitches) learnedPitches[p.id] = { n: 40 + p.grade * 7, games: 2, entered: { grade: p.grade, command: p.command }, talent: { grade: +(p.grade + 0.2).toFixed(1), command: +(p.command - 0.3).toFixed(1) }, strike_rate: 0.58, evidence: { hitters: [hitters[0][0].id] } };
  await push("coach", tV, "learned", [{ id: `p:${P.brooks.id}`, pitcherId: P.brooks.id, at: t0, learner: "2.1", pitches: learnedPitches }]);

  // ---------------------------------------------------------------- the player portal: one claimed pitcher, one invite link, one parent's email waiting
  await rpc("player", "pc_accept_invite", { tok: await invite("coach", tV, "player", { pitcher: P.brooks.id }) });
  const pitcherInviteTok = await invite("coach", tV, "player", { pitcher: P.reyes.id });
  const parentTok = (await db.query("insert into public.invites (program_id, role, pitcher_id, email, under13, created_by, needs_approval, declared_by) values ($1, 'player', $2, 'kelly.parent@test.local', true, $3, true, null) returning token", [tV, P.kelly.id, U.coach])).rows[0].token;

  // ---------------------------------------------------------------- uploads (TrackMan, from web/tests/data/Track_Combo.csv), through the player's own session
  const upIds = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pq-seed-"));
  let browser;
  try {
    const lines = fs.readFileSync(path.join(__dirname, "data/Track_Combo.csv"), "utf8").split(/\r?\n/).filter(Boolean), head = lines[0].split(",");
    const iP = head.indexOf("PitcherId"), iD = head.indexOf("Date"), iT = head.indexOf("PitcherThrows");
    const by = new Map();
    for (const l of lines.slice(1)) { const c = l.split(","); if (c[iT] !== "Right") continue; (by.get(c[iP]) || by.set(c[iP], []).get(c[iP])).push(l); }
    const ranked = [...by].filter(([, r]) => r.length >= 50 && r.length <= 400).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
    if (ranked.length < 2) throw new Error("Track_Combo.csv has no two right-handers with 50 to 400 pitches");
    const mdy = (n) => { const [y, m, d] = day(n).split("-"); return `${+m}/${+d}/${y}`; };
    const files = ranked.map(([, rows], i) => { const f = path.join(tmp, `trackman_session_${i + 1}.csv`);
      fs.writeFileSync(f, [lines[0], ...rows.map((l) => { const c = l.split(","); c[iD] = mdy(i ? -2 : -9); return c.join(","); })].join("\n")); return f; });
    const ping = await fetch(SITE + "/login").then((r) => r.ok).catch(() => false);
    if (!ping) throw new Error(`the site isn't answering at ${SITE}`);
    browser = await chromium.launch();
    const pg = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    pg.setDefaultTimeout(60000);
    await pg.goto(SITE + "/login?next=/app", { waitUntil: "load", timeout: 90000 });
    const f = pg.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill("player@test.local"); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await pg.waitForURL((u) => u.pathname === "/app", { timeout: 90000 });
    for (const [i, file] of files.entries()) {
      await pg.goto(`${SITE}/app/me/${tV}/${P.brooks.id}/uploads`, { waitUntil: "load", timeout: 90000 });
      await pg.waitForLoadState("networkidle").catch(() => {}); await wait(1500);   // hydrated, or the file is ignored
      await pg.getByLabel("Pitch file").setInputFiles(file);
      const btn = pg.getByRole("button", { name: /^Upload \d+ pitches?$/ });
      await btn.waitFor({ timeout: 60000 });
      await btn.click();
      await pg.waitForURL(/\/uploads\/[0-9a-f-]{36}/, { timeout: 60000 });
      upIds.push((pg.url().match(/uploads\/([0-9a-f-]{36})/) || [])[1]);
      await pg.waitForLoadState("networkidle").catch(() => {});
    }
    // accept one proposal, the way the player would: one accepted, others left waiting
    await pg.goto(`${SITE}/app/me/${tV}/${P.brooks.id}/uploads`, { waitUntil: "load", timeout: 90000 });
    await pg.waitForLoadState("networkidle").catch(() => {}); await wait(1500);
    const acc = pg.getByRole("form", { name: /^Accept / }).first();
    if (await acc.count()) { await acc.getByRole("button", { name: "Accept" }).click(); await pg.waitForURL(/ok=accepted/, { timeout: 30000 }); }
    else skipped.push({ item: "one accepted proposal", reason: "no 'Accept ...' form on the player's uploads page" });
  } catch (e) {
    skipped.push({ item: "uploads", reason: String(e.message || e).split("\n")[0] });
  } finally { if (browser) await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  const upRows = (await db.query("select id, session_type, n_pitches from public.uploads where program_id = $1 order by created_at", [tV])).rows;
  const proposals = +(await db.query("select count(*) n from public.proposals where program_id = $1 and status = 'pending'", [tV])).rows[0].n;
  const accepted = +(await db.query("select count(*) n from public.proposals where program_id = $1 and status <> 'pending'", [tV])).rows[0].n;

  // ---------------------------------------------------------------- the ids the shot harness needs
  const mem = (await db.query("select count(*) n from public.members where program_id = $1", [tV])).rows[0].n;
  const out = {
    pass: PASS, createdAt: new Date().toISOString(),
    users: Object.fromEntries(Object.keys(U).map((k) => [k, { id: U[k], email: `${k}@test.local` }])),
    org: { ridgeview: org, lakeside: orgL }, team: { varsity: tV, jv: tJ, lakeside: tL },
    pitchers: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.id])),
    claimedPitcher: P.brooks.id, invitedPitcher: P.reyes.id, parentApprovalPitcher: P.kelly.id, twoPitchPitcher: P.reyes.id,
    opponents: { hillcrest: OPPS[0], lakemont: OPPS[1], emptyStonebridge: OPPS[2] },
    games: { upcomingToday: G.today, upcomingNoPlan: G.noplan, finished: [G.f1, G.f2, G.f3] },
    uploads: { all: upRows.map((r) => r.id), accepted: upIds[0] || null, waitingForCoach: upIds[1] || null },
    joinToken: joinTok, pendingStaffToken: pendingStaffTok, pitcherInviteToken: pitcherInviteTok, parentApprovalToken: parentTok,
    pitchCounts, pitchesPerFinishedGame: perGame, proposals: { pending: proposals, decided: accepted }, skipped,
  };
  fs.mkdirSync(path.join(__dirname, "screens"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "screens/app_seed.json"), JSON.stringify(out, null, 2));
  await db.end();
  const under = Object.entries(pitchCounts).filter(([, c]) => c < 10).map(([k, c]) => `${k}:${c}`).join(", ");
  console.log([
    `orgs: Ridgeview Baseball (active, 2 teams: Varsity ${tV}, JV ${tJ}); Lakeside Legion (locked)`,
    `users: coach(owner) asst(pitching) viewer player lapsed new admin @test.local, all ${PASS}; members on Varsity: ${mem}`,
    `invites: 1 pending staff (volunteer@test.local), 1 pitcher link (Dylan Reyes), 1 parent email awaiting approval (Mason Kelly), 1 unused join token`,
    `pitchers: ${pitchers.length} (Ethan Brooks claimed by player@test.local; Dylan Reyes has 2 pitches)`,
    `opponents: Hillcrest Hawks (9 hitters), Lakemont Lions (9), Stonebridge Academy (none)`,
    `games: 1 today with plan, 1 in 4 days with no plan, 3 final with ${Object.values(perGame).join("/")} pitches (${events.length} events)`,
    `pitch types under 10 pitches (10-pitch minimum visible): ${under || "none"}`,
    `uploads: ${upRows.length} (${upRows.map((r) => r.n_pitches).join(", ")} pitches); proposals pending ${proposals}, decided ${accepted}`,
    `skipped: ${skipped.length ? skipped.map((s) => s.item + " (" + s.reason + ")").join("; ") : "none"}`,
    `wrote web/tests/screens/app_seed.json`].join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
