# Prompt: E-7 fix, stage2 bar, worlds_test estimator (rulings 41-44), 2026-11-26

Branch feat/hitter-v13-final (worktree C:/dev/pc-final), tip b74abdb. Standing constraints as before: nothing touches production; commit as Claude; never main; no force-push; no images; archives read-only; 2026 held out and the Step 6 script stays behind --drew-go (do NOT run or unlock it); run things and capture output before calling them done; fixed seeds; use the desktop (workers about cores-2, about 48 GB guard). Anything Claude grades is marked proposed; Drew grades rows.

## Drew's rulings (2026-11-26)
- 41. Apply the E-7 fix: scale the `plus_opp` coaching credit by RHO_L (0.6) at HS and travel, as the other MLB-sized coaching terms are. College, MLB and same-side cells stay untouched.
- 42. Noise-chasing learner (stage2): accept about 72% catch rate; lower the test bar from 80% to 70%. Record it in DECISIONS as a known limit, with the 200-season numbers (70.5% old, 73.0% now). Test change only; no engine change.
- 43. worlds_test power bias: apply the test-only estimator fix (normalize the row, as the generator does). Expect about 1.54 at 400 PAs and 1.52 at 6400.
- 44. The other failing suites stay documented as history; no re-pins for them.

## Tasks
1. E-7 fix in engine.py, app/engine.js, web/lib/engine.js (same operations, same order); rebuild app/dist; Python/JS parity (0 mismatches).
2. Robustness grid before and after: every cell outside the 30 + 30 opposite-side cells identical; the HS 3-2 and 2-2 cells still under 10 (known exceptions: ride126 2-2, the 11 cells over 10); no cell worse by more than 2 points without being listed.
3. HS sims (900 engine-called + 900 reference staff, same seeds as Part 9): engine minus reference runs, K and BB gaps vs Part 9. Stop line: the same as Part 9 (report if any is crossed; do not push past it).
4. Changed calls for the proposed new golden (HS and travel opposite side): list picks changed, top calls changed, E-7 before/after, and which of the 6 HS rows, HG-1 to HG-4, E rows and read-through rows move. Write the proposed re-pin to p10/golden_v13coreE7.json; do NOT apply it (Drew grades the changed calls first).
5. Tests: lower the stage2 noise-learner bar to 70% with a comment citing the 200-season result; apply the worlds_test estimator normalization (test-side only; check the estimator is not shared with production code first, and say so if it is).
6. Floor table check (no HS/travel default cell below the floor), fuzz 3000, suites. Compare to Part 10: no new failures except what Tasks 1 and 5 change.
7. Part 11 in docs/BUILD_v13_fulldata_REPORT.md: the E-7 menu before/after, the blast radius, sims, the changed-call list, the proposed re-pin, and a plain list of what stands between this and the 2026 go. Record rulings 41-44 in DECISIONS. Commit as Claude (fix, tests, report as separate commits), push the feature branch. Stop there; Step 6 stays locked.
