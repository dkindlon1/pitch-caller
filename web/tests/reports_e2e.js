/*
 * Build 1: the reports end to end on the built site and the LOCAL Supabase, on top of the seeded season
 * (node web/tests/season_seed.js first; it writes C:/dev/pitch-caller-logs/season.json). It changes that season:
 * notes, link states, a new game and "Mark season over" (re-seed before screenshots).
 *   1. Each role in a real browser: the head coach (everything), a viewer (reads, can't write notes), a pitcher (his own
 *      reports only: no overrides, no staff notes, no hitters' names; staff and other pitchers' pages refused).
 *   2. Signed out: a public recap shows only its chosen sections; an under-18 player's link is dead until his parent
 *      approves it on /app/approve; a revoked link is dead.
 *   3. Notes: a coach writes one shared, one staff-only; the pitcher sees only the shared one.
 *   4. Email: a game charted in the game app, End game, sync: the pitcher gets one outing email and each coach one game
 *      email, nobody else, and running again sends nothing more. Mark season over in Settings: each pitcher who pitched
 *      gets his final recap email and each coach one, once; the recaps are frozen.
 * Run from the repo root after `npm run build` in web/:  node web/tests/reports_e2e.js
 */
const { chromium } = require("playwright");
const fakeMail = require("./fake_resend");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");
const { playGame } = require("../../app/chart_driver");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3201, SITE = `http://localhost:${PORT}`, MAIL = PORT + 1, CRON = "e2e-cron";
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const T = season.team, P = season.pitchers, G = season.games, PASS = season.password;
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", ["-y", "supabase@2.122.1", "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());

(async () => {
  const S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  if (!(await db.query("select 1 from public.programs where id = $1", [T])).rows.length) throw new Error("the seeded season isn't in the local database: run web/tests/season_seed.js first");
  const mail = await fakeMail.start({ port: MAIL });
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: S.API_URL, SUPABASE_PUBLISHABLE_KEY: S.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: S.SECRET_KEY, NODE_ENV: "production", SITE_URL: SITE,
      RESEND_API_KEY: "re_test_e2e", RESEND_FAKE_API: `http://127.0.0.1:${MAIL}`, EMAIL_FROM: "PitchIQ <reports@test.local>", CRON_SECRET: CRON }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }
  const browser = await chromium.launch();
  const ctxs = {};
  const as = async (who) => {
    if (ctxs[who]) return ctxs[who];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
    if (who !== "anon") {
      await page.goto(SITE + "/login?next=/app");
      const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(PASS);
      await f.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
    }
    return (ctxs[who] = { ctx, page });
  };
  const open = async (who, url) => { const { page } = await as(who); const r = await page.goto(SITE + url, { waitUntil: "networkidle" });
    return { page, status: r ? r.status() : 0, html: await page.content(), text: await page.locator("body").innerText().catch(() => ""), url: page.url() }; };
  const g1 = G.find((g) => g.n === 1).id, g6 = G.find((g) => g.n === 6).id, g3 = G.find((g) => g.n === 3).id;
  const hitterNames = Object.values(season.opponents).length ? ["Ruiz", "Chen", "Patel", "Okafor", "Vega", "Stone", "Hayes", "Silva"] : [];
  const oppNames = Object.keys(season.opponents);
  try {
    console.log("1. Each role");
    let r = await open("coach", `/app/t/${T}/reports/${g6}/${P.Ace}`);
    check(r.status === 200 && /Overrides and style/.test(r.html) && /Hitter by hitter/.test(r.html) && /Heat maps/.test(r.html) && /Outcome tracking/.test(r.html), "the head coach's outing report: every section, overrides included");
    check(/Add a note/.test(r.text) && /Eli Brooks.s report/.test(r.text), "he can write notes; the game's other pitcher is one click away");
    r = await open("coach", `/app/t/${T}/reports/${g6}`);
    check(r.status === 200 && /Game summary/.test(r.html) && /Staff line/.test(r.html) && (r.html.match(/Outing report<\/a>/g) || []).length === 2, "the game summary: the staff line and both pitchers' reports");
    r = await open("viewer", `/app/t/${T}/reports/${g6}/${P.Ace}`);
    check(r.status === 200 && /Overrides and style/.test(r.html) && !/Save note/.test(r.html), "a viewer reads the staff report but gets no note form");
    r = await open("ace", `/app/t/${T}/reports/${g6}/${P.Ace}`);
    check(!r.url.includes("/reports/") && !/Overrides and style/.test(r.html), `a pitcher sent to the staff report doesn't get it (went to ${new URL(r.url).pathname})`);
    r = await open("ace", `/app/me/${T}/${P.Ace}/outings/${g1}`);
    check(r.status === 200 && /Hitter by hitter/.test(r.html) && !/Overrides and style/.test(r.html) && !/coach.s call/i.test(r.html), "his own report: no overrides, no coach's-call marks");
    check(!hitterNames.some((n) => r.html.includes(`>${n}<`) || r.html.includes(` ${n}<`)) && /Batting 1/.test(r.html), "hitters are their batting slot, never a name");
    check(/Fastball had life early/.test(r.html) && !/Staff only: watch his pitch count/.test(r.html) && !/Leadoff: we went away/.test(r.html), "the shared note shows; the staff-only outing and at-bat notes don't");
    r = await open("ace", `/app/me/${T}/${P.Lefty}/outings/${G.find((g) => g.n === 2).id}`);
    check(!/Hitter by hitter|Pitch mix and results/.test(r.text) && /got away/i.test(r.text), "another pitcher's report: the not-found page, none of his data");
    r = await open("ace", `/app/t/${T}/opponents/${season.opponents.Lakeside.id}/hitters/${season.opponents.Lakeside.hitters[0]}`);
    check(!/Every at-bat/.test(r.html), "a player never reaches a hitter page");
    r = await open("kid", `/app/me/${T}/${P.Kid}/outings/${g3}`);
    check(r.status === 200 && /Good poise for his first start/.test(r.html), "the under-18 player reads his own report and the note shared with him");

    console.log("2. Signed out");
    r = await open("anon", `/r/${season.shares.ace}`);
    check(r.status === 200 && /Season line/.test(r.html) && /Heat maps/.test(r.html) && /Outings/.test(r.html) && !/Pitch by pitch/.test(r.html), "the adult's public recap: the sections he chose (summary, heat maps, outings), not pitch by pitch");
    check(!oppNames.some((n) => r.html.includes(n)) && !/Fastball had life|Staff only|Overrides|coach.s call/.test(r.html), "no opponents, notes, overrides or style on it");
    r = await open("anon", `/r/${season.shares.kid}`);
    check(r.status === 404, `the under-18 player's link is dead before his parent approves (${r.status})`);
    r = await open("parent", "/app/approve");
    check(/Eli Brooks/.test(r.html) && /Waiting for you/.test(r.html), "his parent sees the request on /app/approve");
    await r.page.getByRole("button", { name: "Approve and turn it on" }).click(); await r.page.waitForLoadState("networkidle"); await wait(400);
    r = await open("anon", `/r/${season.shares.kid}`);
    check(r.status === 200 && /Eli Brooks/.test(r.html), "approved: the link is live");
    r = await open("parent", "/app/approve");
    await r.page.getByRole("button", { name: "Turn it off" }).click(); await r.page.waitForLoadState("networkidle"); await wait(400);
    check((await open("anon", `/r/${season.shares.kid}`)).status === 404, "the parent turns it off: dead again");
    r = await open("ace", `/app/me/${T}/${P.Ace}/recap/${season.spring}`);
    check(/Public link/.test(r.html) && /Live/.test(r.html), "his link shows as live on his final recap");
    const pdf = await (await as("anon")).page.request.get(`${SITE}/r/${season.shares.ace}/pdf`);
    check(pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf" && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "the public PDF downloads");
    await r.page.getByRole("button", { name: "Turn the link off for good" }).click(); await r.page.getByRole("button", { name: "Yes, turn it off for good" }).click(); await r.page.waitForLoadState("networkidle"); await wait(600);
    check((await open("anon", `/r/${season.shares.ace}`)).status === 404 && (await (await as("anon")).page.request.get(`${SITE}/r/${season.shares.ace}/pdf`)).status() === 404, "revoked: the page and its PDF are dead");

    console.log("3. Notes");
    r = await open("coach", `/app/t/${T}/reports/${g1}/${P.Ace}`);
    const form = r.page.locator("#h-notes").locator("xpath=ancestor::section").locator("form.rp-noteform");
    const writeNote = async (body, share) => {
      const sum = r.page.locator("#h-notes").locator("xpath=ancestor::section").locator("summary");
      if (await sum.count() && !(await form.isVisible())) await sum.first().click();
      await form.locator("textarea").fill(body); if (share) await form.getByLabel("Share with the pitcher").check();
      await form.getByRole("button", { name: "Save note" }).click(); await r.page.waitForTimeout(1200);
    };
    await writeNote("E2E shared: keep the changeup down.", true);
    await writeNote("E2E staff only: shoulder looked tight.", false);
    const mineNow = await open("ace", `/app/me/${T}/${P.Ace}/outings/${g1}`);
    check(/E2E shared: keep the changeup down/.test(mineNow.html) && !/E2E staff only/.test(mineNow.html), "the pitcher sees the shared note, not the staff-only one");

    console.log("4. Email");
    const inbox0 = mail.inbox.length;
    {   // a new game on the coach's iPad (today), one inning, End game, sync
      const c = await browser.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" }), p = await c.newPage();
      await p.goto(SITE + "/app/game/"); await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 20000 });
      await p.waitForFunction(() => typeof SYNC !== "undefined" && SYNC.cfg && SYNC.cfg.managed, null, { timeout: 10000 });
      await p.locator(".tabs button", { hasText: "Setup" }).click(); await p.waitForTimeout(300);
      await p.locator("#sync-email").fill("coach@test.local"); await p.locator("#sync-pass").fill(PASS);
      await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForTimeout(1500);
      await p.getByRole("button", { name: /RIT Tigers/ }).click(); await p.waitForTimeout(3500);
      await p.evaluate(({ ace, opp }) => { S.setup.staffIds = [ace]; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = true; S.setup.inputs = 2; useOpponent(opp); S.game = newGame(); S.view = "live"; save(); render(); }, { ace: P.Ace, opp: season.opponents.Riverton.id });
      await p.evaluate(playGame, { seed: 4242, innings: 1, maxPitches: 40 });
      await p.evaluate(() => syncNow(true)); await wait(4000);
      await c.close();
    }
    const fresh = mail.inbox.slice(inbox0);
    const to = (subj) => fresh.filter((m) => m.subject.startsWith(subj)).map((m) => m.to[0]).sort();
    check(JSON.stringify(to("Your outing report is ready")) === JSON.stringify(["ace@test.local"]), `the pitcher gets one outing email (${to("Your outing report is ready").join(", ")})`);
    check(JSON.stringify(to("Outing reports are ready")) === JSON.stringify(["coach@test.local", "pcoach@test.local", "viewer@test.local"]), `each coach gets one game email (${to("Outing reports are ready").join(", ")})`);
    check(!fresh.some((m) => /lefty|kid|parent|outsider/.test(m.to[0])), "nobody else: not the other pitchers, the parent or an outsider (catchers have no account)");
    const link = (fresh.find((m) => m.subject.startsWith("Your outing report")) || {}).text || "";
    check(/\/app\/me\/[0-9a-f-]{36}\/[\w-]+\/outings\/gam_/.test(link), "the pitcher's email links to his own report");
    const again = await (await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } })).json();
    check(again.outingMails === 0 && again.summaryMails === 0 && mail.inbox.length === inbox0 + fresh.length, `the daily run sends nothing again (${JSON.stringify(again)})`);
    check((await fetch(SITE + "/api/reports/run")).status === 401 && (await fetch(SITE + "/api/reports/run", { method: "POST", body: JSON.stringify({ team: T }) })).status === 400, "the run refuses callers without the cron secret or a team member's token");

    const inbox1 = mail.inbox.length;
    r = await open("coach", `/app/t/${T}/settings`);
    await r.page.getByLabel("Season name").fill("Fall 2026");
    await r.page.getByRole("button", { name: "Mark season over" }).click(); await r.page.getByRole("button", { name: /Yes, mark it over/ }).click(); await r.page.waitForURL(/ok=season|error=/, { timeout: 60000 }).catch(() => {});
    check(/ok=season/.test(r.page.url()), `Mark season over (${new URL(r.page.url()).search})`);
    const fall = (await db.query("select id from public.seasons where program_id = $1 and name = 'Fall 2026'", [T])).rows[0];
    const frozen = fall ? (await db.query("select pitcher_id from public.recap_versions where season_id = $1 order by pitcher_id", [fall.id])).rows.map((x) => x.pitcher_id) : [];
    const pitched = (await db.query("select distinct e.pitcher_id from public.events e join public.games g on g.program_id = e.program_id and g.id = e.game_id where e.program_id = $1 and g.doc->>'date' >= '2026-06-01' and e.deleted_at is null and e.pitcher_id is not null order by 1", [T])).rows.map((x) => x.pitcher_id);
    check(frozen.length > 0 && JSON.stringify(frozen) === JSON.stringify(pitched), `a frozen recap for each pitcher who pitched in the fall (${frozen.length})`);
    const recapMail = mail.inbox.slice(inbox1);
    const rto = (subj) => recapMail.filter((m) => m.subject.startsWith(subj)).map((m) => m.to[0]).sort();
    const linked = { [P.Ace]: "ace@test.local", [P.Lefty]: "lefty@test.local", [P.Kid]: "kid@test.local" };
    check(JSON.stringify(rto("Your final recap is ready")) === JSON.stringify(pitched.map((id) => linked[id]).filter(Boolean).sort()), `each pitcher with an account gets his final recap once (${rto("Your final recap is ready").join(", ")})`);
    check(JSON.stringify(rto("Final recaps are ready")) === JSON.stringify(["coach@test.local", "pcoach@test.local", "viewer@test.local"]), "each coach gets one final-recaps email");
    const third = await (await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } })).json();
    check(third.recapMails === 0 && third.frozen === 0, "running again freezes and sends nothing more");
    r = await open("ace", `/app/me/${T}/${P.Ace}/recap`);
    check(/Your season so far/.test(r.html) && /Fall 2026/.test(r.html), "his season so far starts over; Fall 2026 is listed with his final recaps");
  } finally {
    await browser.close(); web.kill(); await mail.close(); await db.end();
    if (/Error|failed/i.test(webLog)) fs.writeFileSync("C:/dev/pitch-caller-logs/reports_e2e.server.log", webLog);
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} reports e2e check(s) FAILED`); process.exit(1); }
  console.log("reports e2e: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
