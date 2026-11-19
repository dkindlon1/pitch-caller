/*
 * Build 3 visual loop: the outcome tracking views at 1440x900, 1180x820, 820x1180 and 390x844 (full page): an outing
 * report (head coach; the section and the drift notes), a season so far recap (coach), the pitcher page (At his best),
 * the pitcher's own outing and home. Against the seeded season and a running local site (SITE).
 * Usage: node web/tests/outcome_shots.js <round>  -> C:/dev/pitch-caller-shots/build3/<round>/
 * Pass OUTING=<gameId>|<pitcherId> to pick the outing (default: the one with the most findings in outcome_findings).
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs"), path = require("path");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || "http://localhost:3197", T = season.team, round = process.argv[2] || "r1";
const OUT = path.join("C:/dev/pitch-caller-shots/build3", round); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  let [g, pid] = (process.env.OUTING || "").split("|");
  if (!g) {
    const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
    const r = (await db.query("select game_id, pitcher_id, jsonb_array_length(data->'findings'->'shown') + jsonb_array_length(data->'drift') n from public.outcome_findings where program_id = $1 and pitcher_id = $2 order by 3 desc limit 1", [T, season.pitchers.Ace])).rows[0];
    await db.end(); g = r.game_id; pid = r.pitcher_id; console.log(`outing ${g} (${r.n} findings + notes)`);
  }
  const ace = season.pitchers.Ace;
  const PAGES = { coach: [["outing", `/app/t/${T}/reports/${g}/${pid}`], ["recap", `/app/t/${T}/roster/${ace}/recap`], ["pitcher", `/app/t/${T}/roster/${ace}`]],
    ace: [["own-outing", `/app/me/${T}/${ace}/outings/${g}`], ["own-home", `/app/me/${T}/${ace}`]] };
  const b = await chromium.launch(), rep = [];
  for (const [who, list] of Object.entries(PAGES)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), p = await ctx.newPage();
    await p.goto(SITE + "/login?next=/app"); const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
    for (const [k, u] of list) for (const [w, hh] of [[1440, 900], [1180, 820], [820, 1180], [390, 844]]) {
      await p.setViewportSize({ width: w, height: hh }); const r = await p.goto(SITE + u, { waitUntil: "networkidle" }); await p.waitForTimeout(200);
      // the outcome section itself, cropped, plus the full page
      const sec = p.locator("#ot").first();
      if (await sec.count()) await sec.screenshot({ path: path.join(OUT, `${k}-section__${w}x${hh}.png`) }).catch(() => {});
      await p.screenshot({ path: path.join(OUT, `${k}__${w}x${hh}.png`), fullPage: true });
      rep.push(`${k} ${w} ${r.status()} overflow=${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)}`);
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, "report.txt"), rep.join("\n")); console.log(rep.filter((x) => !/ 200 overflow=0$/.test(x)).join("\n") || "all 200, no overflow");
})().catch((e) => { console.error(e); process.exit(1); });
