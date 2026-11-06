/*
 * The player portal and the super admin (Plan 3b) against a real local Supabase and the built site: a player sees only
 * himself (outings, arsenal, profile, what the engine learned), edits a grade, a coach sees "changed by player" and puts
 * it back (D9); the admin lists organizations, opens one, transfers ownership with a reason, and every step is in the
 * audit log, while nobody else can open any of it (D13).
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/player_admin_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), fs = require("fs"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3198, SITE = `http://localhost:${PORT}`;
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
  for (const n of ["coach", "asst", "kid", "kid2", "admin", "nobody"]) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token;
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const team = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);
  const t0 = Date.now(), ago = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const P1 = "pit_kid1aaaaaaaaaaaaaaaaaaaaaaaa", P2 = "pit_kid2bbbbbbbbbbbbbbbbbbbbbbbb", OURS = "tea_ours0000000000000000000000", OPP = "tea_opp00000000000000000000000";
  const pitch = (id, name, type, kind, grade, command) => ({ id, type, name, kind, shape: "", grade, command, feel: 0.7, velo: "", ivb: "", hb: "", spin: "", active: true });
  await rpc("coach", "pc_push", { p: team, tbl: "teams", rows: [{ id: OURS, createdAt: t0, updatedAt: t0, name: "RIT Tigers", isOurs: true, pitchRule: { preset: "ps-19-22" } },
    { id: OPP, createdAt: t0, updatedAt: t0, name: "Ithaca Bombers", isOurs: false }] });
  await rpc("coach", "pc_push", { p: team, tbl: "pitchers", rows: [
    { id: P1, createdAt: t0, updatedAt: t0, teamId: OURS, name: "Avery Brooks", number: "21", hand: "R", role: "SP", slot: "three-quarter", height_ft: 6.1, gradYear: "",
      notes: "secret coach note: tips his slider", pitches: [pitch("pt_fb1", "Fastball", "Four-seam", "FB", 3, 3), pitch("pt_sl1", "Slider", "Slider", "SL", 2, 2)] },
    { id: P2, createdAt: t0, updatedAt: t0, teamId: OURS, name: "Sam Lee", number: "7", hand: "L", role: "RP", notes: "", pitches: [pitch("pt_fb2", "Fastball", "Four-seam", "FB", 4, 3)] }] });
  await rpc("coach", "pc_push", { p: team, tbl: "games", rows: [{ id: "gm_1", createdAt: t0, updatedAt: t0, date: ago(2), status: "final", opponentId: OPP }] });
  const evs = [["ball", "Fastball", "FB"], ["cstrike", "Fastball", "FB"], ["whiff", "Slider", "SL"], ["foul", "Fastball", "FB"], ["ball", "Slider", "SL"]]
    .map(([res, pitchName, kind], i) => ({ id: `ev_${i}`, createdAt: t0, updatedAt: t0, type: "pitch", gameId: "gm_1", pitcherId: P1, hitterId: "hit_x", res, pitchName, kind }));
  evs.push({ id: "ev_p2", createdAt: t0, updatedAt: t0, type: "pitch", gameId: "gm_1", pitcherId: P2, res: "ball", pitchName: "Fastball", kind: "FB" });
  await rpc("coach", "pc_push", { p: team, tbl: "events", rows: evs });
  await rpc("coach", "pc_push", { p: team, tbl: "learned", rows: [{ id: `p:${P1}`, createdAt: t0, updatedAt: t0, pitcherId: P1, at: t0, learner: "2.1",
    pitches: { pt_fb1: { n: 3, games: 1, entered: { grade: 3, command: 3 }, talent: { grade: 3.1, command: 2.8 }, strike_rate: 0.61, evidence: { hitters: ["hit_x"] } } } }] });
  for (const [who, pid] of [["kid", P1], ["kid2", P2]]) {
    const tok = await rpc("coach", "pc_invite", { p: team, member_role: "player", pitcher: pid, invite_email: null, under13: false });
    await rpc(who, "pc_accept_invite", { tok });
  }
  const tokA = await rpc("coach", "pc_invite", { p: team, member_role: "pitching", pitcher: null, invite_email: null, under13: false });
  await rpc("asst", "pc_accept_invite", { tok: tokA });
  await db.query("insert into public.platform_admins (user_id, note) values ($1, 'Drew')", [U.admin]);

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async (w = 1180) => { const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(String(e))); return p; };
  const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); };
  // (flex rows put each piece on its own line in innerText: spaces are folded so a sentence reads as one)
  const text = async (p, re) => { let t = ""; for (let i = 0; i < 50; i++) { t = (await p.locator("main:visible").first().innerText().catch(() => "")).replace(/\s+/g, " "); if (!re || re.test(t)) return t; await wait(200); } return t; };
  const goto = async (p, u) => { const r = await p.goto(SITE + u); await settle(p); return r; };
  const submit = async (p, form, button, to) => {
    const before = p.url();
    await p.getByRole("form", { name: form, exact: true }).getByRole("button", { name: button }).first().click();
    await p.waitForURL(to || ((u) => u.href !== before), { timeout: 15000 }).catch(() => {});
    await settle(p);
  };
  const signIn = async (p, n) => {
    await goto(p, "/login?next=/app");
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${n}@test.local`); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {}); await settle(p);
  };
  const doc = async (id) => (await db.query("select doc from public.pitchers where program_id = $1 and id = $2", [team, id])).rows[0].doc;
  const until = async (fn) => { for (let i = 0; i < 60; i++) { if (await fn()) return true; await wait(250); } return false; };
  const shots = path.join(ROOT, "web/tests/screens"); fs.mkdirSync(shots, { recursive: true });

  try {
    console.log("1. A player opens his team: himself only");
    const kid = await fresh();
    await signIn(kid, "kid");
    await kid.locator("main:visible").getByRole("link", { name: "RIT Tigers" }).click();
    await kid.waitForURL(new RegExp(`/app/me/${team}/${P1}$`), { timeout: 10000 }).catch(() => {}); await settle(kid);
    const home = await text(kid, /Last outing/);
    check(new URL(kid.url()).pathname === `/app/me/${team}/${P1}`, "his team opens on his own page");
    check(/Avery Brooks/.test(home) && /5 pitches/.test(home) && /60%/.test(home) && /Fastball 3 · Slider 2/.test(home), `his last outing: 5 pitches, 60% strikes, by pitch (${home.replace(/\n/g, " | ").slice(0, 300)})`);
    check(/Can pitch/i.test(home) && /Pitch Smart, ages 19-22/.test(home), "when he can pitch next, under the team's rule");
    const html = await kid.content();
    check(!/secret coach note|Ithaca|Sam Lee|hit_x/.test(html), "no coach notes, opponent, teammate or hitter anywhere on the page");
    await kid.screenshot({ path: path.join(shots, "player-home.png"), fullPage: true });
    await goto(kid, `/app/t/${team}`);
    check(new URL(kid.url()).pathname.startsWith(`/app/me/${team}`), "the coach portal sends him back to his own");
    const r404 = await goto(kid, `/app/me/${team}/${P2}`);
    check(r404.status() === 404 || /not found|404/i.test(await kid.locator("body").innerText()), "a teammate's page is a 404");

    console.log("2. He changes a grade and his profile (D9)");
    await goto(kid, `/app/me/${team}/${P1}/arsenal`);
    await kid.getByRole("form", { name: "Arsenal" }).getByLabel("Pitch 2 stuff").fill("4");
    await submit(kid, "Arsenal", "Save", (u) => /ok=saved/.test(u.search));
    let d1 = await doc(P1);
    const h1 = (await db.query("select * from public.grade_history where program_id = $1 and pitcher_id = $2", [team, P1])).rows;
    check(d1.pitches[1].grade === 4 && d1.notes === "secret coach note: tips his slider", "saved at once; the coach's note is untouched");
    check(h1.length === 1 && h1[0].by_role === "player" && +h1[0].old_value === 2 && +h1[0].new_value === 4 && h1[0].changed_by === U.kid, "and the history has who, old and new");
    check(/Slider stuff 2 → 4 · you/.test(await text(kid, /→/)), "he sees the change in his history");
    await kid.screenshot({ path: path.join(shots, "player-arsenal.png"), fullPage: true });
    await goto(kid, `/app/me/${team}/${P1}/profile`);
    const pf = kid.getByRole("form", { name: "Profile" });
    await pf.getByLabel("Grad year").fill("2028"); await pf.getByLabel("Height (feet)").fill("6.25"); await pf.getByLabel("Arm slot").selectOption("sidearm");
    await submit(kid, "Profile", "Save", (u) => /ok=saved/.test(u.search));
    d1 = await doc(P1);
    check(d1.gradYear === "2028" && d1.height_ft === 6.25 && d1.slot === "sidearm" && d1.role === "SP", "profile saved: grad year, height, arm slot; his role is still the coaches'");
    await goto(kid, `/app/me/${team}/${P1}/learned`);
    const lt = await text(kid, /Fastball/);
    check(/Fastball/.test(lt) && /3\.0 → 3\.1/.test(lt) && /3\.0 → 2\.8/.test(lt) && /61%/.test(lt), `what the engine learned: entered and read, per pitch (${lt.replace(/\n/g, " | ").slice(0, 200)})`);

    console.log("3. The coach sees it and puts it back");
    const coach = await fresh();
    await signIn(coach, "coach");
    await goto(coach, `/app/t/${team}/roster/${P1}`);
    const ct = await text(coach, /changed by player/i);
    check(/1 changed by player/i.test(ct) && /Slider stuff 2 → 4/.test(ct), "his pitcher page: \"1 changed by player\", with the change");
    await coach.screenshot({ path: path.join(shots, "coach-grade-history.png"), fullPage: true });
    await submit(coach, "Put back Slider stuff", "Put back to 2", (u) => /ok=reverted/.test(u.search));
    check(await until(async () => (await doc(P1)).pitches[1].grade === 2), "one tap: the slider is back to 2");
    await goto(kid, `/app/me/${team}/${P1}/arsenal`);
    check(/Put back by a coach/i.test(await text(kid, /Put back/i)) && /2 → 4/.test(await text(kid)), "the player sees a coach put it back");
    const kid2 = await fresh();
    await signIn(kid2, "kid2");
    await goto(kid2, `/app/me/${team}/${P2}/arsenal`);
    check(/No changes yet/.test(await text(kid2, /No changes/)), "his teammate sees none of his history");

    console.log("4. The super admin (D13)");
    const nobody = await fresh();
    await signIn(nobody, "nobody");
    const na = await goto(nobody, "/admin");
    const naText = await nobody.locator("body").innerText();
    check((na.status() === 404 || /not found|404/i.test(naText)) && !/Organizations|RIT Baseball/.test(naText), `someone who isn't an admin gets the not-found page, nothing else (${na.status()})`);
    const out = await (await fresh()).goto(SITE + "/admin/audit").then((r) => r.url());
    check(/\/login/.test(out), "signed out goes to sign in");
    const before = +(await db.query("select count(*) n from public.admin_audit")).rows[0].n;
    const admin = await fresh();
    await signIn(admin, "admin");
    await goto(admin, "/admin");
    const at = await text(admin, /RIT Baseball/);
    check(/RIT Baseball/.test(at) && /coach@test\.local/.test(at) && /Active/.test(at), "the admin sees the organization, its owner and billing");
    await admin.screenshot({ path: path.join(shots, "admin-orgs.png"), fullPage: true });
    await admin.locator("main:visible").getByRole("link", { name: "RIT Baseball" }).click(); await admin.waitForURL(/\/admin\/org\//).catch(() => {}); await settle(admin);
    const ot = await text(admin, /Teams/);
    check(/RIT Tigers/.test(ot) && /asst@test\.local/.test(ot) && !/Avery|Sam Lee|Fastball|secret/.test(await admin.content()), "one organization: teams, staff; no player or pitch data");
    const tf = admin.getByRole("form", { name: "Transfer ownership" });
    await tf.getByLabel(/New owner/).fill("kid@test.local"); await tf.getByLabel(/Reason/).fill("testing");
    await submit(admin, "Transfer ownership", "Transfer ownership", (u) => /error=/.test(u.search));
    check(/has to be a coach/.test(await text(admin, /coach/)), "not to a player");
    await tf.getByLabel(/New owner/).fill("asst@test.local"); await tf.getByLabel(/Reason/).fill("Head coach left; AD asked by email on Nov 5");
    await submit(admin, "Transfer ownership", "Transfer ownership", (u) => /ok=transferred/.test(u.search));
    check((await db.query("select owner_id from public.organizations where id = $1", [org])).rows[0].owner_id === U.asst, "to a coach, with a reason: the owner changes");
    await goto(admin, "/admin/audit");
    const aud = await text(admin, /Transferred ownership/);
    check(/Transferred ownership/.test(aud) && /Head coach left/.test(aud) && /Opened an organization/.test(aud) && /admin@test\.local/.test(aud), "the audit log has each step, who and why");
    const after = +(await db.query("select count(*) n from public.admin_audit")).rows[0].n;
    check(after - before >= 5, `every admin page and action wrote a row (${after - before})`);
    check(!errs.length, `no page errors (${errs.join("; ")})`);
  } catch (e) {
    fails++; console.error(e); console.error(webLog.slice(-3000));
  } finally {
    await browser.close(); web.kill(); await db.end();
  }
  console.log(fails ? `\n${fails} player/admin check(s) FAILED` : "\nall player/admin checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
