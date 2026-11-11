/*
 * The public site end to end, on the built site (next start): the 3D hero (SwiftShader's software WebGL) drawing the
 * at-bat and stopping off screen, the live call stepping with it, reduced motion holding the two-strike call, the
 * phone layout, keyboard order, and the "Talk to us" form and its API (validation, the honeypot, and the honest
 * "can't send yet" answer while no email provider is set).
 * Run from the repo root after `npm run build` in web/:
 *   node web/tests/site_e2e.js
 */
const { chromium } = require("playwright");
const path = require("path"), { spawn } = require("child_process");

const WEB_PORT = 3198, WEB = path.join(__dirname, ".."), URL_ = `http://127.0.0.1:${WEB_PORT}/`;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

async function startWeb() {
  // no RESEND_API_KEY or CONTACT_TO: the form must say it can't send rather than pretend
  const env = Object.assign({}, process.env, { PORT: String(WEB_PORT), RESEND_API_KEY: "", CONTACT_TO: "" });
  const p = spawn(path.join(WEB, "node_modules/.bin/next"), ["start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(URL_); if (r.ok) return p; } catch {}
    if (p.exitCode !== null) break;
    await wait(500);
  }
  throw new Error("next start did not come up:\n" + log);
}
const frames = (page) => page.locator(".mk-hero-stage").evaluate((el) => Number(el.dataset.frames || 0));

(async () => {
  const web = await startWeb();
  const browser = await chromium.launch({ args: GL });
  try {
    console.log("1. The hero");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(URL_);
    check((await page.locator("h1").innerText()).replace(/\s+/g, " ") === "Every pitch called. Every call explained.", "one h1, the headline");
    await page.waitForSelector(".mk-hero-stage.is-on canvas", { timeout: 20000 });
    const f0 = await frames(page); await wait(1500); const f1 = await frames(page);
    check(f1 > f0 && f1 > 10, `the 3D field draws the at-bat (${f0} then ${f1} frames)`);
    const seen = new Set();
    for (let n = 0; n < 14; n++) { seen.add(await page.locator(".mk-call-count").innerText()); await wait(500); }
    check(seen.size >= 2 && [...seen].every((c) => /^[0-3]-[0-2]$/.test(c)), `the live call steps with the pitches (${[...seen].join(", ")})`);
    check(/^[1-4]$/.test(await page.locator(".mk-call-sign").innerText()) && (await page.locator(".mk-call-why").innerText()).length > 10, "each call shows a sign and the engine's reason");
    await page.locator("#contact").scrollIntoViewIfNeeded(); await wait(1200);
    const g0 = await frames(page); await wait(2500);
    check((await frames(page)) === g0, "it stops drawing once the hero is scrolled away");
    check(errors.length === 0, `no console errors (${errors.slice(0, 2).join(" | ") || "none"})`);

    console.log("2. Reduced motion, phone, keyboard");
    const rm = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const rp = await rm.newPage(); await rp.goto(URL_); await wait(3500);
    const a = await rp.locator(".mk-call-count").innerText(); await wait(3500);
    check(a === "1-2" && (await rp.locator(".mk-call-count").innerText()) === "1-2", "under reduced motion the call rests on the two-strike pitch");
    await rm.close();
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pp = await phone.newPage(); await pp.goto(URL_, { waitUntil: "networkidle" });
    check(await pp.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scroll on a phone");
    const btn = await pp.locator(".mk-hero-actions .mk-btn").boundingBox();
    check(btn && btn.y + btn.height < 844, "the hero's 'Talk to us' button is on the first phone screen");
    check(!(await pp.locator(".mk-nav-link").first().isVisible()), "the phone nav keeps only the mark and 'Talk to us'");
    await phone.close();
    const order = [];
    for (let n = 0; n < 5; n++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || "")); }
    check(order[0] === "Skip to content" && order.includes("Talk to us"), `keyboard reaches the skip link and the nav (${order.join(" / ")})`);

    console.log("3. Talk to us");
    await page.goto(URL_ + "#contact", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send message" }).click(); await wait(600);
    check((await page.locator(".mk-form-err").count()) === 5, "an empty form names each missing field");
    await page.fill("#c-name", "Sam Ortiz"); await page.fill("#c-email", "sam@school.edu");
    await page.selectOption("#c-role", "Head coach"); await page.selectOption("#c-level", "High school");
    await page.fill("#c-message", "We have six pitchers and want help calling games.");
    check((await page.locator(".mk-form-err").count()) === 0, "fixing a field clears its message");
    await page.getByRole("button", { name: "Send message" }).click(); await wait(800);
    check((await page.locator(".mk-form-problem").innerText()) === "This site can't send messages yet.", "with no email provider it says so instead of faking a send");
    const hp = await fetch(URL_ + "api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: "x" }) });
    check(hp.status === 200, "the hidden field turns bots away quietly");
    const bad = await fetch(URL_ + "api/contact", { method: "POST", body: "{{{" });
    check(bad.status === 400, "a broken request gets a 400");
  } finally {
    await browser.close(); web.kill("SIGTERM");
  }
  console.log(fails ? `\n${fails} site check(s) FAILED` : "\nall site checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
