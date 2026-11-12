/*
 * The coach portal (Plan 3a) against a real local Supabase and the built site: each screen's flow, a coach on two teams,
 * a viewer, and an edit made on the website arriving on the iPad and the other way round.
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/portal_e2e.js
 */
const { chromium } = require("playwright");
const fakeMail = require("./fake_resend");
const { Client } = require("pg");
const path = require("path"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3196, SITE = `http://localhost:${PORT}`;
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
  for (const n of ["coach", "asst", "viewer", "other"]) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token;
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });
  const activate = async (org, team) => { await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]); await db.query("update public.programs set status = 'active' where id = $1", [team]); };
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const tA = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await activate(org, tA);
  const org2 = await rpc("other", "pc_create_org", { name: "Summer League", level: "travel" });
  const tB = await rpc("other", "pc_create_team", { org: org2, name: "Rochester Summer", level: "travel", timezone: "America/New_York", join_as: "head" });
  await activate(org2, tB);
  const join = async (inviter, team, who, role) => { const tok = await rpc(inviter, "pc_invite", { p: team, member_role: role, pitcher: null, invite_email: null, under13: false }); await rpc(who, "pc_accept_invite", { tok }); };
  await join("coach", tA, "viewer", "viewer");
  await join("other", tB, "coach", "caller");                   // the coach is also a pitch caller on another org's team

  const M = await fakeMail.start({ port: 12113 });
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production",
      RESEND_API_KEY: "re_test_fake_portal", RESEND_FAKE_API: "http://127.0.0.1:12113", EMAIL_FROM: "PitchIQ <team@test.local>" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async (w = 1180) => { const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(String(e))); return p; };
  const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.locator("main:visible").first().waitFor({ timeout: 10000 }).catch(() => {}); };
  const text = async (p, re) => { let t = ""; for (let i = 0; i < 50; i++) { t = await p.locator("main:visible").first().innerText().catch(() => ""); if (!re || re.test(t)) return t; await wait(200); } return t; };
  const goto = async (p, u) => { await p.goto(SITE + u); await settle(p); };
  const submit = async (p, form, button, to) => {
    const before = p.url();
    await p.getByRole("form", { name: form }).getByRole("button", { name: button, exact: true }).first().click();
    await p.waitForURL(to || ((u) => u.href !== before), { timeout: 10000 }).catch(() => {});
    await settle(p);
  };
  const signIn = async (p, n) => {
    await goto(p, "/login?next=/app");
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${n}@test.local`); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {}); await settle(p);
  };
  const srvPitchers = async (team) => (await db.query("select doc from public.pitchers where program_id = $1 and deleted_at is null", [team])).rows.map((r) => r.doc);
  const shots = path.join(ROOT, "web/tests/screens"); require("fs").mkdirSync(shots, { recursive: true });

  try {
    console.log("1. The coach opens his team");
    const coach = await fresh();
    await signIn(coach, "coach");
    await coach.getByRole("link", { name: "RIT Tigers" }).click(); await coach.waitForURL(/\/app\/t\//, { timeout: 10000 }).catch(() => {}); await settle(coach);
    check(new URL(coach.url()).pathname === `/app/t/${tA}` && /No pitchers yet/.test(await text(coach, /No pitchers yet/)), "his team's home page, empty so far");
    // the launcher's tiles (the dock steps aside on the launcher at laptop width; inside a screen it carries the same list)
    const nav = await coach.getByRole("list", { name: "Screens you can open" }).innerText();
    check(["Game Day", "Roster", "Opponents", "Staff", "Settings", "Game app"].every((x) => nav.includes(x)), "the head coach sees a tile for every section");

    console.log("2. Roster: paste the names");
    await goto(coach, `/app/t/${tA}/roster`);
    await coach.getByRole("form", { name: "Add pitchers" }).getByLabel(/Paste your pitchers/).fill("12 Smith\n7 Jones L\nAvery Brooks");
    await submit(coach, "Add pitchers", "Add pitchers");
    const ps = await srvPitchers(tA);
    const ours = (await db.query("select doc from public.teams where program_id = $1 and (doc->>'isOurs')::boolean", [tA])).rows;
    check(/Added 3/.test(await text(coach, /Added/)) && ps.length === 3 && ours.length === 1 && ps.every((p) => p.teamId === ours[0].doc.id && p.pitches.length === 2 && p.pitches.every((d) => d.grade === 3)),
      "three pitchers on the server, on the team's own team record, each with a fastball and a changeup graded 3");
    check(ps.find((p) => p.name === "Jones").hand === "L" && ps.find((p) => p.name === "Smith").number === "12", "numbers and throwing hand read from the lines");
    await coach.screenshot({ path: path.join(shots, "roster.png"), fullPage: true });

    console.log("3. A pitcher's arsenal");
    const smith = ps.find((p) => p.name === "Smith");
    await goto(coach, `/app/t/${tA}/roster/${smith.id}`);
    const f = coach.getByRole("form", { name: "Pitcher" });
    await f.getByLabel("Pitch 1 stuff").fill("5"); await f.getByLabel("Pitch 2 command").fill("2"); await f.getByLabel("Add a pitch").selectOption("Slider");
    await submit(coach, "Pitcher", "Save", (u) => /ok=saved/.test(u.search));
    const s2 = (await srvPitchers(tA)).find((p) => p.id === smith.id);
    check(s2.pitches.length === 3 && s2.pitches[0].grade === 5 && s2.pitches[1].command === 2 && s2.pitches[2].kind === "SL" && s2.pitches[2].grade === 3, `saved: stuff 5, command 2, a slider added at 3 (${s2.pitches.map((d) => `${d.name} ${d.grade}/${d.command}`).join(", ")})`);
    await coach.screenshot({ path: path.join(shots, "pitcher.png"), fullPage: true });

    console.log("4. An invite link for a pitcher");
    await goto(coach, `/app/t/${tA}/roster`);
    await coach.getByRole("row", { name: /Brooks/ }).locator("summary", { hasText: "Invite" }).click();
    await submit(coach, "Invite Avery Brooks", "Make invite link", (u) => /invite=/.test(u.search));
    check(/\/join\/[0-9a-f]{64}/.test(await text(coach, /join\//)), "the link to send is on the page");
    check(/Invited/.test(await coach.getByRole("row", { name: /Brooks/ }).innerText()), "and the pitcher's row says he's been invited");

    console.log("4b. An invite with an email is emailed too; one for a child goes to the parent");
    // a pitcher of his own: an under-13 invite holds the pitcher's records off the server, which section 7 needs for Smith
    await http("POST", "/rest/v1/rpc/pc_push", { token: await tokenOf("coach"), body: { p: tA, tbl: "pitchers", rows: [{ id: "kid1", updatedAt: Date.now(), name: "Carter", pitches: [] }] } });
    await goto(coach, `/app/t/${tA}/roster`);
    await coach.getByRole("row", { name: /Carter/ }).locator("summary", { hasText: "Invite" }).click();
    const inv = coach.getByRole("form", { name: "Invite Carter" });
    await inv.getByLabel(/Email \(optional/).fill("smith.mom@test.local"); await inv.getByRole("checkbox", { name: /Under 13/ }).check();
    await submit(coach, "Invite Carter", "Make invite link", (u) => /invite=/.test(u.search));
    const pageTok = ((await text(coach, /join\//)).match(/join\/([0-9a-f]{64})/) || [])[1];
    const pm = M.inbox.find((m) => m.to[0] === "smith.mom@test.local");
    check(pm && /Your child's invite to RIT Tigers/.test(pm.subject) && pm.text.includes(`/join/${pageTok}`) && /through a parent or guardian/.test(pm.text) && /coach@test\.local invited/.test(pm.text),
      `the parent gets the link by email, told he joins for his child (${pm ? pm.subject : JSON.stringify(M.inbox.map((m) => [m.to, m.subject]))})`);
    check(/We emailed it too/.test(await text(coach, /emailed/)), "and the page says it was emailed as well as showing the link");
    check(!M.inbox.some((m) => /Brooks/.test(m.text)), "an invite made without an email sends nothing");

    console.log("5. Opponents: nine hitters in under a minute");
    await goto(coach, `/app/t/${tA}/opponents`);
    await coach.getByRole("form", { name: "Add an opponent" }).getByLabel("Opponent").fill("Ithaca College");
    await submit(coach, "Add an opponent", "Add");
    await coach.getByRole("link", { name: "Ithaca College" }).click(); await coach.waitForURL(/opponents\//).catch(() => {}); await settle(coach);
    const t0 = Date.now();
    await coach.getByRole("form", { name: "Add hitters" }).getByLabel(/Their hitters/).fill("1 Avila R\n2 Baker L\n3 Cruz S\n4 Dunn\n5 Ellis L\n6 Ford R\n7 Gray L\n8 Hale R\n9 Ito S");
    await submit(coach, "Add hitters", "Save hitters", (u) => /ok=hitters/.test(u.search));
    const ms = Date.now() - t0;
    const hit = (await db.query("select doc from public.hitters where program_id = $1", [tA])).rows.map((r) => r.doc);
    check(hit.length === 9 && hit.find((x) => x.number === "3").bats === "S" && hit.find((x) => x.number === "4").bats === "R", `nine hitters with how they bat, saved in ${(ms / 1000).toFixed(1)} s of the coach's typing and the save`);
    await coach.getByRole("form", { name: "Add hitters" }).getByLabel(/Their hitters/).fill("4 Dunn L");
    await submit(coach, "Add hitters", "Save hitters", (u) => /n=1/.test(u.search));
    const hit2 = (await db.query("select doc from public.hitters where program_id = $1", [tA])).rows.map((r) => r.doc);
    check(hit2.length === 9 && hit2.find((x) => x.number === "4").bats === "L", "typing a number again updates that hitter instead of adding a second");

    console.log("6. Staff: presets and the advanced toggles");
    await goto(coach, `/app/t/${tA}/staff`);
    await coach.getByRole("form", { name: "Invite a coach" }).getByLabel("Invite as").selectOption("pitching");
    await submit(coach, "Invite a coach", "Make invite link", (u) => /invite=/.test(u.search));
    const tok = (await text(coach, /join\//)).match(/join\/([0-9a-f]{64})/)[1];
    await rpc("asst", "pc_accept_invite", { tok });
    await coach.getByRole("form", { name: "Invite a coach" }).getByLabel("Invite as").selectOption("caller");
    await coach.getByRole("form", { name: "Invite a coach" }).getByLabel(/^Email/).fill("newcaller@test.local");
    await submit(coach, "Invite a coach", "Make invite link", (u) => /mailed=/.test(u.search));
    const cm = M.inbox.find((m) => m.to[0] === "newcaller@test.local");
    check(cm && /You're invited to RIT Tigers/.test(cm.subject) && /as a pitch caller/.test(cm.text) && /\/join\/[0-9a-f]{64}/.test(cm.text) && cm.from === "PitchIQ <team@test.local>",
      `a coach invite with an email is emailed: the team, the role and the link (${cm && cm.subject})`);
    await goto(coach, `/app/t/${tA}/staff`);
    const row = coach.getByRole("form", { name: "Preset for asst@test.local" });
    await row.getByText("Advanced").click(); await row.getByLabel("Staff").check(); await row.getByLabel("Edit grades").uncheck();
    await row.getByRole("button", { name: "Save" }).click(); await coach.waitForURL(/ok=member/).catch(() => {}); await settle(coach);
    const m = (await db.query("select role, perms from public.members where program_id = $1 and user_id = $2", [tA, U.asst])).rows[0];
    check(m.role === "pitching" && m.perms.manage_staff === true && m.perms.edit_grades === false && Object.keys(m.perms).length === 2, `the pitching coach, with Staff added and Edit grades taken off (${JSON.stringify(m.perms)})`);
    await coach.screenshot({ path: path.join(shots, "staff.png"), fullPage: true });

    console.log("7. Settings and the home page");
    await goto(coach, `/app/t/${tA}/settings`);
    const sf = coach.getByRole("form", { name: "Team settings" });
    await sf.getByLabel("Time zone (the team's dates and rest days)").selectOption("America/Chicago"); await sf.getByLabel("Pitch-count rule").selectOption("ps-19-22");
    await submit(coach, "Team settings", "Save", (u) => /ok=saved/.test(u.search));
    const prog = (await db.query("select timezone from public.programs where id = $1", [tA])).rows[0];
    const ourDoc = (await db.query("select doc from public.teams where program_id = $1 and (doc->>'isOurs')::boolean", [tA])).rows[0].doc;
    check(prog.timezone === "America/Chicago" && ourDoc.pitchRule && ourDoc.pitchRule.preset === "ps-19-22", "the time zone is the team's and the rule is on the team's record (so the iPad gets it)");
    const day = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const tk = await tokenOf("coach");
    const push = (tbl, rows) => http("POST", "/rest/v1/rpc/pc_push", { token: tk, body: { p: tA, tbl, rows } });
    await push("games", [{ id: "g1", updatedAt: Date.now(), date: day(1), status: "final", opponentId: (await db.query("select id from public.teams where program_id = $1 and doc->>'name' = 'Ithaca College'", [tA])).rows[0].id }]);
    await push("events", Array.from({ length: 85 }, (_, i) => ({ id: `e${i}`, updatedAt: Date.now(), gameId: "g1", pitcherId: smith.id, type: "pitch" })));
    await goto(coach, `/app/t/${tA}`);
    const home = await text(coach, /Smith/);
    const smithRow = await coach.getByRole("row", { name: /Smith/ }).innerText();
    check(/Under Pitch Smart, ages 19-22/.test(home) && /85 pitches/.test(smithRow) && /85/.test(smithRow), `availability: his last outing and the week (${smithRow.replace(/\s+/g, " ")})`);
    const elig = new Date(Date.now() + 4 * 86400000).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
    check(smithRow.includes(elig), `85 pitches yesterday (4 days off): eligible ${elig}`);
    check(/Today/.test(await coach.getByRole("row", { name: /Jones/ }).innerText()), "a pitcher who hasn't thrown is available today");
    check(/vs Ithaca College/.test(home), "the game is under recent games");
    await coach.screenshot({ path: path.join(shots, "home.png"), fullPage: true });
    const phone = await fresh(390); await signIn(phone, "coach"); await goto(phone, `/app/t/${tA}`);
    check((await phone.evaluate(() => document.documentElement.scrollWidth)) <= 390, `on a phone the home page fits the screen (${await phone.evaluate(() => document.documentElement.scrollWidth)} px)`);
    await phone.screenshot({ path: path.join(shots, "home-phone.png"), fullPage: true });

    console.log("8. A coach on two teams sees each separately");
    await goto(coach, `/app/t/${tA}`);
    await coach.getByText("RIT Tigers", { exact: true }).first().click().catch(() => {});
    check(await coach.getByRole("link", { name: "Rochester Summer" }).count() >= 1, "the switcher lists his other team");
    await goto(coach, `/app/t/${tB}/roster`);
    const rB = await text(coach, /Roster/);
    check(!/Smith|Jones|Brooks/.test(rB) && !(await coach.getByRole("form", { name: "Add pitchers" }).count()), "on the other team (where he's a pitch caller) none of RIT's pitchers, and no roster editing");
    const navB = await coach.getByRole("navigation", { name: "Screens" }).innerText();
    check(!/Settings/.test(navB) && !/Staff/.test(navB), "and no Staff or Settings there");

    console.log("9. A viewer");
    const viewer = await fresh(); await signIn(viewer, "viewer");
    await goto(viewer, `/app/t/${tA}/roster/${smith.id}`);
    check(await viewer.getByRole("button", { name: "Save" }).count() === 0 && await viewer.getByLabel("Pitch 1 stuff").isDisabled(), "sees the arsenal, can't change it");
    await goto(viewer, `/app/t/${tA}/settings`);
    check(/Settings are for coaches who manage the roster/.test(await text(viewer, /Settings/)), "and gets no settings");
    await goto(viewer, `/app/t/${tB}`);
    check(/could not be found|404/i.test(await viewer.locator("body").innerText()), "another team's page doesn't exist for him");

    console.log("10. The website and the iPad are the same team");
    const ipad = await fresh();
    await ipad.goto(SITE + "/app/game/"); await ipad.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
    await ipad.locator(".tabs button", { hasText: "Setup" }).click(); await ipad.waitForTimeout(300);
    await ipad.locator("#sync-email").fill("coach@test.local"); await ipad.locator("#sync-pass").fill(PASS);
    await ipad.getByRole("button", { name: "Sign in" }).click(); await ipad.waitForTimeout(1200);
    await ipad.getByRole("button", { name: /RIT Tigers/ }).click(); await ipad.waitForTimeout(2500);
    const onIpad = await ipad.evaluate(() => ({ names: [...DB.pitchers.values()].map((p) => p.name).filter(Boolean).sort(), stubs: [...DB.pitchers.values()].filter((p) => !p.name).length, rule: (ourTeam() || {}).pitchRule, slider: ([...DB.pitchers.values()].find((p) => p.name === "Smith") || { pitches: [] }).pitches.map((d) => d.kind).join() }));
    check(JSON.stringify(onIpad.names) === JSON.stringify(["Avery Brooks", "Jones", "Smith"]) && onIpad.slider === "FB,CH,SL" && onIpad.rule && onIpad.rule.preset === "ps-19-22",
      `the iPad has the website's roster, Smith's new slider and the team's rule (${onIpad.names.join(", ")}; Carter, held as under 13 without consent, comes as a nameless stub: ${onIpad.stubs})`);
    await ipad.evaluate(async () => { const p = [...DB.pitchers.values()].find((x) => x.name === "Jones"); p.name = "Jones (from the iPad)"; await dbPut("pitchers", p); await syncNow(true); });
    await goto(coach, `/app/t/${tA}/roster`);
    check(/Jones \(from the iPad\)/.test(await text(coach, /from the iPad/)), "and a change on the iPad shows on the website");

    check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
    check(!/Error:|⨯/.test(webLog), "no server errors" + (/Error:|⨯/.test(webLog) ? ":\n" + webLog.split("\n").filter((l) => /Error|⨯/.test(l)).slice(0, 6).join("\n") : ""));
  } finally {
    await browser.close(); web.kill(); await M.close(); await db.end();
  }
  console.log(fails ? `\n${fails} portal check(s) FAILED` : "\nall portal checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
