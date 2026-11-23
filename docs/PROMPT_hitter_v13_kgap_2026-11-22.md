Drew's rulings (Nov 22, late). Record them in docs/DECISIONS_refit_v13.md.
1. K gap: diagnose first, no tuning. Nothing gets wired; this is report only. For D1, D2, D3 and HS (MLB as the control),
   measure how much of the strikeout gap each piece explains, as a K change with SE, in one table:
   a. Per-pitch rates vs count mix: in sims, per-count swing / whiff / foul / called-strike / in-play against the fitted
      count layer, plus the share of PAs reaching two strikes and pitches per PA against real. Does the extra K come from
      per-pitch rates or from reaching two strikes more often?
   b. Engine-chosen spots: K when the engine's chosen locations are swapped for the average-pitcher landing mix the count
      layer is normalized to. Also check that the zone table averages back to the count layer over the landing mix the
      sims actually use. This splits the "calling advantage" from model error.
   c. Zone trend: K with the college / HS trend extension turned off (Single-A shape as is).
   d. HS only: K with the velocity table off, and with the whole staff at the median speed.
   e. Edge called strike: engine vs real on the inner and outer half of the edge (real .922 / .410), and K with the
      engine's edge called-strike set to real, as a diagnostic run only.
   f. v1.2: which settings v1.2's recalibration moved to land K, for comparison.
   Use enough games per run for a K SE of about 0.3 points. One heavy job at a time.
   Then stop and report, with a proposed fix marked PROPOSED. Don't wire it.
2. Hold the 400-game sims, the three-way read-through, the suite re-pin table and the D2 / D3 rescore until I rule on the fix.
3. The edge called-strike ruling waits for this diagnosis.
