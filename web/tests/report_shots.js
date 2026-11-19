/*
 * Build 1 visual loop: every new screen at 1440x900, 1180x820, 820x1180 and 390x844 (full page), signed in as the head
 * coach, a pitcher, the under-18 player, his parent, and signed out (the public recap); plus the heat map's states and
 * the PDFs. Against the seeded season (web/tests/season_seed.js) and a running local site (SITE, default :3197).
 * Usage (repo root): node web/tests/report_shots.js <round-name> [--only=key,key] [--sizes=1440,390]
 * Writes C:/dev/pitch-caller-shots/build1/<round>/ (on disk only).
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site;
const round = process.argv[2] || "r1";
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const sizesArg = (process.argv.find((a) => a.startsWith("--sizes=")) || "").slice(8).split(",").filter(Boolean).map(Number);
const OUT = path.join("C:/dev/pitch-caller-shots/build1", round); fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[1440, 900], [1180, 820], [820, 1180], [390, 844]].filter(([w]) => !sizesArg.length || sizesArg.includes(w));
const T = season.team, P = season.pitchers, G = season.games;
const g6 = G.find((g) => g.n === 6).id, g1 = G.find((g) => g.n === 1).id, g13 = G.find((g) => g.n === 13).id, g3 = G.find((g) => g.n === 3).id;
const opp = season.opponents.Lakeside.id, hitter = season.opponents.Lakeside.hitters[0];

const PAGES = {
  coach: [
    ["outing", `/app/t/${T}/reports/${g6}/${P.Ace}`], ["outing-kid", `/app/t/${T}/reports/${g6}/${P.Kid}`], ["summary", `/app/t/${T}/reports/${g6}`],
    ["sofar", `/app/t/${T}/roster/${P.Ace}/recap`], ["final", `/app/t/${T}/roster/${P.Ace}/recap/${season.spring}`],
    ["hitter", `/app/t/${T}/opponents/${opp}/hitters/${hitter}`], ["opponent", `/app/t/${T}/opponents/${opp}`], ["settings", `/app/t/${T}/settings`],
    ["pitcher", `/app/t/${T}/roster/${P.Kid}`], ["games", `/app/t/${T}/games`], ["outing-old-app", `/app/t/${T}/reports/${G.find((g) => g.n === 12).id}/${P.Lefty}`],
  ],
  ace: [["me-outing", `/app/me/${T}/${P.Ace}/outings/${g1}`], ["me-recap", `/app/me/${T}/${P.Ace}/recap`], ["me-final", `/app/me/${T}/${P.Ace}/recap/${season.spring}`]],
  kid: [["kid-recap", `/app/me/${T}/${P.Kid}/recap`], ["kid-outing", `/app/me/${T}/${P.Kid}/outings/${g3}`]],
  parent: [["approve", "/app/approve"]],
  anon: [["public", `/r/${season.shares.ace}`], ["public-missing", `/r/${"0".repeat(64)}`]],
};

async function signIn(page, who) {
  await page.goto(SITE + "/login?next=/app");
  const f = page.getByRole("form", { name: "Sign in" });
  await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password);
  await f.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app") && !u.pathname.startsWith("/app/login"), { timeout: 15000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const [who, list] of Object.entries(PAGES)) {
    const todo = list.filter(([k]) => !only.length || only.includes(k));
    if (!todo.length) continue;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    if (who !== "anon") await signIn(page, who);
    for (const [key, url] of todo) {
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        const t0 = Date.now();
        const res = await page.goto(SITE + url, { waitUntil: "networkidle" }).catch((e) => ({ status: () => "ERR " + e.message }));
        await page.waitForTimeout(250);
        const file = path.join(OUT, `${key}__${w}x${h}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        report.push(`${key} ${w}x${h} ${res && res.status ? res.status() : "?"} ${Date.now() - t0}ms overflow=${over}px`);
      }
      // the heat map's other states, at laptop and phone
      if (["outing", "me-outing", "final"].includes(key)) for (const [w, h] of SIZES.filter(([x]) => x === 1440 || x === 390)) {
        await page.setViewportSize({ width: w, height: h }); await page.goto(SITE + url, { waitUntil: "networkidle" });
        const heat = page.locator(".rp-heatwrap");
        if (await heat.count()) {
          await heat.getByRole("button", { name: "Where it landed" }).click(); await heat.getByRole("button", { name: "Negative" }).click();
          await heat.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
          await heat.screenshot({ path: path.join(OUT, `${key}-heat-landed-negative__${w}.png`) });
          await heat.getByRole("button", { name: "Where it was called" }).click(); await heat.getByRole("button", { name: "Strikes" }).click(); await page.waitForTimeout(100);
          await heat.screenshot({ path: path.join(OUT, `${key}-heat-called-strikes__${w}.png`) });
          const pick = heat.locator(".rp-seg").first().getByRole("button").nth(1);
          if (await pick.count()) { await pick.click(); await page.waitForTimeout(100); await heat.screenshot({ path: path.join(OUT, `${key}-heat-pitch__${w}.png`) }); }
        }
      }
    }
    if (errs.length) report.push(`${who}: page errors: ${[...new Set(errs)].slice(0, 5).join(" | ")}`);
    // the PDFs
    if (who === "coach" && (!only.length || only.includes("pdf"))) {
      for (const [k, u] of [["outing", `/app/t/${T}/reports/${g6}/${P.Ace}/pdf`], ["final", `/app/t/${T}/roster/${P.Ace}/recap/${season.spring}/pdf`]]) {
        const r = await page.request.get(SITE + u); const b = await r.body(); fs.writeFileSync(path.join(OUT, `pdf-${k}.pdf`), b);
        report.push(`pdf ${k}: ${r.status()} ${r.headers()["content-type"]} ${b.length} bytes`);
      }
    }
    if (who === "anon" && (!only.length || only.includes("pdf"))) {
      const r = await page.request.get(`${SITE}/r/${season.shares.ace}/pdf`); const b = await r.body(); fs.writeFileSync(path.join(OUT, "pdf-public.pdf"), b);
      report.push(`pdf public: ${r.status()} ${b.length} bytes`);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.txt"), report.join("\n") + "\n");
  console.log(report.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
