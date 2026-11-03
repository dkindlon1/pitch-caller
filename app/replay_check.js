/*
 * Every game in a backup replays exactly from the raw log: learner v2's own replay rebuilds each pitch's confidence
 * (with the strike rate the app served that game), "landing today" and the pitch count, and no pitch is missing.
 * Usage (from app/): node replay_check.js <backup.json>   (exit 1 on any mismatch)
 */
const fs = require("fs");
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const L2 = require("./learner.js");
const bk = JSON.parse(fs.readFileSync(process.argv[2], "utf8")), st = bk.stores;
const pitchers = new Map(st.pitchers.map((p) => [p.id, p]));
let games = 0, pitches = 0, confWorst = 0, landBad = 0, pcBad = 0, holes = 0, unversioned = 0;
for (const g of st.games) {
  const evs = st.events.filter((e) => e.gameId === g.id && !e.deletedAt && !e.legacy).sort((a, b) => a.n - b.n);
  if (!evs.length) continue;
  games++; pitches += evs.length;
  if (!evs.every((e, i) => e.n === i + 1)) holes++;
  unversioned += evs.filter((e) => !(e.v && e.v.engine && e.v.data && e.choice)).length;
  for (const pid of new Set(evs.map((e) => e.pitcherId))) {
    const mine = evs.filter((e) => e.pitcherId === pid), G = L2.gamesOf(mine)[0];
    for (const pd of pitchers.get(pid).pitches) {
      const thrown = mine.filter((e) => (e.thrown || e.pitchName) === pd.name);
      if (!thrown.length) continue;
      const { script, base } = L2._pitchGame(G, pd, () => pd.name);
      const snap0 = mine.map((e) => e.ars.find((x) => x.name === pd.name)).find(Boolean);
      const path = L2._confPath(E, pd.kind, base, script, snap0 && snap0.strike_rate != null ? snap0.strike_rate : null);
      thrown.forEach((e, k) => { confWorst = Math.max(confWorst, Math.abs(path[k] - e.ars.find((x) => x.name === pd.name).conf)); });
    }
    const land = {};
    mine.forEach((e, i) => {
      if (JSON.stringify(e.sit.landing_today || {}) !== JSON.stringify(land)) landBad++;
      if (e.pcRaw !== i || e.sit.pitch_count !== e.pcRaw + e.fatigueShift) pcBad++;
      const t = e.thrown || e.pitchName, x = land[t] || [0, 0];
      land[t] = [x[0] + (e.res === "ball" || e.res === "hbp" ? 0 : 1), x[1] + 1];
    });
  }
}
const ok = confWorst === 0 && !landBad && !pcBad && !holes && !unversioned;
console.log(`${games} games, ${pitches} pitches: confidence largest difference ${confWorst}, landing-today mismatches ${landBad}, pitch-count mismatches ${pcBad}, games with holes ${holes}, unversioned pitches ${unversioned} -> ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
