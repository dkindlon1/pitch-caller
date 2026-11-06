/*
 * Billing (Plan 2) against a real local Supabase, the built site and a fake Stripe (fake_stripe.js) that signs its
 * webhooks with the real library: sign up and pay, a replayed event, adding a team (paid and declined), removing and
 * keeping one, a failed renewal locking everything and emailing everyone's data (a fake Resend keeps the emails), an
 * event arriving out of order, the card fixed, cancelling and coming back. Covers D5 and D6 without Stripe; the same flows against Stripe's test mode need Drew's test keys.
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/billing_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), fs = require("fs"), { spawn, execFileSync } = require("child_process");
const fake = require("./fake_stripe");
const fakeMail = require("./fake_resend");
const { unzipSync, strFromU8 } = require("fflate");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3197, SITE = `http://localhost:${PORT}`;
const FAKE_PORT = 12111, FAKE = `http://localhost:${FAKE_PORT}`, WHSEC = "whsec_test_" + "e2e", MAIL_PORT = 12112;
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
  const UID = {};
  for (const n of ["drew", "coach", "player"]) UID[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;

  const F = await fake.start({ port: FAKE_PORT, webhookUrl: `${SITE}/api/stripe/webhook`, secret: WHSEC });
  const M = await fakeMail.start({ port: MAIL_PORT });
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_fake_e2e", STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_ID: "price_team_year", STRIPE_COUPON_ID: "first_year", STRIPE_FAKE_API: FAKE,
      RESEND_API_KEY: "re_test_fake_e2e", RESEND_FAKE_API: `http://127.0.0.1:${MAIL_PORT}`, EMAIL_FROM: "PitchIQ <data@test.local>" },
    stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async () => { const p = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(String(e))); return p; };
  const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); };
  const text = async (p, re) => { let t = ""; for (let i = 0; i < 60; i++) { t = await p.locator("main:visible").first().innerText().catch(() => ""); if (!re || re.test(t)) return t; await wait(250); } return t; };
  const goto = async (p, u) => { await p.goto(SITE + u); await settle(p); };
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
  const orgRow = async () => (await db.query("select * from public.organizations where name = 'Lakeside Baseball'")).rows[0];
  const teamsOf = async (org) => (await db.query("select name, status from public.programs where org_id = $1 order by created_at, id", [org])).rows.map((r) => `${r.name}:${r.status}`).join(" ");
  const active = async (name) => (await db.query("select private.pc_team_active(id) a from public.programs where name = $1", [name])).rows[0].a;
  const subUpdates = () => F.S.calls.filter((c) => c.method === "POST" && /^\/v1\/subscriptions\//.test(c.path));
  const tclock = (q) => fetch(FAKE + q, { method: "POST" }).then((r) => r.json());
  const until = async (fn) => { for (let i = 0; i < 60; i++) { if (await fn()) return true; await wait(250); } return false; };
  const shots = path.join(ROOT, "web/tests/screens"); fs.mkdirSync(shots, { recursive: true });

  try {
    console.log("1. Sign up: name the organization, its teams, then Stripe Checkout (D5)");
    const drew = await fresh();
    await signIn(drew, "drew");
    await drew.getByRole("link", { name: "Start an organization" }).click(); await drew.waitForURL(/\/app\/new/).catch(() => {}); await settle(drew);
    // his account was made without the sign-up form, so he agrees to the Terms here first (D15)
    check((await drew.getByRole("form", { name: "New organization" }).count()) === 0, "paying needs the Terms agreed first");
    const ag = drew.getByRole("form", { name: "Agree to the Terms" });
    await ag.getByRole("checkbox").check(); await ag.getByRole("button", { name: "Agree" }).click();
    await drew.getByRole("form", { name: "New organization" }).waitFor({ timeout: 10000 }).catch(() => {});
    const acc = (await db.query("select doc, version, via from public.legal_acceptances where user_id = $1 order by doc", [UID.drew])).rows;
    check(acc.length === 2 && acc.every((r) => r.via === "portal" && /^\d{4}-\d{2}-\d{2}/.test(r.version)) && acc.map((r) => r.doc).join() === "privacy,terms", "his agreement is stored with the version and time");
    const nf = drew.getByRole("form", { name: "New organization" });
    await nf.getByLabel("Organization name").fill("Lakeside Baseball");
    await nf.getByLabel("Level").selectOption("hs");
    await nf.getByLabel(/Teams, one per line/).fill("Varsity\nJV");
    await nf.getByLabel(/You, on the first team/).selectOption("head");
    await drew.screenshot({ path: path.join(shots, "billing-signup.png"), fullPage: true });
    await nf.getByRole("button", { name: "Continue to payment" }).click();
    await drew.waitForURL((u) => u.href.startsWith(FAKE + "/pay/"), { timeout: 15000 }).catch(() => {});
    const cs = F.S.calls.find((c) => c.path === "/v1/checkout/sessions");
    let org = await orgRow();
    check(drew.url().startsWith(FAKE + "/pay/") && cs, "Continue goes to Checkout");
    check(cs && cs.body.mode === "subscription" && cs.body.line_items[0].price === "price_team_year" && cs.body.line_items[0].quantity === "2"
      && cs.body.client_reference_id === org.id && cs.body.subscription_data.metadata.org_id === org.id && cs.body.discounts[0].coupon === "first_year"
      && cs.body.customer_email === "drew@test.local" && cs.version === "2026-09-30.endive",
      `one yearly price, two teams, the first-year coupon, the owner's email, the pinned API version (${cs && JSON.stringify({ ...cs.body, success_url: undefined, cancel_url: undefined })}, ${cs && cs.version})`);
    check(org.billing_status === "pending" && await teamsOf(org.id) === "Varsity:pending JV:pending", "before paying: saved, nothing switched on");
    await drew.getByRole("button", { name: "Pay with 4242" }).click();
    await drew.waitForURL((u) => u.href.startsWith(SITE + "/app/billing"), { timeout: 15000 }).catch(() => {}); await settle(drew);
    const t1 = await text(drew, /Active/);
    org = await orgRow();
    check(/checkout=done/.test(drew.url()) && /Active/.test(t1) && /2 teams, paid through/.test(t1), `back on the billing page: active, 2 teams, paid through next year (${t1.split("\n").slice(0, 4).join(" | ")})`);
    check(org.billing_status === "active" && org.stripe_customer_id && org.stripe_subscription_id && await teamsOf(org.id) === "Varsity:active JV:active" && await active("Varsity"),
      "the webhook switched the organization and both teams on");
    check(F.S.deliveries.length === 3 && F.S.deliveries.every((d) => d.status === 200), `every webhook accepted (${F.S.deliveries.map((d) => `${d.type}:${d.result}`).join(", ")})`);
    await drew.screenshot({ path: path.join(shots, "billing-active.png"), fullPage: true });
    await goto(drew, "/app");
    const t1b = await text(drew, /Paid up/i), links = await drew.locator("main:visible").getByRole("link", { name: "Varsity", exact: true }).count();
    check(links === 1 && /Paid up/i.test(t1b), "his teams page: Varsity (he's its head coach) and the organization paid up");

    console.log("2. Webhooks: replayed, forged");
    const done = F.S.deliveries.find((d) => d.type === "checkout.session.completed");
    const again = await tclock(`/test/replay?event=${done.id}`);
    check(again.status === 200 && again.result === "duplicate" && await teamsOf(org.id) === "Varsity:active JV:active", `the same event again changes nothing (${again.result})`);
    const forged = await tclock(`/test/replay?event=${done.id}&bad=1`);
    check(forged.status === 400, `a bad signature is refused (${forged.status})`);
    const unsigned = await fetch(SITE + "/api/stripe/webhook", { method: "POST", body: JSON.stringify(F.S.events[done.id]) });
    check(unsigned.status === 400, "and so is no signature");

    console.log("3. Adding a team: charged now; a declined card leaves it waiting");
    await goto(drew, `/app/billing?org=${org.id}`);
    await drew.getByRole("form", { name: "Add a team" }).getByLabel("Add a team").fill("Freshman");
    await submit(drew, "Add a team", "Add team", (u) => /ok=team_adding/.test(u.search));
    let up = subUpdates().at(-1);
    check(up && up.body.items[0].quantity === "3" && up.body.proration_behavior === "always_invoice" && up.body.payment_behavior === "pending_if_incomplete",
      `quantity 3, prorated and charged now, only if the card pays (${up && JSON.stringify(up.body)})`);
    check(await teamsOf(org.id) === "Varsity:active JV:active Freshman:active", "the new team is on");
    await tclock(`/test/card?customer=${org.stripe_customer_id}&decline=1`);
    await drew.getByRole("form", { name: "Add a team" }).getByLabel("Add a team").fill("Summer");
    await submit(drew, "Add a team", "Add team", (u) => /ok=team_adding/.test(u.search));
    let t3 = await text(drew, /Waiting for payment/);
    org = await orgRow();
    check(/Waiting for payment/.test(t3) && org.billing_status === "active" && await teamsOf(org.id) === "Varsity:active JV:active Freshman:active Summer:pending",
      "declined: Summer waits, and nothing else is locked");
    await tclock(`/test/card?customer=${org.stripe_customer_id}&decline=0`);
    await submit(drew, "Pay for waiting teams", "Pay for 1 waiting team", (u) => /ok=team_adding/.test(u.search));
    // (the page comes back to the same address, so wait for the server instead)
    check(await until(async () => await teamsOf(org.id) === "Varsity:active JV:active Freshman:active Summer:active"), "card fixed, paid again: Summer is on");

    console.log("4. Removing a team: usable until the paid year ends, not charged next year (D6)");
    await drew.getByRole("row", { name: /^JV/ }).locator("summary", { hasText: "Remove" }).click();
    await submit(drew, "Remove JV", "Remove", (u) => /error=confirm/.test(u.search));
    check(/Tick the box/.test(await text(drew, /Tick/)) && await teamsOf(org.id) === "Varsity:active JV:active Freshman:active Summer:active", "not without ticking the box");
    await drew.getByRole("row", { name: /^JV/ }).locator("summary", { hasText: "Remove" }).click();
    await drew.getByRole("form", { name: "Remove JV" }).getByRole("checkbox").check();
    await submit(drew, "Remove JV", "Remove", (u) => /ok=team_ending/.test(u.search));
    up = subUpdates().at(-1);
    const jv = (await db.query("select status, ends_at from public.programs where name = 'JV'")).rows[0];
    org = await orgRow();
    check(up.body.items[0].quantity === "3" && up.body.proration_behavior === "none" && !up.body.payment_behavior, `quantity 3 with no proration (no refund) (${JSON.stringify(up.body)})`);
    check(jv.status === "ending" && +jv.ends_at === +org.period_ends_at && await active("JV"), "JV ends with the paid year and works until then");
    check(/Ends /.test(await text(drew, /Ends /)), "the page says when it ends");
    await submit(drew, "Keep JV", "Keep this team", (u) => /ok=team_kept/.test(u.search));
    check(subUpdates().at(-1).body.items[0].quantity === "4" && subUpdates().at(-1).body.proration_behavior === "none" && await teamsOf(org.id) === "Varsity:active JV:active Freshman:active Summer:active",
      "kept again: back in next year's count, with no charge now");
    await drew.getByRole("row", { name: /^JV/ }).locator("summary", { hasText: "Remove" }).click();
    await drew.getByRole("form", { name: "Remove JV" }).getByRole("checkbox").check();
    await submit(drew, "Remove JV", "Remove", (u) => /ok=team_ending/.test(u.search));
    await drew.screenshot({ path: path.join(shots, "billing-teams.png"), fullPage: true });
    // the year ends (as a test clock would): JV's end passes, the renewal is paid for three teams
    await db.query("update public.programs set ends_at = now() - interval '1 second' where name = 'JV'");
    const renew = await tclock(`/test/renew?sub=${org.stripe_subscription_id}`);
    check(renew.result === "applied" && !(await active("JV")) && await teamsOf(org.id) === "Varsity:active JV:removed Freshman:active Summer:active",
      `the year renews: JV is gone, the others carry on (${await teamsOf(org.id)})`);

    // a roster with data on Varsity: the coach on the staff, two pitchers with games, one of them linked to a player
    const V = (await db.query("select id from public.programs where name = 'Varsity'")).rows[0].id;
    await db.query("insert into public.members (program_id, user_id, role) values ($1, $2, 'pitching'), ($1, $3, 'player')", [V, UID.coach, UID.player]);
    await db.query("insert into public.player_links (program_id, user_id, pitcher_id) values ($1, $2, 'p1')", [V, UID.player]);
    const doc = (o) => JSON.stringify({ updatedAt: 1000, ...o });
    for (const [id, name] of [["p1", "Avery Brooks"], ["p2", "Sam Reyes"]]) await db.query("insert into public.pitchers (program_id, id, doc) values ($1, $2, $3)", [V, id, doc({ id, name, hand: "R", pitches: [{ id: "pt1", name: "Fastball", grade: 3, command: 3, velo: 86 }] })]);
    await db.query("insert into public.games (program_id, id, doc) values ($1, 'g1', $2), ($1, 'g2', $3)", [V, doc({ id: "g1", date: "2026-10-01" }), doc({ id: "g2", date: "2026-10-08" })]);
    let n = 0;
    for (const [pid, game, k] of [["p1", "g1", 7], ["p1", "g2", 5], ["p2", "g2", 9]]) for (let i = 0; i < k; i++) {
      n++; await db.query("insert into public.events (program_id, id, doc) values ($1, $2, $3)", [V, `e${n}`, doc({ id: `e${n}`, type: "pitch", gameId: game, pitcherId: pid, res: i % 2 ? "ball" : "cstrike", n: i })]);
    }
    await db.query("insert into public.hitters (program_id, id, doc) values ($1, 'h1', $2)", [V, doc({ id: "h1", name: "Opp Hitter", bats: "L", teamId: "opp" })]);

    console.log("5. A failed renewal locks every team and emails everyone their data; an older event can't undo the lock; the card fixed unlocks (D7)");
    const failed = await tclock(`/test/renew?sub=${org.stripe_subscription_id}&fail=1`);
    org = await orgRow();
    check(failed.result === "applied" && org.billing_status === "locked" && !(await active("Varsity")) && !(await active("Freshman")), "locked: no team syncs");
    // Varsity: Drew (owner, head) and the coach get the team file, the player his own; Freshman and Summer: Drew. JV was removed.
    const exps = async () => (await db.query("select e.*, u.email from public.exports e join auth.users u on u.id = e.user_id where e.org_id = $1 order by e.created_at", [org.id])).rows;
    check(await until(async () => (await exps()).filter((e) => e.email_status !== "pending").length === 5), "the exports are built and recorded for everyone");
    let ex = await exps();
    const byWho = ex.map((e) => `${e.email.split("@")[0]}:${e.team_name}:${e.kind}`).sort().join(" ");
    check(byWho === "coach:Varsity:coach drew:Freshman:coach drew:Summer:coach drew:Varsity:coach player:Varsity:player", `one per coach per team and one per linked player (${byWho})`);
    check(ex.every((e) => e.email_status === "sent") && M.inbox.length === 5 && M.inbox.every((m) => m.from === "PitchIQ <data@test.local>"), `each one emailed (${M.inbox.length} in the test inbox)`);
    const pmail = M.inbox.find((m) => m.to[0] === "player@test.local");
    const plink = pmail && (pmail.text.match(/Download it: (\S+)/) || [])[1];
    check(pmail && /Your PitchIQ data: Varsity/.test(pmail.subject) && /until /.test(pmail.text) && /12 months/.test(pmail.text) && plink && /\/storage\/v1\/object\/sign\/exports\//.test(plink),
      `the player's email: a signed download link, when it expires, and that nothing is deleted (${pmail && pmail.subject})`);
    const pexp = ex.find((e) => e.kind === "player");
    check(pexp && Math.abs(new Date(pexp.link_expires_at) - Date.now() - 30 * 86400000) < 600000, "the link lasts 30 days");
    const zipOf = async (url) => { const r = await fetch(url); return r.ok ? unzipSync(new Uint8Array(await r.arrayBuffer())) : null; };
    const csvRows = (z, t) => (z[`${t}.csv`] ? strFromU8(z[`${t}.csv`]).split("\r\n").filter((l) => l !== "").length - 1 : 0);
    const pz = plink && await zipOf(plink);
    const pRows = pz ? ["pitchers", "games", "events", "hitters", "uploads", "upload_pitches", "grade_history"].reduce((a, t) => a + csvRows(pz, t), 0) : -1;
    const dbP = +(await db.query(`select (select count(*) from public.pitchers where program_id = $1 and id = 'p1')
      + (select count(*) from public.events where program_id = $1 and pitcher_id = 'p1')
      + (select count(*) from public.games g where g.program_id = $1 and g.id in (select game_id from public.events where program_id = $1 and pitcher_id = 'p1')) n`, [V])).rows[0].n;
    check(pz && pRows === dbP && pRows === pexp.rows && csvRows(pz, "events") === 12 && !strFromU8(pz["pitchers.csv"]).includes("Sam Reyes") && !pz["hitters.csv"]
      && strFromU8(pz["summary.pdf"].slice(0, 5)) === "%PDF-" && /events\.csv  12 rows/.test(strFromU8(pz["README.txt"])),
      `his zip has exactly his rows, ${pRows} = ${dbP} in the database (his 12 pitches, his 2 games, his record), a summary PDF and nothing of a teammate's`);
    const cmail = M.inbox.find((m) => m.to[0] === "coach@test.local");
    const cz = cmail && await zipOf((cmail.text.match(/Download it: (\S+)/) || [])[1]);
    check(cz && csvRows(cz, "pitchers") === 2 && csvRows(cz, "events") === 21 && csvRows(cz, "games") === 2 && csvRows(cz, "hitters") === 1 && !cz["summary.pdf"],
      "the coach's zip covers the whole team: both pitchers, all 21 pitches, both games, the scouted hitter");
    // locked: the player's sign-in reads nothing of the team, but still reads his own export
    const tok = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: "player@test.local", password: PASS } })).access_token;
    const mine = await http("GET", "/rest/v1/exports?select=id,kind", { token: tok });
    const teamRows = await http("GET", `/rest/v1/pitchers?select=id&program_id=eq.${V}`, { token: tok });
    const coachTok = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: "coach@test.local", password: PASS } })).access_token;
    const coachRows = await http("GET", `/rest/v1/events?select=id&program_id=eq.${V}`, { token: coachTok });
    check(teamRows.length === 0 && coachRows.length === 0 && mine.length === 1 && mine[0].kind === "player", "RLS: while locked, neither the player nor the coach reads the team; the player still sees his own export");
    const pl = await fresh();
    await signIn(pl, "player");
    await pl.getByRole("link", { name: "Your data downloads" }).click(); await pl.waitForURL(/\/app\/exports/).catch(() => {}); await settle(pl);
    const tx = await text(pl, /Download/);
    check(/Avery Brooks, Varsity/.test(tx) && new RegExp(`${pexp.rows} rows`, "i").test(tx), `his downloads page lists it, even though the team is locked (${tx.split("\n").find((l) => /Varsity/.test(l))})`);
    const [dl] = await Promise.all([pl.waitForEvent("download", { timeout: 15000 }).catch(() => null), pl.getByRole("button", { name: "Download" }).click()]);
    const dlPath = dl && await dl.path();
    const dz = dlPath && unzipSync(new Uint8Array(fs.readFileSync(dlPath)));
    check(dz && csvRows(dz, "events") === 12, "Download gives him a fresh link to the same zip");
    await pl.screenshot({ path: path.join(shots, "exports.png"), fullPage: true });
    const forgedId = ex.find((e) => e.kind === "coach").id;
    await goto(pl, "/app/exports");
    await pl.evaluate((id) => { document.querySelector("input[name=id]").value = id; }, forgedId);
    await pl.getByRole("button", { name: "Download" }).click(); await pl.waitForURL(/error=missing/, { timeout: 10000 }).catch(() => {});
    check(/isn't yours/.test(await text(pl, /isn't yours/)), "another person's export id gets nothing");
    const replay = await tclock(`/test/replay?event=${failed.id}`);
    await wait(1500);
    check(replay.result === "duplicate" && (await exps()).length === 5 && M.inbox.length === 5, "the same failure again sends nothing twice");
    // an email that failed: the super admin sends again, and only that one goes out
    await db.query("update public.exports set email_status = 'failed' where kind = 'player' and org_id = $1", [org.id]);
    await db.query("insert into public.platform_admins (user_id, note) values ($1, 'test')", [UID.drew]);
    await goto(drew, `/admin/org/${org.id}`);
    check(/Lapse exports/.test(await text(drew, /Lapse exports/)) && (await drew.getByRole("table", { name: "Lapse exports" }).locator("tbody tr").count()) === 1, "the admin page shows the lapse and its emails");
    await submit(drew, "Send the exports again", "Send the exports again", (u) => /ok=resent/.test(u.search));
    const resent = M.inbox.slice(5);
    check(/ok=resent/.test(drew.url()) && resent.length === 1 && resent[0].to[0] === "player@test.local" && (await exps()).every((e) => e.email_status === "sent") && (await exps()).length === 5,
      `"Send the exports again" retries just the failed email, with a fresh link (${resent.map((m) => m.to[0]).join(", ")})`);
    const audit = (await db.query("select action from public.admin_audit where org_id = $1 order by id", [org.id])).rows.map((r) => r.action);
    check(audit.includes("resend_exports"), "and it's in the audit log");
    await db.query("delete from public.platform_admins where user_id = $1", [UID.drew]);
    const before = Math.floor(new Date(org.billing_changed_at).getTime() / 1000) - 60;
    const late = await fetch(FAKE + "/test/send", { method: "POST", body: JSON.stringify({ type: "invoice.paid", created: before,
      object: { id: "in_late", object: "invoice", customer: org.stripe_customer_id, billing_reason: "subscription_cycle", parent: { type: "subscription_details", subscription_details: { subscription: org.stripe_subscription_id, metadata: { org_id: org.id } } } } }) }).then((r) => r.json());
    check(late.result === "stale" && (await orgRow()).billing_status === "locked", `a payment from before the failure, arriving late, doesn't unlock (${late.result})`);
    await goto(drew, `/app/billing?org=${org.id}`);
    const t5 = await text(drew, /Locked/);
    check(/Locked: the last payment didn't go through/.test(t5) && (await drew.getByRole("form", { name: "Add a team" }).count()) === 0, "the owner still gets the billing page, saying what to do, with no team changes");
    await drew.screenshot({ path: path.join(shots, "billing-locked.png"), fullPage: true });
    await submit(drew, "Card and invoices", "Card and invoices", (u) => u.href.startsWith(FAKE + "/portal/"));
    check(drew.url().startsWith(`${FAKE}/portal/${org.stripe_customer_id}`), "Card and invoices opens Stripe's billing portal for his customer");
    const portalCall = F.S.calls.find((c) => c.path === "/v1/billing_portal/sessions");
    check(portalCall && portalCall.body.return_url === `${SITE}/app/billing?org=${org.id}`, "which comes back to the billing page");
    const retry = await tclock(`/test/renew?sub=${org.stripe_subscription_id}`);
    check(retry.result === "applied" && (await orgRow()).billing_status === "active" && await active("Varsity") && await teamsOf(org.id) === "Varsity:active JV:removed Freshman:active Summer:active",
      "Stripe's retry is paid: unlocked, and the removed team stays removed (A5)");

    console.log("6. Cancelled, and coming back (full price: the coupon is the first year's)");
    const cancel = await tclock(`/test/cancel?sub=${org.stripe_subscription_id}`);
    org = await orgRow();
    check(cancel.result === "applied" && org.billing_status === "locked" && org.subscription_status === "canceled", "cancelled: locked");
    check(await until(async () => (await exps()).length === 10 && M.inbox.length === 11), `a new lapse sends everyone their data again (${(await exps()).length} exports, ${M.inbox.length} emails)`);
    await goto(drew, `/app/billing?org=${org.id}`);
    check(/the subscription ended/.test(await text(drew, /ended/)), "the page says the subscription ended and the data is kept");
    const nCalls = F.S.calls.length;
    await submit(drew, "Pay", "Pay again", (u) => u.href.startsWith(FAKE + "/pay/"));
    const cs2 = F.S.calls.slice(nCalls).find((c) => c.path === "/v1/checkout/sessions");
    check(cs2 && cs2.body.customer === org.stripe_customer_id && !cs2.body.discounts && !cs2.body.customer_email && cs2.body.line_items[0].quantity === "3",
      `Checkout again: his customer, three teams, no coupon (${cs2 && JSON.stringify({ customer: cs2.body.customer, q: cs2.body.line_items[0].quantity, discounts: cs2.body.discounts })})`);
    const oldSub = org.stripe_subscription_id;
    await drew.getByRole("button", { name: "Pay with 4242" }).click();
    await drew.waitForURL((u) => u.href.startsWith(SITE + "/app/billing"), { timeout: 15000 }).catch(() => {});
    org = await orgRow();
    check(org.billing_status === "active" && org.stripe_subscription_id !== oldSub && await active("Varsity") && /Active/.test(await text(drew, /Active/)), "paid: the new subscription takes over and everything is back");
    const ghost = await tclock(`/test/renew?sub=${oldSub}&fail=1`);
    check(ghost.result === "other_subscription" && (await orgRow()).billing_status === "active", "the old subscription's events don't count any more");

    console.log("7. Only the owner");
    const coach = await fresh();
    await signIn(coach, "coach");
    await goto(coach, `/app/billing?org=${org.id}`);
    check(/You don't own an organization/.test(await text(coach, /own/)), "another account gets no billing page for it");
    const declined = await (await fresh()).goto(SITE + `/app/billing?org=${org.id}`).then((r) => r.url());
    check(/\/login/.test(declined), "and a signed-out visitor is sent to sign in");
    check(!errs.length, `no page errors (${errs.join("; ")})`);
  } catch (e) {
    fails++; console.error(e); console.error(webLog.slice(-3000));
  } finally {
    await browser.close(); web.kill(); await F.close(); await M.close(); await db.end();
  }
  console.log(fails ? `\n${fails} billing check(s) FAILED` : "\nall billing checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
