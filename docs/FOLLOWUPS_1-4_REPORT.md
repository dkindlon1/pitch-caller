# Follow-ups to Builds 1–4 (Drew's decisions, Nov 19, 2026)

Same rules as the overnight builds: local Supabase only, nothing on `main`, no deploy, no production, commits as Claude,
only the feature branches pushed. Every result below was run and its output read; logs are under
`C:/dev/pitch-caller-logs/fu/` (`b3/`, `rest/`, `final/`, and the `v11_*` and `rls_matrix_*` logs).

Branches: `feat/logging-reports` (b1), `feat/opponent-db` (b2, merges b1), `feat/outcome-tracking` (b3, merges b2),
`feat/watch-security` (b4, from `main`).

## 1. Drift sensitivity (feat/outcome-tracking)

**What changed.** `app/peak.js` (copied to `web/lib/peak.js`, rebuilt into `app/dist`): `DRIFT_PRIOR` 4,
`SE_SHIFT` 0.5, `EARLY_LOOK` 0.04, `DRIFT_SHARE` 0.25, `DRIFT_P` 0.9. No engine or call math was touched; these are the
drift note's own settings. `app/peak_sim.js` now targets 0.35 false notes per steady outing or fewer (Drew's line) and
reads `PEAK_TUNE` so settings can be tried without editing code. `scripts/outcome_check.js` uses the same settings.

**How it was picked.** A quick sweep over the five settings, then candidates re-run in the full `peak_sim.js 200`. The
quick sweep reads lower on false notes than the full simulation. Logs: `dbg/sweep3.txt`, `sweep4.txt`,
`peaksim_grid.txt`. The pick had the highest all-night catch rate of the settings tried that stay at or under 0.35 in the
full simulation. The closest rival logged 0.350 / 53% in the quick sweep (prior 2, SE shift 0.4) but gives **0.405** /
60% in the full simulation (`PEAK_TUNE='{"prior":2,"seShift":0.4,"early":0.08,"share":0.25,"p":0.9}' node peak_sim.js
200`, re-run for this report). Every setting tried that caught more also went over 0.35. This was a grid search, not an
exhaustive one.

| | Before | After |
|---|---|---|
| False notes per steady outing (200 outings) | 0.18 | **0.320** |
| Slider whiffs to 8% all night: caught | 28% | **53%** (median 10 slider swings in) |
| A drop starting at pitch 30: caught | 12% | **24%** (median 8) |
| Check, 400 outings | | 0.305 false, 51% caught |

**Plan section 5, item 2** (`cd app && node peak_sim.js`): `ok false drift notes: 0.320 per steady outing (target 0.35
or less: Drew, Nov 19)`, `ok seasons with a false "clear" finding: 0.0%`, `ok false early signs: 0.06 a season`,
"the false-alarm targets are met".

**Plan section 5, item 5** (`drift_exact_test`: drift notes change no call). Made stricter. Before, the driver never
stopped between pitches, so no drift note could fire and the test proved nothing. Now `chart_driver.js` runs the drift
check after every pitch, later games are pitched worse than his normal, and the test asserts notes really showed.
Result in b3's final `test-app.sh`: `drift_exact_test` **14/14** (every event identical field for field, with notes really showing), `drift_e2e` **7/7**, `peak_sim` 3/3.

## 2. "Effectively wild" is staff-only (feat/outcome-tracking)

**What changed.** `archetype(base, { audience: "player" })` leaves the label out and keeps the rest (e.g. staff
"Effectively wild, slider for whiffs", player "Slider for whiffs"). `web/lib/outcome.ts` (`outingOutcome`,
`seasonOutcome`, `peakLabel`) takes an audience, staff by default. Every player and parent page passes `"player"`: home,
each outing (`_reports/load.ts`), the season so far, and each final recap. Those pages also feed the PDFs and the public
recap links. The stored copies (`outcome_findings`, `peak_baselines`) keep the whole label and were already closed to
players and parents. Emails never read the archetype.

**Permissions test.** New `web/tests/archetype_e2e.js`, run against the seeded season:
- The head coach sees the label on at least one pitcher.
- Signed in as ace, lefty and kid, every page and PDF their accounts open never contains it, while their own numbers
  stay. Three of the four pitchers the coach sees it on are theirs.
- Signed in as the parent: their home, the approval page, and the child's link and PDF, approved for the check and put
  back afterwards.
- Every live public link and its PDF, signed out, never contains it.
- As those users, the database returns 0 stored rows; the coach gets them.
- The mail code never touches it.

Unit check in `peak_test.js`: staff vs player label.

Results: `archetype_e2e` **18/18** on the final code (26 pages and 18 PDFs read as players and the parent, log
`fu/final2/b3_archetype3.log`). Earlier runs gave 15/15 and 16/16; those predate the parent section, which was added
after I noticed the parent account isn't linked to a pitcher and so had only been checked in the database. `peak_test`:
all pass.

## 3. The owner edits opponents (feat/opponent-db, carried into feat/outcome-tracking)

**What changed.** Migration `20261119003000_owner_opponents.sql` (local only):
- `private.pc_owner_opp(p)`: the caller owns the team's organization and the team is switched on.
- Read policies for the owner on opponent `teams` rows (not `isOurs`), `hitters`, `opp_suggestions` and `opp_merges`.
- `pc_can_read` / `pc_can_write` allow teams and hitters for the owner.
- `pc_push`: the owner may write teams and hitters, and is refused for an `isOurs` team row, new or stored. Diffed
  against the 20261106 version: exactly those two changes.
- Suggestion decide and merge log allow the owner.
- Nothing else is opened. Rosters, games, events, reports, plans, staff and `pc_pull` stay closed to an owner who isn't
  on the staff.

Custom fields and the grid live in the hitter and team documents, so they're covered. The portal (`team.ts`, `nav.ts`,
opponent pages and actions) shows Opponents to the owner, with the editor on.

`docs/PLAN_opponent_database_2026-11-18.md` section 2 now records this as a permission change Drew approved on Nov 19.

**Tests.**

| Command | Result |
|---|---|
| `rls_matrix_test` section 24: owner off the staff; reads none of the 28 other team tables; no pull; edits hitters and opponent teams; `isOurs` refused; pitchers/games/events refused; suggestion decide and merge; another org's team; a team switched off by billing; owner on the staff as a viewer; a viewer coach without the permission; player; signed out | **365/365** on b2 and on b3 |
| The rest of the matrix unchanged: the same test on the baseline migrations (`PC_MIGRATIONS=fu/mig_base`) | 347/347. The normalized diff of the two runs shows only the owner line and one timing line |
| `opp_rls_test` (the old "owner can't write" check now: the owner edits a hitter, still can't write the roster) | **27/27** |
| `owner_opp_e2e` (portal, owner moved to an outsider and back): nav, list, team, hitter page, saves a rating and note; roster, games, report and pitcher pages closed; viewer read-only | **13/13** (`fu/final2/b3_owner.log`) |
| b2 alone: `tsc`, `npm test`, `next build`, site e2e, every SQL test | pass, apart from the baseline's known `review_test` 28/29 |

## 4. Watch pairing-only mode (feat/watch-security)

**What changed.** A setting under Setup → Watches → "Message security": Full encryption (default) or Pairing only. It's
kept on that device.
- In pairing-only mode the game starts with `P` instead of a key, and calls go as plain `C<n>,<sign>,<spot>,<changed>`,
  `X<n>` or `E<n>`.
- The watch accepts plain messages only in a pairing-only session and only over the passkey-bonded link.
- Message numbers still refuse replays and repeats. Malformed messages are dropped. A watch in full mode refuses plain
  calls.
- Switching mid-game starts a fresh session in the new mode and re-sends the call.
- End game and the 6-hour expiry work in both modes.

The README desk test gains "If AES is too slow (Accept to buzz over 300 ms with full encryption): switch to
pairing-only", plus a Security note on what pairing-only gives up.

| Command | Result |
|---|---|
| `node app/watch_test.js` (section 10: pairing-only end to end on fake watches, replay, malformed, unbonded refused, mode switches, expiry, 20-byte writes) | **106/106** (all 20 new checks pass) |
| `node watch/bangle/test.js` (section 8: the watch app itself) | **80/80** |
| `watch_e2e` in the built app (section 13: Setup choice, both watches show the call, the air shows `P` and plain calls, switch back to full) | **47/47** |
| b4 `test-app.sh` | pass (2752 s) |
| `watches_e2e`, `tsc`, `npm test`, `next build`, site e2e, SQL tests | pass, apart from `review_test` 28/29 (known) and `v11_kinds_test` (see 5) |

## 5. v11_kinds_test (feat/logging-reports, carried to feat/opponent-db and feat/outcome-tracking)

**What changed.** The test no longer requires v1.1 to be the newest migration. It checks the migration is present, then
applies every later migration, in order, on the v1.1 data, and checks they run cleanly and leave the stored pitches
unchanged.

| Branch | Before | After |
|---|---|---|
| feat/logging-reports | 11 ok, **FAIL** "the v1.1 migration runs last (20261118010000_reports.sql)" | **14/14** |
| feat/opponent-db | FAIL, naming `20261119000000_opponent_db.sql` | **14/14** |
| feat/outcome-tracking | FAIL, naming `20261119010000_outcome_tracking.sql` | **14/14** |

(logs `fu/v11_before_b*.log`, `fu/v11_after_b*.log`). `feat/watch-security` branches from `main` and wasn't in scope for
this item, so its copy still fails "runs last" (naming `20261119020000_watch_security.sql`). It picks up the fix when the
branches are merged.

## Full runs

| Run | Result |
|---|---|
| b3 web chain (`tsc`, `npm test`, `next build`, site e2e) | pass |
| b3 SQL, each alone | sync 38, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix 365, waitlist 22, v11_kinds 14, v12_sessions 11, logging_sync 10, reports_rls 67, opp_rls 27, outcome_rls 9; `review_test` 28/29 (the baseline's known failure) |
| b3 portal e2es | shell 43, offline_game 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38: all pass |
| b3 `report_check` / `outcome_check` / `reports_e2e` / `opponents_e2e` | 23281/23281, 184/184, 33/33, 29/29 |
| b3 `test-app.sh` | **pass** (3104 s, `fu/final/b3_test_app.log`). The run before it failed only on `app/dist` being out of date, which was rebuilt and committed |

Fixes made during these runs, all to tests or build output, none to the features:
- `opponents_e2e` now clicks the suggestion by id.
- `owner_opp_e2e` picks a live hitter, checks the page is real, and recognizes the editor by its controls (the button
  reads "Saved" until a change).
- The python3 used by the tests now has numpy.
- b3's `app/dist` was rebuilt after the archetype change, and the site rebuilt so the seed serves it.
- `archetype_e2e` now also signs in as the parent (see 2).

## Not verified

- **Pairing-only on a real Bangle.js**, and whether AES is actually too slow there. The desk test (README) is what
  decides it.
- **A real iPad or phone** for any of this. All runs used Chromium and the fakes.
- **Owner portal pages built on events** (lineups, at-bat history against us) show empty to an owner off the staff, by
  design, because events stay closed. The e2e doesn't check every such section.
- `owner_opp_e2e` ran on b3's site, which contains b2. b2's own site ran its standard e2es but not this one.
