/*
 * The final check's hands: the interactions the e2e suite does not cover. Fast repeated clicks and odd combinations in
 * the playground, the changed call surviving a scroll away and back, keyboard use of the at-bat and the questions, the
 * phone menu's focus trap, keyboard scrolling, and the page switching to its calm version and back when the window
 * changes shape (a phone turned on its side). Run from the repo root against a running production build:
 *   node web/tests/final_interact.js [--url http://127.0.0.1:3210/] [--browser chromium|webkit|firefox]
 */
const pw = require("playwright");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg("--url", "http://127.0.0.1:3210/"), BROWSER = arg("--browser", "chromium");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

(async () => {
  const browser = await pw[BROWSER].launch(BROWSER === "chromium" ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {});
  const errors = [];
  const open = async (opts) => { const ctx = await browser.newContext(opts), page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(URL_, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await wait(1500); return { ctx, page }; };
  const filmTo = async (page, p) => { await page.evaluate((f) => { const el = document.getElementById("top"), y = el.offsetTop + f * (el.offsetHeight - innerHeight); if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); }, p); await wait(1300); };
  const rows = (page) => page.locator(".pq-rowwrap").evaluateAll((els) => els.map((e) => [e.dataset.group, +e.dataset.pct]));
  const face = (page) => page.locator(".pq-face").evaluate((e) => ({ o: +getComputedStyle(e).opacity, t: e.innerText.replace(/\s+/g, " ").trim() }));

  console.log(`1. The playground under pressure (${BROWSER})`);
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } });
  await filmTo(page, 0.9);
  const first = await rows(page);
  const ball = page.getByRole("button", { name: "One more ball" }), strike = page.getByRole("button", { name: "One more strike" }), fewer = page.getByRole("button", { name: "One fewer ball" });
  for (let i = 0; i < 3; i++) await ball.click({ force: true, delay: 0 }).catch(() => {});
  for (let i = 0; i < 6; i++) { await fewer.click({ force: true }).catch(() => {}); await ball.click({ force: true }).catch(() => {}); }
  await ball.click({ force: true }).catch(() => {}); await ball.click({ force: true }).catch(() => {});
  for (const n of ["Runner on first", "Runner on second"]) await page.getByRole("button", { name: n }).click();
  await page.getByRole("button", { name: "2 outs" }).click(); await page.getByRole("button", { name: "9th inning" }).click();
  await wait(2200);
  const odd = await rows(page), f1 = await face(page), count = await page.locator(".pq-num").innerText();
  check(/^3.2$/.test(count.trim()) && await ball.isDisabled() && await strike.isDisabled(), `3 balls, 2 strikes after a burst of clicks; both "more" buttons are off (${count.trim()})`);
  check(await page.locator('.pq-base[aria-pressed="true"]').count() === 3, "bases loaded");
  check(odd.length >= 1 && odd.every((r) => r[0] && r[1] >= 0 && r[1] <= 100) && odd.reduce((a, r) => a + r[1], 0) <= 101 && JSON.stringify(odd) !== JSON.stringify(first), `full count, bases loaded, two out, 9th: a real mix (${odd.map((r) => `${r[0]} ${r[1]}%`).join("; ")})`);
  check(f1.o === 1 && f1.t.toUpperCase().startsWith(odd[0][0].split(",")[0].toUpperCase()), `the watch shows its leading call (${f1.t})`);
  check((await page.locator(".pq-why").innerText()).trim().length > 8, `with the engine's reason under it ("${(await page.locator(".pq-why").innerText()).trim()}")`);
  await filmTo(page, 0.62);
  check((await face(page)).o === 0, "scrolled back up into the story, the film's own screen shows (the visitor's call is off it)");
  await filmTo(page, 0.9);
  const f2 = await face(page);
  check(f2.o === 1 && f2.t === f1.t && JSON.stringify(await rows(page)) === JSON.stringify(odd), "and back at the playground the changed call is on the watch again, matching the rows");
  await page.getByRole("button", { name: /Back to the film/ }).click(); await wait(1800);
  check(JSON.stringify(await rows(page)) === JSON.stringify(first), "the reset gives the film's mix again");

  console.log("2. Keyboard: at-bat, questions, scrolling");
  await page.evaluate(() => { const e = document.getElementById("at-bat"); const y = e.offsetTop + (e.offsetHeight - innerHeight) * 0.98; if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); }); await wait(1500);
  const b = page.locator(".pq-ab-face").nth(1);
  await b.focus(); await page.keyboard.press("Enter"); await wait(300);
  const opened = await b.getAttribute("aria-expanded"), rowsIn = await page.locator("#ab-mix-1:visible .pq-ab-mrow").count();
  await page.keyboard.press("Enter"); await wait(300);
  check(opened === "true" && rowsIn >= 1 && (await b.getAttribute("aria-expanded")) === "false", `Enter opens a watch's mix and closes it (${rowsIn} rows)`);
  await page.locator(".pq-ab-face").nth(3).click(); await wait(500);
  const mixBox = await page.evaluate(() => { const m = document.getElementById("ab-mix-3").getBoundingClientRect(), f = document.querySelector(".pq-ab-fine").getBoundingClientRect(); return { bottom: Math.round(m.bottom), vh: innerHeight, fine: Math.round(f.top), h: Math.round(m.height) }; });
  await page.locator(".pq-ab-face").nth(3).click(); await wait(300);
  check(mixBox.h > 40 && mixBox.bottom <= mixBox.vh, `an open mix stays inside the pinned frame (bottom ${mixBox.bottom} of ${mixBox.vh}; the fine print starts at ${mixBox.fine})`);
  await page.locator("#faq").scrollIntoViewIfNeeded(); await wait(800);
  const s2 = page.locator(".pq-fq-item summary").nth(1);
  await s2.focus(); await page.keyboard.press("Enter"); await wait(200);
  const o1 = await page.locator(".pq-fq-item").nth(1).evaluate((d) => d.open);
  await page.keyboard.press("Enter"); await wait(200);
  check(o1 && !(await page.locator(".pq-fq-item").nth(1).evaluate((d) => d.open)), "a question opens and closes from the keyboard (native details: its state is the screen reader's)");
  await page.evaluate(() => { if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true }); else scrollTo(0, 0); document.activeElement?.blur(); }); await wait(600);
  const ys = [];
  for (const k of ["PageDown", "Space", "ArrowDown", "End", "Home"]) { await page.keyboard.press(k); await wait(1500); ys.push(await page.evaluate(() => Math.round(scrollY))); }
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  check(ys[0] > 0 && ys[1] > ys[0] && ys[2] > ys[1] && ys[3] >= max - 4 && ys[4] === 0, `PageDown, Space, ArrowDown, End and Home all scroll (${ys.join(", ")} of ${max})`);

  console.log("3. The window changes shape");
  await filmTo(page, 0.3);
  await page.setViewportSize({ width: 844, height: 390 }); await wait(1600);
  const c1 = await page.evaluate(() => ({ pin: getComputedStyle(document.querySelector(".pq-pin")).position, lenis: !!window.__lenis, tf: getComputedStyle(document.querySelector(".pq-msg.is-2")).transform, o: getComputedStyle(document.querySelector(".pq-msg.is-4")).opacity, frame: document.querySelector(".pq-cv").dataset.frame || "", w: document.documentElement.scrollWidth <= innerWidth, stop: document.getElementById("top").dataset.stop || "" }));
  check(c1.pin === "relative" && !c1.lenis && c1.tf === "none" && c1.o === "1" && c1.frame === "" && c1.w && c1.stop === "", `turned on its side (844x390) the page becomes the calm version: nothing pinned, every stop readable, no leftovers (${JSON.stringify(c1)})`);
  await page.setViewportSize({ width: 1440, height: 900 }); await wait(2600);
  await filmTo(page, 0.42);
  const c2 = await page.evaluate(() => ({ pin: getComputedStyle(document.querySelector(".pq-pin")).position, lenis: !!window.__lenis, frame: +document.querySelector(".pq-cv").dataset.frame, stop: document.getElementById("top").dataset.stop, chips: [...document.querySelectorAll(".pq-chip")].filter((c) => +getComputedStyle(c).opacity > 0.9).length }));
  check(c2.pin === "sticky" && c2.lenis && c2.frame > 60 && c2.stop === "4" && c2.chips === 5, `and back upright the film runs again (${JSON.stringify(c2)})`);
  await page.setViewportSize({ width: 390, height: 844 }); await wait(2600); await filmTo(page, 0.72);
  const c3 = await page.evaluate(() => ({ frame: +document.querySelector(".pq-cv").dataset.frame, w: document.documentElement.scrollWidth <= innerWidth, stop: document.getElementById("top").dataset.stop }));
  check(c3.frame === 150 && c3.w && c3.stop === "6", `narrowed to a phone it re-lays itself on the tall film (${JSON.stringify(c3)})`);
  await ctx.close();

  console.log("4. The phone menu");
  const ph = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(BROWSER !== "firefox" ? { isMobile: true } : {}) });
  const menu = ph.page.locator(".pq-nav-menu");
  await menu.click(); await wait(300);
  const seen = [];
  for (let i = 0; i < 9; i++) { await ph.page.keyboard.press("Tab"); seen.push(await ph.page.evaluate(() => (document.activeElement.closest("#pq-sheet") ? "sheet" : document.activeElement.classList.contains("pq-nav-menu") ? "button" : "outside"))); }
  check(!seen.includes("outside") && seen.includes("button") && seen.includes("sheet"), `Tab stays inside the open menu (${seen.join(" ")})`);
  await ph.page.keyboard.press("Escape"); await wait(200);
  check(await ph.page.locator("#pq-sheet").isHidden() && await ph.page.evaluate(() => document.activeElement.classList.contains("pq-nav-menu")), "Escape closes it and focus returns to the button");
  await menu.click(); await wait(200); await ph.page.locator('#pq-sheet a[href="#programs"]').click(); await wait(2600);
  const land = await ph.page.evaluate(() => ({ hidden: document.getElementById("pq-sheet").hidden, top: Math.round(document.getElementById("programs").getBoundingClientRect().top) }));
  check(land.hidden && Math.abs(land.top) < 6, `a link closes the menu and lands on its section (top ${land.top}px)`);
  await ph.ctx.close();

  check(errors.length === 0, `no page or console errors${errors.length ? ": " + [...new Set(errors)].slice(0, 3).join(" | ") : ""}`);
  await browser.close();
  console.log(fails ? `\n${fails} interaction check(s) FAILED` : "\nall interaction checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
