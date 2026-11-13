// v1.2 Step 3: the learner's miss-lean estimate from a pitcher's own log (learner.js leanModel; plan 2.5).
// Simulated seasons (worlds.js, cells option) with hidden leans, logged on the app's 5x5 grid.
//   node lean_test.js
const W = require("./worlds.js");
const L = require("./learner.js");
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? "  (" + detail + ")" : ""}`); ok ? pass++ : fail++; };

const pitches = [{ id: "fb", name: "Fastball", kind: "FB", shape: "", velo: 86, usage: 0.6 },
  { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.4 }];
const entered = { Fastball: { command: 3, grade: 3 }, Slider: { command: 3, grade: 3 } };
const truth = () => ({ Fastball: { command: 3, grade: 3 }, Slider: { command: 3, grade: 3 } });
const season = (cells, seed, games = 8) => W.season({ pitches, entered, truth, games, pas: 26, level: "college_d3", seed, loc: true, cells });

// the standard error of the symmetrised mean, from the samples themselves
function se(events, name, key, posKey) {
  const ss = events.map((ev) => L.leanSample(ev, "R")).filter((x) => x && x.name === name);
  const a = ss.filter((x) => x[posKey] > 0.5), b = ss.filter((x) => x[posKey] < -0.5);
  const v = (arr) => { const m = arr.reduce((s, x) => s + x[key], 0) / arr.length; return arr.reduce((s, x) => s + (x[key] - m) ** 2, 0) / (arr.length - 1); };
  return Math.sqrt(v(a) / a.length + v(b) / b.length) / 2;
}

// 1. recovery: hidden leans, directional way-off, targets on both sides. Tested as bias and coverage over 20 seasons
// (plan Step 3 said "within 1 SE" per estimate, which a correct estimator misses a third of the time by chance).
const truthLean = { Fastball: [3.0, 1.5], Slider: [-1.5, -3.0] };
{
  const err = { x: [], z: [] }; let inside = 0, total = 0; let ex = "";
  for (let seed = 1; seed <= 20; seed++) {
    const evs = season({ lean: truthLean, sd: 9, directional: true, hand: "R" }, seed);
    const m = L.leanModel(evs, { hand: "R" });
    for (const nm of ["Fastball", "Slider"]) {
      for (const [ax, key, pk, i] of [["x", "dx", "tx", 0], ["z", "dz", "tz", 1]]) {
        const est = m[nm][ax], s = se(evs, nm, key, pk), d = est.mean - truthLean[nm][i];
        err[ax].push(d); total++; if (Math.abs(d) <= 2 * s) inside++;
        if (seed === 1 && nm === "Fastball" && ax === "x") ex = `seed 1 fastball side: true +3, mean ${est.mean.toFixed(2)} (SE ${s.toFixed(2)}, n ${est.n})`;
      }
    }
  }
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  check("recovery is unbiased: mean error over 20 seasons x 2 pitches within 0.3 in. on each axis (hidden fastball +3 / +1.5, slider -1.5 / -3)",
    Math.abs(mean(err.x)) <= 0.3 && Math.abs(mean(err.z)) <= 0.3, `side ${mean(err.x).toFixed(3)}, height ${mean(err.z).toFixed(3)} in.; ${ex}`);
  check("its standard error is honest: at least 85% of the 80 estimates fall within 2 SE (95% expected)", inside / total >= 0.85,
    `${inside}/${total} = ${(100 * inside / total).toFixed(0)}%`);
}

// 2. the served value is the mean shrunk with K = 30
{
  const evs = season({ lean: truthLean, sd: 9, directional: true, hand: "R" }, 44);
  const fb = L.leanModel(evs, { hand: "R" }).Fastball.x;
  check("shrinkage: served value = mean x n / (30 + n)", Math.abs(fb.served - fb.mean * fb.n / (L.LEAN_K + fb.n)) < 1e-12,
    `mean ${fb.mean.toFixed(2)}, n ${fb.n}, served ${fb.served.toFixed(2)}`);
}

// 3. too few targets on a side: no estimate, and a flag that says why
{
  const evs = season({ lean: truthLean, sd: 9, directional: true, hand: "R" }, 55, 1).slice(0, 25);
  const m = L.leanModel(evs, { hand: "R" });
  const fb = m.Fastball;
  check("fewer than 10 targets on a side: no estimate, flagged", fb && fb.x.mean === null && fb.flag.some((f) => f.startsWith("needs targets on both sides")),
    fb ? `sides ${fb.x.sides.join(" / ")}; flag: ${fb.flag[0]}` : "no fastball samples");
}

// 4. today's log (Way off with no direction): pitches dropped, counted, and the estimate biased toward the middle
{
  let bOld = 0, bNew = 0, nd = 0;
  for (const seed of [66, 77, 88]) {
    const lean = { Fastball: [3.0, 0], Slider: [0, 0] };
    const old = L.leanModel(season({ lean, sd: 11, directional: false, hand: "R" }, seed), { hand: "R" }).Fastball;
    const neu = L.leanModel(season({ lean, sd: 11, directional: true, hand: "R" }, seed), { hand: "R" }).Fastball;
    bOld += (old.x.mean - 3.0) / 3; bNew += (neu.x.mean - 3.0) / 3; nd += old.noDir;
  }
  check("today's log (no direction on Way off): those pitches are left out and counted, and the lean reads closer to 0 than with a direction",
    nd > 0 && bOld < bNew, `mean bias ${bOld.toFixed(2)} in. without a direction vs ${bNew.toFixed(2)} with; ${nd} way-off pitches left out over 3 seasons`);
}

// 5. the flag and the gate
{
  const evs = season({ lean: { Fastball: [4.0, 0], Slider: [0, 0] }, sd: 8, directional: true, hand: "R" }, 99, 10);
  const fb = L.leanModel(evs, { hand: "R" }).Fastball;
  check("a clear lean is flagged in the coach's words", fb.flag.some((f) => /misses arm side/.test(f)), fb.flag.join("; "));
  check("served to the engine only when the trait gate admits it (ACTIVE_TRAITS has no lean: flag only)", fb.served === false && !L.ACTIVE_TRAITS.includes("lean"));
}
// 6. a left-hander: his arm side is the catcher's right
{
  const evs = season({ lean: { Fastball: [3.0, 0], Slider: [0, 0] }, sd: 8, directional: true, hand: "L" }, 123, 10);
  const fb = L.leanModel(evs, { hand: "L" }).Fastball;
  check("a left-hander's arm-side lean reads arm side (pitcher's frame, not the catcher's)", fb.x.mean > 1.5, `mean ${fb.x.mean.toFixed(2)}`);
}
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
