# Build 2: opponent database (pages and data): report

Branch `feat/opponent-db` (from `feat/logging-reports`), pushed. Spec: `docs/PLAN_opponent_database_2026-11-18.md`
sections 3, 4, 6, 7. **Section 5's engine mapping is not built and no engine file changed**: the hitter model revamp runs
in parallel. Local Supabase only; nothing on `main`, nothing deployed, no production migration. Working notes:
`docs/BUILD2_PROGRESS.md`.

## What was built
- **Hitter page** (`/app/t/<team>/opponents/<opp>/hitters/<hitter>`): header (number, name, bats, class year, team,
  seasons seen, merged records); ratings power / contact / speed **1 / 2 / 3 plus an Unknown button (stored as
  `"unknown"`, shown "Unknown")** and spray (pull side / mixed / opposite / Unknown, kept in `scoutTags.spray`); the hot /
  cold grid (the game screen's 5x5: the 3x3 zone plus the chase ring; a tap cycles hot, cold, neutral); pitch checkboxes
  (plan's default list); bunt / steal threat; free notes; the owner's custom fields; suggestions with Accept / Dismiss;
  every at-bat across seasons with links to the outing reports (build 1). The engine's own tags show read-only.
- **Team page**: hitters across seasons (seen, at-bats), lineups faced (from the at-bats, newest first), tendencies
  (plan's default list), the owner's team fields, a merge tool (in-place confirm) and adding hitters.
- **Custom fields** (`/opponents/fields`): the organization's owner adds checkbox / dropdown / zone grid / text fields for
  hitters or teams, renames, reorders and archives them (archived values stay, read-only). Coach info only.
- **Suggestions after games** (`lib/opp_suggest.ts`, run with the report job after each sync and daily): hot spot = 2+
  hard-hit balls at a cell, cold = 3+ whiffs or weak contact, contact rating after 10+ plate appearances (strikeout
  rate), power after 10+ PAs and 6+ logged balls in play (hard share). Nothing changes until a coach accepts; a dismissed
  one stays quiet until its evidence doubles and grows by 2.
- **Merge**: the kept hitter takes the duplicate's id (and its aliases); the duplicate is marked merged and soft-deleted
  (every iPad drops it); events are never rewritten; history and suggestions follow the aliases; logged.
- **Importer** (`app/import.js`, the iPad's hitter CSV import): power / contact / speed (1-3, `u`/`unknown`), spray, hot and
  cold spot lists (`up-in | down-away`, in the hitter's own terms).
- **Migration** `20261119000000_opponent_db.sql`: custom field definitions (owner-only function), suggestions (the server
  writes, coaches with "manage opponents" decide), merge log. Scouting itself lives in the hitter / team JSON docs,
  written through `pc_push` under the existing rules.

## Commands and results
Full proof run on the final code: `C:/dev/pitch-caller-logs/run_b2_full.sh`. It builds, seeds a fresh 13-game season through the game app, then runs everything below. Logs are in `C:/dev/pitch-caller-logs/b2full/`.

| Check | Result |
|---|---|
| Site build (`next build`) | ok |
| Season seed (13 games through the game app) | ok, 0 warnings |
| Plan 8 item 3, opponent pages end to end: `web/tests/opponents_e2e.js` | **28/28 pass**. Covers ratings 1/2/3 and Unknown (stored as `"unknown"`, shown as "Unknown"), zone grid + chase ring, pitch boxes, speed/bunt/steal, notes, history, team page lineups/tendencies, merge, custom fields, suggestions accept/dismiss, viewer read-only, player refused. |
| Plan 8 item 4, suggestions after games: `web/lib/opp_suggest.test.ts` (in `npm test`) + the report job in `opponents_e2e` | 15/15 unit; report job writes suggestions; a dismissed one stays quiet until the evidence grows |
| Plan 8 item 5, importer columns: `app/import_opp_test.js` | 7/7 pass |
| **Calls identical with every new field set**: `app/opponent_exact_test.js` | **12/12 pass**: 449 pitches identical, every event field for field, the engine's full mix included |
| Opponent tables permissions: `supabase/test/opp_rls_test.js` | 26/26 |
| Every number on every report page (build 1's check, re-run): `scripts/report_check.js --site` | 23,112/23,112 agree (19 outings, 13 game summaries, 7 recaps, 27 hitters) |
| Build 1 reports e2e | 33/33 |
| Web chain: tsc, `npm test`, `next build`, site e2e | all pass |
| SQL tests, each alone | sync 38, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix 347, waitlist 22, v12_sessions 11, logging_sync 10, reports_rls 67, opp_rls 26: pass. `review_test` 28/29: "accepted invites made them members" is the same failure as on the baseline (see BUILD1_REPORT). **`v11_kinds_test` fails** "the v1.1 migration runs last". It fails by construction for any new migration, now naming `20261119000000_opponent_db.sql`. Same open item as Build 1; the test was not edited. |
| Portal e2es | shell 43, offline_game 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38: all pass |
| `scripts/test-app.sh` (every app suite, engine parity, golden files, plus the new import_opp_test and opponent_exact_test) | **pass** (exit 0, 48 min) |
| Visual loop: `web/tests/opp_shots.js` r1, r2 (1440 / 1180 / 820 / 390, coach, viewer, player) | no horizontal overflow; shots in `C:/dev/pitch-caller-shots/build2/r2/` |

No engine file changed (`git diff $(git merge-base HEAD feat/logging-reports) -- app/engine.js app/engine_data.json` is empty; see the exact-match test above).

## Readings and proposals
1. **Fields never reach the engine.** The engine reads a hitter's `grades`, `crowd` and the approach / path / off-speed tags
   only; this build writes none of those. Proven: `opponent_exact_test` (every new field set on every hitter and the
   team: identical calls).
2. **Proposal: owner editing.** The plan says "owner always" may edit opponents. Today an owner who isn't on the team's
   staff can't read any team data (an existing, tested rule). This build lets the owner set up custom fields (org level);
   editing opponents needs the owner on the staff. Changing that is a permission decision for Drew.
3. **Proposal: the lists.** Pitch checkboxes and team tendencies use the plan's default lists (Drew to edit).
4. **Proposal: game pack.** With no engine mapping, the game pack carries nothing new; it will need the engine-facing
   fields once section 5 is built.
5. **Tag suggestions.** The plan mentions the learner's existing approach suggestions in the same list; those live on the
   iPad today and aren't shown here (not built).
6. Spots inside a CSV cell are separated by `|` or `/`: these sheets already treat `;` as a column separator.

## Not verified
- A real iPad and phone Safari (Chromium only, at 1440, 1180, 820 and 390 wide).
- The iPad's import screen with a real coach's spreadsheet (the parser is unit-tested; the screen's merge code is a
  two-line addition beside the existing tag merge).
