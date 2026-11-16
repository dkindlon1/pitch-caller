/*
 * The visual loop's second camera: the states a scroll does not reach. The playground after a change, hover and focus,
 * an at-bat mix open, the two-wrists pulse, the programs panel as a player, the phone menu.
 *   node web/tests/shoot_states.js --url http://127.0.0.1:3000/ --out docs/site-v2-shots/build/states
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg("--url", "http://127.0.0.1:3000/"), OUT = arg("--out", "docs/site-v2-shots/build/states");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const v of [{ name: "desktop", width: 1440, height: 900, scale: 1 }, { name: "phone", width: 390, height: 844, scale: 2, mobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, isMobile: !!v.mobile, hasTouch: !!v.mobile });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: "networkidle" }); await wait(1500);
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${v.name}-${n}.jpg`), type: "jpeg", quality: 86 });
    const y = async (sel, off) => { await page.evaluate(([s, o]) => { const el = document.querySelector(s), yy = el.getBoundingClientRect().top + scrollY - innerHeight * o; window.__lenis.scrollTo(yy, { immediate: true }); }, [sel, off]); await wait(1300); };
    const click = (name) => page.getByRole("button", { name }).first().evaluate((b) => b.click());
    await page.evaluate(() => { const el = document.getElementById("top"); window.__lenis.scrollTo(el.offsetTop + 0.93 * (el.offsetHeight - innerHeight), { immediate: true }); }); await wait(1500);
    await page.waitForSelector(".pq-pg[data-engine]");
    await click("One more ball"); await wait(450); await shot("pg-1-landing");
    await wait(1600); await shot("pg-2-landed-3-2");
    await click("Opposite"); await wait(2000); await shot("pg-3-opposite");
    if (!v.mobile) {
      await page.locator(".pq-rowwrap").nth(1).locator("button").evaluate((b) => b.click()); await wait(500);
      await page.mouse.move(1200, 300); await wait(400); await shot("pg-4-row-open-hover");
      await page.getByRole("button", { name: "7th inning" }).focus(); await wait(300); await shot("pg-5-focus");
    }
    await y("#at-bat", 0); await page.evaluate(() => { const el = document.getElementById("at-bat"); window.__lenis.scrollTo(el.offsetTop + (el.offsetHeight - innerHeight) * (innerWidth > 860 ? 0.6 : 0.3), { immediate: true }); }); await wait(1400);
    await page.locator(".pq-ab-face").nth(1).evaluate((b) => b.click()); await wait(500); await shot("atbat-mix-open");
    await y(".pq-tw-stage", 0.45); await shot("wrists-1-one-watch");
    await y(".pq-tw-stage", 0.3); await shot("wrists-2-splitting");
    await y(".pq-tw-stage", 0.08); await wait(250); await shot("wrists-3-sent");
    await click(/Change the call/); await wait(520); await shot("wrists-4-changed-buzz"); await wait(900); await shot("wrists-5-changed");
    await y(".pq-pp", 0.12); await wait(3200); await shot("programs-coach");
    await click("Player"); await wait(280); await shot("programs-switching"); await wait(1200); await shot("programs-player");
    if (!v.mobile) { await page.locator(".pq-pp-pitch").nth(1).hover(); await wait(500); await shot("programs-hover-slider"); }
    if (v.mobile) { await page.evaluate(() => document.querySelector(".pq-nav-menu").click()); await wait(400); await shot("menu-open"); }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
