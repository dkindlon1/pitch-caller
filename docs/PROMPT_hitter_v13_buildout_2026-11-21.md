# Hitter v1.3: build everything that doesn't need the finished data (Nov 21, 2026)

Tell Claude Code (after `PROMPT_hitter_v13_next_2026-11-21.md` is done): "Read docs/PROMPT_hitter_v13_buildout_2026-11-21.md and carry it out."

Read first: `docs/PLAN_hitter_model_revamp_2026-11-18.md` (especially sections 3 and 11) and
`docs/BUILD_v13_prework_REPORT.md`. Same rules as the prework prompt:
- local only; never `main`; nothing ships;
- commit as Claude; push feature branches only;
- nothing called done unless it was run and the output read;
- 2026 held out (parsed and counted, never fit or scored);
- archives read-only; data outside git.

Work on `feat/hitter-v13-prework` (or a branch stacked on it).

**The idea:** the college and HS scrapes are still running, but the machinery doesn't need them finished.
- Build every fit and engine path now and run it on the data already in.
- Then one command refits everything when the scrapes finish.
- Numbers produced now are **provisional** and labeled so. Nothing is graded or approved on them.

## Part 1: HS / travel archive (Perfect Game) intake
1. Find the HS archive (ask Drew for the path if it isn't obvious); report its format and schema.
2. Extend the incremental ingest: `python -m hitter_data.update` also picks up new HS games.
3. Build a parser for its format:
   - per pitch: result, count, pitch type, velocity;
   - game state (outs, bases, score, runs rest of inning), batter, pitcher, lineup slot, handedness if present;
   - event and format fields: event name, pool vs bracket, game length or time limit, pitch limits.
   - **No bat-type field is used** (Drew: wood and BBCOR are treated the same).
4. Run the same quality checks as college (3-out half-innings, runs match the line score, count replay, roster or
   handedness match, top unparsed patterns) and a coverage table by season.
5. Add synthetic fixture tests.

## Part 2: engine plumbing that reads tables (no behavior change)
1. **Zone table path:** the engine (both engines) reads zone effects from a versioned data file. Ship the file with
   **v1.2-equivalent values**, so goldens stay bitwise identical. Later, approving the zone table is just a new data
   file plus a golden diff.
2. **Count layer path:** per-level count tables in a data file (swing, called strike, whiff, foul, ball type and
   outcome by count / base-out), with v1.2-equivalent values. Bitwise identical.
3. **Run values path:** per-level run tables from a data file (already partly true); D2 placeholders keep the release
   guard.
4. **Proof:** goldens bitwise identical (Python and JS), `fast.py 40` 0 mismatches, parity, `test-app.sh` exit 0.

## Part 3: the fits, built and run provisionally (plan 3.1–3.4)
Run every fit on the data in hand: D1 is fit-eligible today; D2 and D3 run where there's data and are labeled thin;
HS / travel from Part 1. Each fit writes a candidate data file for Part 2's paths, plus a report table. Nothing is wired
as the default.
1. **Count layer (3.1):**
   - per level, with recency weights (half-life tuned on 2025) and borrowing between neighboring levels (share printed);
   - the level-split check (separate patterns vs shared + offset, scored on 2025);
   - the hard-contact proxy, checked against Single-A;
   - platoon where handedness exists (report the match rate);
   - **HS / travel extra:** splits by pitch class and pitch kind, and velocity effects on swing / whiff / contact, from
     the per-pitch velocity and type.
2. **Run values (3.1):** count × base-out per level; compared with today's tables on 2025 (runs in the rest of the
   inning).
3. **Situation effects (3.3):** times through the order as a smooth curve (no third-time jump), runners in scoring
   position, late and close, and after a whiff / foul / take. For each: the 2025 validation gain and whether it clears
   the bar.
4. **Traits (3.4):**
   - per-hitter early-count aggressiveness, two-strike approach, contact, power and spray, with split-half reliability;
   - lineup-slot × team-strength priors;
   - the six presets sized from real hitters in each group;
   - prefill files per hitter.
5. **Score candidates on 2025** with the Part 4 harness from the prework, vs v1.2 and the per-count baseline, per level.
   The report states clearly that 2026 was not touched and that numbers will move as data lands.

## Part 4: one refresh command
`python -m hitter_data.refit_all`, re-runnable any time:
- ingest new games;
- refresh coverage and the representativeness check;
- rerun every Part 3 fit;
- rescore on 2025;
- regenerate the zone draft if new Statcast landed;
- write one summary table.

When the scrapes finish, this is the only command needed before Drew's review.

## Part 5: quality-gated hanger (after Drew approves the design in `docs/DECISIONS_refit_v13.md`)
If Drew has approved the design, implement it on the branch: the extra penalty applies only when that off-speed pitch is
below his normal today. Add the graded-row stubs that will size it. If he hasn't approved it, skip this part and say so.

## Report
Write `docs/BUILD_v13_buildout_REPORT.md`, short:
- per part, what was run and the captured result;
- the provisional fit and score tables, labeled provisional;
- what's waiting on Drew;
- the refresh command.

Finish with a three-line summary.
