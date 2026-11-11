/*
 * The public site end to end, on the built site (next start): the 3D hero (SwiftShader's software WebGL) drawing the
 * at-bat and stopping off screen, the live call stepping with it, reduced motion holding the two-strike call, the
 * phone layout, keyboard order, and the "Talk to us" form and its API (validation, the honeypot, and the honest
 * "can't send yet" answer while no email provider is set).
 * Run from the repo root after `npm run build` in web/:
 *   node web/tests/site_e2e.js
 */
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");

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
    // without a GPU (as in CI, on SwiftShader) the hero times its frames and settles on a still one; on a GPU it keeps animating
    const still = await page.locator(".mk-hero-stage").getAttribute("data-still");
    check((f1 > f0 && f1 > 10) || (still === "1" && f1 >= 3), `the 3D field draws the at-bat (${f0} then ${f1} frames${still ? ", then held still: no GPU here" : ""})`);
    const seen = new Set();
    for (let n = 0; n < 14; n++) { seen.add(await page.locator(".mk-call-count").innerText()); await wait(500); }
    check(seen.size >= 2 && [...seen].every((c) => /^[0-3]-[0-2]$/.test(c)), `the live call steps with the pitches (${[...seen].join(", ")})`);
    check(/^[1-4]$/.test(await page.locator(".mk-call-sign").innerText()) && (await page.locator(".mk-call-why").innerText()).length > 10, "each call shows a sign and the engine's reason");
    await page.locator("#contact").scrollIntoViewIfNeeded(); await wait(1200);
    const g0 = await frames(page); await wait(2500);
    check((await frames(page)) === g0, "it stops drawing once the hero is scrolled away (or once held still)");

    console.log("1b. One at-bat (scroll-driven)");
    const ab = async (q) => { await page.evaluate((q) => { const s = document.getElementById("at-bat"); const top = s.getBoundingClientRect().top + scrollY; scrollTo(0, top + (s.offsetHeight - innerHeight) * q); }, q); await wait(1800); };
    await ab(0.3); await ab(0.02);
    const introOk = await page.waitForSelector(".mk-ab.is-intro", { timeout: 6000 }).then(() => true, () => false);
    check(introOk, `the chapter opens on its title (${await page.locator(".mk-ab").getAttribute("class")})`);
    await ab(0.65);
    check((await page.locator(".mk-ab-card .mk-ab-count").innerText()) === "1-1" && (await page.locator(".mk-ab-rail .is-now").innerText()).includes("1-1"), "scrolling into the third pitch shows the 1-1 call and marks it on the rail");
    check(await page.locator(".mk-ab-res.is-shown").count() === 1, "the result appears once that pitch has landed");
    await ab(0.97);
    check((await page.locator(".mk-ab.is-end").count()) === 1 && await page.locator(".mk-ab-k").isVisible(), "the chapter ends on the strikeout");

    console.log("1c. The mix, the demo, the dugout, the game, the questions");
    await page.locator(".mk-rd-tile-mix").scrollIntoViewIfNeeded(); await wait(2200);
    const legend = await page.locator(".mk-rd-legend li").allInnerTexts();
    const sum = legend.reduce((a, t) => a + Number(/(\d+)%/.exec(t)[1]), 0);
    check(legend.length >= 3 && sum >= 98 && sum <= 102, `the mix lists ${legend.length} calls adding to ${sum}%`);
    check((await page.locator(".mk-rd-legend li.is-pick").count()) === 1, "the draw lands on one call");
    await page.getByRole("button", { name: "Draw again" }).click(); await wait(1800);
    check((await page.locator(".mk-rd-legend li.is-pick").count()) === 1, "drawing again lands on a call");

    const ENGINE = /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(WEB, "lib/engine.js"), "utf8"))[1];
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await page.waitForSelector(`.mk-dm-screen[data-engine="${ENGINE}"]`, { timeout: 20000 });
    check(true, `the demo runs engine.js ${ENGINE}, the app's own engine`);
    await page.waitForSelector(".mk-dm-what b", { timeout: 15000 });
    const times = [];
    const ms = async () => Number(/called in (\d+) ms/.exec(await page.locator(".mk-dm-ms").innerText())[1]);
    times.push(await ms());
    for (const r of ["Called strike", "Ball", "Foul", "Ball"]) { await page.locator(".mk-dm-res", { hasText: r }).first().click(); await wait(250); times.push(await ms()); }
    check((await page.locator(".mk-dm-count b").innerText()) === "2-2", "tapping called strike, ball, foul, ball leaves the count at 2-2");
    check((await page.locator(".mk-dm-why").innerText()).length > 8, `each call carries the engine's reason ("${await page.locator(".mk-dm-why").innerText()}")`);
    check(Math.max(...times) < 1000, `every call came back in under a second on this machine (${times.join(", ")} ms, software rendering)`);
    await page.locator(".mk-dm-device").press("s"); await wait(300);
    check((await page.locator(".mk-dm-ended").innerText()).startsWith("Strikeout"), "the S key logs a swing and miss: strikeout");

    await page.locator("#dugout").scrollIntoViewIfNeeded();
    await page.getByRole("radio", { name: "Day" }).click(); await wait(700);
    check(await page.locator(".mk-dg-glass img.is-on").evaluate((i) => i.currentSrc.includes("app-day")), "the Day switch shows the real Day screen");

    const gdTop = await page.evaluate(() => { const s = document.getElementById("gameday").parentElement; return s.getBoundingClientRect().top + scrollY; });
    await page.evaluate((y) => scrollTo(0, y + 40), gdTop); await wait(1400);
    const tx0 = await page.locator(".mk-gd-track").evaluate((t) => new DOMMatrix(getComputedStyle(t).transform).m41);
    await page.evaluate((y) => scrollTo(0, y + 420), gdTop); await wait(1400);
    const tx1 = await page.locator(".mk-gd-track").evaluate((t) => new DOMMatrix(getComputedStyle(t).transform).m41);
    const pinned = await page.locator(".mk-gd-inner").evaluate((e) => Math.abs(e.getBoundingClientRect().top) < 2);
    check(tx1 < tx0 - 50 && pinned, `the game panels slide sideways while the section holds still (${Math.round(tx0)} to ${Math.round(tx1)} px)`);

    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page.locator(".mk-fq-item summary").first().click();
    check(await page.locator(".mk-fq-item").first().evaluate((d) => d.open), "a question opens");
    check(errors.length === 0, `no console errors (${errors.slice(0, 2).join(" | ") || "none"})`);

    console.log("2. Reduced motion, phone, keyboard");
    const rm = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const rp = await rm.newPage(); await rp.goto(URL_); await wait(3500);
    const a = await rp.locator(".mk-call-count").innerText(); await wait(3500);
    check(a === "1-2" && (await rp.locator(".mk-call-count").innerText()) === "1-2", "under reduced motion the call rests on the two-strike pitch");
    check((await rp.locator(".mk-ab.is-still .mk-ab-card").count()) === 4, "under reduced motion the at-bat is a plain list of its four calls");
    await rm.close();
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pp = await phone.newPage(); await pp.goto(URL_, { waitUntil: "networkidle" });
    check(await pp.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scroll on a phone");
    const btn = await pp.locator(".mk-hero-actions .mk-btn").boundingBox();
    check(btn && btn.y + btn.height < 844, "the hero's 'Talk to us' button is on the first phone screen");
    check(!(await pp.locator(".mk-nav-link").first().isVisible()), "the phone nav keeps only the mark and 'Talk to us'");
    await phone.close();
    await page.goto(URL_, { waitUntil: "networkidle" });
    const order = [];
    for (let n = 0; n < 8; n++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || "")); }
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
