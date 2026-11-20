/*
 * Pre-release (Nov 20): the public recap's pitch-mix table on a phone. At 390 it was cut off after "Strike" (Whiff per
 * swing, Hard contact, Positive, Negative past the screen's edge, behind a scroll with no cue). Against the seeded season
 * and a running local site, signed out, on the public link (reduced motion, so nothing is mid-animation):
 *   at 390x844 and 820x1180, for every slice of the pitch-mix block (All, count groups, vs left / right):
 *     - every cell of every row is inside the table's visible box (nothing clipped or hidden behind a scroll);
 *     - every column's label can be read for every value (the header at 820; each value's own label on a phone);
 *     - the page itself doesn't scroll sideways;
 *   a full-page screenshot at each width, and the public PDF saved (compare it before and after: it doesn't change).
 * Usage (repo root, site running): node web/tests/recap_phone_e2e.js <out dir>   (SEASON, SITE as for the other tests)
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { chromium } = require("playwright");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, OUT = process.argv[2] || "C:/dev/pitch-caller-shots/prerelease/recap-phone";
const MIX = 'section[aria-labelledby="h-mix"]';   // the Pitch mix and results section
const COLS = ["Pitches", "Share", "Strike", "Whiff per swing", "Hard contact", "Positive", "Negative"];
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[390, 844], [820, 1180]]) {
      console.log(`${w}x${h}`);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const res = await page.goto(`${SITE}/r/${season.shares.ace}`, { waitUntil: "networkidle" });
      check(res.status() === 200, `the public recap opens (${res.status()})`);
      const slices = await page.$$eval(MIX + " [data-slice]", (els) => els.map((e) => e.getAttribute("data-slice")));
      for (const s of slices) {
        // show this slice the way its button does (the others hidden), then measure
        await page.$$eval(MIX + " [data-slice]", (els, s) => els.forEach((e) => { e.hidden = e.getAttribute("data-slice") !== s; }), s);
        const m = await page.$eval(`${MIX} [data-slice="${s}"]`, (el, COLS) => {
          const t = el.querySelector("table"); if (!t) return null;
          const box = t.parentElement.getBoundingClientRect(), wrap = t.parentElement;
          const cells = [...t.querySelectorAll("tbody th, tbody td")];
          const clipped = cells.filter((c) => { const r = c.getBoundingClientRect(); return r.width === 0 || r.left < box.left - 1 || r.right > box.right + 1 || r.right > innerWidth + 1; })
            .map((c) => c.getAttribute("data-label") || c.textContent.trim().slice(0, 20));
          const head = t.querySelector("thead"), headShown = head && head.getBoundingClientRect().height > 2;
          const headCols = [...t.querySelectorAll("thead th")].map((x) => x.textContent.trim());
          // a value's label: the column header when the header shows; its own label (drawn by ::before) when it doesn't
          const unlabeled = [...t.querySelectorAll("tbody td")].filter((c) => {
            if (headShown) return false;
            const before = getComputedStyle(c, "::before"), txt = before.content.replace(/^"|"$/g, "");
            return !COLS.includes(txt) || before.display === "none";
          }).length;
          return { rows: t.querySelectorAll("tbody tr").length, cells: cells.length, clipped, scrollHidden: wrap.scrollWidth - wrap.clientWidth, headShown, headCols, unlabeled };
        }, COLS);
        if (!m) { check(true, `${s}: no pitches in this group (no table)`); continue; }
        check(m.clipped.length === 0 && m.scrollHidden <= 1, `${s}: all ${m.cells} cells of ${m.rows} rows inside the visible box (${m.clipped.length ? "cut off: " + m.clipped.join(", ") : "none cut off"}; ${m.scrollHidden}px hidden behind a scroll)`);
        check(m.headShown ? COLS.every((c) => m.headCols.includes(c)) : m.unlabeled === 0, `${s}: every value has its column's label (${m.headShown ? "header row" : "each value labeled"}${m.unlabeled ? ", " + m.unlabeled + " unlabeled" : ""})`);
      }
      await page.$$eval(MIX + " [data-slice]", (els) => els.forEach((e, i) => { e.hidden = i !== 0; }));
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(sideways <= 0, `the page doesn't scroll sideways (${sideways}px)`);
      await page.screenshot({ path: path.join(OUT, `public__${w}x${h}.png`), fullPage: true });
      await page.$eval(MIX, (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, `public-mix__${w}x${h}.png`) });
      await ctx.close();
    }
    const ctx = await browser.newContext(); const r = await ctx.request.get(`${SITE}/r/${season.shares.ace}/pdf`); const b = await r.body();
    fs.writeFileSync(path.join(OUT, "public.pdf"), b);
    check(r.status() === 200 && b.length > 1000, `the public PDF: ${r.status()}, ${b.length} bytes, sha256 ${crypto.createHash("sha256").update(b).digest("hex").slice(0, 16)}`);
  } catch (e) { check(false, "error: " + (e.stack || e.message)); }
  await browser.close();
  console.log(fails ? `recap phone: ${fails} of ${checks} checks FAILED` : `all ${checks} recap phone checks passed`);
  process.exit(fails ? 1 : 0);
})();
