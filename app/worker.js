// The learning worker: learner v2 runs here, off the screen's thread, so learning after a game never freezes the app.
// build.py puts engine.js, learner.js and this file together as the worker's source. The same messages are answered on
// the main thread if a worker can't start (learnLocal in roster.js), so the result is identical either way.
function pcSlimProfile(prof) {
  const pitches = {};
  for (const [id, p] of Object.entries(prof.pitches)) {
    pitches[id] = { n: p.n, nLoc: p.nLoc, talent: p.talent, sd: p.sd, traits: p.traits, strike_rate: p.strike_rate, possibleChange: p.possibleChange || null,
      score: p.score ? { learned: p.score.learned, coach: p.score.coach, rows: p.score.rows, gap: p.score.gap, se: p.score.se, worse: p.score.worse } : null };
  }
  return { pitcherId: prof.pitcherId, learner: prof.learner, at: prof.at, level: prof.level, games: prof.games, flags: prof.flags, pitches };
}
function pcLearnMessage(E, L, d) {
  if (d.type === "pitcher") {
    const prof = L.learnPitcher(E, d.pitcher, d.events, { level: d.level, scoreboard: true });
    const served = L.finishServe(E, L.serve(prof, d.pitcher, d.prev || null), d.pitcher, d.level);
    return { profile: pcSlimProfile(prof), served };
  }
  if (d.type === "hitter") return { model: L.hitterModel(E, d.hitter, d.events, d.level) };
  throw new Error("unknown message " + d.type);
}
if (typeof self !== "undefined" && typeof window === "undefined" && typeof module === "undefined") {
  self.onmessage = (m) => {
    const d = m.data;
    if (d.type === "init") { PitchEngine.init(d.data); return; }
    try { self.postMessage(Object.assign({ id: d.id, ok: true }, pcLearnMessage(PitchEngine, PCLearner, d))); }
    catch (e) { self.postMessage({ id: d.id, ok: false, error: String((e && e.stack) || e) }); }
  };
}
if (typeof module !== "undefined" && module.exports) module.exports = { pcLearnMessage, pcSlimProfile };
