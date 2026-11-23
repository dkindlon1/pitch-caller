# Hitter v1.3: full data, all levels — everything up to the final test (Nov 22, 2026)

Tell Claude Code: "Read docs/PROMPT_hitter_v13_fulldata_2026-11-22.md and carry it out."

This one prompt covers everything left before the 2026 held-out test:
- it finishes `PROMPT_hitter_v13_apply_2026-11-21.md`;
- it brings in the full college and HS / travel archives;
- it runs the full refit across D1, D2, D3 and HS / travel;
- it assembles and scores the v1.3 core.

Background:
- the plan's sections 11–13;
- `docs/DECISIONS_refit_v13.md`;
- `docs/RESEARCH_hs_data_analysis_2026-11-22.md` and `docs/RESEARCH_college_data_analysis_2026-11-22.md`. These are independent cross-checks run by Claude in claude.ai, not repo outputs.

## Standing rules
- Work locally only. Never use `main`, never force-push, and push feature branches only. Nothing ships.
- Commit as Claude: `git -c user.name=Claude -c user.email=noreply@anthropic.com`.
- **2026 is held out.** Nothing fits, tunes or scores on it, and every fit passes `hitter_data.assert_not_heldout`. Prepare the Step 6 run, but don't execute it.
- Archives are read-only (`mode=ro`). Data stays outside git, in `C:/dev/pitchiq-data`.
- Don't call anything done unless it was run and the output read. Report what didn't run, and why.
- Anything you grade is marked **proposed**. Drew grades.
- **Memory:** run heavy jobs one at a time. No fit runs alongside a suite. If memory gets tight, stop that step, report it and move on to the next step that doesn't depend on it.

## Drew's rulings (Nov 22). Record them in `docs/DECISIONS_refit_v13.md` as decided.
1. **Coverage rule: the 50% full-game share rule is dropped.**
   - D2 and D3 get fitted count layers using `borrow` (and `shared` + offset in the level-split check).
   - Their full games must pass the full-vs-rest check: K, BB and HBP per PA within 1 point of the level's other games. This threshold is the plan's default. Report game-clustered SEs.
   - The pass bar decides. A level that doesn't beat raw v1.2 by more than 2 SE on 2025 keeps v1.2's count numbers, labelled as such.
2. **Data copy:** for each archive, use whichever copy holds more games, opened read-only. The candidates are the live ChatGPT archive the pipeline already reads and the packaged snapshot below. Record the copy used and its counts.
   - College snapshot: `C:\Users\kindl\Downloads\college-baseball-data\archive.sqlite3`.
     - Packaged 2026-11-22 12:33 ET: 119,021 games, 11,460,098 plays, 3,458,236 lineup rows, 323,029 roster rows.
     - Its `derived/` folder holds Claude's cross-check extraction. It is not a source. Ignore it, and ignore `derived/_to_delete/`.
   - HS / travel: the live DiamondKast archive vs any packaged `DiamondKast_2022-2026.zip` on the PC.
     - Search Downloads; if you find no zip, use the live archive.
     - The zip Drew shared holds 21,707 games and 4,775,528 pitch rows.
3. The rulings from `PROMPT_hitter_v13_apply` (pass bar, zone table, hanger gate, HS kind × velocity, ride-up 0.003, R1 / S5, HARD_SD, harness landing, MLB run-value scale, simulator split, HS changed calls) all stand.
   - Ruling 10 now takes effect: once college run values are fit on this data, college levels take no scale from MLB.

## Tasks

### A. Finish the apply prompt first
If `docs/BUILD_v13_core_REPORT.md` doesn't exist, carry out `PROMPT_hitter_v13_apply_2026-11-21.md` tasks A–D, with two exceptions:
- skip its task E (coverage), which is superseded by ruling 1;
- skip "D2 / D3 keep v1.2's count numbers", which is superseded by ruling 1.

If that report exists, read it and pick up from its stop points.

### B. Intake (branch `feat/hitter-v13-fulldata`, stacked on `feat/hitter-v13-core`)
1. Pick each archive copy (ruling 2). Run `python -m hitter_data.update` for college and HS, then the quality, coverage and dupes reports.
2. **Cross-check against Claude's independent numbers.** These come from a simpler parser, so expect small gaps. Explain any gap bigger than the tolerance shown.

   | Check | Claude's number | Tolerance |
   |---|---|---|
   | Count replay consistent | 98.5% of strings | 1 pt |
   | Full-game share 2025, D1 / D2 / D3 | 0.657 / 0.295 / 0.101 | 0.03 |
   | Full games 2025, D1 / D2 / D3 | 6,226 / 1,880 / 689 | 5% |
   | PA rates 2025, D1 | K 19.3, BB 11.4, HBP 3.5 | 0.5 pt |
   | PA rates 2025, D2 | K 17.3, BB 11.2, HBP 3.7 | 0.5 pt |
   | PA rates 2025, D3 | K 16.4, BB 11.1, HBP 4.1 | 0.5 pt |
   | Whiff per swing (full games, fit seasons), D1 / D2 / D3 | 22.4 / 21.6 / 20.1% | 0.5 pt |
   | HS 2022–25 PA rates | K 20.33, BB 14.54, HBP 3.55 | 0.3 pt |
   | HS 2022–25 per-pitch rates | swing 40.7, whiff per swing 24.6 | 0.3 pt |
   | HS count replay vs scorecard count | 99.6% | 0.3 pt |

   The full-game definition used: at least 90% of PAs have a consistent string, and a first-pitch "(0-0)" ball in play counts.
3. Run the representativeness check per level (`python -m hitter_data.represent`) and apply ruling 1's test. Claude's numbers:
   - D1 full games: K +0.82 ± 0.14.
   - D2 full games: BB −0.65 ± 0.14.
   - D3: all gaps within 2 SE.
   - Every gap is under 1 point, so all three should pass. Report the repo's own numbers.

### C. Full refit, all levels (`python -m hitter_data.refit_all`)
On seasons through 2024 for tuning, with 2025 as validation. Then the "ship" refit through 2025:
1. **Count layers** for D1, D2, D3 and HS / travel, in the variants `sep`, `borrow` and `shared`.
   - Run the level-split check per level.
   - Tune the recency half-life on 2025.
   - Report the borrowed share per level. D3 is thinnest (Claude counted about 217k fit pitches), so expect heavy borrowing from D2.
2. **Run values** per level from play-by-play, checked on 2025. Then apply ruling 10.
3. **HS / travel pitch kind × velocity table:** refit it on the full archive. Both engines, parity-tested.
4. **Traits and prefill:** refit and redo the prefill files. Recompute HARD_SD on the full data.
5. **Recalibrate:** run the pitcher-side `fit_all.py` so each level's K / BB / HBP land within 1 point of real.
   - Flag HBP in particular. HS data is 3.55% against the engine target of 4.1%. College runs D1 3.5%, D2 3.7%, D3 4.1% (2025).

### D. Candidate terms (each ships only with a >2 SE gain on 2025 plus Drew's graded rows)
For each term, report the gain, its SE, whether it clears 2 SE, and which graded rows its calls touch.
- **HS / travel:**
  - **times through the order**, as a smooth curve. Claude found K% 21.4 → 18.3 → 15.1 and H/PA .220 → .242 → .268 across 1st, 2nd and 3rd+ times.
  - **velocity vs his own norm**, i.e. today's fastball against his season average. Claude found whiff 19.8% at 3+ mph below vs 25.8% at 3+ mph above.
  - **event format** (the plan's default term).
- **College:**
  - **times through the order**, using pitcher tracking from the substitution lines ("X to p for Y").
- **All levels:** base-out, scoring position, late and close, in-at-bat and platoon, as the plan lists them.

### E. Core assembly with full data
Wire the full-data candidates into the branch's engine defaults (not `main`):
- the approved zone table;
- the hanger gate;
- the HS kind × velocity table;
- the count and run layers for D1, D2, D3 and HS / travel;
- each extra term that passed D.

Then:
1. Score raw v1.2, recalibrated v1.2 and the core on 2025, per level, with the pass verdict.
   - D2 is compared with the better of v1.2's D1 / D3 settings.
   - A level that fails keeps v1.2's count numbers and is labelled so.
2. Size H for the hanger gate on its rows plus HG-1 to HG-4, drafted as **proposed**.
3. Run the hard checks:
   - hard foul = foul;
   - better stuff never worse (fuzz 3000);
   - hit hard twice small;
   - no chase at 3-0 / 3-1;
   - no-scouting full games at every level;
   - the 10-point adaptation robustness check, including the core's 2-2 top-call move (the current engine moves it 18.6 points).
4. Report the 2-for-10 rule as a number, not a pass/fail.
5. Sims: paired-game runs per game per level vs v1.2. Flag anything over +0.25.
6. Regenerate the goldens and the full changed-call list vs v1.2.3, with HS separate. This is the "full regrade after the core" list.
7. Run `scripts/test-app.sh` and `scripts/test-sql.sh`, alone, and report the results.

### F. Prepare the final test, don't run it
Write the Step 6 script that scores the frozen core vs raw v1.2 on 2026, once, per level. Wire it so it refuses to run without `--drew-go`. Don't run it.

## Report
Write `docs/BUILD_v13_fulldata_REPORT.md`. Keep it short and cover every task with what was run and the result. Stop points for Drew:
- the full changed-call list;
- the arguable and flagged HS rows;
- HG-1 to HG-4;
- the 35 draft scenarios;
- any term that cleared 2 SE but changes graded calls;
- any level that failed the pass bar;
- the go for the 2026 test.

Finish with a three-line summary.
