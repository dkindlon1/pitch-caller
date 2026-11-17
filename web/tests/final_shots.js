/*
 * The final check's camera. Lossless (PNG) captures of the public site at every film stop, the hand-off frame by frame
 * and every lower section, at each viewport, with the geometry of everything showing saved next to each shot, so
 * overlaps, clipping and sideways overflow are measured and not judged from a thumbnail.
 * Run from the repo root against a running production build:
 *   node web/tests/final_shots.js --url http://127.0.0.1:3210/ --out docs/site-v2-shots/final-check/before/gl --qs gl=1
 *     [--views desktop,phone] [--browser chromium|webkit|firefox] [--reduced] [--no-sections] [--no-film]
 * Then: python web/tests/final_sheets.py <out dir>   (contact sheets and 2x close-up crops)
 */
const pw = require("playwright");
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const has = (n) => process.argv.includes(n);
const URL_ = arg("--url", "http://127.0.0.1:3210/"), OUT = arg("--out", "docs/site-v2-shots/final-check/tmp"), QS = arg("--qs", ""), BROWSER = arg("--browser", "chromium");
const ALL = [
  { name: "desktop", width: 1440, height: 900, scale: 2 },
  { name: "hd", width: 1920, height: 1080, scale: 1 },
  { name: "laptop", width: 1280, height: 800, scale: 1 },
  { name: "tablet", width: 820, height: 1180, scale: 1, touch: true },
  { name: "phone", width: 390, height: 844, scale: 2, mobile: true },
  { name: "small", width: 360, height: 740, scale: 2, mobile: true },
  // the awkward ones: a 1366x768 laptop's real viewport, a scaled 1080p laptop, an iPad on its side, a phone on its side, a big monitor
  { name: "short", width: 1366, height: 625, scale: 1 },
  { name: "mid", width: 1536, height: 730, scale: 1 },
  { name: "ipadl", width: 1024, height: 768, scale: 1, touch: true },
  { name: "land", width: 844, height: 390, scale: 1, mobile: true },
  { name: "big", width: 2560, height: 1300, scale: 1 },
  { name: "lap700", width: 1280, height: 700, scale: 1 },
  { name: "least", width: 1024, height: 600, scale: 1 },
];
const want = arg("--views", "").split(",").filter(Boolean);
const VIEWS = ALL.filter((v) => (want.length ? want.includes(v.name) : ALL.indexOf(v) < 6));
// every 5% of the film, and the hand-off (the call leaving, the panels coming out) every 1%
const FILM = Array.from({ length: 21 }, (_, i) => i / 20), HAND = Array.from({ length: 17 }, (_, i) => 0.74 + i * 0.01);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WATCH = [".pq-msg", ".pq-msg h1", ".pq-msg h2", ".pq-msg p", ".pq-ledger", ".pq-chip", ".pq-word", ".pq-landed", ".pq-explain", ".pq-rail", ".pq-illus", ".pq-pgtitle", ".pq-ctl", ".pq-mix", ".pq-reset", ".pq-nav-pill", ".pq-face"];

// what is showing right now: each watched element's box, its real opacity (its own times its ancestors'), and whether
// its text is cut off by its own box; plus the page's sideways overflow
const probe = (sels) => {
  const out = [], vw = innerWidth, vh = innerHeight;
  for (const s of sels) document.querySelectorAll(s).forEach((el, i) => {
    let o = 1, vis = true;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); o *= parseFloat(cs.opacity); if (cs.visibility === "hidden" || cs.display === "none") vis = false; }
    const r = el.getBoundingClientRect();
    if (!vis || o < 0.05 || r.width < 2 || r.height < 2) return;
    out.push({ s, i, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), o: +o.toFixed(2), cls: el.className && String(el.className).slice(0, 60), lines: el.matches("h1,h2") ? Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)) : undefined });
  });
  return { els: out, vw, vh, sw: document.documentElement.scrollWidth, stop: document.getElementById("top")?.dataset.stop, frame: document.querySelector(".pq-cv")?.dataset.frame, sharp: document.querySelector(".pq-cv")?.dataset.sharp, gl: !!document.querySelector(".pq-pin.has-gl") };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const launch = BROWSER === "chromium" ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {};
  const browser = await pw[BROWSER].launch(launch);
  const url = URL_ + (QS ? `?${QS}` : "");
  for (const v of VIEWS) {
    const opts = { viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, hasTouch: !!(v.mobile || v.touch), reducedMotion: has("--reduced") ? "reduce" : "no-preference" };
    if (BROWSER !== "firefox") opts.isMobile = !!v.mobile;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
    page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await wait(1500);
    const to = async (y, ms = 1400) => { await page.evaluate((yy) => { if (window.__lenis) window.__lenis.scrollTo(yy, { immediate: true }); else window.scrollTo(0, yy); }, y); await wait(ms); };
    const geo = {};
    const shot = async (name) => { geo[name] = await page.evaluate(probe, WATCH); await page.screenshot({ path: path.join(OUT, `${v.name}-${name}.png`), type: "png" }); };
    if (has("--reduced")) {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += v.height) { await page.evaluate((yy) => scrollTo(0, yy), y); await wait(150); }
      await page.evaluate(() => scrollTo(0, 0)); await wait(300);
      geo.full = await page.evaluate(probe, WATCH);
      await page.screenshot({ path: path.join(OUT, `${v.name}-reduced-full.png`), fullPage: true, type: "png" });
    } else {
      const film = await page.evaluate(() => { const f = document.getElementById("top"); return { top: f.offsetTop, h: f.offsetHeight - innerHeight }; });
      if (!has("--no-film")) {
        for (const p of FILM) { await to(film.top + p * film.h); await shot(`film-${String(Math.round(p * 100)).padStart(3, "0")}`); }
        for (const p of HAND) { await to(film.top + p * film.h, 900); await shot(`hand-${String(Math.round(p * 100)).padStart(3, "0")}`); }
        // the playground at rest (refraction back on in Chromium): long enough for the glass to settle
        await to(film.top + 0.9 * film.h, 2600); await shot("pg-rest");
      }
      if (!has("--no-sections")) {
        const ids = await page.evaluate(() => [...document.querySelectorAll("main > section[id], footer")].filter((s) => s.id !== "top").map((s) => ({ id: s.id || "footer", top: s.getBoundingClientRect().top + scrollY, h: s.offsetHeight })));
        for (const s of ids) {
          const n = s.h <= v.height * 1.1 ? 1 : s.h > v.height * 3 ? 7 : 3;
          for (let i = 0; i < n; i++) { await to(Math.max(0, s.top + (n === 1 ? Math.min(0, (s.h - v.height) / 2) : (i / (n - 1)) * Math.max(0, s.h - v.height))), 1700); await shot(`sec-${s.id}-${i}`); }
        }
      }
    }
    fs.writeFileSync(path.join(OUT, `${v.name}-geo.json`), JSON.stringify(geo));
    const uniq = (a) => [...new Set(a)];
    console.log(`${BROWSER} ${v.name}${QS ? " ?" + QS : ""}: ${Object.keys(geo).length} shots; console ${uniq(errors).length}; failed requests ${uniq(failed).length}`);
    uniq(errors).slice(0, 10).forEach((e) => console.log("   " + e.slice(0, 300)));
    uniq(failed).slice(0, 10).forEach((e) => console.log("   " + e.slice(0, 300)));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
