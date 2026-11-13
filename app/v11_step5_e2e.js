/*
 * v1.1 Step 5 in the real page (docs/PLAN_v1.1_2026-11-12.md, Step 5 "App"):
 *   - the shape list shows profile names (the stored value stays the engine's tag);
 *   - the stuff grade says it is compared with other pitches of this profile;
 *   - the "main fastball" mark (plan 2.1): fastball-class pitches only, one per pitcher; the coach's mark reaches the
 *     engine (primaryFb), else the fastball-class pitch he has thrown most in his records, else none (the engine takes the
 *     first fastball-class pitch); the event snapshot carries the mark only when set, so unmarked snapshots don't change.
 * Run from app/ after a build: node v11_step5_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });

  // a pitcher with a four-seam, a sinker and a slider (the sinker second, so "first fastball-class" is the four-seam)
  await page.evaluate(() => {
    const pd = S.setup.staff[0];
    pd.pitches = [{ name: "Fastball", kind: "FB", grade: 3, command: 3, feel: 0.7, shape: "rides", velo: 90 },
      { name: "Sinker", kind: "SI", grade: 3, command: 3, feel: 0.7, shape: "run", velo: 89 },
      { name: "Slider", kind: "SL", grade: 3, command: 3, feel: 0.6, shape: "sweeper", velo: 80 }];
    G().pitcher = 0; S.view = "setup"; window.__dbReady = DB.ready; DB.ready = false; render();   // the setup pitch table shows without a database
  });

  console.log("1. Profile names and the stuff hint in the pitch editor");
  const ui = await page.evaluate(() => {
    const opts = (id) => [...document.querySelectorAll(`#${id} option`)].map((o) => [o.value, o.textContent]);
    return { fb: opts("p0-0-shape"), sl: opts("p0-2-shape"), sel: document.querySelector("#p0-2-shape").value,
      stuffLabel: document.querySelector("#p0-0-grade").getAttribute("aria-label"),
      hint: [...document.querySelectorAll("p.muted")].some((p) => /a 3 sweeper is an average sweeper/.test(p.textContent)) };
  });
  check(ui.fb.some(([v, t]) => v === "straight" && t === "Straight (dead zone)") && ui.fb.some(([v, t]) => v === "" && t === "Typical"),
    `four-seam shapes show profile names, values stay tags (${ui.fb.map((x) => x[1]).join(", ")})`);
  check(ui.sel === "sweeper" && ui.sl.some(([v, t]) => v === "sweeper" && t === "Sweeper"), `slider's stored tag "sweeper" is selected under its name`);
  check(/compared with other pitches of this profile/.test(ui.stuffLabel) && ui.hint, `stuff grade says it is relative to the profile ("${ui.stuffLabel}")`);

  console.log("2. The main fastball mark: fastball-class only, one per pitcher, reaches the engine");
  const m0 = await page.evaluate(() => ({
    radios: [0, 1, 2].map((i) => !!document.querySelector(`#p0-${i}-main`)),
    main: arsenal().filter((p) => p.main).map((p) => p.name), engineMain: E.v08.primaryFb ? E.v08.primaryFb(arsenal()).name : E.primaryFb(arsenal()).name }));
  check(JSON.stringify(m0.radios) === "[true,true,false]", `a mark for the four-seam and sinker, none for the slider (${JSON.stringify(m0.radios)})`);
  check(m0.main.length === 0 && m0.engineMain === "Fastball", `no mark and no records: nothing marked; the engine takes the first fastball-class pitch (${m0.engineMain})`);
  await page.click("#p0-1-main");
  const m1 = await page.evaluate(() => {
    DB.ready = window.__dbReady;
    G().call = null; S.view = "live"; makeCall();
    const ev = { ars: PCLearn.snapArsenal(arsenal()) };
    return { stored: S.setup.staff[0].pitches.map((d) => !!d.main), main: arsenal().filter((p) => p.main).map((p) => p.name),
      engineMain: (E.v08.primaryFb || E.primaryFb)(arsenal()).name, snap: ev.ars.map((x) => x.main === true ? x.name : null).filter(Boolean),
      snapKeys: ev.ars.filter((x) => "main" in x).length };
  });
  check(JSON.stringify(m1.stored) === "[false,true,false]" && m1.main.join() === "Sinker" && m1.engineMain === "Sinker",
    `marking the sinker: stored on the sinker only, the engine's main fastball is the sinker (${m1.engineMain})`);
  check(m1.snap.join() === "Sinker" && m1.snapKeys === 1, `the event snapshot carries the mark on the sinker only (${m1.snapKeys} pitch with the key)`);
  const m2 = await page.evaluate(() => {
    const pd = S.setup.staff[0]; pd.pitches[0].main = true; delete pd.pitches[1].main;   // move it back to the four-seam
    const a = arsenal().filter((p) => p.main).map((p) => p.name);
    delete pd.pitches[0].main;
    // records: the learner's counts say he throws the sinker most
    const id = pd.id || "test-pitcher"; pd.id = id;
    const prev = DB.models.get("v2:" + id);
    DB.models.set("v2:" + id, { id: "v2:" + id, pitcherId: id, profile: { pitches: { [pd.pitches[0].id || "Fastball"]: { n: 120 }, [pd.pitches[1].id || "Sinker"]: { n: 340 } }, games: [] }, served: { pitches: {} } });
    const fromRecords = mainFbName(pd), engineMain = (E.v08.primaryFb || E.primaryFb)(arsenal()).name;
    if (prev) DB.models.set("v2:" + id, prev); else DB.models.delete("v2:" + id);
    return { a, fromRecords, engineMain };
  });
  check(m2.a.join() === "Fastball", `moving the mark to the four-seam moves it in the arsenal (${m2.a.join()})`);
  check(m2.fromRecords === "Sinker" && m2.engineMain === "Sinker", `no mark: the fastball-class pitch he has thrown most in his records (sinker 340 vs four-seam 120) is his main (${m2.engineMain})`);
  const m3 = await page.evaluate(() => {
    const pd = S.setup.staff[0]; pd.pitches[1].main = true; S.view = "setup"; DB.ready = false; render();
    const sel = document.querySelector("#p0-1-kind"); sel.value = "CH"; sel.dispatchEvent(new Event("change"));
    const out = { mark: pd.pitches.map((d) => !!d.main), kind: pd.pitches[1].kind };
    DB.ready = window.__dbReady; return out;
  });
  check(m3.kind === "CH" && JSON.stringify(m3.mark) === "[false,false,false]", `changing the marked sinker to a changeup clears the mark (${JSON.stringify(m3.mark)})`);
  console.log("3. The Roster screen's arsenal editor (where pitches live with a database)");
  const r = await page.evaluate(() => {
    const p = { id: "e2e-p", name: "Test", hand: "R", pitches: [{ name: "Fastball", kind: "FB", type: "Four-seam", grade: 3, command: 3, feel: 0.7 },
      { name: "Cutter", kind: "FC", type: "Cutter", grade: 3, command: 3, feel: 0.7, main: true }, { name: "Sweeper", kind: "SL", type: "Sweeper", grade: 3, command: 3, feel: 0.6 }] };
    const el = arsenalEditor(p);
    const radios = [...el.querySelectorAll("input[type=radio]")];
    return { n: radios.length, checked: radios.filter((x) => x.checked).map((x) => x.getAttribute("aria-label")),
      stuff: [...el.querySelectorAll("input")].some((x) => /compared with other pitches of this profile/.test(x.getAttribute("aria-label") || "")),
      note: /six kinds/.test(el.textContent) && !/four families/.test(el.textContent) };
  });
  check(r.n === 2 && r.checked.join() === "Cutter is his main fastball", `two marks (four-seam, cutter), the cutter checked (${r.checked.join()})`);
  check(r.stuff && r.note, `stuff hint on the grade; the note says six kinds, not four families`);
  check(!errs.length, `no page errors${errs.length ? " (" + errs[0] + ")" : ""}`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nPASS: v1.1 Step 5 app checks");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
