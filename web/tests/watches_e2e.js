/*
 * Build 4: the team's watch list in the portal (docs/PLAN_watch_security_2026-11-18.md 2.8), against a real local
 * Supabase and the built site. A pitch caller registers two paired watches (as the game app does after pairing); the
 * head coach sees them in Settings → Watches, removes one through its confirm step, and it shows as removed; the caller
 * can't put it back; the game app's list call says it's removed (the app then never sends it a key: app/watch_test.js
 * section 9). Screens at 1440 and 390 wide -> C:/dev/pitch-caller-shots/build4/.
 * Run from the repo root after `npm run build` in web/, with the local Supabase running: node web/tests/watches_e2e.js
 */
const { Client } = require("pg");
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3196, SITE = `http://localhost:${PORT}`;
const CLI = ["-y", "supabase@2.122.1"], PASS = "test-pass-1234", SHOTS = "C:/dev/pitch-caller-shots/build4";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", [...CLI, "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());

(async () => {
  let S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  console.log("(resetting the local database: migrations applied fresh)");
  execFileSync("npx", [...CLI, "db", "reset", "--local"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  S = status();
  const API = S.API_URL, SECRET = S.SECRET_KEY, PUB = S.PUBLISHABLE_KEY;
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  const admin = { apikey: SECRET, authorization: `Bearer ${SECRET}`, "content-type": "application/json" };
  const mkUser = async (n) => (await (await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email: `${n}@test.local`, password: PASS, email_confirm: true }) })).json()).id;
  const token = async (n) => (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PUB, "content-type": "application/json" }, body: JSON.stringify({ email: `${n}@test.local`, password: PASS }) })).json()).access_token;
  const rpc = async (tok, name, body) => { const r = await fetch(`${API}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: PUB, authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const U = { head: await mkUser("head"), caller: await mkUser("caller") };
  const T = { head: await token("head"), caller: await token("caller") };
  const org = (await rpc(T.head, "pc_create_org", { name: "Tigers Org", level: "college_d3" })).body;
  const team = (await rpc(T.head, "pc_create_team", { org, name: "Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" })).body;
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);
  await db.query("insert into public.members (program_id, user_id, role) values ($1, $2, 'caller')", [team, U.caller]);
  // the game app, after pairing: register two watches
  let r = await rpc(T.caller, "pc_watch_register", { p: team, watch_id: "dev-AAAA1111", name: "Bangle.js 1a2b", role: "pitcher" });
  const r2 = await rpc(T.caller, "pc_watch_register", { p: team, watch_id: "dev-BBBB2222", name: "Bangle.js 3c4d", role: "catcher" });
  check(r.body && r.body.ok && r2.body && r2.body.ok, "the game app (a pitch caller) registers two paired watches");

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production", SITE_URL: SITE }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }
  const browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });
  try {
    const signIn = async (who, w = 1440, h = 900) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" }), page = await ctx.newPage();
      await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(PASS); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
      return { ctx, page };
    };
    const head = await signIn("head");
    await head.page.goto(`${SITE}/app/t/${team}/settings`, { waitUntil: "networkidle" });
    const sec = head.page.getByRole("region", { name: "Watches" });
    check(await sec.getByText("Bangle.js 1a2b", { exact: true }).count() === 1 && await sec.getByText("Bangle.js 3c4d", { exact: true }).count() === 1, "Settings → Watches lists both");
    check(await sec.getByText("Pitcher's watch").count() === 1 && await sec.getByText("Catcher's watch").count() === 1, "with their roles");
    await head.page.screenshot({ path: path.join(SHOTS, "settings-watches__1440.png"), fullPage: true });
    await sec.getByText("Remove…").first().click();
    const confirm = sec.getByRole("button", { name: "Remove Bangle.js 1a2b" });
    check(await confirm.isVisible() && await sec.locator("details[open]").getByText(/won.t get another game key/).isVisible(), "Remove asks first, saying what it does");
    await head.page.screenshot({ path: path.join(SHOTS, "settings-watches-confirm__1440.png"), fullPage: true });
    await confirm.click(); await head.page.waitForURL(/ok=watch_removed|error=/, { timeout: 15000 }); await head.page.waitForLoadState("networkidle");
    check(/won.t get another game key; it has to be paired again/.test(await head.page.locator("main").innerText()), "removed: the notice says it has to be paired again");
    check(await sec.getByText(/removed/).count() >= 1 && await sec.getByRole("button", { name: "Remove Bangle.js 1a2b" }).count() === 0, "it shows as removed, with no Remove button");
    const row = (await db.query("select removed_at is not null removed, removed_by from public.team_watches where watch_id = 'dev-AAAA1111'")).rows[0];
    check(row.removed && row.removed_by === U.head, "the database marks it removed, by the head coach");
    await head.page.screenshot({ path: path.join(SHOTS, "settings-watches-removed__1440.png"), fullPage: true });
    await head.ctx.close();

    const list = (await rpc(T.caller, "pc_watch_list", { p: team })).body;
    check(Array.isArray(list) && list.find((w) => w.watch_id === "dev-AAAA1111").removed === true && list.find((w) => w.watch_id === "dev-BBBB2222").removed === false,
      "the game app's list call (as the caller) reports it removed: the app forgets it and never sends it a key");
    r = await rpc(T.caller, "pc_watch_register", { p: team, watch_id: "dev-AAAA1111", name: "Bangle.js 1a2b", role: "pitcher" });
    check(r.body && r.body.ok === false && r.body.removed === true, "the caller pairing it again can't put it back (the head coach can)");
    r = await rpc(T.caller, "pc_watch_remove", { p: team, watch_id: "dev-BBBB2222" });
    check(r.status >= 400, "a caller can't remove a watch");

    const phone = await signIn("head", 390, 844);
    await phone.page.goto(`${SITE}/app/t/${team}/settings`, { waitUntil: "networkidle" });
    const over = await phone.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await phone.page.getByRole("region", { name: "Watches" }).scrollIntoViewIfNeeded();
    await phone.page.screenshot({ path: path.join(SHOTS, "settings-watches__390.png"), fullPage: true });
    check(over === 0, `phone: no sideways scroll (${over})`);
    await phone.ctx.close();
  } finally {
    await browser.close(); web.kill(); await db.end();
  }
  if (fails && webLog) console.log(webLog.split("\n").slice(-20).join("\n"));
  console.log(fails ? `${fails} watches check(s) FAILED` : "watches e2e: all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
