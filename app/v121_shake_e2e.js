/*
 * v1.2.1 in the real page (Drew, Nov 14): the second shake-off of a pitch is a hard switch.
 *   - his only trusted pitch, shaken once: it can come back (a strong pitch may be re-called);
 *   - shaken a second time in the at-bat: it stays out until the next batter, and the toast says so;
 *   - each shake costs 0.05 confidence (was 0.20); the next hitter starts with a clean shake list;
 *   - the setup screen shows the current version line ("PitchIQ 1.2.3 · engine 1.2.3" since v1.2.2).
 * Run from app/ after a build: node v121_shake_e2e.js
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
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });

  const ver = await page.evaluate(() => { S.view = "setup"; render(); const el = document.getElementById("app-version"); return el ? el.textContent : null; });
  check(ver === "PitchIQ 1.3.0 · engine 1.2.3", `setup screen version line: ${JSON.stringify(ver)}`);

  console.log("1. Only trusted pitch: back after one shake, out after the second, back in for the next hitter");
  const r = await page.evaluate(() => {
    S.view = "live";
    const names = arsenal().map((p) => p.name), top = names[0];
    const conf = {}; names.forEach((n, i) => (conf[n] = i === 0 ? 0.9 : 0.1));   // only the first pitch is over any cutoff
    G().conf[pKey()] = conf;
    const slot = slotIdx();
    const shares = () => { const m = {}; for (const d of G().call.dist) m[d.pitch] = (m[d.pitch] || 0) + d.prob; return m; };
    G().call = null; makeCall();
    const first = shares();
    shakeOff();
    G().call = null; makeCall();
    const afterOne = shares(), conf1 = arsenal().find((p) => p.name === top).conf, toast1 = document.getElementById("toast").textContent;
    shakeOff();
    const toast2 = document.getElementById("toast").textContent;
    const later = [];
    for (let i = 0; i < 3; i++) {   // the re-call, then two more pitches in the same at-bat
      G().call = null; makeCall();
      later.push(shares());
      if (i < 2) record({ result: "ball" });
    }
    const conf2 = arsenal().find((p) => p.name === top).conf, shaken = (G().pa.shaken || []).slice(), sameSlot = slotIdx() === slot;
    record({ result: "play", out: "GO" });   // the at-bat ends
    G().call = null; makeCall();
    return { top, names, first, afterOne, conf1, conf2, toast1, toast2, later, shaken, sameSlot, nextSlot: slotIdx() !== slot,
      nextShaken: (G().pa.shaken || []).length, next: shares() };
  });
  const near1 = (m, k) => Object.keys(m).length === 1 && k in m;   // the app's list holds the top calls only, so check which pitches are on it
  check(r.names.length > 1 && near1(r.first, r.top), `fresh: ${r.top} is the only call (${JSON.stringify(r.first)})`);
  check(near1(r.afterOne, r.top), `shaken once, nothing else trusted: the ${r.top} comes back (${JSON.stringify(r.afterOne)})`);
  check(Math.abs(r.conf1 - 0.85) < 1e-9 && Math.abs(r.conf2 - 0.80) < 1e-9,
    `each shake costs 0.05 confidence: 0.90 -> ${r.conf1.toFixed(2)} -> ${r.conf2.toFixed(2)}`);
  check(r.toast1 === `Shook off the ${r.top.toLowerCase()}.` && r.toast2 === `Shook off the ${r.top.toLowerCase()} again. It's out until the next batter.`,
    `toasts: ${JSON.stringify(r.toast1)} then ${JSON.stringify(r.toast2)}`);
  check(r.sameSlot && r.later.every((m) => !(r.top in m)),
    `shaken twice: the next three calls in the at-bat never include it (${r.later.map((m) => Object.keys(m).join("/")).join(", ")})`);
  check(JSON.stringify(r.shaken) === JSON.stringify([r.top, r.top]), `the at-bat keeps one entry per shake: ${JSON.stringify(r.shaken)}`);
  check(r.nextSlot && r.nextShaken === 0 && near1(r.next, r.top), `the next hitter starts clean: ${JSON.stringify(r.next)}`);
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
