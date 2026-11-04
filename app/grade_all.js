/*
 * Grades every pitch and spot the coach could call, in one pass, for the "Call my own" picker.
 * E.gradeCall grades one call and costs two full policy solves; doing it for every button would take seconds on an
 * iPad. This is the same arithmetic as E.gradeCall (engine.js), sharing one solve across all the calls:
 * grade_all_test.js checks it against E.gradeCall call by call.
 */
(function (root) {
  const minAllowed = (costs, tq) => { let m = Infinity; for (const [key, v] of costs) if (tq.includes(key.slice(key.lastIndexOf("|") + 1)) && v < m) m = v; return m; };

  // -> { [pitchName]: { [quad]: { runs_vs_best, allowed, verdict, engine_prob } } }
  function gradeAll(E, arsenal, s) {
    const { dist } = E.callMixed(arsenal, s, { rng: () => 0 });
    const cv = E.atBatValues(arsenal, s)[1];
    const [policy, costs] = E.mixedPolicy(arsenal, s, 0.010, 0.030, null, 8, cv);
    const tq = E.targets(s.balls, s.strikes), best = minAllowed(costs, tq);
    const out = {};
    for (const p of arsenal) {
      out[p.name] = {};
      for (const quad of E.QUADS) {
        const key = p.name + "|" + quad;
        const cHuman = costs.has(key) ? costs.get(key) : E.cost(p, quad, s, arsenal, policy, cv)[0];
        const allowed = tq.includes(quad);
        let prob = 0; for (const d of dist) if (d.pitch.name === p.name && d.quad === quad) prob += d.prob;
        out[p.name][quad] = { runs_vs_best: cHuman - best, allowed, engine_prob: prob,
          verdict: !allowed ? "costly" : prob >= 0.02 ? "in the engine's mix" : (cHuman - best <= 0.03 * E.runScale(s.level) ? "close" : "costly") };
      }
    }
    return out;
  }

  const api = { gradeAll };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PCGrade = api;
})(typeof window !== "undefined" ? window : this);
