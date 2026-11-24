# Hitter v1.3: per-count mean preservation, then finish the full-data run (Nov 24, 2026)

Tell Claude Code: "Read C:/dev/pitch-caller/docs/PROMPT_hitter_v13_meanpreserve_2026-11-24.md and carry it out."

This follows `docs/BUILD_v13_fulldata_REPORT.md` and `docs/KGAP_v13_TABLE_fixed.md` (52be85b on `feat/hitter-v13-fulldata`). Work on that branch.

All earlier rules stand:
- local only, never `main`, push feature branches only;
- commit as Claude;
- 2026 untouched;
- archives read-only, game list frozen;
- nothing called done unless it was run and the output read;
- anything you grade is marked **proposed**;
- the fitted count layer is never changed.

**Compute:** use the whole desktop. Run independent work across worker processes (about cores minus 2) under the ~48 GB memory guard, with fixed seeds so results match a serial run.

## Drew's rulings (Nov 24). Record them in `docs/DECISIONS_refit_v13.md` as decided.
12. **Per-count mean preservation** (plan 3.2, now enforced exactly). This replaces chasing K with pitcher-side keys.
    - For each level and count, put per-count, per-outcome scalars on the zone table and pitch-kind effects (and the HS velocity table). The outcomes are swing, whiff given swing, foul given contact, called strike given take, and in play.
    - The scalars are set so that, under the **reference world**, the world reproduces the fitted count layer's rates exactly. The reference world is the real pitch mix by count plus the average-pitcher landing model (harness h3):
      - HS: the real HS mix from the HS data;
      - college and MLB: the reference mix the count layer is calibrated to.
    - The scalars are computed, not tuned. Store them in a table with a sha, wire them into both engines, and parity-test them.
    - Relative effects between zones, kinds and speeds are unchanged; only their per-count level is pinned to the data.
    - Pitcher-side keys then fit BB, HBP and command only.
    - **Gate:** under the reference world, each level's K / BB / HBP must land within 1 point of target. If one misses, stop and report.
    - Fix the K target definition so sacrifices, intentional walks and interference are counted the same way the chain counts them. That's the ~0.4-point college piece.
13. **Calling-edge limit.** In engine-called sims, K above target is the engine's calling edge.
    - Report it per level with SE.
    - Above **+1.5 points**, stop for Drew's review of the graded rows that drive it.
    - BB and HBP in engine-called sims must still land within 1 point. If they don't, report it.
14. **Fastball floor vs never-pick.** The never-pick window and every other safety or hitter rule outrank the HS fastball floor. The floor applies only among allowed pitches. In sims, apply it after shake-offs and coach overrides as well, so the thrown share meets it where it's allowed.
15. **HS keeps the floor.** It does not move to the real HS pitch mix.

## Tasks
1. Build rulings 12, 14 and the target fix, each as its own commit. Prove the reference world reproduces the count layer at every count, within sampling error.
2. Recalibrate, with pitcher-side keys fitting BB, HBP and command only. Check the gate from ruling 12.
3. Run engine-called sims (480 games per level, 900 at HS) for the calling edge (ruling 13), with BB and HBP.
4. Re-measure the zone trend extension and the edge called strike on this core. With per-count mean preservation they should mostly reshape calls, not shift K. Report them for Drew's ruling, which is still pending.
5. If the gates pass, run everything on hold:
   - 2025 scoring per level vs raw v1.2, with the pass verdict;
   - the candidate terms;
   - the hanger grid with H = 0;
   - the hard checks, fuzz 3000 and robustness;
   - 400-game sims with SE;
   - the three-way read-through;
   - the suite re-pin table, with `stage2 D5` open;
   - goldens and the full changed-call list, with HS separate and floor-driven moves marked;
   - `scripts/test-app.sh` and `scripts/test-sql.sh`.
6. Keep the Step 6 script locked.

## Report
Add a "Part 2 (Nov 24)" section to `docs/BUILD_v13_fulldata_REPORT.md`, short. It covers:
- the scalar table and proof that the reference world reproduces the count layer;
- the landing per level under the reference world;
- the calling edge per level;
- the floor after the never-pick fix;
- trend / edge for ruling;
- every task-5 item that ran.

Stop points for Drew:
- the trend / edge ruling;
- any calling edge over +1.5;
- any level failing the pass bar;
- the graded rows;
- the changed-call list;
- `stage2 D5`;
- the go for 2026.

Finish with a three-line summary.
