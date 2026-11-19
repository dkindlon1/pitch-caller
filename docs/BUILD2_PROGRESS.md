# Build 2: opponent database (pages and data) — progress

Branch `feat/opponent-db` (from `feat/logging-reports`), worktree `C:/dev/pc-b2`. Spec: `docs/PLAN_opponent_database_2026-11-18.md`
sections 3, 4, 6, 7. Section 5 (engine mapping) is NOT built and no engine file changes (the hitter model revamp runs in
parallel). Local Supabase only. Read this file and `git log` after any context reset.

## Steps
| # | Step | State |
|---|---|---|
| 1 | Schema check (hitter docs, tags, write rules) | done: see Readings |
| 2 | Model + suggestions modules, tests | done: `web/lib/opp_model.ts`, `opp_suggest.ts`, `opp_suggest.test.ts` 14/14 |
| 3 | Migration + permissions test | done: `20261119000000_opponent_db.sql`, `opp_rls_test.js` 26/26 |
| 4 | Calls identical with every new field set | done: `app/opponent_exact_test.js` 12/12, 449 pitches |
| 5 | Hitter page, team page, custom fields page, merge, suggestions UI | |
| 6 | Suggestions job after games; importer columns | |
| 7 | Two-season proof (attach, merge, thresholds) + e2e | |
| 8 | Visual loop | |
| 9 | Full checks, report | |

## Readings (taken without asking)
1. **New fields live beside the engine's, never in them.** The engine reads a hitter's `grades` (c/w/d), `crowd`, and the
   `scoutTags` approach / path / off-speed only (`TAG_ROWS` filters every other key). The new 1/2/3 ratings are a separate
   `ratings` field; spray is `scoutTags.spray`, which the engine ignores (the spray effect was dropped on Nov 13). So
   none of this build's fields can move a call; `opponent_exact_test` proves it.
2. **Zone grid** = the game screen's 5x5 location grid in the catcher's view (inner 3x3 the zone, the ring the chase
   spots), stored `{"r,c": "hot"|"cold"}`, neutral absent. Same grid as build 1's heat maps, so suggestions read landing cells directly.
3. **Unknown** is stored as `"unknown"`; a rating never set also shows "Unknown".
4. **Owner editing:** the existing rules let only staff with "manage opponents" or "manage roster" write team data, and an
   owner who isn't on the staff sees none of it. Changing that is outside this build: the owner sets up custom fields
   (org level) and edits opponents once on the staff. Proposal in the report.
5. **Merge** = the kept hitter gets the duplicate's id in `aliases`, the duplicate gets `mergedInto` and is soft-deleted
   (iPads drop it); events are never rewritten, history and suggestions follow the aliases; logged in `opp_merges`.
6. **Lineup history** comes from the pitch events (slot and hitter of each at-bat), which every coach can read, not from
   the game plan (readable only by coaches who see plans).
