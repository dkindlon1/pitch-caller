# Prompt: HS pitch-kind × velocity refit + hanger from data, validated on pre-2026 seasons (2026-11-27)

Run in Claude Code on the desktop (64 GB). Paste everything below the line.

---

Branch: create `feat/v13-hs-hanger-cv` from `origin/audit/v13-final-audit` (tip c518467 or later) in a new worktree
`C:/dev/pc-cv`. Set `PITCHIQ_DATA=C:/dev/pitchiq-data-final`.

## Standing constraints
- Nothing touches production. Commit as Claude (`git -c user.name=Claude -c user.email=noreply@anthropic.com`). Never
  main. No force-push. No images in git. Archives are read-only. Data stays out of git.
- **2026 is spent.** Do NOT read, load, score or look at any 2026 data, do NOT unlock `--drew-go`, do NOT run Step 6. All
  validation uses seasons through 2025.
- Run everything and capture output before calling anything done. Fixed seeds. Use the desktop: independent fits and
  bootstraps in parallel across about cores − 2 workers with a ~48 GB memory guard, and seeds fixed so results match a
  serial run.
- The call-policy changes already on the branch (Drew's Nov 27 rulings: shake-off, hot cap, hitter's-count floor, resized
  reads and setups) stay as they are. Read-through suite v12 is **96/98** on the branch: it must not drop.

## Why (from the V1.3 audit, docs/AUDIT_v13_final_2026-11-27.md)
1. **HS pitch-kind × velocity table counts pitch class twice.**
   - `hitter_data/fit_count_hs.py: pitch_table` fits the kind/velo terms on top of the count-only `hs_sep` base. That base
     has no pitch-kind or location terms.
   - The engine then applies the table on top of the zone table's pitch-class terms.
   - Result: HS 0-2 slider/fastball whiff ratio is 1.82 in the engine vs 1.46 in the data. This is the main driver of HS K%
     26 vs 21 real. Ruling 4's +0.0123 gain was measured on the other base.
2. **The hanger is off** (`zone_v13.json` `class.hanger_gate` = 0, `hanger_hard` flat term).
   - An HS curve 2-for-9 today is thrown middle at 0-2 (HG-2: 7–8% middle at every H on the grid).
   - Every graded hanger row (A5, B7, E2, C7, D3, B8, E8, controls E1/E3/A4) now passes at any H, so H can't be sized on
     rows. Fit it from data.

## Tasks

### A. HS kind × velocity, refit on the engine's real base
1. Change `pitch_table` (or add `pitch_table_engine_base`) so the kind / velo_rel / velo_abs multipliers are fit as
   residuals on top of the probabilities the engine actually produces before `pitch_velo`: the HS count table **plus the
   zone table's class and location terms** for each pitch, through the harness adapter. Same sequential stack, same
   shrinkage (`TERM_ALPHA`).
2. Validation, all with seasons through 2025, using harness `pitch_5way` log loss (nats per pitch) with season- and
   game-clustered bootstrap SE (B = 1000, fixed seed):
   - **Primary:** fit on seasons ≤ 2024, score 2025.
   - **Robustness:** leave-one-season-out over every HS season ≤ 2025.
   - Compare three versions: (i) the shipped table (double count), (ii) no table, (iii) the refit.
3. Also report:
   - HS 0-2 slider/fastball whiff ratio vs the data's 1.46, and slider whiff per swing at two strikes.
   - Sim HS K%, BB%, HBP vs real (21.0 K).
   - The tests.py HS realism row.
4. **Ship rule:**
   - The refit replaces the shipped table only if it beats the shipped table on 2025 by more than 2 SE and doesn't lose
     on the leave-one-season-out average.
   - Otherwise ship no table if (ii) beats (i) by more than 2 SE.
   - Otherwise stop and report for Drew.

### B. Hanger gate H from data
1. Estimate the extra hard-contact logit for **off-speed in the heart when that pitch isn't landing today**. Use the
   engine's own `wild_today` definition: the pitcher's in-game strike record on that pitch vs his normal, computed from
   earlier pitches in the same game only.
   - Fit on HS and college pitches ≤ 2024. Score 2025, same harness and SE as A.
   - Report by level. If the levels disagree by more than 2 SE, report per level and ask.
2. **Ship rule:** `class.hanger_gate` = the fitted H (in `data_tables/zone_v13.json`, both engines read it) only if:
   - the held-out gain is more than 2 SE, **and**
   - `python3 readthrough/scenarios.py --suite v12` stays 96/98 with the same two fails (D6, P7), **and**
   - `readthrough/hanger_gate_size.py` at that H passes every gated and control row.
   - Report the HG rows (proposed) without gating on them.
   - If H fails any rule, keep H = 0 and report.

### C. After A and B
1. Re-make `golden/golden_v13core.json` (`python3 golden/golden_v11.py make --tag v13core --force`). JS must PASS
   (`node golden/golden_v11.js v13core`). Then `python3 golden/fast.py 40` (0 mismatches).
2. Rebuild `app/dist`, copy `app/engine.js` and `app/engine_data.json` to `web/lib`, re-run
   `web/scripts/trim-engine-data.cjs`. Run `python3 app/export_data.py --check`.
3. Run and report:
   - tests.py (42/45 now; HS realism should improve)
   - read-through v12 (96/98)
   - tests_v13_core, tests_v13_tables
   - game_mix_e2e (≤ 3 of 21 games over 70%)
   - rules_e2e, v121_shake_e2e, smoke
   - web `npm test`, `npm run typecheck`, `npm run build`
4. Update the frozen-file hashes on the readiness page if any shipped table changed.
   - State plainly: the Step 6 2026 result was scored on c602f1c's outcome tables. Anything A or B changes in the
     outcome model is validated only by the 2025 / leave-one-season-out evidence above.
5. Write `docs/REPORT_hs_hanger_cv_2026-11-27.md` (short). For A and B: the numbers, the ship rule outcome, and what
   changed. Commit code and report separately. Push the feature branch. Stop there.
