/*
 * Pre-release fix 2: is the faded 6th row on the player's home (390 wide) a real color, or a capture mid-animation?
 * For each of the player's home and his pitcher home, at 390: (a) axe straight after networkidle (as axe_extra ran),
 * (b) axe after every CSS animation on the page has finished, (c) a context with reduced motion. Screenshots of (b), (c)
 * and the computed opacity/color of row 6 at each moment. Also holds only row 6's own fade part way in and runs axe: that
 * reproduces the earlier finding on exactly those cells. Run from the repo root with the site up:
 *   node web/tests/motion_contrast_probe.js [screenshot dir]
 */
const path = require("path"), fs = require("fs");
const ROOT = process.cwd();
const { chromium } = require(require.resolve("playwright", { paths: [ROOT] }));
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [path.join(ROOT, "web")] }), "utf8");
const S = JSON.parse(fs.readFileSync("C:/dev/pitch-caller-logs/season.json", "utf8")), T = S.team, SITE = S.site;
const OUT = process.argv[2] || "C:/dev/pitch-caller-shots/prerelease"; fs.mkdirSync(OUT, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const row6 = () => { const tr = document.querySelector(".data-tbl tbody tr:nth-child(6)"); if (!tr) return null;
  const cs = getComputedStyle(tr), a = tr.getAnimations(); return { opacity: cs.opacity, color: getComputedStyle(tr.querySelector("td")).color,
    running: a.map((x) => `${x.animationName || "anim"}:${x.playState}@${Math.round(x.currentTime)}ms`).join(",") || "none" }; };
const axe = (page) => page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags } }), TAGS)
  .then((r) => r.violations.filter((v) => v.impact === "serious" || v.impact === "critical"));
(async () => {
  const browser = await chromium.launch(); let bad = 0;
  const login = async (ctx) => { const page = await ctx.newPage(); await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill("ace@test.local"); await f.getByLabel("Password").fill(S.password); await f.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 }); return page; };
  for (const [name, u] of [["home", `/app/me/${T}`], ["pitcher", `/app/me/${T}/${S.pitchers.Ace}`]]) {
    for (const mode of ["motion", "reduced"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: mode === "reduced" ? "reduce" : "no-preference" });
      const page = await login(ctx);
      await page.goto(SITE + u, { waitUntil: "networkidle" });
      await page.addScriptTag({ content: AXE });
      const early = await page.evaluate(row6), sv1 = await axe(page);
      let frozen = null, sv0 = [];
      if (mode === "motion") {   // the moment the earlier audit caught: row 6's entrance held at 600 ms in
        // every other animation finished; only row 6's own fade stepped through, until axe flags it (the earlier
        // capture read #666567, about 38% of the way to full opacity)
        const span = await page.evaluate(() => {
          const a6 = window.__a6 = document.querySelector(".data-tbl tbody tr:nth-child(6)").getAnimations({ subtree: false })[0];
          for (const a of document.getAnimations()) if (a !== a6) a.finish();
          if (!a6) return null; const t = a6.effect.getComputedTiming(); return { delay: t.delay, dur: t.duration }; });
        for (let k = 0; span && k <= 10; k++) {
          const ms = Math.round(span.delay + span.dur * k / 10);
          await page.evaluate((t) => { window.__a6.pause(); window.__a6.currentTime = t; }, ms);
          frozen = { at: ms, ...(await page.evaluate(row6)) }; sv0 = await axe(page);
          if (sv0.length) { await page.screenshot({ path: path.join(OUT, `player_${name}_390_mid_animation.png`), fullPage: true }); break; }
        }
        await page.evaluate(() => { if (window.__a6) window.__a6.finish(); });
        await page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
      }
      // wait for every animation on the page to finish (finite ones; infinite ones like the live pill are left out)
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); }).map((a) => a.finished.catch(() => {}))));
      const late = await page.evaluate(row6), sv2 = await axe(page);
      await page.screenshot({ path: path.join(OUT, `player_${name}_390_${mode}_settled.png`), fullPage: true });
      const fmt = (sv) => sv.length ? sv.map((v) => `${v.id}x${v.nodes.length} [${v.nodes.map((n) => n.target.join(" ")).join(" | ").slice(0, 160)}]`).join(", ") : "0 serious";
      if (frozen) console.log(`${name} 390 ${mode}: held mid-fade      row6 ${JSON.stringify(frozen)}  axe: ${fmt(sv0)} ${sv0.length ? '(' + sv0[0].nodes[0].any[0].message.slice(0, 90) + ')' : ''}`);
      console.log(`${name} 390 ${mode}: right after load  row6 ${JSON.stringify(early)}  axe: ${fmt(sv1)}`);
      console.log(`${name} 390 ${mode}: motion settled    row6 ${JSON.stringify(late)}  axe: ${fmt(sv2)}`);
      bad += sv2.length;
      await ctx.close();
    }
  }
  await browser.close();
  console.log(bad ? `contrast probe: ${bad} serious issue(s) after motion settles` : "contrast probe: 0 serious issues once motion settles");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
