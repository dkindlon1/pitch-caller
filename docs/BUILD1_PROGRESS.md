# Build 1: logging + outing reports and season recap — progress

Branch `feat/logging-reports` (from `main` at 8ee2fdc). Spec: `docs/PLAN_reports_recap_2026-11-18.md`; logging fields
from `docs/PLAN_style_layer_2026-11-18.md` 3.2/3.3/5. Local Supabase only (Docker stack `pitch-caller`, API
127.0.0.1:54321, DB 127.0.0.1:54322). Nothing pushed to `main`, nothing deployed, nothing applied to production.

Read this file and `git log` before each part and after any context reset. Ledger: `.claude/run-ledger.md` (gitignored).
Logs: `C:/dev/pitch-caller-logs/` (not committed).

## Steps
| # | Step | State |
|---|---|---|
| 0 | Plan docs committed (58b823c) | done |
| 1 | Baseline: every existing check once, from a worktree of 58b823c (`C:/dev/pc-baseline`) | done (see Baseline) |
| 2 | Part 1 logging + exact-match and old-event tests | done (74addef): exact match 699 pitches 25/25; logging_sync_test all pass |
| 3 | Seeded season through the app | done: `web/tests/season_seed.js` (13 games, 1,629 events) |
| 4 | Data layer + independent check script | done: 3,313/3,313 agree; two planted bugs both caught (362 and 76 mismatches) |
| 5 | Outing report, game summary, notes, permissions | done: pages + reports_rls_test 66/66; report_check --site 20,100 numbers on 88 pages |
| 6 | Email, season so far, final recap, freeze | done: reports_e2e email section all pass |
| 7 | Public link, toggles, parent approval, PDF, website view | done; dead links 404 from the proxy |
| 8 | Visual loop | rounds 1-2 done (fixes: heat note layout, phone overflow, overrides as cards under 900px, trend labels, copy); round 3 next |
| 9 | Full checks | |

## Inventory (read from the code, Nov 18)
- **Events** are JSON docs in `public.events` (`doc jsonb`), written only through `pc_push`, read by coaches via RLS
  (`pc_coach_teams`); players never read `events` rows (only redacted functions such as `pc_my_outings`). Docs are
  stored as sent, so new fields sync with no function change; older migrations add generated columns to make fields
  queryable (v08_inputs, v09_intent) and this build follows that pattern.
- **What a pitch logs today** (`app/index.src.html` `record()`): pitcherId, pitchId/pitchName/kind (called), quad
  (called spot), thrown/thrownId (cross-up), hitterId, slot, bs (batter side), ph, catcherId, choice
  (engine/coach/recall), coach, prob (engine prob of its own pick), shaken, pcRaw, fatigueShift, checkinId, count
  (before the pitch), outs (after the pitch), inning, res, out, contact, read, loc (zone word), locCell (grid cell),
  wp, end, paEnd, runs, glove, radar (v08.radar), sit snapshot (balls, strikes, outs, bases, pitch_count,
  batters_faced… before the pitch), ars snapshot, pred, versions, deviceId, n, ts, gameId.
- **The engine already computes the full mix** (`E.callV08` returns `dist`, every call with share > 0 after the
  0.5% per-pitch floor); the app kept only the top 5 on the call for display. Exposing it is app-side only:
  `engine.js` is not touched.
- **Portal routes that exist:** team home, roster, pitcher page + stats, opponents list + team page (hitters table),
  games (Game Day plan list, plan page, wizard), staff, settings, billing, player portal (`/app/me/...`).
  **Not built before this build:** a game review page, a hitter page, a "Games" history. Reports add them.
- **Accounts:** roles head/pitching/caller/viewer/player; players linked to pitcher ids (`player_links`); under-13
  players join through a parent account (`minors`, `guardian_consents`). There is **no under-18 model** before this
  build (see Readings).
- **Email:** `web/lib/email.ts` `sendMail` via Resend; tests use `web/tests/fake_resend.js`.

## Readings taken without asking (most reasonable reading, noted here)
1. **Old events:** reports and replay treat a missing `mix` as "not logged"; nothing else changes.
2. **Coach call mix:** a coach's own call keeps the engine mix that was on screen when he overrode it (the call object
   already carries it forward), so the overrides section can show what the engine had.
3. **Under 18:** the repo only models under 13. A coach marks a player "under 18" with a parent email on the
   pitcher's page (under-13 players with a consenting parent are under 18 automatically, that parent being the
   approver). The public link can't go public until the signed-in parent account approves it. Enforced in SQL.
4. **Players and opponents:** a pitcher's own report shows at-bats by lineup slot and side, never hitter names or
   ids; the opponent team name shows in his own outing header but never on the public recap.

5. **Count groups** (plan names six but doesn't define them as a partition): 0-0; any 3-ball count; any 2-strike count;
   ahead = 0-1; behind = 1-0, 2-0, 2-1; even = 1-1 (first match wins). Labeled with their counts on the page.
6. **Contact quality decides first** when logged: weak = positive (a bloop hit too), hard = negative (a hard out too),
   solid falls to the result. Reached on error = an out in play. "Hard contact" counts only logged hard contact.
7. **Results follow the pitch thrown** on a cross-up (the app's own rule); the called view draws the called spot.
8. **Whiff %** = swinging strikes / swings; **hard contact %** = hard / balls in play with contact logged; the
   10-pitch rule counts pitches of that pitch in the slice. Whole-outing strike % has no minimum.
9. **Emails:** each pitcher with an account gets one email per outing; each coach gets one email per game listing
   every pitcher's report and the game summary (a single-pitcher game = one per outing). Players without an account
   (and catchers, opponents, anyone off the team) get none. "Test data": a game with no pitcher record (sample staff)
   sends nothing. Proposal in the report if Drew wants coaches to get one email per outing instead.
10. **Trigger:** the game app POSTs `/api/reports/run` with the coach's token after any sync that sent something up;
   Vercel's daily cron runs the same job for every team as the fallback. A game waits for all its pitches (the game
   record's count) for up to 6 hours after End game, then reports anyway.
11. **Freezing:** the job freezes any season marked over that has no recap yet (in the public shape: no opponents).
   A rebuild (`refreeze`) adds version n+1; versions are never updated (trigger).
12. **"Excluded pitches stay excluded"** (public link): read as: whatever the reports leave out (deleted pitches,
   duplicate games, legacy rows, pitches without a landing cell in "landed") is left out of the public recap the same
   way, because it's the same data layer. There is no per-pitch "exclude" flag on game events today.
13. **Heat map colour:** one warm neutral lightness ramp for all four layers (blue = being weighed and green = the call
   are taken; orange is the alert colour; pitch hues mean pitches). Validated with the dataviz validator.

## Baseline (58b823c, before any Build 1 change)
- `tsc` clean; `npm test` pass; `next build` ok; site e2e "all site checks passed".
- `test-sql.sh`: all pass except `review_test` 28/29 ("accepted invites made them members"), the known local sort
  order issue noted in PLAN_portal section 8 (pre-existing).
- Portal e2es (with the Windows npx shim): shell 43, offline_game 22, portal 30, billing 52, player_admin 24,
  uploads 33, retention 10, gameplan 38: all pass (252).
- `scripts/test-app.sh`: every step passes. `v11_fixture_test` stops under Git Bash's tar (known); with Windows' `tar.exe` first on the
  path (a copy in the shim folder, not System32 on the path) it passes 8/8. The steps after it were run by `run_app_rest.sh`: all pass.

## Seed notes
- The seed's first two runs found two harness problems (not app problems): Chrome's Local Network Access blocks a
  page injected with `route.fulfill` from calling the loopback Supabase (fixed with a real localhost proxy for the old
  app); and rewinding the browser clock after a sync made later pitches look older than the sync mark (fixed: the clock
  only moves forward). Third run: every game's charted count equals the server's.

14. **Signed-in not-found pages stream with a 200** (this Next version prerenders the shell first). They carry no data. For
   the public link, where "dead" matters, `proxy.ts` checks the link first and answers a real 404 (page and PDF).
15. **Irreversible actions confirm in place** (the portal's ConfirmSubmit): Mark season over, turn a link off for good,
   delete a note, delete a link.
