# Prompt: pre-gate diagnosis and re-pin (supersedes the E-7 check prompt), 2026-11-26

Branch feat/hitter-v13-final (worktree C:/dev/pc-final), tip f69c9b6. Standing constraints as before: nothing touches production; commit as Claude; never main; no force-push; no images; archives read-only; 2026 held out and the Step 6 script stays behind --drew-go (do NOT run or unlock it); run things and capture output before calling them done; fixed seeds; use the desktop (workers about cores-2, about 48 GB guard).

## Drew's rulings (2026-11-26)
- 34. Floor fix accepted. HS ride126 2-2 (0.0 -> 2.9) is a named exception. HS engine-called runs +0.35 +/- 0.19 accepted, judged by the edge vs the reference staff (-1.64 -> -1.29, passes).
- 35. Graded acceptable: the floor changed calls (#476, #246, E-6, E8, case 42); E-1, E-2, E-3, E-4, E-4b, E-5, E-6, E-8, E-9; E-7 same side. E-7 opposite side is pending Task 1.
- 36. The whole W=32 changed-call list (24 picks, 10 top-call changes) is acceptable.
- 37. A strong hitter read (fastball-crusher) is NOT a hard rule: the floor wins. Ruling 16's hard list stands as written (coach bans, "mashed" damage rules, fatigue/injury limits, Drew's standing rules A1/A2/A3). Everything else is engine-made.
- 38. stage2 D5 (real learner off 2/40) is closed as accepted. Record it in DECISIONS; stop tracking it.
- 39. The 35 scenarios are the H13 hard-check rows. They pass. Only h13_29 moved from the floor fix (Curveball middle 27.16 -> 27.28, 0.12 points). Drew accepts them.
- 40. Before the 2026 go, these three must be diagnosed (Drew's call): the noise-chasing learner at 27/40 (needs 32), game_mix_e2e (4 of 21 games have a top pitch over 70%, limit 3), worlds_test (power biased at 400 PAs, 3.49 vs 1.5).

## Tasks (diagnose first; code changes only where stated)
1. E-7 opposite side (HS 1-2, SL down-in 66%): print the full menu with pre-floor shares and say which term or rule made the concentration: engine cost/softmax, a hard rule from ruling 16, the floor, or the zone/take tables. Also the no-history top call and n=1..6 repeats. If engine-made, propose (do not apply) the smallest spreading change with before/after menus and the other HS cells it touches.
2. Noise learner 27/40: find what moved it from 32 (the recalibrated core had 32). Bisect across the commits since, as you did for the 2-2 jump. Say which commit and why.
3. game_mix_e2e: list the 4 games over 70% and the pitch. Test the floor hypothesis directly (run with the floor fix and with the pre-floor engine). Say whether it is the HS fastball share or something else.
4. worlds_test power bias: say whether it is the estimator, the world generator, or the engine; give the 400 vs larger-PA numbers.
5. Re-point the D1 1-1 probe in tests_v13_tables to a rule-aware condition (like the ground-ball test) and the drift-note check that W=32 broke. Test-only changes.
6. Apply the golden re-pin: replace golden_v13core with C:/dev/pitchiq-data-final/p9/golden_v13coreFloor.json (the JS engine reproduces it), as its own commit with the old and new shas. Both changed-call lists are graded (rulings 35, 36).
7. Suites and fuzz once more at the end. Part 10 in docs/BUILD_v13_fulldata_REPORT.md with: each diagnosis's verdict (cause / not a problem / needs a fix, with the proposed fix and its blast radius), the re-pin, and a plain list of what still stands between this and the 2026 go. Commit as Claude, push the feature branch. Stop there. Do not apply any engine fix that Tasks 1 to 4 propose; Drew rules on those.
