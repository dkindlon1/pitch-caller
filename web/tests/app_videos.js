/*
 * The app on film: records three videos of the PitchIQ portal and game app being used, converts them to mp4, extracts
 * frames and builds contact sheets. Recording only: it reads the seed file, signs in as the seeded coach and player, and
 * changes no data except what the game app's own flow saves (a game is played and ended). The Game Day wizard is never saved.
 *   node web/tests/app_videos.js --url http://localhost:3111 --out docs/app-v2-shots/final [--only game,coach,player] [--reduced]
 * Writes <out>/<name>.mp4, <out>/frames/<name>/f_%04d.jpg (12 fps, 590 px wide) and <out>/frames/<name>__sheet_<n>.jpg.
 * Needs ffmpeg and python with Pillow on PATH, and web/public/app/game generated (node web/scripts/game-shell.mjs).
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const BASE = String(arg("url", "http://localhost:3111")).replace(/\/$/, "");
const OUT = path.resolve(arg("out", "docs/app-v2-shots/final"));
const ONLY = String(arg("only", "game,coach,player")).split(",").map((s) => s.trim()).filter(Boolean);
const REDUCED = argv.includes("--reduced");
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "screens/app_seed.json"), "utf8"));
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) { console.error("refusing: --url must be on localhost (" + BASE + ")"); process.exit(2); }
const V = SEED.team.varsity, C = SEED.claimedPitcher, UP = SEED.uploads, OPP = SEED.opponents, GM = SEED.games;
const t = (p = "") => `/app/t/${V}${p}`, me = (p = "") => `/app/me/${V}/${C}${p}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const beat = () => sleep(300 + Math.floor(Math.random() * 300));   // a human pause between actions
const settle = () => sleep(900);                                   // after each navigation

// ---------------------------------------------------------------- stand-in Bluetooth (as app/shots_v2.js)
const WATCH_APP = fs.readFileSync(path.join(__dirname, "../../watch/bangle/pitchiq.app.js"), "utf8");
const PCW = require("../../app/watch.js");
const FAKE_BT = `
(function () {
  ${WATCH_APP}
  const SVC = ${JSON.stringify(PCW.SVC)}, RX = ${JSON.stringify(PCW.RX)}, TX = ${JSON.stringify(PCW.TX)};
  const enc = new TextEncoder(), dec = new TextDecoder();
  window.__watches = [];
  function makeWatch(name) {
    const w = { name, writes: [], buzzes: [], overlaps: 0, connected: false, notifying: false, view: null, mute: false };
    let busy = false, listener = null; const disc = [];
    w.core = PQCore({ draw: (v) => { w.view = v; }, buzz: (k) => w.buzzes.push(k), light: () => {}, now: () => Date.now(), secure: () => w.connected,   // Build 4: the stand-in link counts as passkey-bonded
      notify: (t) => { if (w.mute) return; if (w.connected && w.notifying && listener) setTimeout(() => listener({ target: { value: new DataView(enc.encode(t).buffer) } }), 10); } });
    const op = (fn) => { if (busy) { w.overlaps++; return Promise.reject(new Error("GATT operation already in progress.")); } busy = true;
      return new Promise((res, rej) => setTimeout(() => { busy = false; if (!w.connected) return rej(new Error("disconnected")); fn(); res(); }, 15)); };
    // Build 4: writes are binary (the game key, sealed frames); the watch app gets one character per byte, as from E.toString
    const rx = { writeValueWithResponse: (b) => op(() => { const t = String.fromCharCode.apply(null, new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset || 0, (b.byteOffset || 0) + b.byteLength) : b)); w.writes.push(t); w.core.onWrite(t); }) };
    const tx = { addEventListener: (e, f) => { listener = f; }, startNotifications: () => op(() => { w.notifying = true; }), stopNotifications: () => op(() => { w.notifying = false; }) };
    const svc = { getCharacteristic: async (u) => (u === RX ? rx : tx) };
    w.device = { id: "id-" + name, name, addEventListener: (e, f) => { if (e === "gattserverdisconnected") disc.push(f); },
      gatt: { connect: () => new Promise((r) => setTimeout(() => { w.connected = true; w.core.onConnect(); r({ getPrimaryService: async (u) => { if (u !== SVC) throw new Error("no"); return svc; } }); }, 20)),
        disconnect: () => { w.connected = false; w.core.onDisconnect(); disc.forEach((f) => f()); } } };
    return w;
  }
  let n = 0;
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: async (o) => {
    if (!o.optionalServices.includes(SVC)) throw new Error("service not requested");
    const w = makeWatch("Bangle.js " + ["a1b2", "c3d4"][n++]); window.__watches.push(w); return w.device; } } });
})();`;

// ---------------------------------------------------------------- shared helpers
const skipped = [];   // steps that could not be done
const NOTES = [];
async function step(label, fn) { try { await fn(); } catch (e) { skipped.push(`${label}: ${String(e.message || e).split("\n")[0].slice(0, 140)}`); console.log("  SKIP " + label + " :: " + String(e.message || e).split("\n")[0].slice(0, 140)); } }
async function signIn(page, who) {
  await page.goto(BASE + "/login?next=/app", { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {}); await settle();
  const f = page.getByRole("form", { name: "Sign in" });
  await f.getByLabel("Email").click(); await f.getByLabel("Email").pressSequentially(SEED.users[who].email, { delay: 35 }); await beat();
  await f.getByLabel("Password").click(); await f.getByLabel("Password").pressSequentially(SEED.pass, { delay: 35 }); await beat();
  await f.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {}); await settle();
}
async function go(page, p) { await page.goto(BASE + p, { waitUntil: "load" }); await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); await settle(); }
// click a link by its text, or fall back to going straight to the route
async function nav(page, loc, fallback, label) {
  try { await loc.first().scrollIntoViewIfNeeded({ timeout: 4000 }); await loc.first().hover({ timeout: 4000 }); await sleep(250); await loc.first().click({ timeout: 6000 });
    await page.waitForLoadState("load").catch(() => {}); await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); await settle(); }
  catch (e) { NOTES.push(`${label}: link not clicked, went to ${fallback} directly`); await go(page, fallback); }
}
async function hoverFirst(page, sel) { const l = page.locator(sel).first(); if (await l.count()) { await l.scrollIntoViewIfNeeded().catch(() => {}); await l.hover({ timeout: 4000 }).catch(() => {}); await sleep(700); } }
async function slowScroll(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const steps = Math.max(6, Math.min(30, Math.ceil(h / 120)));
  for (let i = 1; i <= steps; i++) { await page.evaluate((y) => window.scrollTo({ top: y }), Math.round((h * i) / steps)); await sleep(160); }
  await sleep(500);
  for (let i = steps - 1; i >= 0; i--) { await page.evaluate((y) => window.scrollTo({ top: y }), Math.round((h * i) / steps)); await sleep(120); }
  await sleep(400);
}
function hook(page, errs) {
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message || e).split("\n")[0].slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().split("\n")[0].slice(0, 200)); });
}

// ---------------------------------------------------------------- 1. game-flow
let GAME_PATH = "";
async function gameFlow(page, errs) {
  const FALLBACK = "/app/game/?watch=1";
  await signIn(page, "coach");
  let handedOff = false;
  try {
    await go(page, t("/games"));
    await beat();
    await page.locator("main").getByText("Game Day", { exact: false }).first().hover().catch(() => {});
    // the Game Day tile on the launcher is how a coach gets here; show it first
    await go(page, t()); await hoverFirst(page, 'ul[aria-label="Screens you can open"] a');
    await nav(page, page.getByRole("link", { name: /Game Day/ }), t("/games"), "Game Day tile"); await beat();
    // today's planned game: the one vs Hillcrest Hawks
    await nav(page, page.getByRole("link", { name: /Hillcrest Hawks/ }).first(), t(`/games/${GM.upcomingToday}`), "today's game");
    await beat();
    // carry watch=1 on the hand-off: rewrite only the query of the redirect (the one-time sign-in fragment is kept as is)
    await page.route(/\/games\/[^/]+\/open(\?|$)/, async (route) => {
      const r = await route.fetch({ maxRedirects: 0 });
      const h = { ...r.headers() }; const loc = h["location"] || "";
      if (loc && /\/app\/game\/\?/.test(loc)) h["location"] = loc.replace("/app/game/?", "/app/game/?watch=1&");
      await route.fulfill({ status: r.status(), headers: h, body: await r.body() });
    });
    const start = page.getByRole("link", { name: "Start on this device" });
    await start.first().hover(); await sleep(500);
    await start.first().click();
    await page.waitForURL(/\/app\/game\/|[?&]error=/, { timeout: 15000 });
    if (/[?&]error=/.test(page.url())) { await sleep(1500); throw new Error("the hand-off route refused: " + new URL(page.url()).search); }
    handedOff = true; GAME_PATH = "hand-off from the Game Day plan page (Start on this device) -> /app/game/";
  } catch (e) {
    NOTES.push("hand-off failed (" + String(e.message || e).split("\n")[0].slice(0, 120) + "): fell back to " + FALLBACK);
    await page.unroute(/\/games\/[^/]+\/open(\?|$)/).catch(() => {});
    GAME_PATH = "FALLBACK: opened " + FALLBACK + " directly";
    await page.goto(BASE + FALLBACK, { waitUntil: "load" });
  }
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 45000 });
  await sleep(1500);
  if (handedOff) {
    // let the hand-off settle (the game record is pulled and the game starts)
    for (let i = 0; i < 40; i++) { const ok = await page.evaluate(() => { try { return !!(G() && G().call); } catch (e) { return false; } }).catch(() => false); if (ok) break; await sleep(500); }
    const u = new URL(page.url());
    if (u.searchParams.get("watch") === "1") GAME_PATH += " (watch=1 carried on the hand-off URL by rewriting the redirect's query in the browser)";
    else { u.searchParams.set("watch", "1"); NOTES.push("hand-off URL could not carry watch=1; navigated once to " + u.pathname + u.search);
      GAME_PATH += " (then one navigation to the same URL with watch=1 added)"; await page.goto(u.toString(), { waitUntil: "load" });
      await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 45000 }); await sleep(1500); }
  }
  const tab = async (name) => { await page.locator(".tabs button", { hasText: name }).click(); await beat(); };
  await step("connect two fake watches in Setup", async () => {
    await tab("Setup");
    await page.getByRole("button", { name: "Connect a watch" }).click(); await sleep(900);
    await page.getByRole("button", { name: "Connect a second watch" }).click(); await sleep(900);
    const got = await page.evaluate(() => (window.__watches || []).filter((w) => w.connected).length);
    if (got !== 2) throw new Error("only " + got + " fake watches connected");
    await sleep(600);
  });
  await tab("Game"); await sleep(800);

  const logResult = async (k) => {
    if (k === "x") {   // in play -> out
      await page.locator(".key", { hasText: "In play" }).click(); await beat();
      await page.locator(".detail .seg button", { hasText: /^Out$/ }).first().click(); await beat();
      await page.locator(".detail .seg button", { hasText: "Solid" }).first().click().catch(() => {}); await beat();
      await page.getByRole("button", { name: "Log pitch" }).click(); await beat();
      return;
    }
    await page.keyboard.press(k); await beat();
    const b = page.getByRole("button", { name: "Log pitch" });
    if (await b.count()) { await b.first().click(); await beat(); }   // a foul asks for a follow-up tap first
  };
  const seq = ["b", "c", "f", "x", "b", "c", "f", "b", "c", "x"];   // ball, called strike, foul, in play (out), ...
  for (let i = 0; i < 10; i++) {
    await step("pitch " + (i + 1), async () => {
      if (await page.evaluate(() => !!G().inningOver)) { await page.getByRole("button", { name: /^Take the field/ }).click(); await beat(); }
      if (i === 2) { await sleep(700); await page.keyboard.press("k"); await sleep(900); }   // shake-off before accepting
      if (i === 5) {   // bring in the next pitcher
        const before = await page.evaluate(() => pitcherDef().name);
        await page.locator("header ~ main .head").getByRole("button", { name: /^Bring in / }).first().click(); await sleep(1200);
        const after = await page.evaluate(() => pitcherDef().name);
        if (before === after) throw new Error("pitcher did not change");
      }
      await sleep(800);   // a call acts only after it has been on screen 0.6 s
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await page.waitForFunction(() => /On both watches/.test((document.getElementById("watch-pill") || {}).textContent || ""), null, { timeout: 8000 });
      await sleep(900);
      await logResult(seq[i]);
    });
  }
  await sleep(800);
  await step("end the game", async () => {
    const b = page.getByRole("button", { name: "End game", exact: true });
    await b.scrollIntoViewIfNeeded().catch(() => {});
    await b.click(); await sleep(700); await b.click();
    await page.waitForFunction(() => G().log.length === 0, null, { timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1800);
  });
}

// ---------------------------------------------------------------- 2. coach-portal
async function coachPortal(page) {
  await signIn(page, "coach");
  await go(page, t()); await sleep(600);
  await hoverFirst(page, 'ul[aria-label="Screens you can open"] a, main a[class*="tile"]'); await beat();
  await step("team menu", async () => { const s = page.locator('summary[aria-label$="switch team"]').first(); await s.hover(); await beat(); await s.click(); await sleep(1100); await s.click(); await beat(); });
  await step("account menu", async () => { const s = page.locator('summary[aria-label="Your account"]').first(); await s.hover(); await beat(); await s.click(); await sleep(1100); await s.click(); await beat(); });
  await nav(page, page.getByRole("link", { name: /^Roster/ }), t("/roster"), "Roster"); await hoverFirst(page, "main tbody tr, main .roster-row, main li a"); await beat();
  await nav(page, page.getByRole("link", { name: /Ethan Brooks/ }), t(`/roster/${C}`), "Ethan Brooks"); await beat();
  await nav(page, page.getByRole("link", { name: /^Stats/ }), t(`/roster/${C}/stats`), "pitcher Stats");
  await slowScroll(page);
  await nav(page, page.getByRole("link", { name: /^Uploads/ }), t(`/roster/${C}/uploads`), "pitcher Uploads"); await beat();
  await go(page, t()); await beat();
  await nav(page, page.getByRole("link", { name: /^Opponents/ }), t("/opponents"), "Opponents"); await hoverFirst(page, "main tbody tr, main li a"); await beat();
  await nav(page, page.getByRole("link", { name: /Hillcrest/ }), t(`/opponents/${OPP.hillcrest}`), "an opponent"); await sleep(900);
  await nav(page, page.getByRole("link", { name: /^Game Day/ }), t("/games"), "Game Day"); await beat();
  await nav(page, page.getByRole("link", { name: "Set up a game" }), t("/games/new"), "Set up a game");
  await step("wizard", async () => {
    const f = page.getByRole("form", { name: "Set up a game" }); await f.waitFor({ timeout: 30000 }); await sleep(700);
    await f.getByLabel("Opponent").selectOption({ label: "Hillcrest Hawks" }); await beat();
    await f.getByLabel("First pitch (optional)").fill("16:00"); await beat();
    await f.getByRole("button", { name: "Home", exact: true }).click(); await beat();
    await f.getByRole("button", { name: /Next: Our staff/ }).click(); await sleep(900);
    for (const n of [/^Ethan Brooks/, /^Tyler Nguyen/, /^Caleb Foster/, /^Ethan Brooks/]) { await f.getByRole("button", { name: n }).click(); await beat(); }
    await f.getByRole("button", { name: "Next: Their lineup" }).click(); await sleep(900);
    await f.getByRole("button", { name: "Fill from their roster" }).click(); await sleep(900);
    await f.getByRole("button", { name: "Next: Charting" }).click(); await sleep(900);
    await f.getByRole("radio", { name: /Plus hitter reads/ }).click(); await beat();
    await f.getByRole("button", { name: "Next: Review" }).click(); await sleep(1500);
    const cancel = page.getByRole("link", { name: "Cancel" }).or(page.getByRole("button", { name: "Cancel" }));
    await cancel.first().hover(); await sleep(500); await cancel.first().click(); await page.waitForLoadState("networkidle").catch(() => {}); await settle();
  });
  await nav(page, page.getByRole("link", { name: /^Staff/ }), t("/staff"), "Staff"); await beat();
  await go(page, t()); await beat();
  await nav(page, page.getByRole("link", { name: /^Settings/ }), t("/settings"), "Settings"); await beat();
  await go(page, t()); await beat();
  await nav(page, page.getByRole("link", { name: /^Billing/ }), `/app/billing?org=${SEED.org.ridgeview}`, "Billing"); await sleep(900);
  await nav(page, page.getByRole("link", { name: /Back|Launcher|Home|Ridgeview|Varsity/ }), t(), "back to the launcher");
  if (!new URL(page.url()).pathname.startsWith(t())) await go(page, t());
  await hoverFirst(page, 'ul[aria-label="Screens you can open"] a'); await sleep(900);
}

// ---------------------------------------------------------------- 3. player-portal
async function playerPortal(page) {
  await signIn(page, "player");
  await go(page, me()); await beat();
  await nav(page, page.getByRole("link", { name: /Arsenal/ }), me("/arsenal"), "Arsenal"); await beat();
  await nav(page, page.getByRole("link", { name: /Uploads/ }), me("/uploads"), "Uploads"); await beat();
  await nav(page, page.locator(`a[href*="/uploads/"]`), me(`/uploads/${UP.waitingForCoach}`), "an upload"); await sleep(900);
  await go(page, me("/stats")); await slowScroll(page);
  await nav(page, page.getByRole("link", { name: /What it learned|learned/i }), me("/learned"), "What it learned"); await beat();
  await nav(page, page.getByRole("link", { name: /Profile/ }), me("/profile"), "Profile"); await beat();
  await nav(page, page.getByRole("link", { name: /^Home$|^Today$|^Me$/ }), me(), "home");
  if (new URL(page.url()).pathname !== me()) await go(page, me());
  await sleep(900);
}

// ---------------------------------------------------------------- frames and sheets
const SHEET_PY = `
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
d, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(glob.glob(os.path.join(d, "f_*.jpg")))
COLS, ROWS, MAXS, TW = 8, 6, 8, 295
per = COLS * ROWS
if len(files) > per * MAXS:
    n = per * MAXS
    idx = sorted(set(round(i * (len(files) - 1) / (n - 1)) for i in range(n)))
else:
    idx = list(range(len(files)))
try: font = ImageFont.load_default(size=18)
except TypeError: font = ImageFont.load_default()
sheets = 0
for s in range(0, len(idx), per):
    chunk = idx[s:s + per]
    ims = []
    for i in chunk:
        im = Image.open(files[i]).convert("RGB"); h = round(im.height * TW / im.width); ims.append((i, im.resize((TW, h))))
    th = max(im.height for _, im in ims)
    sheet = Image.new("RGB", (COLS * TW, ROWS * th), (16, 16, 16))
    dr = ImageDraw.Draw(sheet)
    for k, (i, im) in enumerate(ims):
        x, y = (k % COLS) * TW, (k // COLS) * th
        sheet.paste(im, (x, y)); label = str(i + 1)
        dr.rectangle([x, y, x + 12 + 11 * len(label), y + 26], fill=(0, 0, 0)); dr.text((x + 6, y + 3), label, fill=(255, 255, 0), font=font)
    sheets += 1
    sheet.save(os.path.join(out, "%s__sheet_%d.jpg" % (name, sheets)), quality=85)
print(sheets)
`;
function run(cmd, args, opts = {}) { const r = spawnSync(cmd, args, { encoding: "utf8", ...opts }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-300)}`); return r.stdout; }
function durationOf(mp4) { try { return parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).trim()); } catch { return NaN; } }

// ---------------------------------------------------------------- the run
const JOBS = [
  { key: "game", name: "game-flow", ctx: { viewport: { width: 1180, height: 820 }, hasTouch: true }, fake: true, run: gameFlow },
  { key: "coach", name: "coach-portal", ctx: { viewport: { width: 1440, height: 900 } }, run: coachPortal },
  { key: "player", name: "player-portal", ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, run: playerPortal },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const summary = [], errsAll = new Map(), sheetsAll = [];
  for (const job of JOBS) {
    if (!ONLY.includes(job.key)) continue;
    console.log("recording " + job.name);
    const tmp = path.join(OUT, "_rec_" + job.name); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const ctx = await browser.newContext({ ...job.ctx, reducedMotion: REDUCED ? "reduce" : "no-preference", recordVideo: { dir: tmp, size: job.ctx.viewport } });
    if (job.fake) await ctx.addInitScript(FAKE_BT);
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    const errs = []; hook(page, errs);
    let ok = true;
    try { await job.run(page, errs); await sleep(1200); } catch (e) { ok = false; skipped.push(`${job.name} aborted: ${String(e.message || e).split("\n")[0].slice(0, 160)}`); console.log("  ABORT " + job.name + " :: " + String(e.message || e).split("\n")[0]); }
    const vid = page.video(); await ctx.close();
    const webm = await vid.path();
    const mp4 = path.join(OUT, job.name + ".mp4");
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    fs.rmSync(tmp, { recursive: true, force: true });
    const fdir = path.join(OUT, "frames", job.name); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=12,scale=590:-2", "-q:v", "4", path.join(fdir, "f_%04d.jpg")]);
    const nFrames = fs.readdirSync(fdir).length;
    const ns = run("python", ["-I", "-c", SHEET_PY, fdir, job.name, path.join(OUT, "frames")]).trim();
    for (let i = 1; i <= +ns; i++) sheetsAll.push(`${job.name}__sheet_${i}.jpg`);
    for (const m of errs) errsAll.set(m, (errsAll.get(m) || 0) + 1);
    summary.push(`${job.name}: ${ok ? "recorded" : "ABORTED"}, ${durationOf(mp4).toFixed(1)} s, ${(fs.statSync(mp4).size / 1024).toFixed(0)} KB, ${nFrames} frames, ${ns} sheets`);
  }
  await browser.close();
  console.log("---");
  summary.forEach((s) => console.log(s));
  if (GAME_PATH) console.log("game path: " + GAME_PATH);
  NOTES.forEach((n) => console.log("note: " + n));
  skipped.forEach((s) => console.log("skipped: " + s));
  console.log("console and page errors (grouped):"); for (const [m, n] of errsAll) console.log(`  x${n} ${m}`);
  console.log("sheets: " + sheetsAll.join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
