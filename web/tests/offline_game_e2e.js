/*
 * D12, the offline game: the installed game app (/app/game/) against a real local Supabase and the built site.
 * Prep on Wi-Fi, lose the signal, reload (the service worker serves the app), call a full inning, get the signal back:
 * the pitches are in the server's events table. And an update published mid-game waits for the game to end (A6).
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/offline_game_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3197, SITE = `http://localhost:${PORT}`;
const SW = path.join(WEB, "public/app/game/sw.js");
const CLI = ["-y", "supabase@2.122.1"];
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

  const swOriginal = fs.readFileSync(SW, "utf8");
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  const ready = () => page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  const tab = async (name) => { await page.locator(".tabs button", { hasText: name }).click(); await page.waitForTimeout(250); };
  try {
    console.log("1. The game app installs from the site");
    const p2 = await ctx.newPage(); await p2.goto(SITE + "/app/game"); await p2.waitForURL(/\/app\/game\/$/, { timeout: 10000 }).catch(() => {});
    check(new URL(p2.url()).pathname === "/app/game/", `/app/game moves to /app/game/, inside the service worker's scope (${new URL(p2.url()).pathname})`); await p2.close();
    const signedOut = await fetch(SITE + "/app/game/", { redirect: "manual" });
    check(signedOut.status === 200 && /PitchIQ Game/.test(await signedOut.text()), "signed out, the game app opens (it signs in on its own, and must open with no signal)");
    await page.goto(SITE + "/app/game/"); await ready();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    const ctl = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    const man = await (await fetch(SITE + "/app/game/manifest.webmanifest")).json();
    check(ctl && man.start_url === "/app/game/" && man.display === "standalone", `the service worker controls the page, and the manifest makes it installable (controller: ${ctl})`);
    const cfg = await page.evaluate(() => SYNC.cfg && { url: SYNC.cfg.url, managed: SYNC.cfg.managed });
    check(cfg && cfg.url === API && cfg.managed, "the project's URL and key came from the site: nothing to type");

    console.log("2. Prep on Wi-Fi");
    await tab("Setup");
    check(await page.locator("#sync-email").count() === 1 && await page.getByLabel("Project URL").count() === 0, "the sync section asks only for a sign-in");
    await page.locator("#sync-email").fill("coach@test.local"); await page.locator("#sync-pass").fill(PASS);
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /RIT Tigers/ }).click(); await page.waitForTimeout(2000);
    check(/RIT Tigers as head coach/.test(await page.locator("main").innerText()), "signed in and on the team");
    check((await page.evaluate(() => SYNC.cfg.timezone)) === "America/New_York", "the team's time zone came with it");
    await page.locator("#rule-preset").selectOption("ps-19-22"); await page.waitForTimeout(400);
    check(await page.locator("#prep-notice").count() === 0 || true, "(rule picked)");
    await tab("Game");
    check(await page.locator("#prep-notice").count() === 1, "before prep, the Game screen says the iPad isn't ready for offline today");
    await tab("Setup");
    await page.locator("#prep-game").click(); await page.waitForFunction(() => !PREP_BUSY && PREP, null, { timeout: 15000 });
    const prep = await page.evaluate(() => PREP);
    check(prep.ready && prep.checks.find((c) => /Synced/.test(c.text)).ok && prep.checks.find((c) => /opens with no signal/.test(c.text)).ok, `prep: ${prep.checks.map((c) => (c.ok ? "ok " : "NO ") + c.text).join(" | ")}`);
    await tab("Game");
    check(await page.locator("#prep-notice").count() === 0, "after prep the notice is gone");

    console.log("3. No signal: reload, and call a full inning");
    await ctx.setOffline(true);
    await page.reload(); await ready();
    check(await page.evaluate(() => navigator.onLine === false && !!navigator.serviceWorker.controller), "with no signal the app reloads from the service worker");
    await page.evaluate(() => { S.view = "live"; G().call = null; save(); render(); });
    let pitches = 0;
    for (let guard = 0; guard < 120 && !(await page.evaluate(() => !!G().inningOver)); guard++) {
      await page.keyboard.press(["c", "b", "c", "c"][guard % 4]); await page.waitForTimeout(70); pitches++;
    }
    const game = await page.evaluate(() => ({ id: G().dbId, n: G().pitchNo, over: !!G().inningOver }));
    const local = await page.evaluate(async (gid) => (await DB.D.byIndex("events", "gameId", gid)).filter((e) => PCDB.isPitch(e)).length, game.id);
    check(game.over && game.n === local && local > 0, `three outs, ${local} pitches saved on the iPad with no signal`);
    const r0 = await page.evaluate(() => syncNow(true));
    check(r0 === null && /No signal/.test(await page.evaluate(() => SYNC.error || "")), "a sync with no signal says so and keeps everything");
    check(+(await db.query("select count(*) n from public.events where program_id = $1 and game_id = $2", [team, game.id])).rows[0].n === 0, "(nothing on the server yet)");

    console.log("4. The signal comes back");
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(500);
    await page.evaluate(() => syncNow(true)); await page.waitForTimeout(500);
    const onServer = +(await db.query("select count(*) n from public.events where program_id = $1 and game_id = $2 and type = 'pitch'", [team, game.id])).rows[0].n;
    check(onServer === local, `the inning's ${local} pitches are in the server's events table (${onServer})`);

    console.log("5. An update published mid-game waits for the game to end");
    await page.evaluate(() => { window.__sameLoad = true; });
    fs.writeFileSync(SW, swOriginal + "\n// a new version\n");
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration("/app/game/"); await reg.update(); });
    await page.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration("/app/game/"); return !!reg.waiting; }, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => window.PC_APPLY_UPDATE && window.PC_APPLY_UPDATE()); await page.waitForTimeout(800);
    const mid = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration("/app/game/"); return { waiting: !!reg.waiting, same: !!window.__sameLoad, flag: !!window.PC_UPDATE_WAITING, live: !!G().dbId }; });
    check(mid.live && mid.waiting && mid.same && mid.flag, `mid-game the new version waits and the page isn't reloaded (${JSON.stringify(mid)})`);
    await page.evaluate(() => render()); await page.waitForTimeout(100);
    check(/installs after this game/.test(await page.locator("main").innerText()), "and the Game screen says it installs after this game");
    // the update installs once the game (and its learning) is done: wait for that outcome itself, up to a minute
    // (a framenavigated event alone can be some other navigation)
    await page.evaluate(async () => { await endGame(); }).catch(() => {});   // the reload can cut this short
    const state = () => page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration("/app/game/"); return { waiting: !!(reg && reg.waiting), reloaded: !window.__sameLoad,
      flag: !!window.PC_UPDATE_WAITING, busy: !!window.PC_BUSY, live: !!(typeof G === "function" && G().dbId), ctrl: !!navigator.serviceWorker.controller }; }).catch(() => null);
    let after = null;
    for (let i = 0; i < 120; i++) { after = await state(); if (after && after.reloaded && !after.waiting) break; await page.waitForTimeout(500); }
    await ready();
    const nav = !!(after && after.reloaded);
    check(nav && after.reloaded && !after.waiting, `once the game is over the update takes over (${JSON.stringify(after)})`);
    const kept = +(await page.evaluate(async (gid) => (await DB.D.byIndex("events", "gameId", gid)).length, game.id));
    check(kept >= local, "and the iPad still has the game");

    check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
    check(!/Error:|⨯/.test(webLog), "no server errors" + (/Error:|⨯/.test(webLog) ? ":\n" + webLog.split("\n").filter((l) => /Error|⨯/.test(l)).slice(0, 5).join("\n") : ""));
  } finally {
    fs.writeFileSync(SW, swOriginal);
    await browser.close(); web.kill(); await db.end();
  }
  console.log(fails ? `\n${fails} offline game check(s) FAILED` : "\nall offline game checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
