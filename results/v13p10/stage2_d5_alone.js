// Part 10 task 2: stage2_test.js's D5 block alone, against the app/ copy in argv[2]. Same seeds, same code.
const path = require("path");
const dir = path.resolve(process.argv[2]);
const { season, E, L } = require(path.join(dir, "worlds.js"));
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const C3 = { command: 3, grade: 3 };
const G3 = { Fastball: C3, Slider: C3, Changeup: C3 };
const pitcherOf = (entered) => ({ id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) });
const clone = (x) => JSON.parse(JSON.stringify(x));
const keep = clone({ drift: L.CFG.driftPerGame, caps: L.CFG.caps });
const chase = (on) => { if (on) { L.CFG.driftPerGame = 1.2; Object.assign(L.CFG.caps, { step: 2, total: 3 }); } else { L.CFG.driftPerGame = keep.drift; Object.assign(L.CFG.caps, keep.caps); } };
const off = (prof) => ["fb", "sl", "ch"].filter((k) => prof.pitches[k].score && prof.pitches[k].score.worse);
const rows = [];
let nC = 0, nF = 0;
const S0 = +(process.argv[3] || 0), S1 = +(process.argv[4] || 40);
for (let r = S0; r < S1; r++) {
  const evs = season({ pitches: P3, entered: G3, truth: () => G3, games: 16, pas: 22, seed: 500 + r, loc: true });
  chase(true); const c = off(L.learnPitcher(E, pitcherOf(G3), evs, { now: 1 })); chase(false);
  const f = off(L.learnPitcher(E, pitcherOf(G3), evs, { now: 1 }));
  if (c.length) nC++; if (f.length) nF++;
  const sig = require("crypto").createHash("sha1").update(JSON.stringify(evs)).digest("hex").slice(0, 10);
  rows.push({ seed: 500 + r, caught: c, falseOff: f, events: evs.length, sig });
}
console.log(JSON.stringify({ dir: path.basename(path.dirname(dir)), caught: nC, falseOff: nF, rows }));
