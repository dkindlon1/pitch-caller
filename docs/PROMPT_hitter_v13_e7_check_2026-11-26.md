# Prompt: E-7 cause check and rulings 34-35 (2026-11-26)

Branch feat/hitter-v13-final (worktree C:/dev/pc-final), tip f69c9b6. Same standing constraints as the prior prompts: nothing touches production; commit as Claude; never main; no force-push; no images; archives read-only; 2026 held out and the Step 6 script stays behind --drew-go; run things and capture output before calling them done; no re-pins applied.

## Drew's rulings (2026-11-26)
- 34. Floor fix accepted: HS ride126 2-2 (0.0 -> 2.9) is a named exception; HS engine-called runs +0.35 +/- 0.19 accepted, judged by the edge vs the reference staff (-1.64 -> -1.29, still passes).
- 35. Graded acceptable by Drew: #476, #246, E-6, E8 (read-through), case 42 (HS 0-1); E-1, E-5, E-6, E-8; E-2, E-3; E-4, E-4b; E-9. E-7 same side acceptable; E-7 opposite side (SL down-in 66%) pending the check below.
- The golden_v13core re-pin (p9/golden_v13coreFloor.json) is still NOT applied. It waits on Drew grading the W=32 changed-call list (24 picks, 10 top-call changes) too.

## Task
Diagnose only. Do not change engine code.
1. At HS 1-2, opposite-side hitter (E-7), print the full call menu with each call's share, the pre-floor share, and which rule or term produced the concentration on SL down-in 66%: engine cost/softmax, a hard rule (name it from DECISIONS ruling 16's list), the fastball floor, or the zone/take tables.
2. Run the same cell with the no-history top call and at n = 1..6 repeats; report the shares and how the top call moves.
3. State plainly: engine-made or hard-rule-made. If engine-made, say which term and propose (do not apply) the smallest change that spreads it, with the before/after menu, and list which other HS cells it would touch.
4. Add a short Part 10 to docs/BUILD_v13_fulldata_REPORT.md with the result; commit as Claude and push the feature branch. Stop there.
