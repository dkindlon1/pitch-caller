/*
 * Game Day (docs/PLAN_portal_2026-11-12.md) against a real local Supabase and the built site: the glass launcher by
 * role, a game set up on the website, who may see its plan (the owner decides), and starting it on a device: the
 * one-time sign-in hand-off, the game app opening that very record, the claim going up, a second device refused
 * while it's live, today's planned game offered when the app opens on its own, and the hand-off working only once.
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/gameplan_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), fs = require("fs"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3199, SITE = `http://localhost:${PORT}`;
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
  const PASS = "test-pass-1234", U = {};
  for (const n of ["coach", "viewer"]) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token;
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });
  // the coach owns the organization and is head coach of its team
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const team = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);
  const tok = await rpc("coach", "pc_invite", { p: team, member_role: "viewer", pitcher: null, invite_email: null, under13: false });
  await rpc("viewer", "pc_accept_invite", { tok });
  // the team's records, the way the iPad and the portal write them
  const tk = await tokenOf("coach");
  const push = async (tbl, rows) => { const r = await http("POST", "/rest/v1/rpc/pc_push", { token: tk, body: { p: team, tbl, rows: rows.map((x) => ({ createdAt: Date.now(), updatedAt: Date.now(), ...x })) } }); if (r.rejected.length) throw new Error(`${tbl}: ${JSON.stringify(r.rejected)}`); return r; };
  const pitch = (id, type, name, kind, shape) => ({ id, type, name, kind, shape, grade: 3, command: 3, feel: 0.75, velo: "", ivb: "", hb: "", spin: "", active: true });
  await push("teams", [{ id: "tea_ours000000000000000000001", name: "RIT Tigers", isOurs: true, level: "college_d3" }, { id: "tea_ithaca00000000000000000001", name: "Ithaca College", isOurs: false, level: "college_d3", notes: "" }]);
  const ours = "tea_ours000000000000000000001", ith = "tea_ithaca00000000000000000001";
  await push("pitchers", [
    { id: "pit_smith0000000000000000001", teamId: ours, name: "Sam Smith", number: "12", hand: "R", role: "SP", slot: "three-quarter", height_ft: 6.2, pitches: [pitch("pt_a1", "Four-seam", "Fastball", "FB", "ride"), pitch("pt_a2", "Slider", "Slider", "SL", "tight"), pitch("pt_a3", "Changeup", "Changeup", "CH", "fade")] },
    { id: "pit_jones0000000000000000001", teamId: ours, name: "Jo Jones", number: "7", hand: "L", role: "RP", slot: "three-quarter", height_ft: 6.0, pitches: [pitch("pt_b1", "Four-seam", "Fastball", "FB", "ride"), pitch("pt_b2", "Curveball", "Curveball", "CB", "typical")] },
  ]);
  await push("hitters", ["Diaz S", "Park L", "Reyes R", "Cole R", "Ng L", "Ortiz R", "Shaw R", "Kim L", "Lee R"].map((x, i) => ({ id: `hit_ith${String(i).padStart(22, "0")}`, teamId: ith, name: x.split(" ")[0], number: String(i + 1), bats: x.split(" ")[1], pos: "", stats: {}, tags: [], notes: "" })));
  await push("catchers", [{ id: "cat_vega000000000000000000001", teamId: ours, name: "Vega", block: 4 }]);

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async (w = 1440, h = 900) => { const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); p.on("pageerror", (e) => errs.push(String(e))); return p; };
  const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.locator("main:visible").first().waitFor({ timeout: 10000 }).catch(() => {}); };
  const text = async (p, re) => { let t = ""; for (let i = 0; i < 60; i++) { t = await p.locator("main:visible").first().innerText().catch(() => ""); if (!re || re.test(t)) return t; await wait(200); } return t; };
  const goto = async (p, u) => { await p.goto(SITE + u); await settle(p); };
  const signIn = async (p, n) => {
    await goto(p, "/login?next=/app");
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${n}@test.local`); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {}); await settle(p);
    const agree = p.getByRole("form", { name: "Agree to the Terms" });
    if (await agree.count()) { await agree.getByRole("checkbox").first().check().catch(() => {}); await agree.getByRole("button").first().click(); await settle(p); }
  };
  const shots = path.join(ROOT, "web/tests/screens/portal"); fs.mkdirSync(shots, { recursive: true });
  const gameRow = async (id) => (await db.query("select doc from public.games where program_id = $1 and id = $2", [team, id])).rows[0]?.doc;
  const appState = (p) => p.evaluate(() => { try { const s = JSON.parse(localStorage.getItem("pitchcaller.v2") || "null"); return s && { dbId: s.game && s.game.dbId, view: s.view, staffIds: s.setup.staffIds, lineup: s.setup.lineup.map((b) => b.hitterId), opp: s.setup.opponentId, catcher: s.setup.catcherId, inputs: s.setup.inputs, ump: s.setup.umpSeed }; } catch (e) { return null; } });
  const appReady = async (p) => { await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 30000 }).catch(() => {}); await wait(500); };

  try {
    console.log("1. The launcher, by role");
    const coach = await fresh(); await signIn(coach, "coach");
    await goto(coach, `/app/t/${team}`);
    const home = await text(coach, /No game set up yet/);
    check(/No game set up yet/.test(home), "the game card says no game is set up");
    const tiles = await coach.getByRole("list", { name: "Screens you can open" }).innerText();
    check(["Game Day", "Roster", "Opponents", "Staff", "Settings", "Billing", "Game app"].every((x) => tiles.includes(x)), "the owner and head coach gets every tile, Billing included");
    check(!(await coach.locator(".pq-dock").isVisible()), "on a laptop the dock steps aside on the launcher (the tiles are the way around)");
    await coach.screenshot({ path: path.join(shots, "launcher-laptop.png"), fullPage: true });
    const viewer = await fresh(); await signIn(viewer, "viewer");
    await goto(viewer, `/app/t/${team}`);
    const vt = await viewer.getByRole("list", { name: "Screens you can open" }).innerText();
    check(!/Game Day/.test(vt) && !/Staff|Settings|Billing|Game app/.test(vt) && /Roster/.test(vt) && /Opponents/.test(vt), `a viewer gets Roster and Opponents, no Game Day, Staff, Settings, Billing or Game app (${vt.replace(/\s+/g, " ").slice(0, 120)})`);

    console.log("2. Set up a game");
    await coach.getByRole("link", { name: "Set up a game" }).first().click(); await coach.waitForURL(/\/games\/new/); await settle(coach);
    const sheet = coach.getByRole("form", { name: "Set up a game" });
    await sheet.getByLabel("Opponent").selectOption({ label: "Ithaca College" });
    await sheet.getByLabel("First pitch (optional)").fill("13:05");
    await sheet.getByRole("button", { name: "Home", exact: true }).click();
    await sheet.getByRole("button", { name: /Next: Our staff/ }).click();
    check(/at least one pitcher/.test(await sheet.innerText()) === false, "(step 1 passes)");
    await sheet.getByRole("button", { name: "Next: Their lineup" }).click();
    check(/Pick at least one pitcher/.test(await sheet.innerText()), "it won't go on with nobody on today's staff");
    await sheet.getByRole("button", { name: /^Jo Jones/ }).click();
    await sheet.getByRole("button", { name: /^Sam Smith/ }).click();
    await sheet.getByRole("button", { name: /^Sam Smith/ }).click();   // a second tap makes him the starter
    await sheet.getByLabel("Today's catcher").selectOption({ label: "Vega, blocking 4" });
    await coach.screenshot({ path: path.join(shots, "setup-staff.png"), fullPage: true });
    await sheet.getByRole("button", { name: "Next: Their lineup" }).click();
    await sheet.getByRole("button", { name: "Fill from their roster" }).click();
    await sheet.getByLabel("Hitter 9", { exact: true }).fill("Newman");
    await sheet.getByRole("button", { name: "Next: Charting" }).click();
    await sheet.getByRole("radio", { name: /Plus hitter reads/ }).click();
    await sheet.getByRole("button", { name: "Wide zone" }).click();
    await sheet.getByRole("button", { name: "Next: Review" }).click();
    const review = await sheet.innerText();
    check(/Sam Smith \(starts\)/.test(review) && /Diaz \(S\)/.test(review) && /vs Ithaca College/.test(review), "the review shows the starter, the lineup and the opponent");
    await coach.screenshot({ path: path.join(shots, "setup-review.png"), fullPage: true });
    await sheet.getByRole("button", { name: "Save game" }).click();
    await coach.waitForURL(/\/games\/gam_[0-9a-z]+\?ok=planned/, { timeout: 15000 }).catch(() => {}); await settle(coach);
    const gid = (coach.url().match(/games\/(gam_[0-9a-z]+)/) || [])[1];
    const doc = gid && await gameRow(gid);
    check(!!doc && doc.status === "planned" && doc.deviceId === null, `saved as a planned game on the server (${gid})`);
    check(doc && doc.staffIds[0] === "pit_smith0000000000000000001" && doc.staffIds.length === 2 && doc.catcherId === "cat_vega000000000000000000001", "the starter is first on today's staff, with the catcher");
    check(doc && doc.opponentId === ith && doc.lineup[0].hitterId === "hit_ith0000000000000000000000" && doc.lineup[0].hand === "S" && doc.setup.home === true && doc.time === "13:05", "the opponent, the lineup from their roster, home and the start time");
    const newman = (await db.query("select doc from public.hitters where program_id = $1 and doc->>'name' = 'Newman'", [team])).rows[0]?.doc;
    check(!!newman && newman.teamId === ith && doc.lineup[8].hitterId === newman.id, "a name typed into the lineup joined their roster and the plan points at him");
    check(doc && doc.inputs === 3 && doc.setup.umpSeed === "wide" && doc.setup.engine === "v09", "charting and the umpire, in the game app's own fields");
    await coach.screenshot({ path: path.join(shots, "plan.png"), fullPage: true });
    await goto(coach, `/app/t/${team}`);
    const home2 = await text(coach, /vs Ithaca College/);
    check(/Today vs Ithaca College/.test(home2) && await coach.getByRole("link", { name: "Review and start" }).count() === 1, "the launcher's game card shows today's game with Review and start");
    await coach.screenshot({ path: path.join(shots, "launcher-planned.png"), fullPage: true });

    console.log("3. Who sees the plan: the owner decides");
    await goto(viewer, `/app/t/${team}`);
    const vh = await text(viewer, /Ithaca/);
    check(/Today vs Ithaca College/.test(vh) && await viewer.getByRole("link", { name: "See the game plan" }).count() === 0, "a viewer sees that there's a game today (the schedule), not the plan");
    await goto(viewer, `/app/t/${team}/games/${gid}`);
    check(/doesn.t show game plans/.test(await text(viewer, /game plans/)), "the plan's own page tells him his role doesn't show it");
    const vTok = await tokenOf("viewer");
    const direct = await http("GET", `/rest/v1/games?program_id=eq.${team}&select=id`, { token: vTok });
    check(Array.isArray(direct) && direct.length === 0, "and the database won't hand him the record either");
    await goto(coach, `/app/t/${team}/staff`);
    const row = coach.locator(".staff-row", { hasText: "viewer@test.local" });
    await row.locator("summary", { hasText: "Advanced" }).click();
    await row.getByLabel("See the game plan").check();
    await row.getByRole("button", { name: "Save" }).click(); await coach.waitForURL(/ok=member/, { timeout: 10000 }).catch(() => {}); await settle(coach);
    const perms = (await db.query("select perms from public.members where program_id = $1 and user_id = $2", [team, U.viewer])).rows[0].perms;
    check(perms.view_plan === true, `the owner switched on "See the game plan" for the viewer (${JSON.stringify(perms)})`);
    await goto(viewer, `/app/t/${team}`);
    check(/Game Day/.test(await viewer.getByRole("list", { name: "Screens you can open" }).innerText()), "now the viewer has a Game Day tile");
    await goto(viewer, `/app/t/${team}/games/${gid}`);
    const vp = await text(viewer, /Their lineup/);
    check(/Diaz/.test(vp) && /Sam Smith/.test(vp) && await viewer.getByRole("link", { name: "Start on this device" }).count() === 0 && /Read only/.test(vp), "he reads the plan, with no Start button");

    console.log("4. Start it on this device");
    const ipad = await fresh(1180, 820); const ipadLog = []; ipad.on("console", (m) => ipadLog.push(m.type() + ": " + m.text().slice(0, 200))); await signIn(ipad, "coach");
    await goto(ipad, `/app/t/${team}/games/${gid}`);
    const openRes = ipad.waitForResponse((r) => r.url().includes(`/games/${gid}/open`), { timeout: 15000 });
    await ipad.getByRole("link", { name: "Start on this device" }).click();
    const loc = (await openRes).headers()["location"] || "";
    check(/\/app\/game\/\?game=gam_/.test(loc) && /#pq=[0-9a-f]{20,}/.test(loc), "Start goes to the game app with the game and a one-time sign-in in the fragment");
    await ipad.waitForURL(/\/app\/game\//, { timeout: 15000 }); await appReady(ipad);
    let st = null;
    for (let i = 0; i < 60; i++) { st = await appState(ipad); if (st && st.dbId === gid) break; await wait(500); }
    if (!st || st.dbId !== gid) console.log("     (game app:", JSON.stringify(await ipad.evaluate(() => ({ msg: PORTAL.msg, err: SYNC.error, prog: SYNC.cfg && SYNC.cfg.programId, url: SYNC.cfg && !!SYNC.cfg.url, auth: !!SYNC.authSession, teams: (SYNC.teams || []).length, href: location.href, ready: DB.ready })).catch((e) => String(e))), ")", ipadLog.slice(-8).join(" | "));
    check(st && st.dbId === gid && st.view === "live", `the game app started the game on the planned record (${JSON.stringify(st && { dbId: st.dbId, view: st.view })})`);
    check(st && st.staffIds[0] === "pit_smith0000000000000000001" && st.opp === ith && st.catcher === "cat_vega000000000000000000001" && st.inputs === 3 && st.ump === "wide", "with the plan's staff (starter on the mound), opponent, catcher, charting and umpire");
    check(st && st.lineup[0] === "hit_ith0000000000000000000000" && st.lineup.length >= 9, "and their lineup");
    check(!/#pq=/.test(ipad.url()), "the sign-in is gone from the address once used");
    let claimed = null;
    for (let i = 0; i < 30; i++) { claimed = await gameRow(gid); if (claimed && claimed.status === "live") break; await wait(500); }
    const devA = await ipad.evaluate(() => DB.deviceId);
    check(claimed && claimed.status === "live" && claimed.deviceId === devA, `the claim went up: live on this device (${claimed && claimed.status}, ${claimed && claimed.deviceId === devA})`);
    check(await ipad.evaluate(() => !!G().call), "and the first call is up");
    await ipad.screenshot({ path: path.join(shots, "game-app-started.png") });

    console.log("5. A game in progress stays on that one device");
    await goto(coach, `/app/t/${team}/games/${gid}`);
    const live = await text(coach, /Live/);
    check(/stays on that device only/.test(live) && await coach.getByRole("link", { name: "Start on this device" }).count() === 0, "the plan page says it's live on one device, with no Start button and nothing from the game");
    await goto(coach, `/app/t/${team}/games`);
    check(/Live on one device/.test(await text(coach, /Live on one device/)), "the schedule says so too");
    await goto(viewer, `/app/t/${team}/games/${gid}`);
    check(!/pitch \d|Strike|Ball \d/i.test(await text(viewer, /Live/)) , "a coach who sees plans sees only that it's live");
    const other = await fresh(1180, 820); await signIn(other, "coach");
    await other.goto(`${SITE}/app/t/${team}/games/${gid}/open`); await other.waitForURL(/\/app\/game\//, { timeout: 15000 }); await appReady(other);
    let msg = "";
    for (let i = 0; i < 40; i++) { msg = await other.locator("main").innerText().catch(() => ""); if (/another device/.test(msg)) break; await wait(500); }
    const st2 = await appState(other);
    check(/being called on another device/.test(msg) && (!st2 || st2.dbId !== gid), "a second device that opens it is refused: it's being called on another device");

    console.log("6. Today's planned game, offered when the app opens on its own");
    await goto(coach, `/app/t/${team}/games/new`);
    const s2 = coach.getByRole("form", { name: "Set up a game" });
    await s2.getByLabel("Opponent").selectOption({ label: "Ithaca College" });
    await s2.getByRole("button", { name: /Next: Our staff/ }).click();
    await s2.getByRole("button", { name: /^Jo Jones/ }).click();
    for (const n of ["Their lineup", "Charting", "Review"]) await s2.getByRole("button", { name: `Next: ${n}` }).click();
    await s2.getByRole("button", { name: "Save game" }).click(); await coach.waitForURL(/ok=planned/, { timeout: 15000 }).catch(() => {});
    const gid2 = (coach.url().match(/games\/(gam_[0-9a-z]+)/) || [])[1];
    await other.goto(`${SITE}/app/game/`); await appReady(other);
    await other.evaluate(() => syncNow(true)); await wait(800); await other.evaluate(() => render());
    const offer = other.locator("#planned-notice");
    check(await offer.isVisible().catch(() => false) && /Today's game vs Ithaca College is set up/.test(await offer.innerText()), "the game app offers today's planned game");
    await offer.getByRole("button", { name: "Start it" }).click(); await wait(800);
    const st3 = await appState(other);
    check(st3 && st3.dbId === gid2 && st3.staffIds[0] === "pit_jones0000000000000000001", "Start it starts that game on that device");

    console.log("7. The hand-off works once");
    const replay = await fresh(1180, 820);
    await replay.goto(loc.startsWith("http") ? loc : SITE + loc); await appReady(replay);
    let rmsg = "";
    for (let i = 0; i < 30; i++) { rmsg = await replay.locator("main").innerText().catch(() => ""); if (/expired|Sign in/.test(rmsg)) break; await wait(500); }
    const st4 = await appState(replay);
    check(/expired/.test(rmsg) && (!st4 || !st4.dbId), "the same link a second time doesn't sign anyone in");

    console.log("8. Screens on an iPad and a phone");
    const tab = await fresh(820, 1180); await signIn(tab, "coach"); await goto(tab, `/app/t/${team}`);
    check(await tab.locator(".pq-dock").isVisible(), "on an iPad the dock sits at the bottom of the launcher");
    check((await tab.evaluate(() => document.documentElement.scrollWidth)) <= 820, "and the launcher fits the screen");
    await tab.screenshot({ path: path.join(shots, "launcher-ipad.png"), fullPage: true });
    await goto(tab, `/app/t/${team}/games/new`); await tab.screenshot({ path: path.join(shots, "setup-ipad.png"), fullPage: true });
    const ph = await fresh(390, 844); await signIn(ph, "coach"); await goto(ph, `/app/t/${team}`);
    check((await ph.evaluate(() => document.documentElement.scrollWidth)) <= 390, `on a phone the launcher fits (${await ph.evaluate(() => document.documentElement.scrollWidth)} px)`);
    await ph.screenshot({ path: path.join(shots, "launcher-phone.png"), fullPage: true });

    const pageErrs = errs.filter((e) => !/ResizeObserver/.test(e));
    check(!pageErrs.length, "no page errors" + (pageErrs.length ? ": " + pageErrs.slice(0, 3).join(" | ") : ""));
    check(!/Error:|⨯/.test(webLog), "no server errors" + (/Error:|⨯/.test(webLog) ? ":\n" + webLog.split("\n").filter((l) => /Error|⨯/.test(l)).slice(0, 5).join("\n") : ""));
  } finally {
    await browser.close(); web.kill(); await db.end();
  }
  console.log(fails ? `\n${fails} game day check(s) FAILED` : "\nall game day checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
