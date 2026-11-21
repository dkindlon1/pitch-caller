# Hitter model v1.3: work that can start before the college data is finished (Nov 21, 2026)

Tell Claude Code: "Read docs/PROMPT_hitter_v13_prework_2026-11-21.md and carry it out."

Read first: `docs/PLAN_hitter_model_revamp_2026-11-18.md` (the plan; section numbers below refer to it) and
`docs/RESEARCH_hitter_data_sources_2026-11-18.md`. Copy both into `docs/` from the project if they aren't there.

---

## Rules
- **Same rules as before:**
  - local Supabase only;
  - never `main`, never production, never deploy, never force-push;
  - commit as Claude (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit ...`);
  - push only feature branches;
  - nothing called done unless it was run and the output read;
  - no screenshots or images committed;
  - local scripts read Supabase settings from the running Docker containers, not the CLI.
- **Data stays out of git.** Raw and derived data (college archive, Statcast, MLB API, Retrosheet) live under a
  gitignored data folder (e.g. `C:\dev\pitchiq-data`). Test fixtures are short and synthetic.
- **The college archive is read-only.** ChatGPT is still adding games; never write to it. Ingest copies from it.
- **2026 is the held-out season.** It may be parsed and counted, but no fit, tuning or scoring may use it. Build a
  guard (e.g. `assert_not_heldout(season)`) that the fit and scoring code paths call, plus a test that it trips.
- **No behavior ships.** Engine changes stay on this branch and are reported. The plan's stop points (zone table
  approval, regrading changed calls) wait for Drew.
- **Branch:** if builds 1–4 (`feat/logging-reports` … `feat/watch-security`) are merged to `main`, branch from `main`.
  If not, branch from the top of that stack (`feat/watch-security`) and say so in the report. Name it
  `feat/hitter-v13-prework`.
- **Work in parallel where parts don't depend on each other.** Long pulls run resumable in the background.

## Part 0: start line
1. Run `scripts/test-app.sh` and `scripts/test-sql.sh` on the branch point; record the results.
2. **Inventory (plan section 4):** find every shipped number that came from Statcast, the MLB Stats API or MLB-only
   fits. That includes the approach coefficient, `STUFF_CHASE`, `fit_v08.json` terms, the landing-today settings, the
   HBP-by-crossing curve, profile priors / medians / thresholds, MLB targets, MLB command carried by `fit_all.py`,
   platoon sizes, and anything else found.
   - Write `docs/HITTER_V13_INVENTORY.md`: name, file:line (both engines), current value, the script and data that
     produced it, and which levels it affects.
   - Flag anything in plan section 4 that isn't in the code, and anything in the code the plan missed.

## Part 1: college archive intake and parser (plan Step 1; the biggest risk, start first)
1. **Find the archive.** Ask Drew for the path if it isn't obvious, and report its format (SQLite, CSV, other) and
   schema.
2. **Incremental ingest (`hitter_data/`):**
   - one command (e.g. `python -m hitter_data.update`) copies new games from the archive, dedupes by game (each game
     can appear on both schools' sites; when copies disagree, keep both flagged), parses them, and refreshes the
     coverage report;
   - safe to re-run any time as ChatGPT adds games; already-parsed games are skipped unless their source text changed.
3. **Parser, from the play text:**
   - **Pitch strings:** letters per pitch.
     - Letter check: the last letter on "struck out looking" vs "struck out swinging" (expected K vs S).
     - Count replay: the string must reach the final count shown.
     - A table of every letter seen.
   - **Plate-appearance result:** strikeout looking / swinging, walk, HBP, hit type and bases, outs by type, sacrifice,
     error, fielder's choice, catcher's interference.
   - **Ball in play:** type (grounder / liner / fly / pop / bunt) and direction (pull / center / oppo once handedness is
     joined), from the text ("to ss", "down the lf line", "to right center").
   - **Game state:** outs, bases and score before every plate appearance, rebuilt from the text, including steals,
     caught stealing, wild pitches, passed balls, balks, pickoffs, errors and runner advances. Also runs scored in the
     rest of the inning.
   - **People:** batter, pitcher of record (from substitution lines), lineup slot, and bats / throws joined from
     rosters.
4. **Quality checks** (report per level × season):
   - share of lines parsed;
   - half-innings that end with exactly 3 outs (walk-offs and shortened games listed separately);
   - runs per inning that match the box-score line score where the archive has it;
   - count-replay consistency; the letter check; roster match rate.
   - List the 20 most common unparsed line patterns so the parser can be extended.
5. **Coverage table:** the same definitions as `docs/PROMPT_chatgpt_archive_checkpoint_2026-11-21.md` (full / partial /
   none games per level × season), computed by our code, not taken from ChatGPT's numbers.
6. **Tests:** synthetic fixture lines for every pattern handled, including tricky ones (multiple runners on one play,
   errors on throws, substitutions mid-inning, pitch strings interrupted by a steal).

## Part 2: MLB and minor-league data, zone seed, shared refits (plan Step 2; doesn't need the college data)
1. **Pulls** (resumable, polite pacing, every season available):
   - MLB Statcast;
   - MiLB Statcast (Triple-A, Single-A parks);
   - MLB Stats API pitch-by-pitch for every minor-league level it covers;
   - Retrosheet event files.
   - Report rows per level × season, and which levels carry location.
2. **Zone seed (plan 3.2):** fit zone band × pitch class (and profile where it matters) × count group effects on swing,
   chase, whiff, contact quality and ball type, relative to each count's average.
   - Fit on Single-A, Triple-A and MLB separately.
   - Recency weights halve every 2 seasons back.
   - Each level's latest season is held out for the seed's own check.
3. **Transfer check:** is the shape stable from Single-A to Triple-A to MLB, or does it trend with level? Report both
   with uncertainty.
4. **Draft the zone table:** write `docs/ZONE_TABLE_DRAFT_v13.md` with about 20–30 plain statements, each with its
   fitted size, uncertainty and v1.2's current value beside it, in coach language (e.g. "hung off-speed over the heart
   with two strikes is hit hard ×N as often as a fastball there"). **Stop point: Drew approves; don't wire it into the
   engine.**
5. **Shared refits (plan section 4):** refit each inventory number on all seasons (MLB + MiLB, recent weighted).
   - Apply them on the branch in **one separate commit**.
   - Re-run the rule checks: better stuff never a worse call (fuzz), get-it-over loses about half, the 2-for-10 rule,
     and the hard rules.
   - Regenerate goldens and write the changed-call list, with HS separate.
   - **Stop point: Drew regrades moved rows.**

## Part 3: D2 plumbing (plan 3.5)
1. Add `college_d2` everywhere a level is listed, in both engines:
   - run tables, outcome params, spread params, win-expectancy tables, `RHO_L`, landing defaults, validation;
   - the app and portal level pickers, labels, simulator `LEVEL=college_d2`, the matrix, and tests.
2. **Placeholder numbers:** D2 uses D3's numbers, marked `PLACEHOLDER_D2` in code and data. Add a release-guard test
   that fails while any placeholder remains, so D2 can't ship on D3's numbers.
3. **Database:** check Supabase for any level enum or check constraint. If one exists, write the migration and test it
   on local only.
4. **Proof:** Python = JS parity with D2 cases; existing goldens unchanged for every other level (bitwise); a D2 game
   runs end to end in the app (e2e).

## Part 4: scoring harness (plan 5.1)
1. One harness scores any engine version on real games:
   - log loss per pitch event (take-ball, take-strike, whiff, foul, in play) by count;
   - ball-in-play type;
   - plate-appearance outcomes;
   - runs in the rest of the inning.
   - Bootstrap by game.
   - The same pitch-mix and landing assumptions for every engine version, documented in the code and the report.
2. Write the design in `docs/HARNESS_v13.md`. Have a **fresh-context reviewer** (a subagent that hasn't seen your work)
   check it for yardstick problems before any scoring, and record its findings and your fixes.
3. Score v1.2 on every season up to 2025 that has enough coverage, per level. This is the baseline; 2026 is never
   scored.

## Part 5: simulator hitters (plan 3.4, Step 5 scaffolding)
1. Hidden hitter traits in `simulate.py`: early-count aggressiveness, two-strike approach, contact, power, spray. Add
   the six presets: aggressive early, patient, power, contact, free swinger, two-strike battler. Placeholder sizes are
   labeled until the fits exist.
2. A hitter world in `app/worlds.js` with checks that a hitter's traits are recovered from realistic at-bat counts and
   that an average hitter isn't moved.
3. With no traits set, everything stays bitwise identical (tests).

## Part 6: draft scenario rows
Write `docs/SCENARIOS_v13_DRAFT.md`: about 35 rows following the plan's split (traits and presets 6, two-strike 5,
adaptation and in-at-bat 5, unknown hitters by slot / team 4, platoon 3, situation 4, no-scouting spot checks 3, D2 5).
- Each row gives the situation, the call being judged and a **proposed** grade.
- Drew grades them later. Don't freeze a scenario file.

## Report
Write `docs/BUILD_v13_prework_REPORT.md`, kept short: per part, what was done, the command run and the captured result.
List:
- the stop points waiting for Drew (archive path if needed, zone table approval, regrading the refit's changed calls);
- what still needs the finished college data (count-layer fits, run values, level-split check, trait fits, prefill,
  final held-out test);
- the exact command to refresh ingest and coverage as more games arrive.

Finish with a three-line summary.
