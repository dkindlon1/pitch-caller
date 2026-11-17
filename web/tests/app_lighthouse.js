/*
 * Lighthouse (mobile) on signed-in portal pages, against a production build served locally (web/tests/start_local.sh).
 * Signs in as the seeded coach with Playwright, hands the session cookie to Lighthouse, runs each page N times and
 * prints the median. Budgets: performance 85+, accessibility 100, layout shift under 0.05.
 *   node web/tests/app_lighthouse.js --url http://localhost:3120 [--runs 3]
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg("--url", "http://localhost:3120"), RUNS = +arg("--runs", 3);
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(URL_)) { console.error("local servers only"); process.exit(2); }
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "screens/app_seed.json"), "utf8"));
const team = seed.team.varsity || seed.team.id || Object.values(seed.team)[0], pitcher = seed.claimedPitcher.id || seed.claimedPitcher;
const PAGES = [["launcher", `/app/t/${team}`], ["pitcher", `/app/t/${team}/roster/${pitcher}`], ["pitcher-stats", `/app/t/${team}/roster/${pitcher}/stats`], ["game-day", `/app/t/${team}/games`], ["game-day-wizard", `/app/t/${team}/games/new`]];
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(URL_ + "/login"); await page.getByLabel("Email").first().fill("coach@test.local"); await page.getByLabel("Password").first().fill(seed.pass || "test-pass-1234");
  await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL(/\/app/, { timeout: 30000 });
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const chromePath = chromium.executablePath();
  await browser.close();
  const hdr = path.join(os.tmpdir(), "lh-headers.json"); fs.writeFileSync(hdr, JSON.stringify({ Cookie: cookie }));
  const lh = path.join(__dirname, "../node_modules/lighthouse/cli/index.js");
  let bad = 0;
  for (const [name, route] of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const out = path.join(os.tmpdir(), `lh-${name}-${i}.json`);
      execFileSync(process.execPath, [lh, URL_ + route, "--quiet", "--chrome-flags=--headless=new", `--extra-headers=${hdr}`, "--only-categories=performance,accessibility", "--output=json", `--output-path=${out}`],
        { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "ignore", "ignore"] });
      const r = JSON.parse(fs.readFileSync(out, "utf8"));
      if (!r.finalDisplayedUrl.includes(route)) throw new Error(`${name}: Lighthouse was sent to ${r.finalDisplayedUrl} (not signed in?)`);
      runs.push({ perf: Math.round(r.categories.performance.score * 100), a11y: Math.round(r.categories.accessibility.score * 100), cls: r.audits["cumulative-layout-shift"].numericValue,
        lcp: r.audits["largest-contentful-paint"].numericValue, tbt: r.audits["total-blocking-time"].numericValue,
        a11yFails: Object.values(r.audits).filter((a) => r.categories.accessibility.auditRefs.some((x) => x.id === a.id && x.weight > 0) && a.score !== null && a.score < 1).map((a) => a.id) });
    }
    const p = med(runs.map((x) => x.perf)), a = Math.min(...runs.map((x) => x.a11y)), c = Math.max(...runs.map((x) => x.cls));
    const ok = p >= 85 && a === 100 && c < 0.05; if (!ok) bad++;
    console.log(`${ok ? "  ok  " : "  FAIL"} ${name}: performance ${runs.map((x) => x.perf).join(", ")} (median ${p}); accessibility ${a}; layout shift ${c.toFixed(3)}; LCP ${runs.map((x) => (x.lcp / 1000).toFixed(1)).join(", ")} s; blocking ${runs.map((x) => Math.round(x.tbt)).join(", ")} ms${a < 100 ? "; failing audits: " + [...new Set(runs.flatMap((x) => x.a11yFails))].join(", ") : ""}`);
  }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
