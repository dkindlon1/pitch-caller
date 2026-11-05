// v0.8 compute budget (spec 6.5): PA solve and root call in Chromium with a 4x CPU throttle (iPad stand-in).
// usage: node app/budget_v08.js   -> prints timings; exits 1 if over budget
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const eng = fs.readFileSync(__dirname + "/engine.js", "utf8");
  const data = fs.readFileSync(__dirname + "/engine_data.json", "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: eng });
  await page.evaluate((d) => { PitchEngine.init(JSON.parse(d)); PitchEngine.setFlags(PitchEngine.FLAGS_V08); }, data);
  const run = async (rate) => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    return page.evaluate(() => {
      const E = PitchEngine, P = E.Pitch;
      const ars = {
        two: [P({ name: "Fastball", kind: "FB", grade: 3, command: 3, conf: 0.7, shape: "ride", velo: 85 }), P({ name: "Slider", kind: "SL", grade: 3, command: 3, conf: 0.65, shape: "tight", velo: 77 })],
        three: [P({ name: "Fastball", kind: "FB", grade: 3, command: 3, conf: 0.7, shape: "ride", velo: 85 }), P({ name: "Slider", kind: "SL", grade: 3, command: 3, conf: 0.65, shape: "tight", velo: 77 }), P({ name: "Changeup", kind: "CH", grade: 3, command: 3, conf: 0.6, shape: "fade", velo: 77 })],
        four: [P({ name: "Fastball", kind: "FB", grade: 3, command: 3, conf: 0.7, shape: "ride", velo: 85 }), P({ name: "Slider", kind: "SL", grade: 3, command: 3, conf: 0.65, shape: "tight", velo: 77 }), P({ name: "Curveball", kind: "CB", grade: 3, command: 3, conf: 0.62, shape: "loopy", velo: 71 }), P({ name: "Changeup", kind: "CH", grade: 3, command: 3, conf: 0.6, shape: "fade", velo: 77 })],
      };
      const out = [];
      for (const level of ["hs", "college_d3", "college_d1"]) for (const an of ["two", "three", "four"]) for (const bases of [[false, false, false], [true, false, true]]) {
        const s = E.Situation({ balls: 0, strikes: 0, outs: 1, bases, level, inning: 8, margin: 1, home: true });
        const s0 = Object.assign({}, s, { win: E.v08.winConstants(s) });
        let t = performance.now();
        const tab = E.v08.solveTable(ars[an], s0);
        const tSolve = performance.now() - t;
        let worstRoot = 0;
        for (const [b, k] of E.COUNTS) {
          const sc = Object.assign({}, s0, { balls: b, strikes: k, last: ["Fastball", "up-away", "foul"], look: [84.0, 2.9] });
          t = performance.now(); E.v08.callV08(ars[an], sc, { tab, rng: () => 0.5 }); worstRoot = Math.max(worstRoot, performance.now() - t);
        }
        out.push({ level, an, bases: bases.join(","), tSolve, worstRoot, sweeps: tab.sweeps });
      }
      return out;
    });
  };
  for (const rate of [1, 4]) {
    const r = await run(rate);
    const mx = (f) => Math.max(...r.map(f));
    const mean = (f) => r.reduce((a, x) => a + f(x), 0) / r.length;
    console.log(`CPU throttle ${rate}x: PA solve mean ${mean((x) => x.tSolve).toFixed(0)} ms, max ${mx((x) => x.tSolve).toFixed(0)} ms (${r.find((x) => x.tSolve === mx((y) => y.tSolve)).level} ${r.find((x) => x.tSolve === mx((y) => y.tSolve)).an}); root call max ${mx((x) => x.worstRoot).toFixed(1)} ms`);
    if (rate === 4) {
      const ok = mx((x) => x.tSolve) <= 1000 && mx((x) => x.worstRoot) <= 50;
      console.log(ok ? "PASS: within the 6.5 budget (PA solve <= 1.0 s, root <= 50 ms at 4x)" : "FAIL: over the 6.5 budget");
      await browser.close();
      process.exit(ok ? 0 : 1);
    }
  }
})();
