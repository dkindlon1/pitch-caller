/*
 * The portal's camera: signs in as each role and saves a PNG of every portal route (and its states) at four viewports.
 * Reads web/tests/screens/app_seed.json (written by web/tests/app_seed.js). Changes no data: the only submit is a deliberately
 * wrong sign-in; the Game Day wizard is driven by clicks and never saved.
 *   node web/tests/app_shots.js --url http://localhost:3111 --out <dir> [--only a,b] [--view laptop,ipad-l,ipad-p,phone] [--reduced] [--scale 1|2]
 * Writes <out>/<name>__<view>.png (full page) and <out>/<name>__<view>__fold.png (the viewport only).
 * Exits 1 if any shot failed: a redirect somewhere unexpected, a 404 that wasn't expected, or the Next.js error overlay.
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const flag = (k) => argv.includes("--" + k);
const BASE = String(arg("url", "http://localhost:3111")).replace(/\/$/, "");
const OUT = path.resolve(arg("out", "docs/app-v2-shots/portal"));
const ONLY = arg("only", "") ? arg("only").split(",").map((s) => s.trim()).filter(Boolean) : null;
const VIEWS = {
  laptop: { viewport: { width: 1440, height: 900 } },
  "ipad-l": { viewport: { width: 1180, height: 820 }, hasTouch: true },
  "ipad-p": { viewport: { width: 820, height: 1180 }, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, scale: 2 },
};
const WANT = arg("view", "laptop,ipad-l,ipad-p,phone").split(",").map((s) => s.trim()).filter(Boolean);
for (const v of WANT) if (!VIEWS[v]) { console.error("unknown view " + v); process.exit(2); }
const SCALE = arg("scale", null) ? +arg("scale") : null;
const REDUCED = flag("reduced");
const SEED_FILE = path.join(__dirname, "screens/app_seed.json");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) { console.error("refusing: --url must be on localhost or 127.0.0.1 (" + BASE + ")"); process.exit(2); }
if (!fs.existsSync(SEED_FILE)) { console.error("no " + SEED_FILE + ": run node web/tests/app_seed.js first"); process.exit(2); }
const SEED = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
const V = SEED.team.varsity, J = SEED.team.jv, C = SEED.claimedPitcher, PIT = SEED.pitchers, GM = SEED.games, OPP = SEED.opponents, UP = SEED.uploads;
const t = (p = "") => `/app/t/${V}${p}`, me = (p = "") => `/app/me/${V}/${C}${p}`;
const BAD_TOKEN = "0".repeat(64);

// ---------------------------------------------------------------- the wizard, driven by clicks (nothing is saved)
const form = (p) => p.getByRole("form", { name: "Set up a game" });
const wizard = (step, { error = false } = {}) => async (p) => {
  const f = form(p);
  await f.waitFor({ timeout: 30000 });
  await wait(600);   // hydrated
  if (step >= 1) {
    await f.getByLabel("Opponent").selectOption({ label: "Hillcrest Hawks" });
    await f.getByLabel("First pitch (optional)").fill("16:00");
    await f.getByRole("button", { name: "Home", exact: true }).click();
  }
  if (step >= 2) await f.getByRole("button", { name: /Next: Our staff/ }).click();
  if (step === 2 && error) { await f.getByRole("button", { name: "Next: Their lineup" }).click(); await wait(300); return; }
  if (step >= 2 && step <= 5) {
    // staff picked on step 2 for every later shot
    if (step >= 2 && !error) { await f.getByRole("button", { name: /^Ethan Brooks/ }).click(); await f.getByRole("button", { name: /^Tyler Nguyen/ }).click(); await f.getByRole("button", { name: /^Caleb Foster/ }).click();
      await f.getByRole("button", { name: /^Ethan Brooks/ }).click(); }   // a second tap makes him the starter
  }
  if (step >= 3) await f.getByRole("button", { name: "Next: Their lineup" }).click();
  if (step >= 3) await f.getByRole("button", { name: "Fill from their roster" }).click();
  if (step >= 4) await f.getByRole("button", { name: "Next: Charting" }).click();
  if (step >= 4) await f.getByRole("radio", { name: /Plus hitter reads/ }).click();
  if (step >= 5) await f.getByRole("button", { name: "Next: Review" }).click();
  await wait(500);
};

// ---------------------------------------------------------------- the shots
// role: who signs in. path: where. expect: the final pathname (default: the path's own). status404: this page is meant to be a not-found.
// only: the views it's taken at. fold: viewport only. act: what to do on the page before the picture.
const SHOTS = [
  { name: "login", role: "anon", path: "/login" },
  { name: "login-signup", role: "anon", path: "/login?mode=signup" },
  { name: "login-error", role: "anon", path: "/login", expectQuery: /error=bad_login/, act: async (p) => {
    const f = p.getByRole("form", { name: "Sign in" }); await f.waitFor(); await wait(600);
    await f.getByLabel("Email").fill("coach@test.local"); await f.getByLabel("Password").fill("not-the-password-1");
    await f.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/error=/, { timeout: 30000 }); } },
  { name: "login-reset", role: "anon", path: "/login/reset" },
  { name: "join", role: "anon", path: `/join/${SEED.joinToken}` },
  { name: "join-signed-in", role: "new", path: `/join/${SEED.joinToken}` },
  { name: "join-bad-token", role: "anon", path: `/join/${BAD_TOKEN}` },
  { name: "password", role: "coach", path: "/app/password" },
  { name: "team-picker", role: "coach", path: "/app" },
  { name: "team-picker-lapsed", role: "lapsed", path: "/app" },
  { name: "team-picker-empty", role: "new", path: "/app" },
  { name: "new-team", role: "new", path: "/app/new" },
  { name: "launcher-coach", role: "coach", path: t() },
  { name: "launcher-asst", role: "asst", path: t() },
  { name: "launcher-viewer", role: "viewer", path: t() },
  { name: "launcher-empty", role: "coach", path: `/app/t/${J}` },
  { name: "launcher-team-menu-open", role: "coach", path: t(), only: ["laptop"], act: async (p) => { await wait(500); await p.locator('summary[aria-label$="switch team"]').first().click(); await wait(400); } },
  { name: "launcher-account-menu-open", role: "coach", path: t(), only: ["laptop"], act: async (p) => { await wait(500); await p.locator('summary[aria-label="Your account"]').first().click(); await wait(400); } },
  { name: "launcher-focus", role: "coach", path: t(), foldOnly: true, act: async (p) => { await wait(500); for (let i = 0; i < 4; i++) { await p.keyboard.press("Tab"); await wait(120); } } },
  { name: "games", role: "coach", path: t("/games") },
  { name: "game-new-1", role: "coach", path: t("/games/new"), act: wizard(1) },
  { name: "game-new-2-error", role: "coach", path: t("/games/new"), act: wizard(2, { error: true }) },
  { name: "game-new-2", role: "coach", path: t("/games/new"), act: wizard(2) },
  { name: "game-new-3", role: "coach", path: t("/games/new"), act: wizard(3) },
  { name: "game-new-4", role: "coach", path: t("/games/new"), act: wizard(4) },
  { name: "game-review", role: "coach", path: t("/games/new"), act: wizard(5) },
  { name: "game-detail-upcoming", role: "coach", path: t(`/games/${GM.upcomingToday}`) },
  { name: "game-detail-noplan", role: "coach", path: t(`/games/${GM.upcomingNoPlan}`) },
  { name: "game-detail-viewer", role: "viewer", path: t(`/games/${GM.upcomingToday}`) },
  { name: "game-detail-finished", role: "coach", path: t(`/games/${GM.finished[2]}`) },
  { name: "game-edit", role: "coach", path: t(`/games/${GM.upcomingToday}/edit`) },
  { name: "roster", role: "coach", path: t("/roster") },
  { name: "roster-viewer", role: "viewer", path: t("/roster") },
  { name: "roster-invite-open", role: "coach", path: t("/roster"), act: async (p) => { await wait(500); await p.locator("summary", { hasText: "Invite" }).first().click(); await wait(300); } },
  { name: "pitcher", role: "coach", path: t(`/roster/${C}`) },
  { name: "pitcher-two-pitches", role: "coach", path: t(`/roster/${PIT.reyes}`) },
  { name: "pitcher-stats", role: "coach", path: t(`/roster/${C}/stats`) },
  { name: "pitcher-stats-sparse", role: "coach", path: t(`/roster/${PIT.nguyen}/stats`) },
  { name: "pitcher-uploads", role: "coach", path: t(`/roster/${C}/uploads`) },
  { name: "pitcher-upload-detail", role: "coach", path: t(`/roster/${C}/uploads/${UP.waitingForCoach}`) },
  { name: "opponents", role: "coach", path: t("/opponents") },
  { name: "opponent-detail", role: "coach", path: t(`/opponents/${OPP.hillcrest}`) },
  { name: "opponent-empty", role: "coach", path: t(`/opponents/${OPP.emptyStonebridge}`) },
  { name: "staff", role: "coach", path: t("/staff") },
  { name: "settings", role: "coach", path: t("/settings") },
  { name: "settings-viewer", role: "viewer", path: t("/settings") },
  { name: "billing", role: "coach", path: `/app/billing?org=${SEED.org.ridgeview}` },
  { name: "billing-lapsed", role: "lapsed", path: `/app/billing?org=${SEED.org.lakeside}` },
  { name: "exports", role: "coach", path: "/app/exports" },
  { name: "me-picker", role: "player", path: `/app/me/${V}`, expect: new RegExp(`^/app/me/${V}/${C}$`) },
  { name: "me-home", role: "player", path: me() },
  { name: "me-arsenal", role: "player", path: me("/arsenal") },
  { name: "me-uploads", role: "player", path: me("/uploads") },
  { name: "me-upload-detail", role: "player", path: me(`/uploads/${UP.waitingForCoach}`) },
  { name: "me-stats", role: "player", path: me("/stats") },
  { name: "me-learned", role: "player", path: me("/learned") },
  { name: "me-profile", role: "player", path: me("/profile") },
  { name: "not-found", role: "anon", path: "/nope", status404: true },
  { name: "not-found-app", role: "coach", path: "/app/nope", status404: true },
  { name: "admin", role: "admin", path: "/admin" },
  { name: "admin-org", role: "admin", path: `/admin/org/${SEED.org.ridgeview}` },
  { name: "admin-audit", role: "admin", path: "/admin/audit" },
];

// ---------------------------------------------------------------- the run
const consoleAll = new Map();   // message -> { n, shots: Set }

// --axe: run axe-core on every page or state before its screenshot; a serious or critical finding fails the run
const AXE_ON = process.argv.includes("--axe");
const AXE_SRC = AXE_ON ? require("fs").readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname, require("path").join(__dirname, ".."), require("path").join(__dirname, "../..")] }), "utf8") : "";
const axeHits = [];
async function axeCheck(page, label) {
  if (!AXE_ON) return;
  await page.evaluate(AXE_SRC);
  const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations"] }));
  for (const v of r.violations) if (v.impact === "serious" || v.impact === "critical") axeHits.push({ label, id: v.id, impact: v.impact, n: v.nodes.length, target: String(v.nodes[0].target), html: v.nodes[0].html.slice(0, 160), why: (v.nodes[0].any[0] || {}).message || "" });
}
function axeReport() {
  if (!AXE_ON) return 0;
  const by = new Map(); for (const h of axeHits) { const k = h.id + " | " + h.target; const e = by.get(k) || { ...h, labels: [] }; e.labels.push(h.label); by.set(k, e); }
  console.log(`axe: ${axeHits.length} serious or critical findings in ${by.size} groups`);
  for (const e of by.values()) console.log(`  ${e.impact} ${e.id} x${e.labels.length} [${e.labels.slice(0, 3).join(", ")}] ${e.target} :: ${e.why} :: ${e.html}`);
  return axeHits.length;
}
(async () => {
  const list = ONLY ? SHOTS.filter((s) => ONLY.includes(s.name)) : SHOTS;
  if (ONLY) { const miss = ONLY.filter((n) => !SHOTS.some((s) => s.name === n)); if (miss.length) { console.error("unknown shot(s): " + miss.join(", ")); process.exit(2); } }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const states = {};   // role -> storage state, signed in once per run
  const stateFor = async (role) => {
    if (role === "anon") return undefined;
    if (states[role]) return states[role];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(60000);
    await p.goto(BASE + "/login?next=/app", { waitUntil: "load", timeout: 60000 });
    await p.waitForLoadState("networkidle").catch(() => {}); await wait(800);
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(SEED.users[role].email); await f.getByLabel("Password").fill(SEED.pass);
    await f.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => u.pathname === "/app", { timeout: 60000 });
    await p.waitForLoadState("networkidle").catch(() => {});
    states[role] = await ctx.storageState(); await ctx.close();
    return states[role];
  };

  const overlay = (p) => p.evaluate(() => {
    const n = document.querySelector("nextjs-portal"), r = n && n.shadowRoot;
    const dlg = !!(r && r.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-overlay], [data-nextjs-dialog-body], [data-nextjs-error-overlay]"));
    const body = document.body ? document.body.innerText : "";
    return { dlg, crash: /Application error: a (server|client)-side exception|Internal Server Error|Unhandled Runtime Error/i.test(body), notFound: /could not be found|\b404\b/i.test(body) };
  });

  async function take(s, view) {
    const V0 = VIEWS[view], scale = SCALE || V0.scale || 1;
    const ctx = await browser.newContext({ viewport: V0.viewport, hasTouch: !!V0.hasTouch, isMobile: !!V0.isMobile, deviceScaleFactor: scale, reducedMotion: REDUCED ? "reduce" : "no-preference",
      storageState: await stateFor(s.role) });
    const errs = [];
    try {
      const p = await ctx.newPage(); p.setDefaultTimeout(60000);
      p.on("pageerror", (e) => errs.push("pageerror: " + String(e.message || e).split("\n")[0]));
      p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().split("\n")[0].slice(0, 220)); });
      const res = await p.goto(BASE + s.path, { waitUntil: "load", timeout: 60000 });
      await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await p.evaluate(() => document.fonts.ready);
      if (s.act) await s.act(p);
      await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await p.evaluate(() => document.fonts.ready);
      await wait(900);
      // did it land where it should, and is it the page it should be
      const u = new URL(p.url()), want = new URL(BASE + s.path);
      if (s.expect) { if (!s.expect.test(u.pathname)) throw new Error(`redirected to ${u.pathname}${u.search}, expected ${s.expect}`); }
      else if (u.pathname !== want.pathname) throw new Error(`redirected to ${u.pathname}${u.search}, expected ${want.pathname}`);
      if (s.expectQuery && !s.expectQuery.test(u.search)) throw new Error(`url is ${u.pathname}${u.search}, expected a query like ${s.expectQuery}`);
      const o = await overlay(p), status = res ? res.status() : 0;
      if (o.dlg) throw new Error("the Next.js error overlay is showing");
      if (o.crash || status >= 500) throw new Error(`the page crashed (HTTP ${status})`);
      if (s.status404) { if (status !== 404 && !o.notFound) throw new Error(`expected a not-found page, got HTTP ${status}`); }
      else if (status === 404 || o.notFound) throw new Error(`unexpected not-found page (HTTP ${status})`);
      await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});   // the dev-server badge isn't part of the design
      await p.mouse.move(0, 0).catch(() => {});
      await axeCheck(p, `${s.name}__${view}`);
      const base = path.join(OUT, `${s.name}__${view}`);
      if (!s.foldOnly) await p.screenshot({ path: base + ".png", fullPage: true });
      await p.screenshot({ path: base + "__fold.png", fullPage: false });
      return { errs };
    } finally { await ctx.close(); }
  }

  let written = 0; const failed = [];
  for (const s of list) {
    for (const view of (s.only ? WANT.filter((v) => s.only.includes(v)) : WANT)) {
      const label = `${s.name}__${view}`; let r = null, err = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) {
        try { r = await take(s, view); err = null; } catch (e) { err = e; if (!/Timeout/i.test(String(e.message))) break; }
      }
      if (r) {
        written++;
        for (const m of r.errs) { const e = consoleAll.get(m) || { n: 0, shots: new Set() }; e.n++; e.shots.add(label); consoleAll.set(m, e); }
        console.log(`  ok   ${label}${r.errs.length ? `  (${r.errs.length} console/page error${r.errs.length > 1 ? "s" : ""})` : ""}`);
      } else {
        failed.push(label);
        console.log(`  FAIL ${label}  ${String(err && err.message || err).split("\n")[0]}`);
      }
    }
  }
  await browser.close();
  if (consoleAll.size) {
    console.log("console and page errors (grouped):");
    for (const [m, e] of [...consoleAll].sort((a, b) => b[1].n - a[1].n)) console.log(`  x${e.n}  ${m}  [${[...e.shots].slice(0, 3).join(", ")}${e.shots.size > 3 ? ", ..." : ""}]`);
    fs.writeFileSync(path.join(OUT, "_console_errors.json"), JSON.stringify([...consoleAll].map(([m, e]) => ({ message: m, count: e.n, shots: [...e.shots] })), null, 2));
  }
  console.log(`shots: ${written} written, ${failed.length} failed: ${failed.join(", ") || "none"}`);
  const ax = axeReport();
  process.exit(failed.length || ax ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
