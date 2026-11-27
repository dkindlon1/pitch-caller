# PitchIQ V1.3 final audit — shared brief for every agent

## What V1.3 is
PitchIQ is a pitch-calling engine for baseball coaches (HS, travel, college D1/D2/D3). Each pitch it outputs a sign + one of
six targets, drawn at random from a mix weighted toward the calls that give up the fewest expected runs (mixed strategy so
hitters can't sit on a pitch). Python reference engine `engine.py`; JavaScript twin `app/engine.js` (copied to
`web/lib/engine.js`) that runs in the iPad game app (`app/dist/pitch-caller.html`) and the Next.js site/portal (`web/`).

V1.3 = the hitter-model revamp: a new count layer, zone table, run values and per-level models (HS/travel, D1, D2, D3, MLB)
fit on ~238k college + ~21.7k HS games (data lives on the owner's desktop, NOT in this repo — you cannot re-run fits).
Branch `feat/hitter-v13-final`, tip c602f1c. The held-out 2026 test ("Step 6") was run ONCE today and passed at all four
levels on pitch-level log loss vs raw v1.2 (D1 −0.032, D2 −0.028, D3 −0.032, HS −0.008 nats/pitch). It can never be re-run.
`main` is still v1.2.3 + v1.4 features (live in production). Deployment = merging V1.3 to main and promoting app + web.

Build log (read the parts relevant to you, not all 1,951 lines): `docs/BUILD_v13_fulldata_REPORT.md` (Part 12 = readiness page,
line ~1785; Step 6 at the end). Rulings/decisions: `docs/DECISIONS_refit_v13.md`. Other v1.3 docs: `docs/*v13*`.
Owner's baseball decisions over time (authoritative for what the engine SHOULD do): `/home/claude/audit/OWNER_DECISIONS.md`.

## Already known (verified by the lead from GitHub Actions on c602f1c — don't re-discover, build on it)
- CI fails 3 of 4 jobs on this branch (main passes):
  - `web` unit tests + `web-shell` build: `web/lib/engine.js` init crashes `Cannot read properties of undefined (reading 'levels')`
    because `web/lib/engine_data_d3.json` and `web/lib/engine_data.json` are stale (no `TABLES.count/zone/mp`). The lead is fixing
    this (regenerating with `scripts/trim-engine-data.cjs` etc.). The build log never mentions it.
  - `engine-and-app`: `tests.py` 38/45. Failing: v1.0 grid D1 3-1 top-pitch 50–80% (4/9), hitter's-count floor ≥50% (lowest 37%),
    D1 3-1 slider landing row (HS slider 22→24% only), LAND_GAIN 1.8 vs fit 2.02, Step 7 coaching reads ("squared up" 25→10%,
    "hot" 25→39%: under the 20-pt bar), realism K, exact-v1.0. 15 suites total are failing and were declared "history"
    (ruling 44) instead of being updated.

## Machine limits — IMPORTANT
Shared box: 2 cores, 7 GB RAM, nine agents at once. Never run the whole suite (`scripts/test-app.sh`, `matrix/run.sh`,
`fuzz.py 3000`, big sims). Keep any single command under ~8 minutes; prefer small targeted scripts, small sample counts with fixed
seeds, `nice -n 10`. Python deps (numpy, scipy) and `npm ci` at the repo root are installed. `web/` node_modules are NOT installed.

## Rules
- The main checkout `/home/claude/pitch-caller` (branch `audit/v13-final-audit`) is the lead's — do NOT edit or commit there.
  Read it freely. For experiments that edit code, make your own worktree:
  `git -C /home/claude/pitch-caller worktree add /home/claude/audit/wt-<you> -b audit/wt-<you>` and work there.
- Do not push, do not touch Supabase/production, do not commit to main. No network scraping.
- Any change that moves engine call mixes or fitted numbers invalidates the one-shot 2026 holdout and the owner's graded rows:
  PROPOSE those, with evidence, but do not present them as safe. Safe-to-apply = bug fixes that don't change calls, or that
  restore an intended, documented behavior the code fails to deliver (show it).
- Evidence over assertion: every finding needs the command you ran and the output (or file:line). If you couldn't verify
  something, say so plainly. "Documented" or "previously tested" is not evidence that it works.
- Ignore cosmetics. Rank by real impact on a coach calling a real game, or on deploy safety.

## Deliverable
Write `/home/claude/audit/<your-role>.md` (≤ ~250 lines):
1. Verdict for your discipline: one line + grade (A–F) against an elite standard.
2. Findings table: ID, severity (BLOCKER / MAJOR / MINOR), title, evidence (command + key output or file:line), impact,
   proposed fix, fix class (SAFE-NOW / CHANGES-CALLS / NEEDS-DATA / NEEDS-OWNER-RULING).
3. Scenarios/tests you ran and their results.
4. What you could not verify and why.
Your final message back to the lead: the path to your file plus your top 5 findings in ≤ 15 lines.
