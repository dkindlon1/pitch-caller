// Collects reference screenshots + computed typography/colour for two boards.
// Run from C:\dev\pitch-caller with: node docs/app-v2-shots/references/_collect.js
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(__dirname);
const RESULTS = path.join(
  process.env.SCRATCH || "C:/Users/kindl/AppData/Local/Temp/claude/60f5f0549f8331c3/ade50e5d-06e1-4d9d-acfe-987d799e9453/scratchpad",
  "reference-results.json"
);

const BOARDS = {
  game: {
    scroll: true,
    pages: [
      "https://www.trackman.com/baseball",
      "https://rapsodo.com/pages/baseball-softball",
      "https://www.whoop.com/us/en/",
      "https://www.strava.com/features",
      "https://www.apple.com/apple-watch-ultra-2/",
      "https://www.apple.com/ios/carplay/",
      "https://www.formula1.com/en/timing/f1-live-lite",
      "https://www.hawkeyeinnovations.com/",
    ],
  },
  portal: {
    scroll: false,
    pages: [
      "https://linear.app/",
      "https://linear.app/features",
      "https://vercel.com/",
      "https://www.raycast.com/",
      "https://arc.net/",
      "https://stripe.com/payments",
      "https://www.notion.com/product",
      "https://ui.shadcn.com/examples/dashboard",
      "https://ui.shadcn.com/examples/tasks",
    ],
  },
};

function slugOf(url) {
  const u = new URL(url);
  return (u.hostname.replace(/^www\./, "") + u.pathname)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function readStyles(page) {
  return page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const h = document.querySelector("h1") || document.querySelector("h2") || document.querySelector("h3");
    const body = document.body;
    return {
      headingTag: h ? h.tagName.toLowerCase() : null,
      headingText: h ? (h.innerText || "").trim().slice(0, 80) : null,
      headingFont: h ? cs(h).fontFamily : null,
      bodyFont: cs(body).fontFamily,
      bodyBg: cs(body).backgroundColor,
      bodyColor: cs(body).color,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  for (const [board, cfg] of Object.entries(BOARDS)) {
    results[board] = [];
    const dir = path.join(OUT, board);
    fs.mkdirSync(dir, { recursive: true });
    for (const url of cfg.pages) {
      const slug = slugOf(url);
      const rec = { url, slug, ok: false };
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3500);
        Object.assign(rec, await readStyles(page));
        await page.screenshot({ path: path.join(dir, `${slug}.png`), type: "png" });
        rec.file = path.relative(ROOT, path.join(dir, `${slug}.png`)).replace(/\\/g, "/");
        if (cfg.scroll) {
          await page.mouse.move(720, 450);
          await page.mouse.wheel(0, 1000);
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(dir, `${slug}-scrolled.png`), type: "png" });
          rec.scrolledFile = path.relative(ROOT, path.join(dir, `${slug}-scrolled.png`)).replace(/\\/g, "/");
        }
        rec.ok = true;
      } catch (err) {
        rec.error = String(err.message || err).split("\n")[0].slice(0, 200);
      } finally {
        await context.close();
      }
      results[board].push(rec);
      console.log(board, rec.ok ? "OK  " : "FAIL", url, rec.error || "");
    }
  }
  await browser.close();
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  console.log("results:", RESULTS);
})();
