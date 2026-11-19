/*
 * Build 1: a seeded season, charted through the real game app against the LOCAL Supabase, for the reports, the recap,
 * the independent check script and the screenshots. Never a hosted project (refuses anything not on localhost).
 *
 * What it makes (fresh database: the local stack is reset first):
 *   - one team (RIT Tigers, D3) with a head coach, a pitching coach, a viewer, three players linked to their pitcher
 *     records (one under 18, with a parent account that isn't on the team) and an outsider;
 *   - four pitchers, two catchers, three opponents with nine hitters each;
 *   - 13 games through the game app (app/chart_driver.js: the app's own calls, shake-offs, the "Call my own" box,
 *     cross-ups, pitching changes): Spring 2026 (10 games, Feb 21 - Apr 25) and the fall so far (3 games); two pitchers
 *     in six of them; one with no locations, one with results only (no contact), one with full detail; some pitches
 *     with no location or no contact logged; one game charted with no signal and synced later; one charted on a second
 *     iPad running main's game app (before Build 1: no mix fields) to prove an older app still syncs;
 *   - Spring marked over on May 31 (backdated: the seasons row is written as the coach's tap would have written it),
 *     then the site's report run freezes each pitcher's final recap and emails it;
 *   - a few coach notes (outing and at-bat, some shared with the pitcher) and two public links (an adult's, live; the
 *     under-18 player's, waiting on his parent).
 * The browser's clock is set to each game's date, so game dates, stamps and the learner's order are the season's.
 *
 * Run from the repo root after `npm run build` in web/ (it serves the built site):
 *   node web/tests/season_seed.js            -> writes C:/dev/pitch-caller-logs/season.json (ids, users, game list)
 * Env: SEASON_OUT (that path), SEASON_PORT (3197), KEEP_SERVER=1 to leave the site running for screenshots.
 */
const { chromium } = require("playwright");
const fakeMail = require("./fake_resend");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");
const { playGame, seededRandomInit } = require("../../app/chart_driver");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, "..");
const PORT = +(process.env.SEASON_PORT || 3197), SITE = `http://localhost:${PORT}`, MAIL_PORT = PORT + 1;
const OUT = process.env.SEASON_OUT || "C:/dev/pitch-caller-logs/season.json";
const CLI = ["-y", "supabase@2.122.1"], PASS = "test-pass-1234", CRON = "local-cron-secret";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", [...CLI, "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());
const log = (...a) => console.log(...a);

const ARS = {
  Ace: [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 89, grade: 4, command: 3, feel: 0.75 },
    { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 80, grade: 4, command: 3, feel: 0.7 },
    { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 81, grade: 3, command: 3, feel: 0.6 }],
  Lefty: [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 85, grade: 3, command: 4, feel: 0.75 },
    { type: "12-6 curve", name: "Curve", kind: "CB", shape: "sharp", velo: 72, grade: 4, command: 3, feel: 0.6 },
    { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 77, grade: 3, command: 3, feel: 0.6 }],
  Kid: [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 82, grade: 3, command: 3, feel: 0.7 },
    { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 72, grade: 3, command: 2, feel: 0.6 }],
  Pen: [{ type: "Sinker", name: "Sinker", kind: "SI", shape: "sink", velo: 88, grade: 3, command: 3, feel: 0.7 },
    { type: "Cutter", name: "Cutter", kind: "FC", shape: "cut", velo: 85, grade: 3, command: 3, feel: 0.65 },
    { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 79, grade: 3, command: 3, feel: 0.65 }],
};
const NAMES = { Ace: "Jake Moreno", Lefty: "Sam Ortiz", Kid: "Eli Brooks", Pen: "Marcus Hale" };
const HANDS = { Ace: "R", Lefty: "L", Kid: "R", Pen: "R" };
const TRUTH = { Fastball: { command: 2.8 }, Slider: { grade: 4 }, Curve: { command: 2.6 }, Changeup: {}, Sinker: {}, Cutter: { grade: 2.5 } };
const OPP = { Lakeside: ["Ruiz", "Chen", "Patel", "Okafor", "Diaz", "Larsen", "Kim", "Novak", "Grant"], Riverton: ["Hayes", "Silva", "Burke", "Tran", "Moss", "Reyes", "Clark", "Adler", "Price"],
  Hillcrest: ["Vega", "Stone", "Ito", "Ward", "Ochoa", "Fox", "Lund", "Shaw", "Beck"] };
const BATS = ["R", "L", "R", "S", "L", "R", "R", "L", "R"];
// the season: date, opponent, starter, reliever (and when he comes in), charting
const GAMES = [
  { date: "2026-02-21", opp: "Lakeside", start: "Ace", inputs: 2, logLoc: true },
  { date: "2026-02-28", opp: "Riverton", start: "Lefty", pen: "Pen", changeAt: 5, inputs: 2, logLoc: true },
  { date: "2026-03-07", opp: "Hillcrest", start: "Kid", pen: "Pen", changeAt: 4, inputs: 2, logLoc: true },
  { date: "2026-03-14", opp: "Lakeside", start: "Ace", inputs: 1, logLoc: true },                        // results only: no contact
  { date: "2026-03-21", opp: "Riverton", start: "Lefty", inputs: 2, logLoc: false },                     // no locations
  { date: "2026-03-28", opp: "Hillcrest", start: "Ace", pen: "Kid", changeAtPitch: 70, inputs: 3, logLoc: true, pCoach: 0.1, pShake: 0.1 },   // full detail
  { date: "2026-04-04", opp: "Lakeside", start: "Pen", inputs: 2, logLoc: true },
  { date: "2026-04-11", opp: "Riverton", start: "Lefty", pen: "Pen", changeAt: 5, inputs: 2, logLoc: true, offline: true },   // no signal, synced later
  { date: "2026-04-18", opp: "Hillcrest", start: "Ace", inputs: 2, logLoc: true, pNoLoc: 0.3 },
  { date: "2026-04-25", opp: "Lakeside", start: "Kid", pen: "Lefty", changeAt: 4, inputs: 2, logLoc: true },
  // fall: the season so far
  { date: "2026-09-19", opp: "Riverton", start: "Ace", inputs: 2, logLoc: true },
  { date: "2026-10-03", opp: "Hillcrest", start: "Lefty", inputs: 2, logLoc: true, oldApp: true },      // main's game app, before Build 1
  { date: "2026-10-17", opp: "Lakeside", start: "Ace", pen: "Pen", changeAt: 5, inputs: 2, logLoc: true },
];

(async () => {
  let S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  log("(resetting the local database: migrations applied fresh)");
  execFileSync("npx", [...CLI, "db", "reset", "--local"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  S = status();
  const API = S.API_URL, PUB = S.PUBLISHABLE_KEY, SECRET = S.SECRET_KEY;
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  const http = async (method, url, { key = PUB, token, body } = {}) => {
    for (let i = 0; ; i++) {
      const res = await fetch(API + url, { method, headers: { apikey: key, authorization: `Bearer ${token || key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => null);
      if (res.status === 503 && i < 20) { await wait(500); continue; }
      if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
      return json;
    }
  };
  const USERS = ["coach", "pcoach", "viewer", "ace", "lefty", "kid", "parent", "outsider"], U = {};
  for (const n of USERS) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokens = {};
  const tokenOf = async (n) => tokens[n] || (tokens[n] = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token);
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const team = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);
  for (const [who, role] of [["pcoach", "pitching"], ["viewer", "viewer"]]) await rpc(who, "pc_accept_invite", { tok: await rpc("coach", "pc_invite", { p: team, member_role: role, pitcher: null, invite_email: null, under13: false }) });

  const mail = await fakeMail.start({ port: MAIL_PORT });
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production", SITE_URL: SITE,
      RESEND_API_KEY: "re_test_local", RESEND_FAKE_API: `http://127.0.0.1:${MAIL_PORT}`, EMAIL_FROM: "PitchIQ <reports@test.local>", CRON_SECRET: CRON }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const at = (date) => new Date(`${date}T18:30:00-04:00`);
  const out = { team, org, site: SITE, api: API, users: Object.fromEntries(USERS.map((n) => [n, { id: U[n], email: `${n}@test.local` }])), password: PASS, pitchers: {}, catchers: {}, opponents: {}, games: [] };
  try {
    // ---------------------------------------------------------------- the coach's iPad: sign in, set up the roster
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript(seededRandomInit, 2026);
    const page = await ctx.newPage();
    await page.clock.setSystemTime(at("2026-02-14"));
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(SITE + "/app/game/");
    await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 20000 });
    await page.waitForFunction(() => typeof SYNC !== "undefined" && SYNC.cfg && SYNC.cfg.managed, null, { timeout: 10000 });
    await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(300);
    await page.locator("#sync-email").fill("coach@test.local"); await page.locator("#sync-pass").fill(PASS);
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /RIT Tigers/ }).click(); await page.waitForTimeout(2500);
    if (!/RIT Tigers as head coach/.test(await page.locator("main").innerText())) throw new Error("the coach didn't get onto the team in the game app");
    const ids = await page.evaluate(async ({ ARS, NAMES, HANDS, OPP, BATS }) => {
      const r = { pitchers: {}, catchers: {}, opponents: {} };
      for (const k of Object.keys(ARS)) {
        const p = PCDB.newPitcher(ourTeam().id, { name: NAMES[k], hand: HANDS[k], number: String({ Ace: 21, Lefty: 34, Kid: 7, Pen: 45 }[k]) });
        p.pitches = ARS[k].map((d) => PCDB.newPitch(d.type, Object.assign({}, d)));
        const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np); r.pitchers[k] = np.id;
      }
      for (const [nm, block] of [["Luis Molina", 4], ["Ben Carter", 3]]) { const c = await dbPut("catchers", { name: nm, block }); DB.catchers.set(c.id, c); r.catchers[nm] = c.id; }
      for (const [tn, hs] of Object.entries(OPP)) {
        const t = await dbPut("teams", { name: tn, isOurs: false, level: "college_d3", notes: "" }); DB.teams.set(t.id, t); r.opponents[tn] = { id: t.id, hitters: [] };
        for (let i = 0; i < hs.length; i++) { const h = await dbPut("hitters", PCDB.newHitter(t.id, { name: hs[i], bats: BATS[i], number: String(i + 1) })); DB.hitters.set(h.id, h); r.opponents[tn].hitters.push(h.id); }
      }
      await syncNow(true);
      return r;
    }, { ARS, NAMES, HANDS, OPP, BATS });
    Object.assign(out, ids);
    log(`roster: ${Object.keys(ids.pitchers).length} pitchers, ${Object.keys(ids.catchers).length} catchers, ${Object.keys(ids.opponents).length} opponents`);

    // players: each linked to his pitcher record; the under-18 player's parent is marked by the head coach
    for (const [who, k] of [["ace", "Ace"], ["lefty", "Lefty"], ["kid", "Kid"]]) {
      const tok = await rpc("coach", "pc_invite", { p: team, member_role: "player", pitcher: ids.pitchers[k], invite_email: null, under13: false });
      await rpc(who, "pc_accept_invite", { tok });
    }
    await rpc("coach", "pc_set_minor18", { p: team, pitcher: ids.pitchers.Kid, parent_email: "parent@test.local" });

    // ---------------------------------------------------------------- the season
    const playOne = async (pg, g, i) => {
      await pg.clock.setSystemTime(at(g.date));
      await pg.evaluate(({ g, ids, i }) => {
        const staff = [ids.pitchers[g.start]].concat(g.pen ? [ids.pitchers[g.pen]] : []);
        S.setup.staffIds = staff; attachStaff();
        S.setup.catcherId = i % 4 === 3 ? ids.catchers["Ben Carter"] : ids.catchers["Luis Molina"];
        S.setup.level = "college_d3"; S.setup.logLoc = g.logLoc; S.setup.inputs = g.inputs;
        S.setup.lineup.forEach((b) => { b.hitterId = null; b.name = ""; });
        useOpponent(ids.opponents[g.opp].id);
        S.game = newGame(); S.view = "live"; G().pitcher = 0; save(); render();
      }, { g, ids, i });
      const r = await pg.evaluate(playGame, Object.assign({ seed: 9001 + i * 7919, truth: TRUTH, innings: g.pen ? 7 : 6, maxPitches: 150 }, g));
      const game = await pg.evaluate(async (date) => { const gs = (await DB.D.all("games")).filter((x) => x.date === date).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)); return gs[0] && { id: gs[0].id, date: gs[0].date, pitches: gs[0].pitches, status: gs[0].status }; }, g.date);
      return { ...r, game };
    };
    let offlinePending = null;
    for (let i = 0; i < GAMES.length; i++) {
      const g = GAMES[i];
      if (g.oldApp) continue;   // below, on the second iPad
      if (offlinePending && i === offlinePending.i + 1) {   // the signal's back: the offline game goes up before the next one starts
        await page.evaluate(() => syncNow(true)); await wait(300);
        log(`  the offline game ${offlinePending.game.id} synced before game ${i + 1}`);
      }
      if (g.offline) await ctx.setOffline(true);
      const r = await playOne(page, g, i);
      if (g.offline) {
        const s0 = await page.evaluate(() => syncNow(true));
        offlinePending = { i, game: r.game, failedWhileOffline: s0 === null };
        await ctx.setOffline(false);
        log(`game ${i + 1} ${g.date}: ${r.pitches} pitches, charted with no signal (not synced yet)`);
        continue;
      }
      await page.evaluate(() => syncNow(true));
      out.games.push({ n: i + 1, ...g, id: r.game.id, pitches: r.pitches, located: r.located });
      log(`game ${i + 1} ${g.date} vs ${g.opp}: ${r.pitches} pitches (${Math.round((r.located || 0) * 100)}% located)`);
    }
    if (offlinePending) out.games.push({ n: offlinePending.i + 1, ...GAMES[offlinePending.i], id: offlinePending.game.id, pitches: offlinePending.game.pitches, failedWhileOffline: offlinePending.failedWhileOffline });
    if (errs.length) log("page errors on the coach's iPad: " + errs.join(" | "));

    // ---------------------------------------------------------------- a second iPad on main's game app (no Build 1 fields)
    const gi = GAMES.findIndex((g) => g.oldApp);
    {
      const oldDist = execFileSync("git", ["show", "8ee2fdc:app/dist/pitch-caller.html"], { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
      const newDist = fs.readFileSync(path.join(ROOT, "app/dist/pitch-caller.html"), "utf8");
      const shell = await (await fetch(SITE + "/app/game/")).text();
      if (!shell.includes(newDist)) throw new Error("the served game app isn't this build's app/dist (run npm run build in web/)");
      const oldShell = shell.split(newDist).join(oldDist);
      // served from a real localhost server (a proxy to the site with only /app/game/ swapped): a page injected with
      // route.fulfill counts as a public address to Chrome, which then blocks its calls to the loopback Supabase
      const proxy = require("http").createServer((req, res) => {
        if (req.url.split("?")[0] === "/app/game/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(oldShell); }
        const chunks = []; req.on("data", (d) => chunks.push(d));
        req.on("end", async () => {
          const r = await fetch(SITE + req.url, { method: req.method, headers: { ...req.headers, host: `localhost:${PORT}` }, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: "manual" });
          const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) h[k] = v; });
          res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
        });
      });
      await new Promise((r) => proxy.listen(PORT + 2, "127.0.0.1", r));
      const c2 = await browser.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
      await c2.addInitScript(seededRandomInit, 77);
      const p2 = await c2.newPage();
      // two hours before the game: the clock only ever moves forward on an iPad (a rewound clock stamps new pitches before
      // its own last sync, and they'd never be sent)
      await p2.clock.setSystemTime(new Date(at(GAMES[gi].date).getTime() - 2 * 3600e3));
      const e2 = []; p2.on("pageerror", (e) => e2.push(String(e)));
      await p2.goto(`http://127.0.0.1:${PORT + 2}/app/game/`);
      await p2.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 20000 });
      await p2.waitForFunction(() => typeof SYNC !== "undefined" && SYNC.cfg && SYNC.cfg.managed, null, { timeout: 10000 });
      await p2.locator(".tabs button", { hasText: "Setup" }).click(); await p2.waitForTimeout(300);
      await p2.locator("#sync-email").fill("pcoach@test.local"); await p2.locator("#sync-pass").fill(PASS);
      await p2.getByRole("button", { name: "Sign in" }).click(); await p2.waitForTimeout(1500);
      await p2.getByRole("button", { name: /RIT Tigers/ }).click(); await p2.waitForTimeout(3000);
      const appV = await p2.evaluate(() => APP_VERSION);
      const r = await playOne(p2, GAMES[gi], gi);
      const sres = await p2.evaluate(async () => { const r = await syncNow(true); return r && { applied: r.push.applied, rejected: r.push.rejected.length }; });
      out.games.push({ n: gi + 1, ...GAMES[gi], id: r.game.id, pitches: r.pitches, oldAppVersion: appV, oldAppSync: sres });
      log(`game ${gi + 1} ${GAMES[gi].date}: ${r.pitches} pitches on main's game app (${appV}); sync: ${JSON.stringify(sres)}${e2.length ? "; page errors: " + e2.join(" | ") : ""}`);
      await c2.close(); proxy.close();
    }
    out.games.sort((a, b) => a.n - b.n);

    // the coach's iPad pulls everything once more (the second iPad's game comes down to it)
    await page.clock.setSystemTime(at("2026-10-20"));
    await page.evaluate(() => syncNow(true));

    // ---------------------------------------------------------------- Spring marked over (backdated to May 31), then the report run
    await db.query("insert into public.seasons (program_id, name, start_date, end_date, ended_at, ended_by) values ($1, 'Spring 2026', '2026-02-21', '2026-05-31', '2026-05-31T22:00:00Z', $2)", [team, U.coach]);
    const run = await (await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } })).json();
    log(`report run (daily cron path): ${JSON.stringify(run)}`);
    out.spring = (await db.query("select id from public.seasons where program_id = $1", [team])).rows[0].id;

    // ---------------------------------------------------------------- coach notes and public links
    const evRows = (await db.query("select game_id, doc from public.events where program_id = $1 and deleted_at is null and coalesce(doc->>'type','pitch') = 'pitch'", [team])).rows;
    const firstAb = (gid, pid) => evRows.filter((r) => r.game_id === gid && r.doc.pitcherId === pid).map((r) => r.doc.n).sort((a, b) => a - b)[0];
    const notes = [];
    const note = async (gi_, k, scope, body, shared) => {
      const gid = out.games[gi_].id, pid = ids.pitchers[k];
      const row = { program_id: team, game_id: gid, pitcher_id: pid, scope, at_bat: scope === "atbat" ? String(firstAb(gid, pid)) : null, body, shared };
      const r = await http("POST", "/rest/v1/report_notes", { token: await tokenOf("coach"), body: row });
      notes.push({ gid, pid, scope, shared });
      return r;
    };
    await note(0, "Ace", "outing", "Fastball had life early. Lost the slider's shape in the 5th; worth a look in his next pen.", true);
    await note(0, "Ace", "atbat", "Leadoff: we went away three times. Next time show him one in.", false);
    await note(0, "Ace", "outing", "Staff only: watch his pitch count after 80; mechanics slipped.", false);
    await note(2, "Kid", "outing", "Good poise for his first start. Slider command is the next step.", true);
    await note(10, "Ace", "atbat", "Great sequence: fastball up, slider away.", true);
    out.notes = notes;
    out.shares = {};
    out.shares.ace = await rpc("ace", "pc_share_create", { p: team, pitcher: ids.pitchers.Ace, season: out.spring });
    await rpc("ace", "pc_share_sections", { tok: out.shares.ace, secs: { summary: true, heat: true, pitches: false, outings: true } });
    out.shares.kid = await rpc("kid", "pc_share_create", { p: team, pitcher: ids.pitchers.Kid, season: null });
    const held = (await db.query("select game_id, count(*)::int n from public.events where program_id = $1 and deleted_at is null and coalesce(doc->>'type','pitch') = 'pitch' group by game_id", [team])).rows;
    for (const g of out.games) { g.onServer = (held.find((h) => h.game_id === g.id) || {}).n || 0; if (g.onServer !== g.pitches) log(`WARNING: game ${g.n} charted ${g.pitches} pitches but the server holds ${g.onServer}`); }
    out.mail = mail.inbox.map((m) => ({ to: m.to, subject: m.subject }));
    out.checks = {
      events: evRows.length, withMix: evRows.filter((r) => Array.isArray(r.doc.mix)).length,
      oldAppEvents: evRows.filter((r) => r.game_id === out.games[gi].id).length,
      oldAppWithMix: evRows.filter((r) => r.game_id === out.games[gi].id && Array.isArray(r.doc.mix)).length,
      coachCalls: evRows.filter((r) => r.doc.choice === "coach").length, recalls: evRows.filter((r) => r.doc.choice === "recall").length,
      crossUps: evRows.filter((r) => r.doc.thrown && r.doc.thrown !== r.doc.pitchName).length,
      noLocation: evRows.filter((r) => !Array.isArray(r.doc.locCell)).length,
      bipNoContact: evRows.filter((r) => r.doc.res === "play" && !r.doc.contact).length,
      twoPitcherGames: new Set(evRows.map((r) => r.game_id + "|" + r.doc.pitcherId)).size - new Set(evRows.map((r) => r.game_id)).size,
    };
    log(`events: ${JSON.stringify(out.checks)}`);
    log(`emails so far: ${mail.inbox.length}`);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    log(`wrote ${OUT}`);
    await ctx.close();
  } finally {
    await browser.close();
    if (process.env.KEEP_SERVER) { log(`site left running at ${SITE} (pid ${web.pid}); mail inbox at http://127.0.0.1:${MAIL_PORT}/emails`); }
    else { web.kill(); await mail.close(); }
    await db.end();
    if (/Error|failed/i.test(webLog)) fs.writeFileSync(OUT.replace(/\.json$/, ".server.log"), webLog);
  }
  if (!process.env.KEEP_SERVER) process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
