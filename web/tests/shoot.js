/*
 * The visual loop's camera. Screenshots of the public site at fixed viewports and scroll positions, and optionally a
 * recording of one full scroll. Run from the repo root against a running site:
 *   node web/tests/shoot.js --url http://127.0.0.1:3000/ --out docs/site-v2-shots/build/pass1 [--only desktop|phone] [--video] [--reduced] [--film 0.05,0.5] [--sections]
 * Film positions are fractions of the film's scroll (0 = top, 1 = the end of the pinned scene).
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const has = (n) => process.argv.includes(n);
const URL_ = arg("--url", "http://127.0.0.1:3000/"), OUT = arg("--out", "docs/site-v2-shots/build/tmp"), ONLY = arg("--only", "");
const FILM = (arg("--film", "0.02,0.12,0.2,0.27,0.33,0.4,0.46,0.53,0.6,0.66,0.72,0.76,0.8,0.84,0.88,0.93")).split(",").map(Number);
const VIEWS = [{ name: "desktop", width: 1440, height: 900, scale: 1 }, { name: "phone", width: 390, height: 844, scale: 2, mobile: true }].filter((v) => !ONLY || v.name === ONLY);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, isMobile: !!v.mobile, hasTouch: !!v.mobile,
      reducedMotion: has("--reduced") ? "reduce" : "no-preference", ...(has("--video") ? { recordVideo: { dir: OUT, size: { width: v.width, height: v.height } } } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(URL_, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await wait(1200);
    const to = async (y) => { await page.evaluate((yy) => { if (window.__lenis) window.__lenis.scrollTo(yy, { immediate: true }); else window.scrollTo(0, yy); }, y); await wait(1300); };
    const tag = has("--reduced") ? `${v.name}-reduced` : v.name;
    if (has("--video")) {
      // one steady scroll from top to bottom, the way a visitor would
      const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const step = Math.round(v.height * 0.045);
      for (let y = 0; y <= total; y += step) { await page.mouse.wheel(0, step); await wait(40); }
      await wait(1500);
    } else if (has("--reduced") || has("--full")) {
      // walk the page once so lazy images are in before the long screenshot
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += v.height) { await page.evaluate((yy) => scrollTo(0, yy), y); await wait(120); }
      await page.evaluate(() => scrollTo(0, 0)); await wait(300);
      await page.screenshot({ path: path.join(OUT, `${tag}-full.jpg`), fullPage: true, type: "jpeg", quality: 82 });
    } else {
      const film = await page.evaluate(() => { const f = document.getElementById("top"); return f ? { top: f.offsetTop, h: f.offsetHeight - innerHeight } : null; });
      if (film && !has("--no-film")) for (const p of FILM) { await to(film.top + p * film.h); await page.screenshot({ path: path.join(OUT, `${tag}-film-${String(Math.round(p * 100)).padStart(3, "0")}.jpg`), type: "jpeg", quality: 86 }); }
      if (has("--sections")) {
        const ids = await page.evaluate(() => [...document.querySelectorAll("main > section[id], footer")].filter((s) => s.id !== "top").map((s) => ({ id: s.id || "footer", top: s.getBoundingClientRect().top + scrollY, h: s.offsetHeight })));
        for (const s of ids) {
          const n = Math.max(1, Math.min(8, Math.round(s.h / v.height * 1.5)));
          for (let i = 0; i < n; i++) { await to(s.top + (n === 1 ? 0 : (i / (n - 1)) * Math.max(0, s.h - v.height))); await page.screenshot({ path: path.join(OUT, `${tag}-${s.id}-${i}.jpg`), type: "jpeg", quality: 86 }); }
        }
      }
    }
    if (errors.length) console.log(`${tag}: page errors:\n  ` + [...new Set(errors)].slice(0, 8).join("\n  "));
    else console.log(`${tag}: no page errors`);
    const video = page.video();
    await ctx.close();
    if (video) { const p = await video.path(); const dest = path.join(OUT, `${tag}-scroll.webm`); fs.renameSync(p, dest); console.log("video", dest); }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
