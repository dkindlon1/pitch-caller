/*
 * Build 2 visual loop: the opponent screens at 1440x900, 1180x820, 820x1180 and 390x844 (full page), as the head coach,
 * a viewer (read-only) and a player (refused). Against the seeded season and a running local site (SITE).
 * Usage: node web/tests/opp_shots.js <round>  -> C:/dev/pitch-caller-shots/build2/<round>/
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || "http://localhost:3197", T = season.team, round = process.argv[2] || "r1";
const OUT = path.join("C:/dev/pitch-caller-shots/build2", round); fs.mkdirSync(OUT, { recursive: true });
const opp = season.opponents.Lakeside, h = opp.hitters[5];
const PAGES = { coach: [["hitter", `/app/t/${T}/opponents/${opp.id}/hitters/${h}`], ["hitter-sugg", `/app/t/${T}/opponents/${opp.id}/hitters/${opp.hitters[0]}`], ["team", `/app/t/${T}/opponents/${opp.id}`], ["fields", `/app/t/${T}/opponents/fields`], ["opponents", `/app/t/${T}/opponents`]],
  viewer: [["hitter-viewer", `/app/t/${T}/opponents/${opp.id}/hitters/${h}`]], ace: [["hitter-player", `/app/t/${T}/opponents/${opp.id}/hitters/${h}`]] };
(async () => {
  const b = await chromium.launch(), rep = [];
  for (const [who, list] of Object.entries(PAGES)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), p = await ctx.newPage();
    await p.goto(SITE + "/login?next=/app"); const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
    for (const [k, u] of list) for (const [w, hh] of [[1440, 900], [1180, 820], [820, 1180], [390, 844]]) {
      await p.setViewportSize({ width: w, height: hh }); const r = await p.goto(SITE + u, { waitUntil: "networkidle" }); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(OUT, `${k}__${w}x${hh}.png`), fullPage: true });
      rep.push(`${k} ${w} ${r.status()} overflow=${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)}`);
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, "report.txt"), rep.join("\n")); console.log(rep.filter((x) => !/overflow=0$/.test(x)).join("\n") || "no overflow");
})().catch((e) => { console.error(e); process.exit(1); });
