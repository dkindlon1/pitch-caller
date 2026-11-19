# Build 1: logging + outing reports and season recap: report

Branch `feat/logging-reports` (from `main` at 8ee2fdc), pushed. Nothing pushed to or merged into `main`, nothing deployed,
no migration applied to production, pitchiq-prod untouched. Every run used the local Supabase (Docker). Working notes and
every reading taken without asking: `docs/BUILD1_PROGRESS.md`.

## What was built
**Part 1: logging** (`app/index.src.html`). The engine already computed the full mix (`E.callV08`'s `dist`); the app kept
the top 5. Each call now carries all of it, and each pitch logs `mix` ([pitch id, name, spot, share] for every call),
`styledMix` (= `mix` for now), `styleApplied: "none"` and `strength: null`. A coach's own call keeps the engine mix that was
on screen. `engine.js` is untouched. Migration `20261118000000_build1_logging.sql` adds two generated columns only (docs
are JSON, so `pc_push`/`pc_pull` carry the fields with no change).

**Part 2: reports** (PLAN_reports_recap sections 2-5)
- `web/lib/report_outcomes.ts`: the one home of the outcome definitions. `web/lib/report_data.ts`: line, pitch mix and results
  by count group and hitter side, heat maps (4 layers x called/landed, per pitch, left-out counts), hitter by hitter with
  each sequence, what worked / who hurt us, overrides, game summary, recap (trends, level comparison, outing list, pitch
  by pitch), hitter at-bats. All from raw events.
- Migration `20261118010000_reports.sql`: coach notes (RLS), seasons, frozen recap versions (never updated), public links
  with section toggles and under-18 parent approval, a mail log; `pc_my_report` (a pitcher's own data, coach-only fields
  stripped in SQL) and `pc_public_recap` (only the chosen sections, only while live).
- Pages: outing report (staff and the pitcher's own), game summary, season so far, final recap, hitter page, opponent
  page with at-bats seen, Settings → Seasons ("Mark season over"), pitcher page → under 18 + parent email, the pitcher's
  share panel, `/app/approve` for the parent, the public recap `/r/<token>` and PDFs (US Letter, light) for each.
- Email: the game app POSTs `/api/reports/run` after any sync that sent something up; a daily cron runs the same job.
  Each pitcher with an account: one email per outing. Each coach: one email per game (every report + the summary).
  Final recaps: frozen and emailed on "Mark season over". Each email is claimed in `report_mail` first (never twice).
- Seeded season `web/tests/season_seed.js`: 13 games through the real game app (two pitchers in 6, 99 coach calls, 111
  re-calls, 46 cross-ups, 297 pitches without a cell, 50 balls in play without contact, one offline game synced later,
  one game on main's old app build, an under-18 player with a parent account). Spring frozen, fall "so far".

## Commands and results
| Check | Result |
|---|---|
| `app/logging_exact_test.js` (old vs new build, same seeded games) | 25/25; 699 pitches identical field for field (52 coach calls, 46 re-calls, 24 cross-ups) |
| `supabase/test/logging_sync_test.js` | all pass (new fields round-trip; an old app's events still sync) |
| Old app build syncing (season seed, game 12 on main's build) | 150 pitches synced, 0 with mix fields; reports and check script handle them |
| `web/lib/report_outcomes.test.ts` + `report_data.test.ts` | 22 + 11 pass (one test per result type: fouls by count, unlogged contact, ball four, HBP) |
| `scripts/report_check.js --site` (independent recompute) | 23,463/23,463 on the fresh season (19,992 numbers read off 87 pages); after the e2e changed it, 23,971/23,971 on 92 pages; two planted bugs caught (362, 76 mismatches) |
| `supabase/test/reports_rls_test.js` | 67/67 (each role, signed out, under-18 parent approval, frozen recaps, mail log) |
| `web/tests/reports_e2e.js` | 33/33 (roles, public sections, revoked/unapproved links 404, notes, one email each, final recaps once) |
| `web/tests/report_audit.js` | axe: 58 page states, 0 serious/critical; Lighthouse mobile x3 medians 89 / 89 / 90, accessibility 100, CLS 0 |
| `tsc --noEmit`, `npm test`, `next build`, site e2e | clean; 93/93; ok; all site checks passed |
| 8 portal e2es | all pass: shell 43, offline 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38 (252, same as baseline) |
| SQL tests, each alone | sync 38, client_review 37, sync_auth 9, app_sync_e2e 37, waitlist 22, v12_sessions 11, logging_sync 10, reports_rls 66: pass. `review_test` 28/29 (known, same as baseline). `rls_matrix_test` 347/347 (after the fix below). **`v11_kinds_test` FAILS** "the v1.1 migration runs last" (see Open below) |
| `scripts/test-app.sh` (engines, parity, goldens, learner worlds, app e2es) | every step passes (exit 0, 47 min; with the Windows tar.exe / python3 shims), incl. parity, goldens, worlds, logging_exact_test 25/25 |


## Log fields: what every pitch already had, and gaps found
Already logged (confirmed in `record()`): who chose the call (`choice`: engine / coach / recall), what was thrown on a
cross-up (`thrown`, `thrownId`), landing cell (`locCell`, when logged), contact quality, result, count (before the
pitch), outs (after the pitch; before is in `sit.outs`), runners (`sit.bases`), batters faced (`sit.batters_faced`), pitch
count (`pcRaw`), catcher id, hitter id and side (`bs`). Nothing had to be added beyond the four new fields. Gaps found:
1. `hitterId` is null when a lineup slot has no roster hitter; reports fall back to "Batting n".
2. An out in play always adds one out (no double play), so innings pitched undercount when a DP happens (app limitation).
3. On a coach's own call, `prob` is the engine's probability of its own pick, not of the coach's pitch; reports ignore
   it for coach calls and show the logged `mix` instead.
4. No intentional-walk event (the app suggests it; the coach signals it); there's no "test game" flag on a game.
5. `styledMix` doubles the mix's size per pitch (about 1-2 KB) while it equals `mix`.

## Open (found in the final full run, not fixed)
1. **Fixed after the first full run:** `rls_matrix_test` requires that anon can execute no `pc_` function, and this build
   had granted `pc_public_recap` to anon. Now the site's server (public page, PDF route, proxy) calls it with the
   service key; anon has no grant (`rls_matrix_test` 347/347, `reports_rls_test` 67/67 with a check for it). Re-verified
   on a fresh seeded season: `reports_e2e` 33/33, `report_check --site` 23,910/23,910 numbers on 92 pages.
Still open:
2. **`v11_kinds_test` asserts the v1.1 migration is the newest file.** It applies migrations only up to v1.1, so any new
   migration fails it by construction. I didn't edit an existing test. Proposed fix: apply the later migrations after
   the v1.1 step and assert they run cleanly. (On this Windows box it also needs `python3` resolvable from cmd.)

## Proposals (not built)
1. **Coach emails:** one per game listing every outing (built) vs one per outing per coach. Say if you want the latter.
2. **Under 18:** this build adds a coach-entered parent email (under-13 players with a consenting parent are covered
   automatically). A real 13-17 parent invite (account linked to the player) would be cleaner.
3. **Opponent name in the pitcher's own report:** shown (his own game); never on the public recap. Players still never see
   hitters, scouting or opponent pages. Hide it too if "players never see opponents" should include the team name.
4. **Store `styledMix` only when it differs** from `mix`, once the style layer exists.
5. **Double plays:** log them in the app so innings pitched are exact.
6. **Heat map colour:** one neutral ramp for all four layers (blue/green are taken, orange is the alert colour). A
   separate hue per layer is possible if you'd rather tell layers apart at a glance.

## Not verified
- A real iPad (Safari) and a real phone (Safari): every screen was checked in Chromium at 1440x900, 1180x820, 820x1180
  and 390x844 only.
- Real email delivery through Resend (a local stand-in received every email; the production key and domain weren't used).
- Vercel's cron on the deployment (the route works with the secret locally; the second cron entry is in `vercel.json`).
- The game summary at 390 wide reports 276 px of extra page width in Chromium only after the same tab was resized from
  820 and navigated; a fresh 390 load measures exactly 390 and every element sits inside it. Looks like stale layout in
  the test browser, not a page overflow, but not proven on a phone.
- Signed-in "not found" pages answer 200 (this Next version streams the shell first; no data is shown). Public links
  answer a real 404 from the proxy.
- On Windows the portal e2es need an `npx` shim and `v11_fixture_test` needs Windows' `tar.exe` first (both outside the
  repo); CI on Linux needs neither.

## Look at these first
`C:/dev/pitch-caller-shots/build1/picks/` (on disk, not in git):
1. `1-outing-report__laptop-1440.png`: an outing report on a laptop (full page).
2. `2-outing-report__ipad-1180.png`: the same on an iPad in landscape.
3. `3a-heat-map__called-strikes.png` and `3b-heat-map__landed-negative.png`: one heat map, both views.
4. `4-public-recap__phone-390.png`: the public recap on a phone.
5. `5a-pdf-outing-page1.png` and `5b-pdf-final-recap-page1.png`: the PDFs (originals: `build1/r5/pdf-*.pdf`).
6. `6-game-summary__ipad-portrait-820.png`: the game summary, overrides as cards on an upright iPad.
