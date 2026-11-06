/*
 * The landing page end to end: the built site (next start), the real waitlist function on a local Postgres, and a
 * small stand-in for Supabase's REST endpoint that runs the function as service_role, the way PostgREST does.
 * Section 2 checks the 3D (with SwiftShader's software WebGL), the reduced-motion path without it, and the live demo
 * running the game app's engine.
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

const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const ENGINE_VERSION = /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "app/engine.js"), "utf8"))[1];
const frames = (page, sel) => page.locator(sel).evaluate((el) => Number(el.dataset.frames || 0));
const opacity = (page, sel) => page.locator(sel).evaluate((el) => Number(getComputedStyle(el).opacity));

async function scrollThrough(page) {
  for (const id of ["problem", "at-bat", "how", "demo", "ipad", "reads", "rules", "people", "uploads", "pricing", "questions", "join"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await wait(250);
  }
}

async function marketing() {
  const gl = await chromium.launch({ args: GL });
  try {
    const ctx = await gl.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`);
    await page.waitForSelector(".stage.on", { timeout: 20000 });
    const f0 = await frames(page, ".stage-3d"); await wait(1500); const f1 = await frames(page, ".stage-3d");
    check(f1 > f0 && f1 > 10, `the hero's 3D pitch takes over the zone after load and draws its flights (${f0} then ${f1} frames)`);
    check((await opacity(page, ".stage .zone-lg")) < 0.05 && (await page.locator(".stage-3d canvas").count()) === 1, "the flat zone fades out under one canvas");
    const hud = await page.locator(".hud").innerText(), pitch = await page.locator(".call-panel .band-pitch").first().innerText();
    check(/^(FB|SL|CH|CU) · (UP-IN|UP-AWAY|DOWN-IN|DOWN-AWAY|MIDDLE|CHASE) · \d-\d\s+\d+ mph$/.test(hud) && hud.startsWith({ FASTBALL: "FB", SLIDER: "SL", CHANGEUP: "CH", CURVEBALL: "CU" }[pitch]),
      `the readout names the call on screen ("${hud.replace(/\s+/g, " ")}" for ${pitch})`);
    await page.locator("#rules").scrollIntoViewIfNeeded(); await wait(1200);
    const g0 = await frames(page, ".stage-3d"); await wait(4000);
    check((await frames(page, ".stage-3d")) === g0, "it stops drawing once the hero is scrolled away");

    console.log("2b. The live demo, on the game app's engine");
    await page.locator("#demo").scrollIntoViewIfNeeded();
    const demo = page.locator(".demo-panel");
    await demo.locator(".band-pitch").waitFor({ timeout: 15000 });
    check((await demo.getAttribute("data-engine")) === ENGINE_VERSION, `the demo runs engine.js ${ENGINE_VERSION}, the app's version`);
    const first = await demo.locator(".band-pitch").innerText();
    check(["FASTBALL", "SLIDER", "CHANGEUP"].includes(first) && /^Picked at random from the mix, where it comes up \d+% of the time\./.test(await demo.locator(".demo-why").innerText()),
      `it calls one of the starter's three pitches with the app's own reason (${first})`);
    const fs0 = await demo.locator(".demo-results").boundingBox();
    const tap = async (name) => { await demo.getByRole("button", { name, exact: true }).click(); await wait(80); };
    let moved = 0;
    for (let i = 0; i < 3; i++) { await tap("Ball"); if (Math.abs((await demo.locator(".demo-results").boundingBox()).y - fs0.y) > 1) moved++; }
    check((await demo.locator(".call-count .mono").innerText()) === "3-0", "three balls make it 3-0");
    check(moved === 0, "the result buttons stay where they are from call to call");
    const why30 = await demo.locator(".demo-why").innerText(), spot30 = await demo.locator(".band-spot").innerText();
    check(why30.includes("No chase pitch at 3-0 or 3-1.") && spot30 !== "CHASE", `no chase pitch at 3-0, and the reason says so (${spot30})`);
    await tap("Ball");
    check((await demo.locator(".call-result").innerText()) === "Walk" && (await demo.locator(".call-hitter").innerText()).startsWith("Hitter 2 of 9") &&
      (await demo.locator(".bases").getAttribute("aria-label")) === "Runner on first", "ball four walks him: runner on first, next hitter, 0-0");
    await tap("In play, out");
    check((await demo.locator(".call-hitter").innerText()) === "Hitter 3 of 9, bats left" && /OUTS\s*1/i.test(await demo.locator(".demo-game").innerText()), "an out in play brings up the third hitter, a lefty, with one out");
    check((await demo.locator(".zone-box").getAttribute("x")) === "226" && (await demo.locator(".zone").getAttribute("aria-label")).endsWith("left-handed hitter"),
      "the zone mirrors for him: the hitter's box on the right");
    for (const r of ["Called strike", "Swing and miss", "Foul", "Foul", "Swing and miss"]) await tap(r);
    check((await demo.locator(".call-result").innerText()) === "Strikeout swinging" && (await demo.locator(".demo-foot").innerText()).startsWith("10 pitches"),
      "fouls with two strikes keep the count; the third strike is a strikeout");
    await demo.getByRole("button", { name: "Start over" }).click();
    check((await demo.locator(".call-count .mono").innerText()) === "0-0" && (await demo.locator(".call-hitter").innerText()) === "Hitter 1 of 9, bats right" &&
      (await demo.locator(".demo-foot").innerText()).startsWith("0 pitches"), "Start over goes back to the first hitter");

    console.log("2c. The iPad and the movement cloud");
    await page.locator("#ipad").scrollIntoViewIfNeeded(); await wait(600);
    check(await page.locator(".ipad img").evaluate((i) => i.complete && i.naturalWidth > 0 && i.alt.startsWith("The live-calling screen")), "the iPad shows the app's live screen");
    await page.locator("#uploads").scrollIntoViewIfNeeded();
    await page.waitForSelector(".cloud.on", { timeout: 20000 }); await wait(900);   // the 0.6 s crossfade
    check((await opacity(page, ".cloud-flat")) < 0.05 && (await page.locator(".cloud-note").innerText()).startsWith("Sample data, not a real file."), "the 3D cloud replaces the flat plot, labelled as sample data");
    await page.getByRole("button", { name: "Velocity" }).click();
    // the turn takes 1.1 s; software WebGL on a CI runner can draw slowly, so poll for its end
    let tz = 0, tx = 1;
    for (let i = 0; i < 40 && !(tz > 0.9 && tx < 0.05); i++) {
      await wait(250);
      tz = await page.locator(".cloud-tick.t-z").first().evaluate((e) => Number(e.style.opacity));
      tx = await page.locator(".cloud-tick.t-x").first().evaluate((e) => Number(e.style.opacity));
    }
    check((await page.getByRole("button", { name: "Velocity" }).getAttribute("aria-pressed")) === "true" && tz > 0.9 && tx < 0.05 &&
      (await page.locator(".cloud-note").innerText()).includes("Velocity in mph"), `Velocity turns it side-on: mph ticks show, break ticks hide (${tz}, ${tx})`);
    check(errors.length === 0, `no page errors with WebGL (${errors.join(" | ") || "none"})`);
    await ctx.close();

    const phone = await gl.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pp = await phone.newPage(); await pp.goto(`http://127.0.0.1:${WEB_PORT}/`);
    await pp.waitForSelector(".stage.on", { timeout: 20000 }); await scrollThrough(pp);
    check(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 390 with the 3D on");
    await phone.close();
  } finally { await gl.close(); }

  // reduced motion: the static page, no WebGL at all
  const nb = await chromium.launch({ args: GL });
  try {
    const rm = await nb.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const rp = await rm.newPage(); await rp.goto(`http://127.0.0.1:${WEB_PORT}/`); await wait(3500); await scrollThrough(rp); await wait(1500);
    check((await rp.locator("canvas").count()) === 0 && (await rp.locator(".stage.on, .cloud.on").count()) === 0 && (await opacity(rp, ".cloud-flat")) === 1 &&
      (await opacity(rp, ".stage .zone-lg")) === 1, "with reduced motion nothing loads WebGL: the flat zone and the flat plot stay");
    check((await rp.locator(".demo-panel .band-pitch").count()) === 1, "the demo still works there (it isn't 3D)");
    await rm.close();
  } finally { await nb.close(); }
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
    check((await pp.locator("h1").innerText()) === "Privacy" && /spring waitlist/i.test(await pp.locator("main").innerText()), "the privacy page loads, and still covers the waitlist");
    await pp.goto(`http://127.0.0.1:${WEB_PORT}/terms`);
    check((await pp.locator("h1").innerText()) === "Terms" && /Working draft, version \d{4}-\d{2}-\d{2}/.test(await pp.locator("main").innerText()), "the Terms page loads, marked as a draft with its version (D15)");
    await phone.close();

    console.log("2. 3D, the demo and the movement cloud");
    await marketing();

    console.log("3. The waitlist, into the real database function");
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
