/*
 * Watch prototype in the real page (docs/plans/PLAN_watch_prototype_2026-11-15.md rev 3). A stand-in navigator.bluetooth whose
 * "watches" run the real watch app's core (watch/bangle/pitchiq.app.js PQCore):
 *   - without Web Bluetooth (the iPad) there's no Accept button and no Watches card: the Game screen is as before;
 *   - connect from Setup; nothing reaches the watch until Accept; Accept and Enter send the call on screen;
 *   - a recorded pitch, a shake-off, the coach's own call, undo and the third out each clear the watch, and the next
 *     call needs Accept again; a shake-off then Accept is a "changed" call (two short buzzes);
 *   - two pitches sharing a sign block Accept until one gets its own number;
 *   - the watch shows the app's own sign and the spot in words.
 * Run from app/ after a build: node watch_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const WATCH_APP = fs.readFileSync(path.join(__dirname, "../watch/bangle/pitchiq.app.js"), "utf8");
const PCW = require("./watch.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

// the stand-in Bluetooth: up to two fake watches, each running PQCore; writes take 15 ms and overlap is refused as in Chrome
const FAKE_BT = `
(function () {
  ${WATCH_APP}
  const SVC = ${JSON.stringify(PCW.SVC)}, RX = ${JSON.stringify(PCW.RX)}, TX = ${JSON.stringify(PCW.TX)};
  const enc = new TextEncoder(), dec = new TextDecoder();
  window.__watches = [];
  function makeWatch(name) {
    const w = { name, writes: [], raw: [], buzzes: [], overlaps: 0, connected: false, notifying: false, view: null, bonded: true };
    let busy = false, listener = null; const disc = [];
    w.core = PQCore({ draw: (v) => { w.view = v; }, buzz: (k) => w.buzzes.push(k), light: () => {}, now: () => Date.now(), secure: () => w.connected && w.bonded,
      notify: (t) => { if (w.connected && w.notifying && listener) setTimeout(() => listener({ target: { value: new DataView(enc.encode(t).buffer) } }), 10); } });
    const op = (fn) => { if (busy) { w.overlaps++; return Promise.reject(new Error("GATT operation already in progress.")); } busy = true;
      return new Promise((res, rej) => setTimeout(() => { busy = false; if (!w.connected) return rej(new Error("disconnected")); fn(); res(); }, 15)); };
    // each write as the watch app gets it (E.toString: one character per byte), and as readable text for the checks
    // (opened with the key the watch holds): K<id>, H, C<n>,<sign>,<loc>,<chg>, X<n>, HB<n>, E<n>
    const desc = (bytes) => {
      if (bytes.length === 18 && bytes[0] === 0x4b) return "K" + bytes[1];
      if (bytes.length === 16 && bytes[0] === 0x51 && w.core.st.key) {
        const m = PQSec.open(bytes, w.core.st.keyId, (i) => PQSec.inningKeys(w.core.st.key, i));
        return !m ? "?bad" : m.kind === "call" ? "C" + m.n + "," + m.sign + "," + m.loc + "," + (m.chg ? 1 : 0) : m.kind === "clear" ? "X" + m.n : m.kind === "hb" ? "HB" + m.n : "E" + m.n;
      }
      return String.fromCharCode.apply(null, bytes);
    };
    const rx = { writeValueWithResponse: (b) => op(() => { const bytes = new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset || 0, (b.byteOffset || 0) + b.byteLength) : b); const t = String.fromCharCode.apply(null, bytes); w.raw.push(t); w.writes.push(desc(bytes)); w.core.onWrite(t); }) };
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

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const open = async (fake, optIn = fake) => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    if (fake) await ctx.addInitScript(FAKE_BT);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(url + (optIn ? "?watch=1" : "")); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    return page;
  };

  console.log("1. No Web Bluetooth (the iPad): nothing changes");
  {
    const page = await open(false);
    const acts = await page.evaluate(() => [...document.querySelectorAll(".call-acts button")].map((b) => b.textContent));
    check(JSON.stringify(acts) === JSON.stringify(["He shook it off", "Call my own"]), `Game screen buttons: ${JSON.stringify(acts)}`);
    check(await page.evaluate(() => WATCH === null && !document.getElementById("watch-pill")), "no watch link, no pill");
    await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
    // selector only (round 4): the Setup row is titled "Watches" wherever the browser has Bluetooth, so the card is found by its element
    check(!(await page.evaluate(() => document.getElementById("watch-card"))), "no Watches card in Setup");
    // review C1: a roster with two pitches on one sign (common after the v1.1 migration) shows no warning or picker here
    const quiet = await page.evaluate(() => {
      const pd = pitcherDef(); pd.pitches.push(Object.assign({}, pd.pitches.find((d) => d.kind === "FB"), { id: "tmp-fb2", name: "Two-seam test" }));
      const out = { clash: signConflicts(pd).length, note: signNote(pd), pick: signPick(pd, pd.pitches[pd.pitches.length - 1], () => {}) };
      S.view = "setup"; render(); const a = document.body.innerText;
      S.view = "roster"; render(); const b = document.body.innerText;
      pd.pitches.pop(); S.view = "live"; render();
      return Object.assign(out, { text: /share sign/.test(a + b), pickers: document.querySelectorAll(".signpick").length });
    });
    check(quiet.clash === 1 && !quiet.note && !quiet.pick && !quiet.text && !quiet.pickers, "two pitches on one sign: no warning, no sign picker on a device without watches");
    await page.close();
  }

  console.log("1b. Chrome with Bluetooth but not opted in: nothing changes either");
  {
    const page = await open(true, false);
    check(await page.evaluate(() => WATCH === null && !document.querySelector(".btn.accept")), "no watch link, no Accept");
    await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
    // (Drew, Nov 17, round 4: the switch is always in Setup; the full Watches card shows only once watch mode is on)
    check(await page.evaluate(() => { const s = document.querySelector('#watch-switch [role="switch"]'); return !!s && s.getAttribute("aria-checked") === "false" && !document.getElementById("watch-card"); }),
      "Setup shows the watch switch, off, and no Watches card until watch mode is on");
    await page.close();
  }

  const page = await open(true);
  const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(150); };
  const settle = () => page.waitForTimeout(700);   // Enter accepts only a call that's been on screen 0.6 s
  const watch = (i = 0) => page.evaluate((i) => { const w = window.__watches[i]; return w ? { view: w.view, buzzes: w.buzzes.slice(), overlaps: w.overlaps, writes: w.writes.slice(), raw: w.raw.slice() } : null; }, i);
  const screen = () => page.evaluate(() => { const c = G().call, k = c && kindOf(c.pitch); return c ? { sign: signFor(k, c.pitch), quad: c.quad, kind: k, id: c.id, pitch: c.pitch } : null; });
  const words = (quad, kind) => PCW.WORDS[PCW.locCode(quad, kind)].join(" ");
  const pill = () => page.evaluate(() => document.getElementById("watch-pill")?.textContent || "");
  const acceptBtn = () => page.evaluate(() => { const b = document.querySelector(".btn.accept"); return b ? { text: b.textContent, disabled: b.disabled } : null; });

  console.log("2. Connect from Setup");
  await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
  check(await page.evaluate(() => document.body.innerText.includes("Watches")), "Setup has a Watches card");
  await page.getByRole("button", { name: "Connect a watch" }).click(); await page.waitForTimeout(500);
  const card = await page.evaluate(() => document.getElementById("watch-card")?.innerText || "");
  check(/Bangle\.js a1b2/.test(card) && /Connected/.test(card), `card: ${card.split("\n").slice(0, 2).join(" | ")}`);
  check((await watch()).view && (await watch()).view.link && !(await watch()).view.sign, "the watch shows — (linked, no call)");

  console.log("3. Accept sends the call on screen");
  await page.getByRole("button", { name: "Game" }).first().click(); await page.waitForTimeout(300);
  let s0 = await screen();
  check(!(await watch()).view.sign, "before Accept: nothing on the watch");
  check((await acceptBtn()).text === "Accept" && /Watch ready/.test(await pill()), `Accept button and "${await pill()}"`);
  await page.getByRole("button", { name: "Accept" }).click(); await page.waitForTimeout(300);
  let w = await watch();
  check(w.view.sign === s0.sign && (w.view.words || []).join(" ") === words(s0.quad, s0.kind), `watch: ${w.view.sign} / ${(w.view.words || []).join(" ") || "(sign alone)"} for ${s0.pitch}, ${s0.quad}`);
  check(w.buzzes.join() === "new" && (await acceptBtn()).text === "Accepted" && (await acceptBtn()).disabled, "one long buzz; the button reads Accepted");
  check(/On the watch ✓/.test(await pill()), `pill: "${await pill()}"`);

  console.log("4. A recorded pitch clears it; Enter accepts the next call (not a second Enter right away)");
  await page.keyboard.press("b"); await page.waitForTimeout(60);
  check(!(await watch()).view.sign && (await acceptBtn()).text === "Accept", "ball recorded: the watch shows —, the next call needs Accept");
  await key("Enter"); await page.waitForTimeout(200);
  check(!(await watch()).view.sign, "a second Enter right after the pitch doesn't accept a call the coach hasn't seen");
  await settle();
  s0 = await screen();
  await key("Enter"); await page.waitForTimeout(300);
  w = await watch();
  check(w.view.sign === s0.sign && w.buzzes.slice(-1)[0] === "new", `Enter accepted: ${w.view.sign} / ${(w.view.words || []).join(" ") || "(sign alone)"}`);

  console.log("5. Shake-off, then Accept: a changed call");
  await key("k"); await page.waitForTimeout(250);
  check(!(await watch()).view.sign, "shake-off: the watch is cleared at once");
  await settle();
  s0 = await screen();
  await key("Enter"); await page.waitForTimeout(300);
  w = await watch();
  check(w.view.sign === s0.sign && w.buzzes.slice(-1)[0] === "changed", `the new call is sent as a change (two short buzzes): ${w.view.sign}`);

  console.log("6. The coach's own call");
  await page.getByRole("button", { name: "Call my own" }).click(); await page.waitForTimeout(150);
  check((await watch()).view.sign === s0.sign, "opening Call my own doesn't touch the watch");
  // review I2: with his own-call panel open, Enter and the Accept button can't send the engine's call
  await page.evaluate(() => { G().call = null; render(); });   // a fresh engine call while the panel is open
  await page.evaluate(() => { pickMode = true; render(); }); await settle();
  const wBefore = (await watch()).writes.filter((t) => t[0] === "C").length;
  await key("Enter"); await page.waitForTimeout(250);
  check((await watch()).writes.filter((t) => t[0] === "C").length === wBefore && !(await acceptBtn()), "panel open: Enter sends nothing, no Accept button");
  await page.locator(".pick .seg").first().getByRole("button").first().click();
  await page.locator(".pick .seg").nth(1).getByRole("button", { name: "Down and away" }).click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await page.waitForTimeout(250);
  check(!(await watch()).view.sign && (await acceptBtn()).text === "Accept", "his own call replaces the engine's: watch cleared until he accepts it");
  s0 = await screen();
  await page.getByRole("button", { name: "Accept" }).click(); await page.waitForTimeout(300);
  w = await watch();
  check(w.view.sign === s0.sign && (w.view.words || []).join(" ") === "LOW AND OUTSIDE", `his call on the watch: ${w.view.sign} / ${(w.view.words || []).join(" ")}`);

  console.log("7. Undo");
  await key("c"); await page.waitForTimeout(250);
  await key("u"); await page.waitForTimeout(250);
  check(!(await watch()).view.sign && (await acceptBtn()).text === "Accept", "undo of the pitch: the watch stays cleared; the restored call needs Accept");

  console.log("8. Shared signs");
  const blocked = await page.evaluate(() => {
    const pd = pitcherDef(); pd.pitches.push(Object.assign({}, pd.pitches.find((d) => d.kind === "FB"), { id: "tmp-fb2", name: "Two-seam test" }));
    render();
    const t = document.getElementById("toast"); t.textContent = "";
    return { clash: signConflicts(pd).map((x) => x.sign + ":" + x.names.join("+")), pick: !!signPick(pd, pd.pitches[pd.pitches.length - 1], () => {}) };
  });
  check(blocked.clash.length === 1 && blocked.pick, `two fastballs share a sign (${blocked.clash}); the picker shows for them`);
  const before = (await watch()).writes.length;
  await page.evaluate(() => watchAccept()); await page.waitForTimeout(250);
  const toastTxt = await page.evaluate(() => document.getElementById("toast").textContent);
  check(/share sign 1/.test(toastTxt) && (await watch()).writes.filter((t) => t[0] === "C").length === (await watch()).writes.slice(0, before).filter((t) => t[0] === "C").length, `Accept is blocked: "${toastTxt}"`);
  await page.evaluate(() => { const pd = pitcherDef(); pd.pitches[pd.pitches.length - 1].sign = 7; render(); });
  check(await page.evaluate(() => signConflicts(pitcherDef()).length === 0), "giving the second one sign 7 clears it");
  await page.evaluate(() => { const pd = pitcherDef(); pd.pitches.pop(); G().call = null; render(); });

  console.log("9. Third out");
  await page.evaluate(() => { G().outs = 2; G().strikes = 2; G().balls = 0; G().call = null; render(); });
  await settle();
  await key("Enter"); await page.waitForTimeout(250);
  check(!!(await watch()).view.sign, "a call on the watch with two outs, two strikes");
  await key("c"); await page.waitForTimeout(300);
  check(await page.evaluate(() => !!G().inningOver) && !(await watch()).view.sign && !(await acceptBtn()), "strike three, third out: the watch is cleared, no Accept on the three-outs screen");

  console.log("10. Two watches");
  await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Connect a second watch" }).click(); await page.waitForTimeout(500);
  check(!(await page.evaluate(() => [...document.querySelectorAll("#watch-card button")].some((b) => /Connect/.test(b.textContent)))), "two connected: no third Connect button");
  await page.getByRole("button", { name: "Game" }).first().click(); await page.waitForTimeout(200);
  const take = page.getByRole("button", { name: /^Take the field/ }); if (await take.count()) { await take.click(); await page.waitForTimeout(250); }
  await settle();
  await key("Enter"); await page.waitForTimeout(350);
  const a = await watch(0), b = await watch(1);
  check(a.view.sign && JSON.stringify(a.view) === JSON.stringify(b.view), `both watches show the same: ${a.view.sign} / ${(a.view.words || []).join(" ") || "(sign alone)"}`);
  check(/On both watches ✓/.test(await pill()), `pill: "${await pill()}"`);
  check(a.overlaps === 0 && b.overlaps === 0, `overlapping writes: ${a.overlaps}, ${b.overlaps}`);
  check(a.raw.every((t) => t.length <= 20) && a.raw.every((t) => t === "H" || t.length === 16 || t.length === 18) && !a.raw.some((t) => /^[CX]\d+,|,(HI|HO|LI|LO|L|M|CH|CL),|HIGH|INSIDE|OUTSIDE|CHASE|Bangle|Pitcher/.test(t.length === 18 ? "" : t)),
    `over the air: the game key (18 bytes) once per connection, then only 16-byte sealed frames; no name, no sign or spot in readable form (${a.raw.length} writes)`);
  check(a.writes.some((t) => /^K\d+$/.test(t)) && a.writes.filter((t) => t[0] === "C").length > 0 && !a.writes.includes("?bad"), "the watch got the game key and opened every call");

  console.log("11. Soak test while the app renders");
  const soak = await page.evaluate(async () => {
    WATCH.soakStart(1000);
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 500)); render(); }
    return WATCH.soakStop();
  });
  const sk = Object.values(soak);
  check(sk.length === 2 && sk.every((v) => v.sent >= 5 && v.missing === 0 && v.late === 0), `renders don't clear soak calls (review I4): ${JSON.stringify(soak)}`);
  await page.waitForTimeout(200);
  check(!(await watch()).view.sign, "stopping the soak clears the watches");

  console.log("12. End of game");
  const keyedBefore = await page.evaluate(() => window.__watches.map((w) => !!w.core.st.key));
  await page.evaluate(() => endGame()); await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__watches.map((w) => ({ key: w.core.st.key, nokey: w.view.nokey })));
  check(keyedBefore.every(Boolean) && after.every((w) => w.key === null && w.nokey), "End game: both watches wipe the game key (— and \"no key\")");

  console.log("12. Receipt off");
  await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
  await page.locator('#watch-card [aria-label="Delivery receipt"]').getByRole("button", { name: /Receipt off/ }).click(); await page.waitForTimeout(300);
  check(await page.evaluate(() => !window.__watches[0].notifying && JSON.parse(localStorage.getItem("pitchiq.watch")).receipt === false), "receipt off: notifications stopped; the setting is kept on this device only");
  check(await page.evaluate(() => !JSON.stringify(S.setup).includes("receipt")), "not in the synced setup");

  check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `watch_e2e: ${fails} failed` : "watch_e2e: all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
