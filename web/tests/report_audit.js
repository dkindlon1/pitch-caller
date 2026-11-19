/*
 * Build 1: accessibility and speed on the new routes, against the seeded season and a running local production build.
 *   - axe-core (WCAG 2.x A/AA) on every new route at 1440 and 390 wide, as the head coach, a pitcher, the under-18
 *     player, his parent and signed out; the heat map in its other states too. Fails on any serious or critical issue.
 *   - Lighthouse mobile, 3 runs each, on the outing report (coach), his own recap (pitcher) and the public recap
 *     (signed out): median performance, accessibility, layout shift.
 * Usage (repo root): node web/tests/report_audit.js [--lighthouse] [--runs 3]
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, T = season.team, P = season.pitchers, G = season.games;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [path.join(__dirname, "..")] }), "utf8");
const LH = process.argv.includes("--lighthouse"), RUNS = +((process.argv[process.argv.indexOf("--runs") + 1]) || 3);
const g = (n) => G.find((x) => x.n === n).id, opp = season.opponents.Lakeside;
const ROUTES = {
  coach: [`/app/t/${T}/reports/${g(6)}/${P.Ace}`, `/app/t/${T}/reports/${g(6)}`, `/app/t/${T}/roster/${P.Ace}/recap`, `/app/t/${T}/roster/${P.Ace}/recap/${season.spring}`,
    `/app/t/${T}/opponents/${opp.id}/hitters/${opp.hitters[0]}`, `/app/t/${T}/opponents/${opp.id}`, `/app/t/${T}/settings`, `/app/t/${T}/roster/${P.Kid}`, `/app/t/${T}/games`],
  ace: [`/app/me/${T}/${P.Ace}/outings/${g(1)}`, `/app/me/${T}/${P.Ace}/recap`, `/app/me/${T}/${P.Ace}/recap/${season.spring}`],
  kid: [`/app/me/${T}/${P.Kid}/recap`],
  parent: ["/app/approve"],
  anon: [`/r/${season.shares.ace}`],
};
const signIn = async (page, who) => {
  await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
  await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
};

(async () => {
  const browser = await chromium.launch();
  let serious = 0, runs = 0;
  const cookies = {};
  for (const [who, routes] of Object.entries(ROUTES)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), page = await ctx.newPage();
    if (who !== "anon") { await signIn(page, who); cookies[who] = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; "); }
    for (const route of routes) for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await page.goto(SITE + route, { waitUntil: "networkidle" });
      const states = [async () => {}];
      if (await page.locator(".rp-heatwrap").count()) states.push(async () => { const h = page.locator(".rp-heatwrap"); await h.getByRole("button", { name: "Where it landed" }).click(); await h.getByRole("button", { name: "Negative" }).click(); });
      if (await page.locator(".rp-slices").count()) states.push(async () => { await page.locator(".rp-slices .rp-seg button").nth(5).click(); });
      for (const [i, s] of states.entries()) {
        await s(); await page.waitForTimeout(100);
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
        runs++;
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        serious += bad.length;
        const label = `${who} ${route.replace(T, "T").slice(0, 70)} @${w}${i ? ` (state ${i})` : ""}`;
        if (bad.length) for (const v of bad) console.log(`  FAIL ${label}: ${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
        const minor = r.violations.filter((v) => !(v.impact === "serious" || v.impact === "critical"));
        if (minor.length) console.log(`  note ${label}: ${minor.map((v) => `${v.impact} ${v.id}`).join(", ")}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`axe: ${runs} page states, ${serious} serious or critical issue(s)`);

  let lhBad = 0;
  if (LH) {
    const lh = path.join(__dirname, "../node_modules/lighthouse/cli/index.js"), chromePath = chromium.executablePath();
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    for (const [name, who, route] of [["outing report (coach)", "coach", ROUTES.coach[0]], ["his recap (pitcher)", "ace", ROUTES.ace[1]], ["public recap (signed out)", "anon", ROUTES.anon[0]]]) {
      const hdr = path.join(os.tmpdir(), `lh-h-${who}.json`); fs.writeFileSync(hdr, JSON.stringify(cookies[who] ? { Cookie: cookies[who] } : {}));
      const res = [];
      for (let i = 0; i < RUNS; i++) {
        const out = path.join(os.tmpdir(), `lh-b1-${who}-${i}.json`);
        execFileSync(process.execPath, [lh, SITE + route, "--quiet", "--chrome-flags=--headless=new", `--extra-headers=${hdr}`, "--only-categories=performance,accessibility", "--output=json", `--output-path=${out}`],
          { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "ignore", "ignore"] });
        const r = JSON.parse(fs.readFileSync(out, "utf8"));
        if (!r.finalDisplayedUrl.includes(route.slice(0, 40))) throw new Error(`${name}: Lighthouse landed on ${r.finalDisplayedUrl}`);
        res.push({ perf: Math.round(r.categories.performance.score * 100), a11y: Math.round(r.categories.accessibility.score * 100), cls: r.audits["cumulative-layout-shift"].numericValue,
          lcp: r.audits["largest-contentful-paint"].numericValue, tbt: r.audits["total-blocking-time"].numericValue,
          fails: r.categories.accessibility.auditRefs.filter((x) => x.weight > 0 && r.audits[x.id].score !== null && r.audits[x.id].score < 1).map((x) => x.id) });
      }
      const p = med(res.map((x) => x.perf)), a = Math.min(...res.map((x) => x.a11y)), c = Math.max(...res.map((x) => x.cls));
      const ok = p >= 85 && a === 100 && c < 0.05; if (!ok) lhBad++;
      console.log(`${ok ? "  ok  " : "  FAIL"} Lighthouse ${name}: performance ${res.map((x) => x.perf).join(", ")} (median ${p}); accessibility ${a}; layout shift ${c.toFixed(3)}; LCP ${res.map((x) => (x.lcp / 1000).toFixed(1)).join(", ")} s; blocking ${res.map((x) => Math.round(x.tbt)).join(", ")} ms${a < 100 ? "; failing: " + [...new Set(res.flatMap((x) => x.fails))].join(", ") : ""}`);
    }
  }
  process.exit(serious || lhBad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
