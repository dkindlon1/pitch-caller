/*
 * The game screen's first view on an iPad in landscape: in every call state the call (its words and sign), Accept, the
 * watch status and all six result keys are on screen with the page at the top, no scrolling. Both themes, at 1180 x 820
 * (the full screen) and 1180 x 740 (Safari, under its own bars). Watches are connected in every state, so Accept is there.
 * Drives the real app through the states of app/shots_v2.js (it changes nothing in the app or the DOM).
 *   node app/fold_e2e.js [--only accept-ready,ibb] [--shots <dir>]
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const H = require("./shots_v2.js");

const args = process.argv.slice(2), opt = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
const STATES = (opt("only") || "accept-ready,accepted-both,accepted-one,not-on-watch,shake-off,get-it-over,ibb").split(",");
const SIZES = [["ipad-l", 1180, 820], ["ipad-l-safari", 1180, 740]];
const SHOTS = opt("shots");
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// what must be in view, by selector; the six result keys are counted
const MUST = [["the call's words", ".call-panel .pitch"], ["the sign", ".call-panel .sign"], ["where", ".call-panel .spot"],
  ["Accept", ".call-panel .btn.accept"], ["the watch status", "#watch-pill"]];

let fails = 0, oks = 0;
const check = (ok, msg) => { if (ok) oks++; else fails++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); };

(async () => {
  await new Promise((r) => H.server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  for (const name of STATES) {
    for (const [view, w, hgt] of SIZES) {
      const errs = []; let page;
      try {
        page = await H.openPage(browser, view, "fake", errs);
        // every state gets two watches, so its call carries Accept (states that already connect them do it themselves)
        if (H.S[name].watch !== "fake") await H.connectWatches(page, 2);
        await H.S[name].run(page);
        for (const theme of ["night", "day"]) {
          if ((await page.evaluate(() => (S.theme === "day" ? "day" : "night"))) !== theme) await page.locator('.bar button[aria-label^="Switch to the"]').click();
          await page.evaluate(() => scrollTo(0, 0));
          await page.evaluate(() => document.fonts.ready); await H.wait(page, 350);
          const m = await page.evaluate((must) => {
            const vh = innerHeight, vw = innerWidth, out = { scrollY, docH: document.documentElement.scrollHeight, missing: [], below: [], keys: 0, keysIn: 0, lowest: 0 };
            const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw; };
            for (const [label, sel] of must) {
              const el = document.querySelector(sel);
              if (!el) { out.missing.push(label); continue; }
              const r = el.getBoundingClientRect(); out.lowest = Math.max(out.lowest, Math.round(r.bottom));
              if (!seen(el)) out.below.push(`${label} (${Math.round(r.top)}-${Math.round(r.bottom)})`);
            }
            for (const k of document.querySelectorAll(".keys .key")) { out.keys++; const r = k.getBoundingClientRect(); out.lowest = Math.max(out.lowest, Math.round(r.bottom)); if (seen(k)) out.keysIn++; else out.below.push(`key "${k.firstChild.textContent}" (${Math.round(r.top)}-${Math.round(r.bottom)})`); }
            return out;
          }, MUST);
          const tag = `${name} ${theme} ${w}x${hgt}`;
          check(m.scrollY === 0, `${tag}: at the top of the page`);
          check(!m.missing.length, `${tag}: present${m.missing.length ? ": missing " + m.missing.join(", ") : ""}`);
          check(m.keys === 6 && m.keysIn === 6 && !m.below.length, `${tag}: call, sign, Accept, status and ${m.keysIn} of ${m.keys} result keys in view, lowest at ${m.lowest} of ${hgt}${m.below.length ? ": cut off " + m.below.join("; ") : ""}`);
          if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}__${theme}__${view}.png`) });
        }
      } catch (e) { check(false, `${name} ${w}x${hgt}: ${String(e.message || e).split("\n")[0]}`); }
      for (const e of errs) check(false, `${name} ${view}: page error ${e}`);
      if (page) await page.context().close();
    }
  }
  await browser.close(); H.server.close();
  console.log(fails ? `\n${fails} fold check(s) FAILED (${oks} ok)` : `\nfold_e2e: all ${oks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
