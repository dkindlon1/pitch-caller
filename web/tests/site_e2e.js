/*
 * The public site (v2) end to end, on the built site (next start): the watch film drawing frames as you scroll and
 * resting on its last one with Lenis running; the film's story and the playground agreeing (one engine run, the same
 * numbers in both, the group opening into its exact spots); the playground re-weighing in the browser; the at-bat
 * strip, two wrists and programs each doing their one thing; reduced motion as a still, plain version; the phone
 * layout; keyboard reach; the content rules; and the "Talk to us" form and its API (validation, the honeypot, and the
 * honest "can't send yet" answer while no email provider is set).
 * Also the film's loading (small copies of every frame, sharp frames at rest), its glass (no backdrop work while hidden,
 * refraction only at rest) and the hybrid opening behind ?hybrid=1.
 * Run from the repo root after `npm run build` in web/:
 *   node web/tests/site_e2e.js          (or `npm run e2e` in web/)
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
  const p = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(URL_); if (r.ok) return p; } catch {}
    if (p.exitCode !== null) break;
    await wait(500);
  }
  throw new Error("next start did not come up:\n" + log);
}
// scroll the film to a fraction of its pinned scene and let the scrub settle
const filmTo = async (page, p) => {
  await page.evaluate((f) => { const el = document.getElementById("top"), y = el.offsetTop + f * (el.offsetHeight - innerHeight); if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); }, p);
  await wait(1300);
};
const into = async (page, sel) => { await page.evaluate((s) => { const el = document.querySelector(s), y = el.getBoundingClientRect().top + scrollY - innerHeight * 0.2; if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); }, sel); await wait(1200); };
const num = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10);

(async () => {
  const web = await startWeb();
  const browser = await chromium.launch({ args: GL });
  try {
    console.log("1. The film");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    const frames = [], sheets = []; page.on("request", (r) => { const m = /\/media\/film\/watch\/(wide|tall)\/(\d{4})\.webp/.exec(r.url()); if (m) frames.push(m[1]); const l = /\/media\/film\/watch\/(wide|tall)-lo-\d\.webp/.exec(r.url()); if (l) sheets.push(l[1]); });
    await page.goto(URL_, { waitUntil: "networkidle" }); await wait(1500);
    check(await page.evaluate(() => !!window.__lenis), "Lenis is the smooth-scroll engine");
    check((await page.locator("h1").innerText()).replace(/\s+/g, " ") === "Every pitch called. Every call explained.", "the headline is the promise");
    const count = await page.evaluate(() => fetch("/media/film/watch/wide/0150.webp").then((r) => r.ok));
    const seen = [];
    for (const p of [0.02, 0.2, 0.4, 0.55, 0.7, 0.9]) { await filmTo(page, p); seen.push(num(await page.locator(".pq-cv").getAttribute("data-frame"))); }
    check(seen[0] <= 6 && seen[1] > seen[0] && seen[2] > seen[1] && seen[3] > seen[2], `the film scrubs with the scroll (frames ${seen.join(", ")})`);
    check(seen[4] === 150 && seen[5] === 150, "and rests on its last frame while the call and the playground are up");
    check(count && frames.length >= 150 && frames.every((f) => f === "wide"), `a wide screen loads the whole wide film (${frames.length} frames asked for)`);
    // loading and drawing: the small copies of every frame, sharp frames at rest, a canvas no larger than the frames
    const cv = await page.locator(".pq-cv").evaluate((c) => ({ sharp: c.dataset.sharp, w: c.width, h: c.height }));
    check(sheets.length === 3 && sheets.every((f) => f === "wide"), "the small copy of every frame is asked for (three sheets)");
    check(cv.sharp === "1" && cv.w <= 1920 && cv.h <= 1200, `at rest the frame is the sharp one, on a canvas no bigger than the film (${cv.w}x${cv.h})`);
    // glass: a panel that is not showing does no backdrop work; refraction only once the page rests
    await filmTo(page, 0.02);
    const hidden = await page.locator("#top .pq-glass").evaluateAll((els) => els.map((e) => ({ off: e.classList.contains("is-off"), bf: getComputedStyle(e).backdropFilter })));
    check(hidden.length >= 8 && hidden.every((g) => g.off && g.bf === "none"), "at the top, the film's hidden glass panels carry no backdrop filter");
    await filmTo(page, 0.93);
    const lensOk = await page.evaluate(() => CSS.supports("backdrop-filter", "url(#x)") && matchMedia("(min-width: 900px) and (pointer: fine)").matches);
    const rest = await page.locator(".pq-ctl").evaluate((e) => ({ off: e.classList.contains("is-off"), bf: e.style.backdropFilter }));
    await page.mouse.move(720, 450); await page.mouse.wheel(0, -200); await wait(60);
    const moving = await page.locator(".pq-ctl").evaluate((e) => ({ bf: e.style.backdropFilter, css: getComputedStyle(e).backdropFilter, flag: document.documentElement.dataset.glass }));
    await wait(3200);      // the scroll eases out and the scrubbed timeline settles behind it
    const lensBack = await page.locator(".pq-ctl").evaluate((e) => e.style.backdropFilter);
    check(!rest.off && moving.bf === "" && /blur/.test(moving.css) && moving.flag === "moving" && (!lensOk || (/url\(/.test(rest.bf) && /url\(/.test(lensBack))), `the playground's glass is plain while the page moves and refracts once it rests (${lensOk ? "refraction on" : "this browser has no refraction"})`);
    await filmTo(page, 0.2);
    check((await page.locator("#top").getAttribute("data-stop")) === "2" && (await page.locator(".pq-ledger .pq-lg.is-a li").count()) === 4, "stop 2 lists the situation in the ledger");
    await filmTo(page, 0.46);
    const chips = await page.locator(".pq-chip").evaluateAll((els) => els.map((e) => ({ name: e.dataset.group, pct: +e.dataset.pct, o: +getComputedStyle(e).opacity, x: e.getBoundingClientRect().left })));
    check(chips.length === 4 && chips.every((c) => c.o > 0.9), "stop 4 puts four candidate calls around the watch");   // v1.3: four candidates at this spot (Drew, Nov 27; was five on v1.2.3)
    check(chips.every((c, i) => i === 0 || c.x >= chips[i - 1].x - 1) && chips[chips.length - 1].x > chips[0].x + 40, "the likelier a call, the closer it sits to the watch");

    // the hybrid opening, behind its flag
    const hyb = await ctx.newPage();
    await hyb.goto(URL_ + "?hybrid=1", { waitUntil: "domcontentloaded" });
    await hyb.waitForFunction(() => document.getElementById("top").dataset.auto === "done", null, { timeout: 15000 });
    const hyA = await hyb.evaluate(() => ({ frame: +document.querySelector(".pq-cv").dataset.frame, y: scrollY }));
    check(hyA.y === 0 && hyA.frame >= 21 && hyA.frame <= 24, `with ?hybrid=1 the opening plays by itself and stops (frame ${hyA.frame}, page not scrolled)`);
    await wait(1200); await filmTo(hyb, 0.4);
    const hyB = num(await hyb.locator(".pq-cv").getAttribute("data-frame"));
    check(hyB === seen[2], `then the scroll takes over, and from stop 4 the film is where it always was (frame ${hyB})`);
    await hyb.close();
    const hyb2 = await ctx.newPage();
    await hyb2.goto(URL_ + "?hybrid=1", { waitUntil: "domcontentloaded" });
    await hyb2.waitForFunction(() => document.getElementById("top").dataset.auto === "playing", null, { timeout: 15000 });
    await wait(500); await hyb2.mouse.move(720, 450); await hyb2.mouse.wheel(0, 300); await wait(900);
    const hyC = await hyb2.evaluate(() => ({ auto: document.getElementById("top").dataset.auto, y: scrollY }));
    check(hyC.auto === "done" && hyC.y > 0, "scrolling during the opening stops it and hands over to the scroll");
    await hyb2.close();
    check(!(await page.locator("#top").getAttribute("data-auto")), "without the flag nothing plays by itself");

    console.log("2. The story and the playground agree");
    const storyPct = num(await page.locator("[data-story-pct]").innerText());
    check(chips[0].name === "Fastball, outside" && chips[0].pct === storyPct, `the film's call is Fastball, outside at ${storyPct}%, in the chip and in the sentence`);
    await filmTo(page, 0.93);
    check(await page.locator(".pq-pg.is-live").count() === 1, "the playground is live at the end of the film");
    const rows = () => page.locator(".pq-rowwrap").evaluateAll((els) => els.map((e) => ({ name: e.dataset.group, pct: +e.dataset.pct, spots: [...e.querySelectorAll(".pq-spots li")].map((l) => ({ s: l.dataset.spot, pct: +l.dataset.pct })), open: e.querySelector("button").getAttribute("aria-expanded") === "true" })));
    const first = await rows();
    check(JSON.stringify(first.map((r) => [r.name, r.pct])) === JSON.stringify(chips.map((c) => [c.name, c.pct])), "the playground opens on the film's exact mix (same groups, same shares)");
    check(first[0].open && first[0].spots.length === 2 && first[0].spots.reduce((a, s) => a + s.pct, 0) === storyPct, `the top row is open on its exact spots, and they add up (${first[0].spots.map((s) => `${s.s} ${s.pct}%`).join(" + ")} = ${storyPct}%)`);
    check((await page.locator(".pq-face").evaluate((e) => +getComputedStyle(e).opacity)) === 0, "until something changes, the watch is the film's own last frame");
    await page.waitForSelector(".pq-pg[data-engine]", { timeout: 20000 });
    const version = await page.locator(".pq-pg").getAttribute("data-engine");
    await page.getByRole("button", { name: "One more ball" }).evaluate((b) => b.click()); await wait(1900);
    const second = await rows();
    check(JSON.stringify(second.map((r) => [r.name, r.pct])) !== JSON.stringify(first.map((r) => [r.name, r.pct])), `changing the count re-weighs it in the browser (engine ${version}; 3-2 leads with ${second[0].name}, ${second[0].pct}%)`);
    const face = await page.locator(".pq-face").evaluate((e) => ({ o: +getComputedStyle(e).opacity, t: e.innerText.replace(/\s+/g, " ").trim() }));
    check(face.o === 1 && face.t.startsWith(second[0].name.split(",")[0].toUpperCase()), `and the watch redraws with the new call (${face.t})`);
    await page.getByRole("button", { name: "Opposite" }).evaluate((b) => b.click()); await wait(1500);
    check(JSON.stringify(await rows()) !== JSON.stringify(second), "the hitter's side is a real input too");
    await page.getByRole("button", { name: /Back to the film/ }).evaluate((b) => b.click()); await wait(1500);
    check(JSON.stringify(await rows()) === JSON.stringify(first), "going back to the film's situation gives the film's mix again");

    console.log("3. The at-bat, two wrists, programs");
    await into(page, "#at-bat");
    check(await page.locator(".pq-ab.is-scrub").count() === 1 && await page.locator(".pq-ab-item").count() === 4, "the at-bat is a pinned strip of four watch faces");
    await page.evaluate(() => { const el = document.getElementById("at-bat"); window.__lenis.scrollTo(el.offsetTop + (el.offsetHeight - innerHeight) * 0.98, { immediate: true }); }); await wait(1400);
    check((await page.locator(".pq-ab-seg .g").first().evaluate((e) => +getComputedStyle(e).opacity)) > 0.9, "on the last pitch the whole thread lights");
    await page.locator(".pq-ab-face").nth(3).click(); await wait(400);
    check(await page.locator("#ab-mix-3:visible .pq-ab-mrow").count() === 3, "a face opens the mix the engine chose from");
    await into(page, ".pq-tw-stage"); await wait(900);
    const before = await page.locator(".pq-tw-watch .pq-w").evaluateAll((els) => els.map((e) => !e.classList.contains("is-blank") && +getComputedStyle(e.querySelector(".pq-wwords")).opacity === 1 && e.querySelector(".pq-wwords").innerText.replace(/\s+/g, " ").trim()));
    check(before[0] === "FASTBALL LOW AND OUTSIDE" && before[1] === before[0], "both watches arrive already showing the film's call, never a blank face");
    await page.evaluate(() => { const el = document.querySelector(".pq-tw-stage"), y = el.getBoundingClientRect().top + scrollY - innerHeight * 0.08; window.__lenis.scrollTo(y, { immediate: true }); }); await wait(1600);
    const tw = () => page.locator(".pq-tw-watch .pq-w").evaluateAll((els) => els.map((e) => (e.classList.contains("is-blank") || +getComputedStyle(e.querySelector(".pq-wwords")).opacity < 1 ? "" : e.querySelector(".pq-wwords").innerText.replace(/\s+/g, " ").trim())));
    let both = await tw();
    check(both.length === 2 && both[0] && both[0] === both[1] && both[0] !== "FASTBALL LOW AND OUTSIDE", `scrolling past sends the next call to both watches (${both[0]})`);
    check(/One long buzz/.test(await page.locator(".pq-tw [role=status]").innerText()), "a new call is one long buzz");
    await page.getByRole("button", { name: /Change the call/ }).click(); await wait(1300);
    const again = await tw();
    check(again[0] === again[1] && again[0] !== both[0] && /Two short/.test(await page.locator(".pq-tw [role=status]").innerText()), `pressing again changes it on both, two short buzzes (${again[0]})`);
    await into(page, ".pq-pr"); await wait(3800);
    const lit = await page.locator(".pq-pr-lane").evaluateAll((els) => els.map((e) => [...e.querySelectorAll(".pq-pr-dots i")].filter((d) => d.classList.contains("is-k") && +getComputedStyle(d).opacity === 1).length));
    check((await page.locator(".pq-pr-count b").innerText()) === "412" && JSON.stringify(lit) === "[16,15,13]" && await page.locator(".pq-pr.is-coach .pq-pr-staff").count() === 1, `the outing plays back into three lanes (${lit.join(", ")} strikes in 25), and a coach sees the staff`);
    check(await page.locator(".pq-pr-big dd").count() === 3, "three big numbers, not a dashboard");
    await page.getByRole("button", { name: "Player", exact: true }).click(); await wait(1200);
    check(await page.locator(".pq-pr.is-player .pq-pr-staff").count() === 0 && await page.locator(".pq-pr-own").count() === 1, "a player sees his own page only");
    check(/sample pitcher, not a real player/i.test(await page.locator(".pq-pr figcaption").innerText()), "the page is labelled as a sample");

    console.log("4. Content rules");
    const text = (await page.locator("body").innerText()).toLowerCase();
    const banned = ["latency", "millisecond", "battery", "waitlist", "wait list", "testimonial", "ai-powered", "revolutioniz", "seamless", "unlock", "trusted by", "ncaa compliant", "ncaa-compliant", "built by a pitcher", "$"];
    const hit = banned.filter((w) => text.includes(w));
    check(hit.length === 0, `none of the off-limits claims or filler words are on the page${hit.length ? ` (found: ${hit.join(", ")})` : ""}`);
    check(/illustration/.test(text) && /prototype/.test(text), "the watch is labelled an illustration and a prototype");
    check(await page.locator("#five, #reads, #dugout, .mk-in, canvas.mk-ab").count() === 0, "Five reads, Inside the call and the 3D field are gone");
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);

    console.log("5. Reduced motion, phone, keyboard");
    const rm = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const rp = await rm.newPage();
    await rp.goto(URL_, { waitUntil: "networkidle" }); await wait(800);
    const still = await rp.evaluate(() => ({ lenis: !!window.__lenis, frame: document.querySelector(".pq-cv").dataset.frame || "", filmH: document.getElementById("top").offsetHeight / innerHeight, pin: getComputedStyle(document.querySelector(".pq-pin")).position,
      msgs: [...document.querySelectorAll(".pq-msg")].filter((m) => +getComputedStyle(m).opacity === 1 && m.getBoundingClientRect().height > 0).length, chips: [...document.querySelectorAll(".pq-chip")].filter((m) => +getComputedStyle(m).opacity === 1).length,
      call: getComputedStyle(document.querySelector(".pq-callname")).position, scrub: document.querySelectorAll(".is-scrub").length, wrists: [...document.querySelectorAll(".pq-tw-watch .pq-w")].map((e) => e.classList.contains("is-blank")) }));
    check(!still.lenis && still.frame === "" && still.pin === "relative" && still.filmH < 8, "under reduced motion the film is one still: no smooth scroll, no frames drawn, nothing pinned");
    check(still.msgs === 5 && still.chips === 5 && still.call === "static", "its stops are a plain stacked list, with the call named");
    check(still.scrub === 0 && still.wrists.every((b) => !b), "the at-bat is a plain list and both watches already show the call");
    await rp.getByRole("button", { name: "One more strike" }).isDisabled().then((d) => check(d, "the playground still works there (2 strikes is the limit)"));
    await rp.getByRole("button", { name: "One fewer strike" }).evaluate((b) => b.click()); await wait(1500);
    check((await rp.locator(".pq-rowwrap").first().getAttribute("data-group")) !== null && (await rp.locator(".pq-face").evaluate((e) => +getComputedStyle(e).opacity)) === 1, "and its watch shows the new call without animating");
    await rm.close();

    const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pp = await ph.newPage();
    const tall = []; pp.on("request", (r) => { const m = /\/media\/film\/watch\/(wide|tall)\//.exec(r.url()); if (m) tall.push(m[1]); });
    await pp.goto(URL_, { waitUntil: "networkidle" }); await wait(1200);
    check(tall.length > 0 && tall.every((t) => t === "tall"), "a phone loads the tall film");
    check(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "nothing overflows sideways at 390 wide");
    await filmTo(pp, 0.46);
    const stack = await pp.locator(".pq-chip").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top)]));
    check(stack.every((c, i) => c[0] === stack[0][0] && (i === 0 || c[1] > stack[i - 1][1])), "on a phone the candidate calls stack under the watch");
    await filmTo(pp, 0.72);
    const words = await pp.locator(".pq-word").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    const scr = await pp.evaluate(() => innerHeight / 2);
    check(words[0] < scr && words[1] > scr, "PERFECT sits above the watch and PITCH below it");
    await pp.evaluate(() => document.querySelector(".pq-nav-menu").click()); await wait(300);
    check(await pp.locator("#pq-sheet a:visible").count() >= 5, "the menu opens a sheet of links");
    await ph.close();

    await page.goto(URL_, { waitUntil: "networkidle" }); await wait(800);
    const order = [];
    for (let n = 0; n < 8; n++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || "")); }
    check(order[0] === "Skip to content" && order.includes("Talk to us"), `keyboard reaches the skip link and the nav (${order.join(" / ")})`);
    await page.getByRole("button", { name: "One more ball" }).focus(); await wait(1500);
    check(await page.locator(".pq-pg.is-live").count() === 1, "tabbing into the playground brings the film to it");

    console.log("6. Talk to us");
    await page.goto(URL_ + "#contact", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send message" }).click(); await wait(600);
    check((await page.locator(".pq-form-err").count()) === 5, "an empty form names each missing field");
    await page.fill("#c-name", "Sam Ortiz"); await page.fill("#c-email", "sam@school.edu");
    await page.selectOption("#c-role", "Head coach"); await page.selectOption("#c-level", "High school");
    await page.fill("#c-message", "We have six pitchers and want help calling games.");
    check((await page.locator(".pq-form-err").count()) === 0, "fixing a field clears its message");
    await page.getByRole("button", { name: "Send message" }).click(); await wait(800);
    check((await page.locator(".pq-form-problem").innerText()) === "This site can't send messages yet.", "with no email provider it says so instead of faking a send");
    const hp = await fetch(URL_ + "api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: "x" }) });
    check(hp.status === 200, "the hidden field turns bots away quietly");
    const bad = await fetch(URL_ + "api/contact", { method: "POST", body: "{{{" });
    check(bad.status === 400, "a broken request gets a 400");
  } finally {
    await browser.close(); web.kill();
  }
  console.log(fails ? `\n${fails} site check(s) FAILED` : "\nall site checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
