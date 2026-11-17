/*
 * Screenshots of the game app's states that need a signed-in program (local Supabase only, the built site):
 * not-ready-offline, offline-in-game, back-online-syncing, synced, second-device-refused, each in night and day.
 * Run from the repo root after `npm run build` in web/ (or `node web/scripts/game-shell.mjs` for a fresh game app),
 * with `npx supabase@2.122.1 start` running. This RESETS the local database:
 *   node web/tests/app_state_shots.js
 * On Windows, if npx is not found: NODE_OPTIONS="--require=<path to an npx shim>" node web/tests/app_state_shots.js
 * Output: docs/app-v2-shots/build/game-p4/states/<state>__<night|day>.png (1180x820)
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3196, SITE = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, "docs/app-v2-shots/build/game-p4/states");
const CLI = ["-y", "supabase@2.122.1"];
const VIEW = { width: 1180, height: 820 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", [...CLI, "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  console.log("(resetting the local database: migrations applied fresh)");
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
  const PASS = "test-pass-1234";
  await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: "coach@test.local", password: PASS, email_confirm: true } });
  const token = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: "coach@test.local", password: PASS } })).access_token;
  const rpc = (fn, args) => http("POST", `/rest/v1/rpc/${fn}`, { token, body: args });
  const org = await rpc("pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const team = await rpc("pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const saved = [];
  // saves the current page in both themes, leaving it in the theme it started in
  const shoot = async (page, state) => {
    const startTheme = await page.evaluate(() => (S.theme === "day" ? "day" : "night"));
    for (const theme of [startTheme, startTheme === "night" ? "day" : "night"]) {
      if ((await page.evaluate(() => (S.theme === "day" ? "day" : "night"))) !== theme) {
        await page.locator('.bar button[aria-label^="Switch to the"]').click();
        if ((await page.evaluate(() => (S.theme === "day" ? "day" : "night"))) !== theme) throw new Error("theme switch did not take");
      }
      await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
      const f = path.join(OUT, `${state}__${theme}.png`);
      await page.screenshot({ path: f }); saved.push(path.basename(f)); console.log("  saved " + path.basename(f));
    }
    // back to night so the next state starts the same way
    if ((await page.evaluate(() => (S.theme === "day" ? "day" : "night"))) !== "night") await page.locator('.bar button[aria-label^="Switch to the"]').click();
  };
  try {
    const ctx = await browser.newContext({ viewport: VIEW, serviceWorkers: "allow" });
    const page = await ctx.newPage();
    const ready = () => page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
    const tab = async (name) => { await page.locator(".tabs button", { hasText: name }).click(); await page.waitForTimeout(250); };
    await page.goto(SITE + "/app/game/"); await ready();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => typeof SYNC !== "undefined" && SYNC.cfg && SYNC.cfg.managed, null, { timeout: 10000 }).catch(() => {});
    await tab("Setup");
    await page.locator("#sync-email").fill("coach@test.local"); await page.locator("#sync-pass").fill(PASS);
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /RIT Tigers/ }).click(); await page.waitForTimeout(2000);
    await page.locator("#rule-preset").selectOption("ps-19-22"); await page.waitForTimeout(400);

    console.log("1. not-ready-offline");
    await tab("Game");
    await page.locator("#prep-notice").waitFor({ timeout: 5000 });
    await shoot(page, "not-ready-offline");

    await tab("Setup");
    await page.locator("#prep-game").click(); await page.waitForFunction(() => !PREP_BUSY && PREP, null, { timeout: 15000 });
    await tab("Game");

    console.log("2. offline-in-game");
    await ctx.setOffline(true);
    await page.reload(); await ready();
    await page.evaluate(() => { S.view = "live"; G().call = null; save(); render(); });
    for (let i = 0; i < 3; i++) { await page.keyboard.press(["c", "b", "c"][i]); await page.waitForTimeout(150); }
    await page.waitForTimeout(600);
    await shoot(page, "offline-in-game");

    console.log("3. back-online-syncing, synced");
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(150);
    await shoot(page, "back-online-syncing");
    await page.evaluate(() => syncNow(true)); await page.waitForTimeout(1500);
    await shoot(page, "synced");

    console.log("4. second-device-refused");
    const gid = await page.evaluate(() => G().dbId);
    let live = null;
    for (let i = 0; i < 30; i++) { live = (await db.query("select doc from public.games where program_id = $1 and id = $2", [team, gid])).rows[0]?.doc; if (live && live.status === "live") break; await wait(500); }
    console.log("  game " + gid + " on the server: " + (live && live.status));
    const ctx2 = await browser.newContext({ viewport: VIEW });
    const other = await ctx2.newPage();
    await other.goto(SITE + "/login?next=/app"); await other.waitForLoadState("networkidle").catch(() => {});
    const f = other.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill("coach@test.local"); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await other.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {});
    await other.waitForLoadState("networkidle").catch(() => {});
    const agree = other.getByRole("form", { name: "Agree to the Terms" });
    if (await agree.count()) { await agree.getByRole("checkbox").first().check().catch(() => {}); await agree.getByRole("button").first().click(); await other.waitForLoadState("networkidle").catch(() => {}); }
    await other.goto(`${SITE}/app/t/${team}/games/${gid}/open`); await other.waitForURL(/\/app\/game\//, { timeout: 15000 });
    await other.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 30000 }).catch(() => {});
    let msg = "";
    for (let i = 0; i < 40; i++) { msg = await other.locator("main").innerText().catch(() => ""); if (/another device/.test(msg)) break; await wait(500); }
    if (!/being called on another device/.test(msg)) throw new Error("second device was not refused; main text: " + msg.slice(0, 200));
    await shoot(other, "second-device-refused");
  } finally {
    await browser.close(); web.kill(); await db.end();
  }
  console.log("saved: " + saved.join(", "));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
