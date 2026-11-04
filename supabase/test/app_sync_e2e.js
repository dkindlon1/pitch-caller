/*
 * The Setup screen's "Sync with Supabase" section, driven in a real browser. Run from the repo root:
 *   PGURL=postgres://postgres@localhost:55432/postgres node supabase/test/app_sync_e2e.js
 * A stand-in for a Supabase project, on top of a real local Postgres with the migration applied:
 *   /auth/v1/token   email + password -> an access token for that user (stand-in for Supabase Auth; any password works)
 *   /rest/v1/rpc/*   the sync functions, called as the user in the token (stand-in for Supabase's REST server)
 * Neither is Supabase's own server: this checks the app's screens, requests and data flow, not Supabase itself.
 * Two iPads (separate browser profiles): the head coach signs in, starts a program and charts a game; the charter signs
 * in on the other, picks the program and gets the game; the charter's pitch goes back to the coach.
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const BASE = process.env.PGURL || "postgres://postgres@localhost:55432/postgres";
const DBNAME = "pc_app_sync_e2e";
const DIST = path.join(__dirname, "../../app/dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const connect = async () => { const c = new Client({ connectionString: BASE.replace(/\/[^/]*$/, "/" + DBNAME) }); await c.connect(); return c; };

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DBNAME}`); await admin.query(`create database ${DBNAME}`); await admin.end();
  const su = await connect();
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  await su.query(fs.readFileSync(path.join(__dirname, "../migrations/20261103000000_pitch_caller.sql"), "utf8"));
  const users = { "coach@test.local": crypto.randomUUID(), "charter@test.local": crypto.randomUUID() };
  for (const [email, id] of Object.entries(users)) await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
  const db = await connect();
  const asUser = async (sub, text, params) => {
    await db.query("begin");
    try { await db.query("set local role authenticated"); await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
      const r = await db.query(text, params); await db.query("commit"); return r; } catch (e) { await db.query("rollback"); throw e; }
  };
  const calls = {
    pc_push: (a) => ["select public.pc_push($1, $2, $3::jsonb) as r", [a.p, a.tbl, JSON.stringify(a.rows)]],
    pc_pull: (a) => ["select public.pc_pull($1, $2, $3, $4, $5) as r", [a.p, a.tbl, a.after_xid, a.after_id, a.lim]],
    pc_my_programs: () => ["select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from public.pc_my_programs() x", []],
    pc_create_program: (a) => ["select to_jsonb(public.pc_create_program($1, $2)) as r", [a.name, a.level]],
    pc_invite: (a) => ["select to_jsonb(public.pc_invite($1, $2, $3, $4)) as r", [a.p, a.invite_email, a.member_role, a.member_pitcher]],
    pc_my_invites: () => ["select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from public.pc_my_invites() x", []],
    pc_accept_invite: (a) => ["select to_jsonb(public.pc_accept_invite($1)) as r", [a.p]],
    pc_decline_invite: (a) => ["select to_jsonb(public.pc_decline_invite($1)) as r", [a.p]],
    pc_cancel_invite: (a) => ["select to_jsonb(public.pc_cancel_invite($1, $2)) as r", [a.p, a.invite_email]],
    pc_staff: (a) => ["select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from public.pc_staff($1) x", [a.p]],
    pc_set_role: (a) => ["select to_jsonb(public.pc_set_role($1, $2, $3, $4)) as r", [a.p, a.member, a.member_role, a.member_pitcher]],
    pc_remove_member: (a) => ["select to_jsonb(public.pc_remove_member($1, $2)) as r", [a.p, a.member]],
  };
  let queue = Promise.resolve();   // one Postgres connection: requests take turns
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { queue = queue.then(async () => {
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); }
      if (req.headers.apikey !== "anon-key") return send(401, { message: "no api key" });
      if (/^Bearer anon-key$/.test(req.headers.authorization || "")) return send(401, { message: "stand-in: the project key was sent as a Bearer token" });
      const a = JSON.parse(body || "{}");
      if (req.url.startsWith("/auth/v1/token")) {
        if (req.url.includes("grant_type=refresh_token") && a.refresh_token !== "r") return send(400, { error_description: "Invalid Refresh Token: Refresh Token Not Found" });
        if (req.url.includes("grant_type=refresh_token")) return send(400, { error_description: "stand-in: refresh not modelled" });
        const id = users[a.email]; if (!id) return send(400, { error_description: "Invalid login credentials" });
        return send(200, { access_token: ["e30", Buffer.from(JSON.stringify({ sub: id })).toString("base64url"), "x"].join("."), refresh_token: "r", expires_in: 3600, user: { id, email: a.email } });
      }
      const fn = (req.url.match(/^\/rest\/v1\/rpc\/(\w+)$/) || [])[1];
      if (!calls[fn]) return send(404, { message: "not found" });
      const tok = (req.headers.authorization || "").replace(/^Bearer /, "");
      const sub = tok.includes(".") ? JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).sub : null;
      try { const r = await asUser(sub, ...calls[fn](a)); send(200, r.rows[0].r); } catch (e) { send(e.code === "42501" ? 403 : 400, { code: e.code, message: e.message }); }
    }); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errs = [];
  const open = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    page.on("pageerror", (e) => errs.push(String(e) + " @ " + (e.stack || "").split("\n").slice(1, 4).join(" "))); page.on("console", (m) => { if (m.type() === "error" && !/403|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(url + "/"); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
    return page;
  };
  const toSetup = async (page) => { await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(200); };
  const signIn = async (page, email) => {
    await toSetup(page);
    await page.getByLabel("Project URL").fill(url); await page.getByLabel("Project URL").press("Tab"); await page.waitForTimeout(200);
    await page.getByLabel("Publishable key").fill("anon-key"); await page.getByLabel("Publishable key").press("Tab"); await page.waitForTimeout(300);
    await page.locator("#sync-email").fill(email); await page.locator("#sync-pass").fill("anything");
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(500);
  };

  console.log("1. The head coach signs in and starts a program");
  const coach = await open();
  await coach.evaluate(async () => { const t = ourTeam(); t.name = "RIT Tigers"; await dbPut("teams", t); });
  await signIn(coach, "coach@test.local");
  check(await coach.getByText("Signed in as coach@test.local").count() === 1, "signed in, asked to pick or start a program");
  await coach.getByRole("button", { name: "Start a program for this team" }).click(); await coach.waitForTimeout(1200);
  const status = await coach.locator(".srow", { hasText: "Sync with Supabase" }).innerText();
  check(/RIT Tigers as head coach/.test(status) && /Nothing waiting to go up/.test(status), `program started and the roster synced up ("${status.split("\n").find((l) => /head coach/.test(l))}")`);
  const progId = (await su.query("select id from public.programs where name = 'RIT Tigers'")).rows[0].id;
  check(!!progId && +(await su.query("select count(*) from public.pitchers where program_id = $1", [progId])).rows[0].count >= 1, "the program and its pitchers are on the server");

  console.log("2. The coach charts a game; End game syncs it in the background");
  await coach.locator(".tabs button", { hasText: "Game" }).click(); await coach.waitForTimeout(300);
  for (const k of ["b", "c", "b", "c", "b", "c"]) { await coach.keyboard.press(k); await coach.waitForTimeout(120); }
  await coach.evaluate(() => changePitcher()); await coach.waitForTimeout(200);
  for (const k of ["b", "c"]) { await coach.keyboard.press(k); await coach.waitForTimeout(120); }
  await coach.evaluate(() => endGame()); await coach.waitForTimeout(2500);
  const onServer = (await su.query("select count(*) filter (where type = 'pitch')::int p, count(*) filter (where type = 'play')::int pl from public.events where program_id = $1", [progId])).rows[0];
  check(onServer.p === 8 && onServer.pl === 1, `the game is on the server without tapping Sync: ${onServer.p} pitches, ${onServer.pl} play`);
  const g = (await su.query("select doc from public.games where program_id = $1", [progId])).rows[0].doc;
  check(g.status === "final" && g.packs >= 1, `the game record went up final (${g.status}, ${g.packs} pack)`);

  console.log("3. The charter signs in on another iPad and gets everything");
  await toSetup(coach);
  await coach.locator("#sync-member").fill("nobody@test.local"); await coach.getByRole("button", { name: "Invite", exact: true }).click(); await coach.waitForTimeout(600);
  const staffText = await coach.locator(".srow", { hasText: "Sync with Supabase" }).innerText();
  check(/nobody@test\.local/.test(staffText) && /invited as charter/.test(staffText) && !/no account/.test(staffText), "inviting an email with no account looks like any invite (nothing says who has signed up)");
  await coach.locator("#sync-member").fill("charter@test.local"); await coach.getByRole("button", { name: "Invite", exact: true }).click(); await coach.waitForTimeout(600);
  const notYet = (await su.query("select count(*)::int n from public.members m join auth.users u on u.id = m.user_id where u.email = 'charter@test.local'")).rows[0].n;
  check(notYet === 0, "the invited charter isn't a member until he accepts");
  const charter = await open();
  await signIn(charter, "charter@test.local");
  await charter.waitForTimeout(500);
  await charter.locator(".srow", { hasText: "Sync with Supabase" }).getByRole("button", { name: "Accept" }).click(); await charter.waitForTimeout(1800);
  const role = (await su.query("select m.role from public.members m join auth.users u on u.id = m.user_id where u.email = 'charter@test.local'")).rows[0];
  check(role && role.role === "charter", "he signs in on his iPad, accepts, and joins as charter");
  const got2 = await charter.evaluate(async () => ({ events: (await DB.D.all("events")).filter((e) => e.type === "pitch").length, games: (await DB.D.all("games")).length }));
  check(got2.events === 8 && got2.games >= 1, `the charter's iPad has the coach's game (${got2.events} pitches)`);
  const ours = await charter.evaluate(() => [...DB.teams.values()].filter((t) => t.isOurs).map((t) => t.name));
  check(ours.length === 1 && ours[0] === "RIT Tigers", `the new iPad's placeholder team gave way to the program's (our teams on it: ${ours.join(", ")})`);
  const staff = await charter.evaluate(() => S.setup.staff.map((p) => p.name).sort().join(", "));
  check(staff === "Reliever, Starter", `his staff is the program's pitchers (${staff})`);
  const srvOurs = (await su.query("select count(*)::int n from public.teams where program_id = $1 and (doc->>'isOurs')::boolean", [progId])).rows[0].n;
  check(srvOurs === 1, `the server still has one team of ours (${srvOurs})`);
  const cs = await charter.locator(".srow", { hasText: "Sync with Supabase" }).innerText();
  check(/as charter/.test(cs) && !/weren't allowed|wasn't allowed/.test(cs), "and shows his role, with nothing refused (the placeholders never went up)");

  console.log("4. The charter charts a pitch; the coach's Sync now brings it back");
  await charter.locator(".tabs button", { hasText: "Game" }).click(); await charter.waitForTimeout(300);
  const n0 = await charter.evaluate(() => G().pitchNo);
  for (let i = 0; i < 10 && (await charter.evaluate(() => G().pitchNo)) === n0; i++) { await charter.keyboard.press("b"); await charter.waitForTimeout(150); }
  const synced = await charter.evaluate(async () => { const r = await syncNow(true); return r ? r.push.applied : "no sync"; });
  console.log(`     (charter logged a pitch: ${(await charter.evaluate(() => G().pitchNo)) > n0}; his sync pushed ${synced})`);
  await toSetup(coach);
  await coach.getByRole("button", { name: "Sync now" }).click(); await coach.waitForTimeout(1200);
  const back = await coach.evaluate(async () => (await DB.D.all("events")).filter((e) => e.type === "pitch").length);
  check(back === 9, `the coach's iPad now has the charter's pitch too (${back} pitches)`);

  console.log("5. No signal: the button says so and nothing is lost");
  await coach.context().setOffline(true);
  await coach.locator(".tabs button", { hasText: "Game" }).click(); await coach.waitForTimeout(200);
  await coach.keyboard.press("c"); await coach.waitForTimeout(200);
  await toSetup(coach);
  await coach.getByRole("button", { name: "Sync now" }).click(); await coach.waitForTimeout(600);
  const msg = await coach.locator(".srow", { hasText: "Sync with Supabase" }).innerText();
  check(/No signal|Couldn't reach/.test(msg), `offline sync says so ("${(msg.match(/(No signal|Couldn't reach)[^.]*/) || [""])[0]}")`);
  await coach.context().setOffline(false);
  await coach.getByRole("button", { name: "Sync now" }).click(); await coach.waitForTimeout(1200);
  const n = (await su.query("select count(*)::int n from public.events where program_id = $1 and type = 'pitch'", [progId])).rows[0].n;
  check(n === 10, `back online, the pitch charted with no signal is on the server (${n} pitches)`);

  console.log("6. Mid-game, the coach re-grades and renames the pitch the charter's screen is calling");
  await charter.locator(".tabs button", { hasText: "Game" }).click(); await charter.waitForTimeout(300);
  const before = await charter.evaluate(() => ({ v: G().packV || 0, pitch: G().call && G().call.pitch, pid: pitcherDef().id }));
  await coach.evaluate(async ({ pid, pitch }) => {
    const p = DB.pitchers.get(pid); const d = p.pitches.find((x) => x.name === pitch);
    d.grade = Math.min(80, +d.grade + 5); d.name = pitch + " (new grip)"; await dbPut("pitchers", p); await syncNow(true);
  }, before);
  await coach.waitForTimeout(600);
  await charter.evaluate(() => syncNow(true)); await charter.waitForTimeout(1000);
  const after = await charter.evaluate(async () => ({ v: G().packV, call: G().call && G().call.pitch, last: (await DB.D.get("packs", G().packId)) }));
  check(after.v === before.v + 1 && after.last && after.last.reason === "sync", `the charter's game logged a new pack version for it (v${before.v} -> v${after.v}, reason "${after.last && after.last.reason}")`);
  check(after.call !== before.pitch, `the call for "${before.pitch}" (no longer on his arsenal) was replaced ("${after.call}")`);
  const pitchesBefore = await charter.evaluate(async () => (await DB.D.all("events")).filter((e) => e.type === "pitch").length);
  await charter.keyboard.press("c"); await charter.waitForTimeout(300);
  const ev = await charter.evaluate(async () => { const xs = (await DB.D.all("events")).filter((e) => e.type === "pitch").sort((a, b) => b.createdAt - a.createdAt); return { n: xs.length, packId: xs[0].packId, now: G().packId }; });
  check(ev.n === pitchesBefore + 1 && ev.packId === ev.now, `the next pitch records normally, under the new pack (${ev.n} pitches)`);
  const rejected = await charter.evaluate(async () => (await SYNC.sync.state()).rejected.length);
  check(rejected === 0, `the charter has nothing refused after pulling the coach's pitcher edit (${rejected})`);

  console.log("7. The sign-in runs out");
  await coach.evaluate(async () => { const a = await DB.D.get("meta", "auth"); a.refresh = "revoked"; a.expiresAt = Date.now() - 1000; await DB.D.put("meta", a); });
  await toSetup(coach); await coach.getByRole("button", { name: "Sync now" }).click(); await coach.waitForTimeout(800);
  const t7 = await coach.locator(".srow", { hasText: "Sync with Supabase" }).innerText();
  check(/sign-in expired/.test(t7) && (await coach.locator("#sync-pass").count()) === 1, "a refused refresh says to sign in again and shows the sign-in form");
  await coach.locator("#sync-pass").fill("anything"); await coach.getByRole("button", { name: "Sign in" }).click(); await coach.waitForTimeout(1000);
  check(/RIT Tigers as head coach/.test(await coach.locator(".srow", { hasText: "Sync with Supabase" }).innerText()), "signing in again goes straight back to the program and syncs");

  console.log("8. Both iPads chart the same game (D12): it counts once");
  for (const pg of [coach, charter]) await pg.evaluate(() => { endGame(); });   // close the games from the sections above
  await coach.waitForTimeout(2500);
  const pidSame = await coach.evaluate(() => S.setup.staffIds[0]);
  const chartSame = async (pg) => {
    await pg.evaluate((pid) => { S.setup.staffIds = [pid].concat(S.setup.staffIds.filter((x) => x !== pid)); attachStaff(); G().pitcher = 0; S.view = "live"; save(); render(); }, pidSame);
    for (let i = 0; i < 12; i++) {
      // the coach's own call, the way the "Your call" box sets it, so both iPads record the same pitch
      await pg.evaluate(() => { if (!G().call) makeCall(); const d = pitcherDef().pitches[0], gr = E.gradeCall(arsenal(), situation(), d.name, "middle");
        G().call = Object.assign({}, G().call, { pitch: d.name, quad: "middle", coach: true, runs: gr.runs_vs_best, verdict: "In the engine's mix" }); render(); });
      await pg.keyboard.press(i % 3 === 2 ? "c" : "b"); await pg.waitForTimeout(110);
      if (await pg.evaluate(() => !!G().inningOver)) { await pg.getByRole("button", { name: /^Take the field/ }).click(); await pg.waitForTimeout(120); }
    }
    const id = await pg.evaluate(() => G().dbId); await pg.evaluate(() => endGame()); await pg.waitForTimeout(2500); return id;
  };
  const gCoach = await chartSame(coach), gCharter = await chartSame(charter);
  await charter.evaluate(() => syncNow(true)); await charter.waitForTimeout(2500);
  await coach.evaluate(() => syncNow(true)); await coach.waitForTimeout(2500);
  const twins = (await su.query("select id, doc->>'dupOf' dup from public.games where program_id = $1 and id = any($2)", [progId, [gCoach, gCharter]])).rows;
  const dropped = twins.find((r) => r.dup), kept = twins.find((r) => !r.dup);
  check(twins.length === 2 && dropped && kept && dropped.dup === kept.id, `the two records of one game: one marked as charted twice, pointing at the other (${twins.map((r) => (r.dup ? "dup" : "kept")).join(", ")})`);
  const others = (await su.query("select count(*)::int n from public.games where program_id = $1 and doc->>'dupOf' is not null", [progId])).rows[0].n;
  check(others === 1, `the short games from the sections above aren't marked (${others} marked in all)`);
  const prof = await coach.evaluate((pid) => { const m = pModel(pid); return m ? m.profile.games.map((g) => g.id) : []; }, pidSame);
  check(prof.includes(kept.id) && !prof.includes(dropped.id), "the coach's iPad learns from it once (the learned record came down with the duplicate left out)");
  await toSetup(coach); await coach.evaluate(async (g) => { S.view = "data"; await pastFixLoad(g); }, dropped.id); await coach.waitForTimeout(400);
  check(await coach.getByText(/same game as another iPad/).count() === 1, "Data, Fix a pitch says so, with a way to say they're different games");

  console.log("9. One iPad holds one program; a join with no signal saves nothing");
  {
    const other = (await su.query("select id from public.programs where name = 'RIT Tigers'")).rows[0];
    await asUser(users["coach@test.local"], "select public.pc_create_program('Summer ball')");
    await toSetup(coach);
    await coach.getByRole("button", { name: "Sign out" }).click(); await coach.waitForTimeout(300);
    await coach.locator("#sync-pass").fill("anything"); await coach.getByRole("button", { name: "Sign in" }).click(); await coach.waitForTimeout(900);
    const summer = coach.locator(".srow", { hasText: "Sync with Supabase" }).getByRole("button", { name: /Summer ball/ });
    const disabled = await summer.isDisabled();
    const msg = await coach.evaluate(() => joinProgram({ program_id: SYNC.programs.find((p) => p.name === "Summer ball").program_id, name: "Summer ball", role: "head_coach" }).then(() => "joined", (e) => e.message));
    const leaked = (await su.query("select count(*)::int n from public.events e join public.programs p on p.id = e.program_id where p.name = 'Summer ball'")).rows[0].n;
    check(disabled && /holds the data for RIT Tigers/.test(msg) && leaked === 0, `the coach's iPad can't take Summer ball: the choice is greyed out, joining says why, nothing of RIT's went there ("${msg.slice(0, 60)}...", ${leaked} pitches)`);
    check(await coach.getByRole("button", { name: /start this iPad fresh/ }).count() === 1, "and it offers to back up and start this iPad fresh");
    const fresh = await open();
    await fresh.evaluate(async () => { const t = ourTeam(); t.name = "Placeholder"; await dbPut("teams", t); });
    await signIn(fresh, "charter@test.local");
    await fresh.context().setOffline(true);
    await fresh.locator(".srow", { hasText: "Sync with Supabase" }).getByRole("button", { name: /RIT Tigers/ }).click(); await fresh.waitForTimeout(600);
    const cfg = await fresh.evaluate(async () => ({ prog: (await DB.D.get("meta", "syncConfig")).programId || null, text: document.querySelector(".srow").innerText }));
    await fresh.context().setOffline(false);
    await fresh.evaluate(() => endGame()); await fresh.waitForTimeout(1500);
    const placeholders = (await su.query("select count(*)::int n from public.teams where doc->>'name' = 'Placeholder'")).rows[0].n;
    check(!cfg.prog && placeholders === 0, `joining with no signal leaves the iPad unjoined and its placeholder team off the server (program saved: ${cfg.prog}, placeholder teams up: ${placeholders})`);
  }

  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  await browser.close(); server.close(); await db.end(); await su.end();
  console.log(fails ? `\n${fails} app sync check(s) FAILED` : "\nall app sync checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
