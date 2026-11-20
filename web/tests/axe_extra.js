/*
 * Review: axe (WCAG 2.x A/AA + best practice) on the new routes report_audit.js doesn't cover, at 1440 and 390:
 * custom fields (coach), the player's home (At your best), the owner-off-staff team and hitter pages, Settings (on the
 * merged build: Seasons + Watches together). Run from the repo root with the site up: node web/tests/axe_extra.js
 * Pre-release (Nov 19): waits for the page's entrance animations to finish before each axe run (the faded 6th row on
 * the player's home was a capture mid-fade; web/tests/motion_contrast_probe.js proves it).
 */
const path = require("path"), fs = require("fs");
const ROOT = process.cwd();
const { chromium } = require(require.resolve("playwright", { paths: [ROOT] }));
const { Client } = require(require.resolve("pg", { paths: [ROOT] }));
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [path.join(ROOT, "web")] }), "utf8");
const S = JSON.parse(fs.readFileSync("C:/dev/pitch-caller-logs/season.json", "utf8")), T = S.team, SITE = S.site;
const opp = Object.values(S.opponents)[0];
(async () => {
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const org = (await db.query("select org_id from public.programs where id = $1", [T])).rows[0].org_id;
  const owner0 = (await db.query("select owner_id from public.organizations where id = $1", [org])).rows[0].owner_id;
  const hid = (await db.query("select id from public.hitters where program_id = $1 and doc->>'teamId' = $2 and deleted_at is null and doc->>'mergedInto' is null limit 1", [T, opp.id])).rows[0].id;
  const ROUTES = [["coach", `/app/t/${T}/opponents/fields`], ["coach", `/app/t/${T}/settings`], ["ace", `/app/me/${T}`], ["ace", `/app/me/${T}/${S.pitchers.Ace}`],
    ["outsider", `/app/t/${T}/opponents/${opp.id}`], ["outsider", `/app/t/${T}/opponents/${opp.id}/hitters/${hid}`]];
  const browser = await chromium.launch(); let runs = 0, bad = 0;
  try {
    await db.query("update public.organizations set owner_id = $2 where id = $1", [org, S.users.outsider.id]);
    for (const who of [...new Set(ROUTES.map((r) => r[0]))]) {
      if (who === "coach") await db.query("update public.organizations set owner_id = $2 where id = $1", [org, owner0]);
      if (who === "outsider") await db.query("update public.organizations set owner_id = $2 where id = $1", [org, S.users.outsider.id]);
      const ctx = await browser.newContext(), page = await ctx.newPage();
      await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(S.password); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
      for (const [, u] of ROUTES.filter((r) => r[0] === who)) for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: 900 }); const r = await page.goto(SITE + u, { waitUntil: "networkidle" });
        // let the screen's entrance finish first (rows fade up in a stagger): axe on a half-faded row reads a blended color
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); }).map((a) => a.finished.catch(() => {}))));
        await page.addScriptTag({ content: AXE });
        const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
        const sv = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        runs++; bad += sv.length;
        for (const v of sv) for (const nd of v.nodes) console.log(`        ${v.id}: ${nd.target.join(" ")} :: ${nd.html.slice(0, 160)} :: ${(nd.any[0] && nd.any[0].message || "").slice(0, 140)}`);
        console.log(`${sv.length ? "  FAIL" : "  ok  "} ${who} ${w} ${u.replace(T, "T")} (${r.status()}): ${sv.length} serious/critical${sv.length ? " " + sv.map((v) => v.id + "x" + v.nodes.length).join(",") : ""}; ${res.violations.length} total; overflow ${over}px`);
      }
      await ctx.close();
    }
  } finally { await db.query("update public.organizations set owner_id = $2 where id = $1", [org, owner0]); await browser.close(); await db.end(); }
  console.log(`axe extra: ${runs} page states, ${bad} serious or critical issue(s)`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
