// v1.0 Phase 8 helper for tools/replay_real.py: run the app's learner on a charted-game backup and print, per pitch, the
// coach's grades, what the learner fits (with SD and pitch counts), what it would serve the calls, and its safety switch.
// node tools/replay_learner.js <backup.json>
const fs = require("fs"), path = require("path");
const A = path.join(__dirname, "..", "app");
const E = require(path.join(A, "engine.js")); E.init(JSON.parse(fs.readFileSync(path.join(A, "engine_data.json"))));
const L = require(path.join(A, "learner.js"));
const bk = JSON.parse(fs.readFileSync(process.argv[2], "utf8")), st = bk.stores || {};
const evs = (st.events || []).filter((e) => !e.deletedAt && e.type !== "play");
const out = [];
for (const p of (st.pitchers || [])) {
  const mine = evs.filter((e) => e.pitcherId === p.id);
  if (!mine.length) continue;
  const prof = L.learnPitcher(E, p, mine, { now: Date.now() });
  const sv = L.serve(prof, p, null);
  const pitches = p.pitches.map((pd) => {
    const x = prof.pitches[pd.id] || {}, s = (sv.pitches || {})[pd.id] || {};
    return { name: pd.name, kind: pd.kind, coach: { command: +pd.command, grade: +pd.grade }, n: x.n || 0, nLoc: x.nLoc || 0,
      learned: x.talent || null, sd: x.sd || null, served: { command: s.command, grade: s.grade, learned: s.learned },
      switchedOff: !!(x.score && x.score.worse) };
  });
  out.push({ pitcher: p.name || p.id, id: p.id, pitches });
}
console.log(JSON.stringify(out));
