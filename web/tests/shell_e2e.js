/*
 * The signed-in web shell end to end, against a real local Supabase (`supabase start`: its Auth, REST gateway and
 * Postgres, with this repo's migrations applied fresh by `supabase db reset` at the start of the run), and the built
 * site (`next start`). Run from the repo root after `npm run build` in web/:
 *   node web/tests/shell_e2e.js
 * Needs Docker and the local stack running (npx supabase@2.122.1 start). Never points at a hosted project.
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), { spawn, execFileSync } = require("child_process");

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
      if (res.status === 503 && i < 20) { await wait(500); continue; }   // the gateway right after a reset
      if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
      return json;
    }
  };
  const PASS = "test-pass-1234";
  const users = {};
  for (const n of ["coach", "asst", "mom", "other"]) users[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token;
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });

  // the coach's organization: one paid-up team, and a second one still waiting for billing
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const rit = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  const fall = await rpc("coach", "pc_create_team", { org, name: "RIT Fall Ball", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [rit]);
  await db.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p_kid', $2), ($1, 'p_teen', $3)", [rit,
    { id: "p_kid", updatedAt: 1000, teamId: "ours", name: "Young arm", number: "7", hand: "R", pitches: [] },
    { id: "p_teen", updatedAt: 1000, teamId: "ours", name: "Teen arm", number: "8", hand: "L", pitches: [] }]);

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    return page;
  };
  // a form's Server Action answers with a redirect the router follows on the client: wait for where it should land,
  // then for the streamed part of the page
  const settle = async (page) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.locator("main:visible").first().waitFor({ timeout: 10000 }).catch(() => {}); };
  const submit = async (page, button, to, scope) => {
    const before = page.url();
    await (scope || page).getByRole("button", { name: button, exact: true }).first().click();
    await page.waitForURL(to || ((u) => u.href !== before), { timeout: 10000 }).catch(() => {});
    await settle(page);
  };
  const mainText = async (page, re) => {
    let t = "";
    for (let i = 0; i < 50; i++) { t = await page.locator("main:visible").first().innerText().catch(() => ""); if (!re || re.test(t)) return t; await wait(200); }
    return t;
  };
  const signInForm = async (page, n, to) => {
    const f = page.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${n}@test.local`); await f.getByLabel("Password").fill(PASS);
    await submit(page, "Sign in", to || ((u) => u.pathname !== "/login"), f);
  };
  const goto = async (page, url) => { await page.goto(url); await settle(page); };
  const born = async (page, month, year) => {
    await page.getByLabel("Month").selectOption(String(month)); await page.getByLabel("Year").selectOption(String(year));
  };
  const cards = async (page) => { await page.locator(".team-card h2:visible").first().waitFor({ timeout: 10000 }).catch(() => {}); return page.locator(".team-card h2:visible").allInnerTexts(); };
  const now = new Date();

  try {
    console.log("1. Signed out, /app sends you to sign in");
    const coach = await fresh();
    await goto(coach, SITE + "/app");
    const u = new URL(coach.url());
    check(u.pathname === "/login" && u.searchParams.get("next") === "/app", `redirected to ${u.pathname}${u.search}`);

    console.log("2. Signed in, /app shows exactly your teams");
    await signInForm(coach, "coach");
    const mine = (await rpc("coach", "pc_my_teams")).map((t) => t.team_name).sort();
    const shown = (await cards(coach)).sort();
    check(new URL(coach.url()).pathname === "/app" && JSON.stringify(shown) === JSON.stringify(mine), `the team cards are pc_my_teams' teams (${shown.join(", ")})`);
    const fallCard = await coach.locator(".team-card:visible", { hasText: "RIT Fall Ball" }).innerText();
    const ritCard = await coach.locator(".team-card:visible", { hasText: "RIT Tigers" }).innerText();
    check(/Not active/.test(fallCard) && !/Not active/.test(ritCard), "the team waiting for billing is marked Not active, the paid-up one isn't");
    check(/Organizations you own/.test(await mainText(coach)) && /RIT Baseball/.test(await coach.locator(".org-list:visible").innerText()), "and the organization he owns is listed");
    await submit(coach, "Sign out");
    await goto(coach, SITE + "/app");
    check(new URL(coach.url()).pathname === "/login", "signing out ends the session");

    console.log("3. Sign-in only ever goes on to a page on this site");
    await coach.goto(SITE + "/login?next=" + encodeURIComponent("//evil.example/steal")); await signInForm(coach, "coach");
    check(new URL(coach.url()).host === `localhost:${PORT}` && new URL(coach.url()).pathname === "/app", `a next of //evil.example lands on ${new URL(coach.url()).host}${new URL(coach.url()).pathname}`);

    console.log("4. A coach follows an invite link: the age question, sign in, join");
    const asstTok = await rpc("coach", "pc_invite", { p: rit, member_role: "pitching", pitcher: null, invite_email: null, under13: false });
    const asst = await fresh();
    await goto(asst, `${SITE}/join/${asstTok}`);
    check(await asst.getByRole("form", { name: "Your age" }).count() === 1 && !(await mainText(asst)).includes("RIT"), "signed out, the link asks when you were born first and shows nothing about the team");
    await born(asst, 4, 1990); await submit(asst, "Continue", (u) => u.pathname === "/login");
    const au = new URL(asst.url());
    check(au.pathname === "/login" && au.searchParams.get("next") === `/join/${asstTok}`, "an adult goes on to sign in, coming back to the invite");
    check(await asst.locator("select[name=birth_month]:visible").count() === 0, "and isn't asked his age again to make an account");
    await signInForm(asst, "asst");
    const at = await mainText(asst, /Join RIT Tigers as pitching coach/);
    check(/Join RIT Tigers as pitching coach/.test(at), `signed in, the invite shows the team and the preset (${asst.url().slice(-20)}: "${at.slice(0, 90).replace(/\n/g, " / ")}")`);
    await submit(asst, "Join RIT Tigers");
    const asstCard = await asst.locator(".team-card:visible", { hasText: "RIT Tigers" }).innerText().catch(() => "");
    check(new URL(asst.url()).pathname === "/app" && /pitching coach/i.test(asstCard), `joining lands on /app with the new team on it (${asst.url()}: "${asstCard}")`);
    await goto(asst, `${SITE}/join/${asstTok}`);
    check(/expired or was already used/.test(await mainText(asst)), "the same link can't be used twice");

    console.log("5. A player under 13 follows a link: no account, the invite goes to a parent");
    const kidTok = await rpc("coach", "pc_invite", { p: rit, member_role: "player", pitcher: "p_kid", invite_email: null, under13: false });
    const before = +(await db.query("select count(*) n from auth.users")).rows[0].n;
    const kid = await fresh();
    await goto(kid, `${SITE}/join/${kidTok}`);
    await born(kid, now.getUTCMonth() + 1, now.getUTCFullYear() - 12); await submit(kid, "Continue");
    check(await kid.getByLabel("Parent or guardian's email").count() === 1 && await kid.getByLabel("Password").count() === 0, "under 13, he's asked only for a parent's email: no email or password of his own");
    await kid.getByLabel("Parent or guardian's email").fill("Mom@Test.local"); await submit(kid, "Send to my parent");
    check(/Nothing about you was saved/.test(await mainText(kid)), "he's told a parent finishes joining");
    const moved = (await db.query("select token, under13 from public.invites where program_id = $1 and pitcher_id = 'p_kid' and email = 'mom@test.local' and used_at is null", [rit])).rows;
    const kidDoc = (await db.query("select doc from public.pitchers where program_id = $1 and id = 'p_kid'", [rit])).rows[0].doc;
    check(moved.length === 1 && moved[0].under13 && (await db.query("select used_at from public.invites where token = $1", [kidTok])).rows[0].used_at, "the invite moved to the parent's email, marked under 13, and his link is spent");
    check(kidDoc.name === "Young arm" && +(await db.query("select count(*) n from auth.users")).rows[0].n === before, "no account was made, and his record is untouched until a coach approves the parent's email");
    await goto(kid, `${SITE}/login?mode=signup`);
    const su = kid.getByRole("form", { name: "Make an account" });
    check(await su.getByLabel("Month").count() === 0, "back on the sign-up form the same day, the age question isn't offered again");
    await su.getByLabel("Email").fill("kid@test.local"); await su.getByLabel("Password (8 characters or more)").fill(PASS); await su.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
    await submit(kid, "Make account", (u) => /error=/.test(u.search), su);
    check(/under 13 can't make their own account/.test(await mainText(kid)) && +(await db.query("select count(*) n from auth.users where email = 'kid@test.local'")).rows[0].n === 0, "and making an account anyway is refused, with nothing stored");

    const tiedTok = await rpc("coach", "pc_invite", { p: rit, member_role: "player", pitcher: "p_teen", invite_email: "teen@test.local", under13: false });
    const kid2 = await fresh();
    await goto(kid2, `${SITE}/join/${tiedTok}`);
    await born(kid2, now.getUTCMonth() + 1, now.getUTCFullYear() - 11); await submit(kid2, "Continue");
    await kid2.getByLabel("Parent or guardian's email").fill("someone@test.local"); await submit(kid2, "Send to my parent");
    check(/sent to one email/.test(await mainText(kid2, /sent to one email/)) && (await db.query("select used_at from public.invites where token = $1", [tiedTok])).rows[0].used_at === null,
      "an invite sent to someone's email can't be passed to a 'parent' by whoever opens it");
    await rpc("coach", "pc_cancel_invite", { tok: tiedTok });

    console.log("6. The coach approves the parent's email; the parent opens the invite, agrees, and joins for the child");
    const mom = await fresh();
    await goto(mom, `${SITE}/join/${moved[0].token}`);
    await born(mom, 6, 1985); await submit(mom, "Continue");
    await signInForm(mom, "mom");
    const wt = await mainText(mom, /hasn't approved this invite yet/);
    check(/hasn't approved this invite yet/.test(wt), `(${wt.slice(0, 90).replace(/\n/g, " / ")}) before the coach approves the email the child typed, the parent is told to wait`);
    await rpc("coach", "pc_approve_invite", { tok: moved[0].token });
    const heldDoc = (await db.query("select doc from public.pitchers where program_id = $1 and id = 'p_kid'", [rit])).rows[0].doc;
    check(!("name" in heldDoc), `the coach's approval holds the child's record to the placeholder until the parent agrees (${Object.keys(heldDoc).sort().join(",")})`);
    await mom.reload(); await settle(mom);
    const mt = await mainText(mom, /Join RIT Tigers as player/);
    check(/Join RIT Tigers as player/.test(mt) && await mom.getByRole("checkbox", { name: /parent or guardian and I agree/ }).count() === 1, "the parent sees the notice and a consent box");
    await mom.getByRole("button", { name: "Join RIT Tigers" }).click();
    check(new URL(mom.url()).pathname === `/join/${moved[0].token}`, "joining without ticking the box doesn't go through");
    await mom.getByRole("checkbox", { name: /parent or guardian and I agree/ }).check(); await submit(mom, "Join RIT Tigers");
    const consent = (await db.query("select guardian_user_id, method from public.guardian_consents where program_id = $1 and pitcher_id = 'p_kid'", [rit])).rows[0];
    const link = (await db.query("select user_id from public.player_links where program_id = $1 and pitcher_id = 'p_kid'", [rit])).rows[0];
    check(consent && consent.guardian_user_id === users.mom && consent.method === "web_checkbox_v1" && link && link.user_id === users.mom, "consent is recorded with how it was given, and the child's record is linked to the parent");
    check(/player/i.test(await mom.locator(".team-card:visible", { hasText: "RIT Tigers" }).innerText().catch(() => "")), "the parent's /app shows the team");

    console.log("7. A signed-in player says he's under 13: he isn't linked");
    const teenTok = await rpc("coach", "pc_invite", { p: rit, member_role: "player", pitcher: "p_teen", invite_email: "other@test.local", under13: false });
    const other = await fresh();
    await other.goto(`${SITE}/login?next=${encodeURIComponent(`/join/${teenTok}`)}`); await signInForm(other, "other");
    await other.getByRole("radio", { name: "Yes" }).check(); await submit(other, "Join RIT Tigers");
    check(/parent's or guardian's email/.test(await mainText(other)), "yes without a parent's email asks for one");
    await other.getByRole("radio", { name: "Yes" }).check(); await other.getByLabel("If yes, a parent or guardian's email").fill("dad@test.local");
    await submit(other, "Join RIT Tigers");
    const teenLinked = +(await db.query("select count(*) n from public.player_links where program_id = $1 and pitcher_id = 'p_teen'", [rit])).rows[0].n;
    check(/A parent or guardian finishes joining/.test(await mainText(other)) && teenLinked === 0, "with one, he isn't linked and the invite goes to that parent");

    console.log("8. Links that can't be used");
    await goto(asst, `${SITE}/join/${await rpc("coach", "pc_invite", { p: rit, member_role: "viewer", pitcher: null, invite_email: "someone@test.local", under13: false })}`);
    check(/sent to a different email/.test(await mainText(asst)), "an invite for another email says so");
    await goto(asst, `${SITE}/join/not-a-token`);
    check(/isn't a PitchIQ invite/.test(await mainText(asst)), "a broken link says so");

    console.log("9. The sign-up email's link signs you in (production has confirmations on)");
    const signupLink = await http("POST", "/auth/v1/admin/generate_link", { key: SECRET, body: { type: "signup", email: "newcoach@test.local", password: PASS } });
    const hashed = signupLink.hashed_token || (signupLink.properties && signupLink.properties.hashed_token);
    const nc = await fresh();
    await goto(nc, `${SITE}/auth/confirm?token_hash=${hashed}&type=signup&next=/app`);
    check(new URL(nc.url()).pathname === "/app" && /Signed in as newcoach@test\.local/.test(await mainText(nc)), `the link confirms the email and signs in (${nc.url()})`);
    await goto(nc, `${SITE}/auth/confirm?token_hash=${hashed}&type=signup&next=/app`);
    const nc2 = await fresh();
    await goto(nc2, `${SITE}/auth/confirm?token_hash=${hashed}&type=signup&next=https://evil.example`);
    check(/\/login/.test(nc2.url()) && /didn't work/.test(await mainText(nc2)), "a used link goes to sign-in and says so");
    await goto(nc2, `${SITE}/auth/confirm?code=bogus&next=//evil.example`);
    check(new URL(nc2.url()).host === new URL(SITE).host, "and never off this site");

    console.log("10. Signing in before confirming the email says so, and the link can be sent again");
    await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: "unconfirmed@test.local", password: PASS, email_confirm: false } });
    const uc = await fresh();
    await goto(uc, `${SITE}/login?next=/app`);
    await uc.getByRole("form", { name: "Sign in" }).getByLabel("Email").fill("unconfirmed@test.local");
    await uc.getByRole("form", { name: "Sign in" }).getByLabel("Password").fill(PASS);
    await uc.getByRole("form", { name: "Sign in" }).getByRole("button", { name: "Sign in" }).click();
    await uc.waitForURL(/error=unconfirmed/);
    const ucText = await mainText(uc, /isn't confirmed/);
    check(/Your email isn't confirmed yet/.test(ucText) && !/don't match an account/.test(ucText), "the right password on an unconfirmed account says to confirm, not that the password is wrong");
    const rf = uc.getByRole("form", { name: "Send the confirmation email again" });
    await rf.getByLabel("Email you signed up with").fill("unconfirmed@test.local");
    await rf.getByRole("button", { name: "Send the link again" }).click();
    await uc.waitForURL(/notice=check_email|error=resend_wait/);
    check(/Check your email for a link/.test(await mainText(uc, /Check your email|Too many emails/)), `the link is sent again (${uc.url().replace(SITE, "")})`);
    await goto(uc, `${SITE}/login?next=/app`);
    await uc.getByRole("form", { name: "Sign in" }).getByLabel("Email").fill("unconfirmed@test.local");
    await uc.getByRole("form", { name: "Sign in" }).getByLabel("Password").fill("wrong-password-1");
    await uc.getByRole("form", { name: "Sign in" }).getByRole("button", { name: "Sign in" }).click();
    await uc.waitForURL(/error=bad_login/);
    check(/don't match an account/.test(await mainText(uc, /don't match/)), "a wrong password still just says it doesn't match");

    console.log("11. Making an account means agreeing to the Terms, stored with the version and time (D15)");
    const nu = await fresh();
    await goto(nu, `${SITE}/login?mode=signup&next=/app`);
    const sf = nu.getByRole("form", { name: "Make an account" });
    if (await sf.getByLabel("Month").count()) { await sf.getByLabel("Month").selectOption("5"); await sf.getByLabel("Year").selectOption(String(new Date().getUTCFullYear() - 30)); }
    await sf.getByLabel("Email").fill("agree@test.local"); await sf.getByLabel("Password (8 characters or more)").fill(PASS);
    // past the browser's own check (the box is required): the server refuses too
    await nu.evaluate(() => document.querySelector('form[aria-label="Make an account"] input[name=agree]').removeAttribute("required"));
    await sf.getByRole("button", { name: "Make account" }).click(); await nu.waitForURL(/error=agree/, { timeout: 10000 }).catch(() => {});
    check(/agree to the Terms and the Privacy Policy/.test(await mainText(nu, /agree to the Terms/)) && +(await db.query("select count(*) n from auth.users where email = 'agree@test.local'")).rows[0].n === 0,
      "without ticking the box, no account is made");
    const sf2 = nu.getByRole("form", { name: "Make an account" });
    if (await sf2.getByLabel("Month").count()) { await sf2.getByLabel("Month").selectOption("5"); await sf2.getByLabel("Year").selectOption(String(new Date().getUTCFullYear() - 30)); }
    await sf2.getByLabel("Email").fill("agree@test.local"); await sf2.getByLabel("Password (8 characters or more)").fill(PASS);
    await sf2.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
    await sf2.getByRole("button", { name: "Make account" }).click(); await nu.waitForURL((u) => u.pathname === "/app" || /notice=check_email/.test(u.search), { timeout: 10000 }).catch(() => {});
    const legal = (await db.query("select l.doc, l.version, l.via, l.accepted_at from public.legal_acceptances l join auth.users u on u.id = l.user_id where u.email = 'agree@test.local' order by l.doc")).rows;
    check(legal.length === 2 && legal.every((r) => r.via === "signup" && r.accepted_at && /^\d{4}-\d{2}-\d{2}/.test(r.version)), `ticked: the account and its agreement to both, with the version and time (${legal.map((r) => r.doc + "@" + r.version).join(", ")})`);
    if (new URL(nu.url()).pathname === "/app") check((await nu.getByRole("form", { name: "Agree to the Terms" }).count()) === 0, "and the portal doesn't ask him again");
    const old = await fresh();
    await goto(old, `${SITE}/login?next=/app`);
    const of = old.getByRole("form", { name: "Sign in" });
    await of.getByLabel("Email").fill("other@test.local"); await of.getByLabel("Password").fill(PASS); await of.getByRole("button", { name: "Sign in" }).click();
    await old.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {});
    const agreeForm = old.getByRole("form", { name: "Agree to the Terms" });
    await agreeForm.waitFor({ timeout: 10000 }).catch(() => {});   // the teams list streams in
    check(await agreeForm.count() === 1, `an account made before the Terms is asked to agree in the portal (${old.url().replace(SITE, "")})`);
    await agreeForm.getByRole("checkbox").check(); await agreeForm.getByRole("button", { name: "Agree" }).click();
    const stored = async () => +(await db.query("select count(*) n from public.legal_acceptances l join auth.users u on u.id = l.user_id where u.email = 'other@test.local' and l.via = 'portal'")).rows[0].n === 2;
    for (let i = 0; i < 40 && !(await stored()); i++) await wait(250);
    await old.getByRole("form", { name: "Agree to the Terms" }).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    check(await stored() && (await old.getByRole("form", { name: "Agree to the Terms" }).count()) === 0, "agreeing there stores it, and the prompt goes away");

    check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
    check(!/Error:|⨯/.test(webLog), "no server errors" + (/Error:|⨯/.test(webLog) ? ":\n" + webLog.split("\n").filter((l) => /Error|⨯/.test(l)).slice(0, 5).join("\n") : ""));
  } finally {
    await browser.close(); web.kill(); await db.end();
  }
  console.log(fails ? `\n${fails} shell check(s) FAILED` : "\nall shell checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
