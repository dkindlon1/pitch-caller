/*
 * The landing page end to end: the built site (next start), the real waitlist function on a local Postgres, and a
 * small stand-in for Supabase's REST endpoint that runs the function as service_role, the way PostgREST does.
 * Run from the repo root after `npm run build` in web/:
 *   PGURL=postgresql://postgres@localhost:5432/postgres node web/tests/landing_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");

const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_landing_e2e", KEY = "test-service-key", REST_PORT = 54399, WEB_PORT = 3199;
const WEB = path.join(__dirname, ".."), ROOT = path.join(WEB, "..");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (n) => { const u = new URL(BASE); u.pathname = "/" + n; return u.toString(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupDb() {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DB}`); await a.query(`create database ${DB}`); await a.end();
  const c = new Client({ connectionString: dbUrl(DB) }); await c.connect();
  await c.query(fs.readFileSync(path.join(ROOT, "supabase/test/auth_stub.sql"), "utf8"));
  await c.query(`grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await c.query(fs.readFileSync(path.join(dir, f), "utf8"));
  return c;
}

function fakeRest(db) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
      if (req.method !== "POST" || req.url !== "/rest/v1/rpc/pc_join_waitlist") return send(404, { message: "not found" });
      if (req.headers.apikey !== KEY || req.headers.authorization !== `Bearer ${KEY}`) return send(401, { message: "bad key" });
      try {
        const a = JSON.parse(body);
        await db.query("begin"); await db.query("set local role service_role");
        const r = await db.query("select public.pc_join_waitlist($1, $2, $3, $4) as r", [a.p_email, a.p_role, a.p_level, a.p_ip_hash]);
        await db.query("commit"); send(200, r.rows[0].r);
      } catch (e) { await db.query("rollback").catch(() => {}); send(400, { message: String(e.message) }); }
    });
  }).listen(REST_PORT, "127.0.0.1");
}

async function startWeb() {
  const env = Object.assign({}, process.env, { PORT: String(WEB_PORT), SUPABASE_URL: `http://127.0.0.1:${REST_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: KEY, WAITLIST_IP_SALT: "e2e-salt-not-secret" });
  const p = spawn(path.join(WEB, "node_modules/.bin/next"), ["start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/`); if (r.ok) return p; } catch {}
    if (p.exitCode !== null) break;
    await wait(500);
  }
  throw new Error("next start did not come up:\n" + log);
}

async function signUp(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${WEB_PORT}/`);
  const form = page.locator(".hero form");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('select[name="role"]').selectOption(opts.role || "coach");
  if (opts.level) await form.locator('select[name="level"]').selectOption(opts.level);
  if (opts.trap) await form.locator('input[name="company"]').evaluate((el) => { el.value = "Acme Corp"; });
  await form.getByRole("button", { name: "Join the spring waitlist" }).click();
  const msg = await page.locator(".hero [role=status], .hero [role=alert]").first().innerText({ timeout: 10000 });
  await ctx.close();
  return msg;
}

(async () => {
  const db = await setupDb(), rest = fakeRest(db), web = await startWeb();
  const browser = await chromium.launch();
  const rows = async () => (await db.query("select email, role, level, ip_hash from public.waitlist order by id")).rows;
  try {
    console.log("1. The first screen");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: "networkidle" });
    check((await page.locator("h1").innerText()).includes("Pitch calling for high school, travel and college coaches"), "the h1 names the category and the buyer");
    check(await page.locator(".hero form").isVisible() && (await page.locator(".hero form").boundingBox()).y + 60 < 900, "the waitlist form is on the first screen at 1440x900");
    const first = await page.locator(".call-why").innerText();
    await wait(4200);
    const later = await page.locator(".call-why").innerText();
    check(first !== later, `the call panel plays the at-bat ("${first}" then "${later}")`);
    await page.getByRole("button", { name: "Pause the at-bat" }).click();
    const paused = await page.locator(".call-why").innerText(); await wait(4200);
    check(paused === (await page.locator(".call-why").innerText()), "Pause stops it");
    check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
    await ctx.close();

    const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const rp = await rm.newPage(); await rp.goto(`http://127.0.0.1:${WEB_PORT}/`); await wait(300);
    const still = await rp.locator(".call-why").innerText(); await wait(3500);
    check(still === "He's looking middle (35%)." && still === (await rp.locator(".call-why").innerText()) &&
      (await rp.getByRole("button", { name: "Play the at-bat" }).count()) === 1, "under reduced motion it rests on the two-strike call with a Play button");
    await rm.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await phone.newPage(); await pp.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: "networkidle" });
    check(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 390");
    await pp.goto(`http://127.0.0.1:${WEB_PORT}/privacy`);
    check((await pp.locator("h1").innerText()) === "Privacy on the waitlist", "the privacy page loads");
    await phone.close();

    console.log("2. The waitlist, into the real database function");
    check((await signUp(browser, "Coach.One@School.edu", { level: "hs" })).startsWith("You're on the list"), "a coach signs up and sees the confirmation");
    let r = await rows();
    check(r.length === 1 && r[0].email === "coach.one@school.edu" && r[0].role === "coach" && r[0].level === "hs", "stored lowercased with role and level");
    check(/^[0-9a-f]{64}$/.test(r[0].ip_hash) && !r[0].ip_hash.includes("127.0.0.1"), "only a 64-character HMAC of the address is stored");
    check((await signUp(browser, "coach.one@school.edu")).startsWith("You're on the list"), "a repeat sign-up shows the same confirmation");
    check((await rows()).length === 1, "and stores nothing new");
    check((await signUp(browser, "bot@spam.example", { trap: true })).startsWith("You're on the list"), "a bot that fills the hidden field sees success");
    check(!(await rows()).some((x) => x.email === "bot@spam.example"), "and nothing is stored");
    for (let i = 2; i <= 5; i++) await signUp(browser, `coach${i}@school.edu`, { role: i % 2 ? "parent" : "coach" });
    check((await rows()).length === 5, "five sign-ups from one network are stored");
    check((await signUp(browser, "coach6@school.edu")).startsWith("Too many sign-ups"), "the sixth from the same network within the hour is refused with a clear message");
    check((await rows()).length === 5, "and not stored");
    const bad = await fetch(`http://127.0.0.1:${WEB_PORT}/api/waitlist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope", role: "coach" }) });
    check(bad.status === 400 && (await bad.json()).status === "invalid", "a bad email gets 400 from the API");
    const notJson = await fetch(`http://127.0.0.1:${WEB_PORT}/api/waitlist`, { method: "POST", body: "{{{" });
    check(notJson.status === 400, "a body that isn't JSON gets 400, not a crash");
  } finally {
    await browser.close(); web.kill("SIGTERM"); rest.close(); await db.end();
    const a = new Client({ connectionString: BASE }); await a.connect(); await a.query(`drop database if exists ${DB}`); await a.end();
  }
  console.log(fails ? `\n${fails} landing check(s) FAILED` : "\nall landing checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
