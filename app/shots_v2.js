/*
 * Screenshot harness for the PitchIQ game app (one static page, app/dist/pitch-caller.html).
 * Drives the real app into a fixed list of named states (clicks, keys, the stand-in Bluetooth of watch_e2e.js) and
 * saves PNGs. It never edits the DOM or the app: nothing under app/ is touched.
 *
 *   node app/shots_v2.js --out <dir> [--only <state,state>] [--theme night|day|both] [--view <name,name>] [--scale 1|2] [--reduced]
 *
 * Output: <out>/<state>__<theme>__<view>.png (viewport) and, for data, roster, setup and watches-card, also
 * <state>__<theme>__<view>__full.png (full page). Each (state, view) gets a fresh browser context; the two themes are
 * shot from the same context by pressing the app's own Night / Day button (and waiting 400 ms again).
 * Exit code 1 if any state failed.
 *
 * Not implemented (need a running Supabase): offline-syncing (roster.js prepNotice "This iPad isn't ready for offline
 * today" and SYNC.error "No signal: everything stays on this iPad", roster.js:1122 and :1198) and second-device-refused
 * (sync.js "other-user" refusal, sync.js:20, shown through SYNC.error in roster.js syncPanel:1436).
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const WATCH_APP = fs.readFileSync(path.join(__dirname, "../watch/bangle/pitchiq.app.js"), "utf8");
const PCW = require("./watch.js");

const VIEWS = {
  laptop: { viewport: { width: 1440, height: 900 } },
  "ipad-l": { viewport: { width: 1180, height: 820 }, hasTouch: true },
  "ipad-l-safari": { viewport: { width: 1180, height: 740 }, hasTouch: true },   // Safari's own bars leave about 740 px
  "ipad-p": { viewport: { width: 820, height: 1180 }, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
const FULL = new Set(["data", "roster", "setup", "watches-card"]);
const STATES = ["waiting", "call", "call-options", "accept-ready", "accepted-both", "accepted-one", "not-on-watch", "shake-off",
  "coach-call", "get-it-over", "ibb", "between-innings", "pitching-change-open", "pitching-change-done", "end-game", "data",
  "roster", "setup", "watches-card", "no-bluetooth"];
const ALIAS = { "pitching-change": ["pitching-change-open", "pitching-change-done"] };

// ---------------------------------------------------------------- CLI
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
const OUT = opt("out");
const MAIN = require.main === module;
if (MAIN && !OUT) { console.error("usage: node app/shots_v2.js --out <dir> [--only a,b] [--theme night|day|both] [--view a,b] [--scale 1|2] [--reduced]"); process.exit(2); }
const only = opt("only") ? opt("only").split(",").flatMap((s) => ALIAS[s.trim()] || [s.trim()]) : STATES;
const themeArg = opt("theme") || "both";
const THEMES = themeArg === "both" ? ["night", "day"] : [themeArg];
const viewNames = opt("view") ? opt("view").split(",").map((s) => s.trim()) : Object.keys(VIEWS);
const SCALE = +(opt("scale") || 1);
const REDUCED = args.includes("--reduced");
for (const s of only) if (!STATES.includes(s)) { console.error("unknown state: " + s + " (known: " + STATES.join(", ") + ")"); process.exit(2); }
for (const v of viewNames) if (!VIEWS[v]) { console.error("unknown view: " + v); process.exit(2); }
if (!THEMES.every((t) => t === "night" || t === "day")) { console.error("bad --theme"); process.exit(2); }
if (MAIN) fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- server and stand-in Bluetooth (as watch_e2e.js)
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] !== "/") { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

// two fake watches running the real watch core; a watch with .mute set never sends a receipt back
const FAKE_BT = `
(function () {
  ${WATCH_APP}
  const SVC = ${JSON.stringify(PCW.SVC)}, RX = ${JSON.stringify(PCW.RX)}, TX = ${JSON.stringify(PCW.TX)};
  const enc = new TextEncoder(), dec = new TextDecoder();
  window.__watches = [];
  function makeWatch(name) {
    const w = { name, writes: [], buzzes: [], overlaps: 0, connected: false, notifying: false, view: null, mute: false };
    let busy = false, listener = null; const disc = [];
    w.core = PQCore({ draw: (v) => { w.view = v; }, buzz: (k) => w.buzzes.push(k), light: () => {}, now: () => Date.now(),
      notify: (t) => { if (w.mute) return; if (w.connected && w.notifying && listener) setTimeout(() => listener({ target: { value: new DataView(enc.encode(t).buffer) } }), 10); } });
    const op = (fn) => { if (busy) { w.overlaps++; return Promise.reject(new Error("GATT operation already in progress.")); } busy = true;
      return new Promise((res, rej) => setTimeout(() => { busy = false; if (!w.connected) return rej(new Error("disconnected")); fn(); res(); }, 15)); };
    const rx = { writeValueWithResponse: (b) => op(() => { const t = dec.decode(b); w.writes.push(t); w.core.onWrite(t); }) };
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
const NO_BT = `try { delete Navigator.prototype.bluetooth; } catch (e) {}
try { Object.defineProperty(navigator, "bluetooth", { configurable: true, value: undefined }); } catch (e) {}`;

// ---------------------------------------------------------------- helpers
const wait = (page, ms) => page.waitForTimeout(ms);
const tab = async (page, name) => { await page.locator(".tabs button", { hasText: name }).click(); await wait(page, 300); };
const logKey = async (page, k, ms = 110) => {
  await page.keyboard.press(k); await wait(page, ms);
  const b = page.getByRole("button", { name: "Log pitch" });
  if (await b.count()) { await b.first().click(); await wait(page, ms); }
};
const countOf = (page) => page.evaluate(() => `${G().balls}-${G().strikes}`);

// each state: { watch: "none"|"fake"|"nobt", run(page, h) } ; h gives open() for states that need several tries
async function openPage(browser, view, mode, errs) {
  const ctx = await browser.newContext({ ...VIEWS[view], deviceScaleFactor: SCALE, reducedMotion: REDUCED ? "reduce" : "no-preference" });
  if (mode === "fake") await ctx.addInitScript(FAKE_BT);
  if (mode === "nobt") await ctx.addInitScript(NO_BT);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/` + (mode === "fake" ? "?watch=1" : ""));
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  await wait(page, 500);
  return page;
}
// the roster the states share: the pitcher on the mound gets a 4th pitch (Curveball) and a third pitcher is added, all
// through the Roster screen
async function prepRoster(page) {
  const mound = await page.evaluate(() => pitcherDef().name);
  await tab(page, "Roster");
  await page.getByRole("button", { name: "Add a pitcher" }).click(); await wait(page, 300);
  await page.locator(".pcard").filter({ has: page.locator("b", { hasText: new RegExp("^" + mound + "$") }) }).first().click(); await wait(page, 300);
  await page.getByLabel("Add a pitch").selectOption("Curveball"); await wait(page, 300);
  const r = await page.evaluate(() => ({ pitches: arsenal().length, name: pitcherDef().name, pitchers: DB.pitchers.size }));
  if (r.pitches < 4 || r.pitchers < 3) throw new Error("roster prep failed: " + JSON.stringify(r));
}
async function toGame(page) { await tab(page, "Game"); await wait(page, 200); }
async function connectWatches(page, n) {
  await tab(page, "Setup");
  await page.getByRole("button", { name: "Connect a watch" }).click(); await wait(page, 500);
  if (n > 1) { await page.getByRole("button", { name: "Connect a second watch" }).click(); await wait(page, 500); }
  const got = await page.evaluate(() => (window.__watches || []).filter((w) => w.connected).length);
  if (got !== n) throw new Error(`expected ${n} fake watches connected, got ${got}`);
}
const settle = (page) => wait(page, 700);
// the call's buttons are brought into view on a phone only; on an iPad or a laptop every shot is taken at the top of the page
const phoneOnlyScroll = async (page) => {
  if (await page.evaluate(() => innerWidth < 700)) await page.locator(".call-acts").evaluate((e) => e.scrollIntoView({ block: "center" }));
  else await page.evaluate(() => scrollTo(0, 0));
};   // Enter/Accept only act on a call that has been on screen 0.6 s
const pill = (page) => page.evaluate(() => (document.getElementById("watch-pill") || {}).textContent || "");
async function acceptAndWait(page, ms) {
  await settle(page);
  await page.getByRole("button", { name: "Accept", exact: true }).click(); await wait(page, ms);
  await phoneOnlyScroll(page);
}
async function midAtBat(page) {   // 1-1 after two logged pitches
  await logKey(page, "b"); await logKey(page, "c");
  const c = await countOf(page);
  if (c !== "1-1") throw new Error("expected count 1-1, got " + c);
}
async function strikeouts(page, until, key = "c") {   // called strikes (or the given key) until the inning is over (or the guard trips)
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => !!G().inningOver)) return;
    await logKey(page, key, until || 80);
  }
  throw new Error("the inning never ended");
}
async function logMix(page, n) {
  const keys = ["b", "c", "f", "b", "c", "b", "f", "c", "b", "f", "c", "b", "c", "f"];
  for (let i = 0; i < n; i++) {
    if (await page.evaluate(() => !!G().inningOver)) await page.getByRole("button", { name: /^Take the field/ }).click();
    await logKey(page, keys[i % keys.length], 90);
  }
}

const S = {};
S.waiting = { run: async (page) => { await prepRoster(page); await toGame(page);
  if (await page.evaluate(() => G().log.length !== 0 || !G().call)) throw new Error("no first call on a fresh game"); } };
S.call = { run: async (page) => { await prepRoster(page); await toGame(page); await midAtBat(page); } };
S["call-options"] = { run: async (page) => { await prepRoster(page); await toGame(page); await midAtBat(page);
  const d = page.locator("details.options");
  if (!(await d.evaluate((e) => e.open))) { await d.locator("summary").click(); await wait(page, 200); }
  if (!(await d.evaluate((e) => e.open))) throw new Error("the mix list would not open");
  await d.evaluate((e) => e.scrollIntoView({ block: "nearest" })); } };
S["accept-ready"] = { watch: "fake", run: async (page) => { await prepRoster(page); await connectWatches(page, 2); await toGame(page); await midAtBat(page); await settle(page);
  await phoneOnlyScroll(page);
  const r = await page.evaluate(() => ({ btn: (document.querySelector(".btn.accept") || {}).textContent, pill: (document.getElementById("watch-pill") || {}).textContent }));
  if (r.btn !== "Accept" || !/Both watches ready/.test(r.pill)) throw new Error("not in the accept-ready state: " + JSON.stringify(r)); } };
S["accepted-both"] = { watch: "fake", run: async (page) => { await prepRoster(page); await connectWatches(page, 2); await toGame(page); await midAtBat(page);
  await acceptAndWait(page, 800);
  if (!/On both watches/.test(await pill(page))) throw new Error("pill: " + (await pill(page))); } };
S["accepted-one"] = { watch: "fake", run: async (page) => { await prepRoster(page); await connectWatches(page, 2); await toGame(page); await midAtBat(page);
  await page.evaluate(() => { window.__watches[1].mute = true; });
  await acceptAndWait(page, 1800);
  if (!/^Not on Bangle\.js c3d4: give the sign/.test(await pill(page))) throw new Error("pill: " + (await pill(page))); } };
S["not-on-watch"] = { watch: "fake", run: async (page) => { await prepRoster(page); await connectWatches(page, 1); await toGame(page); await midAtBat(page);
  await page.evaluate(() => { window.__watches[0].mute = true; });
  await acceptAndWait(page, 1800);
  if (!/^Not on .*give the sign/.test(await pill(page))) throw new Error("pill: " + (await pill(page))); } };
S["shake-off"] = { run: async (page) => { await prepRoster(page); await toGame(page); await midAtBat(page);
  const before = await page.evaluate(() => G().call.id);
  await page.keyboard.press("k"); await wait(page, 300);
  if (await page.evaluate(() => G().call.id) === before) throw new Error("the call did not change after the shake-off");
  if (!(await page.evaluate(() => (G().pa.shaken || []).length))) throw new Error("no shake-off recorded"); } };
S["coach-call"] = { run: async (page) => { await prepRoster(page); await toGame(page); await midAtBat(page);
  await page.getByRole("button", { name: "Call my own" }).click(); await wait(page, 200);
  await page.locator(".pick .seg").first().locator("button").nth(1).click();
  await page.locator(".pick .seg").nth(1).getByRole("button", { name: "Down and away" }).click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await wait(page, 300);
  if (!(await page.evaluate(() => !!(G().call && G().call.coach)))) throw new Error("the coach's call is not on screen"); } };
S["get-it-over"] = { run: async (page) => {
  await prepRoster(page); await toGame(page);
  const spot = () => page.evaluate(() => (document.querySelector(".call-panel .spot") || {}).textContent || "");
  const seqs = [];
  for (let i = 0; i < 30; i++) seqs.push("bbb");        // 3-0, a new hitter each time (a walk ends the last one)
  for (let i = 0; i < 10; i++) seqs.push("bbbc");       // 3-1
  let tries = 0;
  for (const seq of seqs) {
    tries++;
    for (const k of seq) await logKey(page, k, 70);
    await wait(page, 120);
    if ((await spot()) === "Get it over") { console.log(`  get-it-over: found at count ${await countOf(page)} after ${tries} tries`); return; }
    // not this time: finish the plate appearance (ball four if 3-0, else another ball) and try the next hitter
    await logKey(page, "b", 70); if ((await countOf(page)) !== "0-0") await logKey(page, "b", 70);
    if (await page.evaluate(() => !!G().inningOver)) await page.getByRole("button", { name: /^Take the field/ }).click();
  }
  throw new Error("no 'Get it over' call in 40 tries (3-0 x30, 3-1 x10)"); } };
S.ibb = { run: async (page) => {
  // the engine only suggests the walk in a spot like: away team, 9th inning, tied, runner on 3rd, 1 out, a hitter with
  // contact and power 5. Set it through Setup, play eight innings of swinging strikeouts (called strikes would teach it a wide umpire), then use Correct for the runner and out.
  await prepRoster(page);
  await tab(page, "Setup");
  await page.getByRole("button", { name: "Away", exact: true }).click(); await wait(page, 200);
  for (let i = 1; i <= 9; i++) for (const g of ["contact", "power"]) await page.getByLabel(`Hitter ${i} ${g} grade`).selectOption("5");
  await toGame(page);
  for (let inn = 1; inn < 9; inn++) { await strikeouts(page, 90, "s"); await page.getByRole("button", { name: /^Take the field/ }).click(); await wait(page, 150); }
  const g = await page.evaluate(() => ({ inning: G().inning, us: G().us, them: G().them, home: S.setup.home }));
  if (g.inning !== 9 || g.us !== 0 || g.them !== 0 || g.home !== false) throw new Error("did not reach a tied 9th, away: " + JSON.stringify(g));
  await page.locator("header ~ main .head").getByRole("button", { name: /^Bring in / }).click(); await wait(page, 300);   // a fresh arm for the ninth
  // the plate appearance's table is solved when the hitter steps in, so set the runner and out first, then bring up the next hitter
  await page.getByRole("button", { name: "Correct", exact: true }).click(); await wait(page, 200);
  await page.getByLabel("Outs up").click(); await wait(page, 200);
  await page.locator(".toggles button", { hasText: "3rd" }).click(); await wait(page, 300);
  await page.getByRole("button", { name: "Skip to next hitter" }).click(); await wait(page, 400);
  await page.getByRole("button", { name: "Done", exact: true }).click(); await wait(page, 300);
  if (!(await page.locator(".walk-note").count())) {
    const d = await page.evaluate(() => { const g = G(); let ws = null; try { ws = E.v08.walkSuggestion(arsenal(), Object.assign({}, situation(), { look: g.pa.look }), paTab); } catch (e) { ws = String(e); }
      return { inning: g.inning, outs: g.outs, bases: g.bases, us: g.us, them: g.them, home: S.setup.home, batter: g.batter, grades: hitterGrades(), balls: g.balls, strikes: g.strikes, ws }; });
    throw new Error("no intentional-walk note: " + JSON.stringify(d));
  } } };
S["between-innings"] = { run: async (page) => { await prepRoster(page); await toGame(page); await strikeouts(page);
  if (!(await page.locator(".done").count())) throw new Error("no inning-over panel"); } };
S["pitching-change-open"] = { run: async (page) => { await prepRoster(page); await toGame(page); await logMix(page, 4); await tab(page, "Data");
  // the Bullpen card of the Data screen (bullpenPanel) lists the staff with a "Bring in" button each; the Bullpen tab itself is bullpen charting
  const card = page.locator('section[aria-label="Bullpen"]');
  if (!(await card.getByRole("button", { name: /^Bring in / }).count())) throw new Error("no Bring in buttons on the Data screen's Bullpen card");
  await card.evaluate((e) => e.scrollIntoView({ block: "center" })); } };
S["pitching-change-done"] = { run: async (page) => { await prepRoster(page); await toGame(page); await logMix(page, 4);
  const before = await page.evaluate(() => pitcherDef().name);
  await page.locator("header ~ main .head").getByRole("button", { name: /^Bring in / }).click(); await wait(page, 300);
  const after = await page.evaluate(() => pitcherDef().name);
  if (before === after) throw new Error("pitcher did not change"); } };
S["end-game"] = { run: async (page) => { await prepRoster(page); await toGame(page); await logMix(page, 5);
  const b = page.getByRole("button", { name: "End game", exact: true });
  await b.click(); await wait(page, 150); await b.click();
  await page.waitForFunction(() => G().log.length === 0, null, { timeout: 8000 });
  await page.evaluate(() => window.scrollTo(0, 0)); } };
S.data = { run: async (page) => { await prepRoster(page); await toGame(page); await logMix(page, 14); await tab(page, "Data");
  const n = await page.evaluate(() => G().log.length); if (n < 12) throw new Error("only " + n + " pitches logged"); } };
S.roster = { run: async (page) => { await prepRoster(page); await tab(page, "Roster");
  if ((await page.evaluate(() => DB.pitchers.size)) < 3) throw new Error("fewer than 3 pitchers"); } };
S.setup = { run: async (page) => { await prepRoster(page); await tab(page, "Setup"); } };
S["watches-card"] = { watch: "fake", run: async (page) => { await prepRoster(page); await connectWatches(page, 2);
  await page.locator("#watch-card").evaluate((e) => e.scrollIntoView({ block: "start" })); } };
S["no-bluetooth"] = { watch: "nobt", run: async (page) => { await prepRoster(page); await toGame(page); await midAtBat(page); await wait(page, 700);
  const r = await page.evaluate(() => ({ watch: WATCH, accept: !!document.querySelector(".btn.accept"), bt: "bluetooth" in navigator && !!navigator.bluetooth }));
  if (r.watch !== null || r.accept || r.bt) throw new Error("bluetooth/Accept present: " + JSON.stringify(r)); } };

// ---------------------------------------------------------------- run

// --axe: run axe-core on every page or state before its screenshot; a serious or critical finding fails the run
const AXE_ON = process.argv.includes("--axe");
const AXE_SRC = AXE_ON ? require("fs").readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname, require("path").join(__dirname, ".."), require("path").join(__dirname, "../.."), require("path").join(__dirname, "../web")] }), "utf8") : "";
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
module.exports = { S, VIEWS, openPage, server, wait, STATES, connectWatches, FAKE_BT, NO_BT };
if (MAIN) (async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  let written = 0; const failed = new Map(); const pageErrs = new Set();
  const fail = (name, why) => { if (!failed.has(name)) failed.set(name, why); console.log(`FAILED ${name}: ${why}`); };
  for (const name of only) {
    for (const view of viewNames) {
      const errs = []; let page;
      try {
        page = await openPage(browser, view, S[name].watch || "none", errs);
        await S[name].run(page);
        for (const theme of THEMES) {
          const cur = await page.evaluate(() => (S.theme === "day" ? "day" : "night"));
          if (cur !== theme) {
            await page.locator('.bar button[aria-label^="Switch to the"]').click();
            if ((await page.evaluate(() => (S.theme === "day" ? "day" : "night"))) !== theme) throw new Error("theme switch did not take");
          }
          await page.evaluate(() => document.fonts.ready);
          await wait(page, 400);
          await axeCheck(page, `${name}__${theme}__${view}`);
          const base = path.join(OUT, `${name}__${theme}__${view}`);
          await page.screenshot({ path: base + ".png" }); written++; console.log("wrote " + base + ".png");
          if (FULL.has(name)) { await page.screenshot({ path: base + "__full.png", fullPage: true }); written++; console.log("wrote " + base + "__full.png"); }
        }
      } catch (e) { fail(name, `${view}: ${String(e.message || e).split("\n")[0]}`); }
      for (const e of errs) pageErrs.add(`${name}/${view}: ${e}`);
      if (page) await page.context().close();
    }
  }
  await browser.close(); server.close();
  for (const e of pageErrs) console.log("page error " + e);
  console.log(`shots: ${written} written, ${failed.size} states failed: ${[...failed.keys()].join(", ") || "none"}`);
  for (const [k, v] of failed) console.log(`  ${k}: ${v}`);
  const ax = axeReport();
  process.exit(failed.size || ax ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
