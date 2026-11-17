/* Interaction-state close-ups of the signed-in portal. Never submits anything.
 *   node web/tests/app_interact_shots.js [--url http://localhost:3111] [--out docs/app-v2-shots/build/portal-p5/states]
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = String(arg("url", "http://localhost:3111")).replace(/\/$/, "");
const OUT = path.resolve(arg("out", "docs/app-v2-shots/build/portal-p5/states"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) { console.error("refusing: url must be localhost"); process.exit(2); }
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "screens/app_seed.json"), "utf8"));
const V = SEED.team.varsity, C = SEED.claimedPitcher;
const t = (p = "") => `/app/t/${V}${p}`;
const VP = { width: 1440, height: 900 };
const skipped = [];
const ok = (n) => console.log("ok " + n);
const skip = (n, why) => { skipped.push(n); console.log(`skip ${n}: ${why}`); };
const M = 24;

async function clip(page, name, loc, { top = M, pad = M } = {}) {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box");
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - top);
  const w = Math.min(VP.width - x, b.width + (b.x - x) + pad), h = b.height + (b.y - y) + pad;
  await page.screenshot({ path: path.join(OUT, name + ".png"), clip: { x, y, width: w, height: h } });
}
const ONLY = arg("only", ""); async function shot(name, fn) { if (ONLY && !ONLY.split(",").includes(name)) return; try { await fn(); ok(name); } catch (e) { skip(name, String(e.message || e).split("\n")[0].slice(0, 140)); } }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const signIn = async (role) => {
    const ctx = await browser.newContext({ viewport: VP });
    const p = await ctx.newPage(); p.setDefaultTimeout(60000);
    await p.goto(BASE + "/login?next=/app", { waitUntil: "load", timeout: 60000 });
    await p.waitForLoadState("networkidle").catch(() => {}); await wait(800);
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(SEED.users[role].email); await f.getByLabel("Password").fill(SEED.pass);
    await f.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => u.pathname === "/app", { timeout: 60000 });
    await p.waitForLoadState("networkidle").catch(() => {});
    const s = await ctx.storageState(); await ctx.close(); return s;
  };
  const state = await signIn("coach");
  const open = async (p, url, opts = {}) => {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, storageState: state, ...opts });
    const page = await ctx.newPage(); page.setDefaultTimeout(60000);
    await page.goto(BASE + url, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    await wait(700);
    return page;
  };
  // never let a press navigate: release off-element
  const press = async (page, loc, name) => {
    const b = await loc.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(200);
    await clip(page, name, loc);
    await page.mouse.move(2, 2); await page.mouse.up();
  };
  const tabTo = async (page, sel, max = 40) => {
    await page.mouse.move(2, 2);
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab"); await wait(80);
      if (await page.evaluate((s) => { const a = document.activeElement; return !!(a && a.matches(s)); }, sel)) return true;
    }
    return false;
  };

  // 1 + 2: launcher
  let page = await open(null, t());
  const tile = page.locator(".pq-tile").first();
  await shot("tile-rest", async () => { await tile.waitFor({ timeout: 5000 }); await clip(page, "tile-rest", tile); });
  await shot("tile-hover", async () => { await tile.hover(); await wait(400); await clip(page, "tile-hover", tile); await page.mouse.move(2, 2); await wait(300); });
  await shot("tile-focus", async () => {
    if (!(await tabTo(page, ".pq-tile, .pq-tile a, a.pq-tile *, .pq-tile:focus-within *"))) throw new Error("no tile focus via Tab");
    const el = page.locator(".pq-tile:has(:focus), .pq-tile:focus").first();
    await wait(300); await clip(page, "tile-focus", el);
  });
  await shot("tile-pressed", async () => { await press(page, tile, "tile-pressed"); });
  await page.close();

  page = await open(null, t());
  let btn = page.getByText(/Review and start/i).first();
  await shot("btn-primary-rest", async () => { await btn.waitFor({ timeout: 5000 }); await clip(page, "btn-primary-rest", btn); });
  await shot("btn-primary-hover", async () => { await btn.hover(); await wait(400); await clip(page, "btn-primary-hover", btn); await page.mouse.move(2, 2); await wait(300); });
  await shot("btn-primary-focus", async () => {
    const tag = await btn.evaluate((e) => e.closest("a,button") ? "x" : "");
    const target = btn.locator("xpath=ancestor-or-self::*[self::a or self::button][1]");
    await target.evaluate((e) => e.blur && e.blur());
    await page.mouse.move(2, 2);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) { await page.keyboard.press("Tab"); await wait(80); hit = await target.evaluate((e) => e === document.activeElement); }
    if (!hit) throw new Error("button never focused");
    await wait(300); await clip(page, "btn-primary-focus", target);
  });
  await shot("btn-primary-pressed", async () => { await press(page, btn.locator("xpath=ancestor-or-self::*[self::a or self::button][1]"), "btn-primary-pressed"); });
  await page.close();

  // 8: menus
  for (const [name, sel] of [["menu-account", 'summary[aria-label="Your account"]'], ["menu-team", 'summary[aria-label$="switch team"]']]) {
    page = await open(null, t());
    await shot(name, async () => { await page.locator(sel).first().click({ timeout: 5000 }); await wait(400); await page.mouse.move(2, 2); await page.screenshot({ path: path.join(OUT, name + ".png") }); });
    await page.close();
  }

  // 3-5: roster
  page = await open(null, t("/roster"));
  await shot("dock-hover", async () => {
    const it = page.locator(".pq-dock a:not([aria-current])").first(); await it.waitFor({ timeout: 5000 });
    await it.hover(); await wait(400); await clip(page, "dock-hover", it); await page.mouse.move(2, 2);
  });
  await shot("dock-focus", async () => {
    const ok2 = await tabTo(page, ".pq-dock a:not([aria-current])");
    if (!ok2) throw new Error("no dock focus");
    await wait(300); await clip(page, "dock-focus", page.locator(".pq-dock a:focus").first());
  });
  await shot("row-hover", async () => {
    const tbl = page.locator("table").first(); const row = tbl.locator("tbody tr").nth(2); await row.waitFor({ timeout: 5000 });
    await row.hover(); await wait(400); await clip(page, "row-hover", tbl); await page.mouse.move(2, 2);
  });
  await shot("invite-open", async () => {
    const tbl = page.locator("table").first();
    await page.locator("summary", { hasText: "Invite" }).first().click({ timeout: 5000 }); await wait(400);
    await page.mouse.move(2, 2); await clip(page, "invite-open", tbl);
  });
  await page.close();

  // 6-7: settings
  page = await open(null, t("/settings"));
  await shot("input-focus", async () => {
    const inp = page.getByLabel(/Team name/i).first(); await inp.click({ timeout: 5000 }); await wait(300);
    await clip(page, "input-focus", page.locator("form").filter({ has: inp }).first());
  });
  await page.close();
  page = await open(null, t("/settings"));
  await shot("select-focus", async () => {
    const sel = page.locator("select").filter({ has: page.locator("option", { hasText: /Eastern|Central|Pacific|Mountain|America/ }) }).first();
    await sel.waitFor({ timeout: 5000 });
    let hit = false; await page.mouse.move(2, 2);
    for (let i = 0; i < 40 && !hit; i++) { await page.keyboard.press("Tab"); await wait(80); hit = await sel.evaluate((e) => e === document.activeElement); }
    if (!hit) throw new Error("select never focused");
    await wait(300); await clip(page, "select-focus", page.locator("form").filter({ has: sel }).first());
  });
  await page.close();

  // 9: charts
  page = await open(null, t(`/roster/${C}/stats`));
  await shot("chart-tip", async () => {
    const ch = page.locator(".chart").first(); await ch.waitFor({ timeout: 5000 }); await ch.scrollIntoViewIfNeeded(); await wait(500);
    await ch.locator("circle.pt").first().hover({ timeout: 5000, force: true }); await wait(300);
    await clip(page, "chart-tip", ch, { top: 80 });
  });
  await shot("mix-tip", async () => {
    const mix = page.locator(".pq-mix").first(); await mix.waitFor({ timeout: 5000 }); await mix.scrollIntoViewIfNeeded(); await wait(400);
    const seg = mix.locator("> *, span, i, li, rect, div").first();
    await seg.hover({ timeout: 5000, force: true }); await wait(300);
    await clip(page, "mix-tip", mix, { top: 80 });
  });
  await page.close();

  // 10: disabled
  page = await open(null, t("/staff"));
  await shot("disabled", async () => {
    const d = page.locator("select:disabled, input:disabled, button:disabled").first(); await d.waitFor({ timeout: 5000 });
    const row = d.locator("xpath=ancestor::*[self::tr or self::li][1]");
    const target = (await row.count()) ? row : d;
    await target.scrollIntoViewIfNeeded(); await clip(page, "disabled", target);
  });
  await page.close();

  // 11: reduced motion
  for (const [name, url, main] of [["reduced-launcher", t(), ".pq-tile"], ["reduced-pitcher-stats", t(`/roster/${C}/stats`), ".chart"], ["reduced-wizard", t("/games/new"), "main.pq-main"]]) {
    await shot(name, async () => {
      const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, storageState: state, reducedMotion: "reduce" });
      try {
        const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
        await pg.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await pg.locator(main).first().waitFor({ state: "visible" });
        await pg.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
        await wait(150);
        await pg.screenshot({ path: path.join(OUT, name + ".png") });
        const n = await pg.evaluate(() => { let c = 0; const bad = []; document.querySelectorAll(".pq, .pq *").forEach((e) => { const s = getComputedStyle(e); const a = s.animationName !== "none"; const tr = s.transitionDuration.split(",").some((d) => d.trim() !== "0s"); if (a || tr) { c++; if (bad.length < 5) bad.push(e.tagName + "." + String(e.className).slice(0, 30)); } }); return { c, bad }; });
        console.log(`   ${name}: ${n.c} animated/transitioned elements ${n.bad.join(" | ")}`);
      } finally { await ctx.close(); }
    });
  }
  await browser.close();
  console.log(skipped.length ? "skipped: " + skipped.join(", ") : "skipped: none");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
