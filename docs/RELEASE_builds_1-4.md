# PitchIQ builds 1–4 release checklist (reports, opponents, outcome tracking, watch security)

Branches `feat/logging-reports` → `feat/opponent-db` → `feat/outcome-tracking` (each built on the one before), then
`feat/watch-security` (built on `main` on its own) → `main @ 8ee2fdc`. Reports: `docs/BUILD1_REPORT.md` …
`docs/BUILD4_REPORT.md`, `docs/FOLLOWUPS_1-4_REPORT.md`, `docs/REVIEW_builds_1-4_2026-11-19.md` (section 5 is the source
for the migration list), `docs/REVIEW_FIXES_REPORT.md`.

**This is for Drew to run, step by step. Claude did none of it:** nothing merged to `main`, nothing deployed, no
production migration, no tag.

Checked on a throwaway local merge of all four (`review/merge-stack-4`, never pushed), rebuilt Nov 20 from the branches
with the Nov 20 fixes (4 merged last, game app rebuilt: identical to the previous merge apart from the version line,
now `1.4.0`): every SQL test (15 files, rls_matrix 369/369), every portal e2e (shell 43, offline 22, portal 30, billing
52, player_admin 24, uploads 33, retention 10, gameplan 38), opponents 29, reports 33, backfill 9, joined 10, retry 14,
recap on a phone 41, archetype 17, owner 18, watches 11, Bangle 88, site e2e, `tsc`, `npm test`, `test-app.sh` (51
suites, 48 min, version line `PitchIQ 1.4.0 · engine 1.2.3`), identical calls (logging 699 pitches 25/25, opponents 449
12/12, drift notes 463 14/14), recounts (report check 23,470/23,470, outcome check 173/173), axe 58 + 12 page states
with 0 serious or critical, the logging migration on 1,000,000 rows (52 ms; a read waited 2 ms). All passed; the retry
test first failed one check in the full run because of a flaw in the test (it counted emails an earlier test had sent),
fixed and re-run in the same order: 14/14 twice. Logs: `C:/dev/pitch-caller-logs/pre2/merged4/` and `pre2/retry_rerun/`.

## What's new

**For coaches**
- **Outing reports and a game summary after every game.** When a game ends and the iPad syncs, each coach gets an email
  with every pitcher's line and a link to the full report: pitch mix, strikes, where pitches ended up, at-bat by at-bat,
  and notes you can write (and choose to share with the pitcher). Also as a PDF.
- **Seasons and final recaps.** Settings → Seasons → "Mark season over" freezes each pitcher's season recap and emails it
  to them and to the coaches.
- **Emails are only about games from now on.** Games and seasons from before this release are never emailed (their
  reports open in the portal as usual). Someone who joins the team later gets emails only for games that end after they
  joined.
- **Opponent pages.** Each opposing team and hitter has a scouting page: ratings, a zone grid, pitch checkboxes, speed /
  small ball, class year, notes and custom fields your organization's owner sets up. After games the site suggests changes
  ("Mark middle hot? 3 hard-hit balls there") that you accept or dismiss. Duplicate hitters can be merged. The
  organization's owner can read and edit opponents on every team, even one where they're not on the staff, but never the
  team's own games.
- **Outcome tracking.** Each outing report says what a pitcher's best outings look like ("At his best: …") and how this one
  compared. During a game, the iPad's Notes badge shows **drift notes** when a pitcher's strike rate or a pitch's results
  slide below their own normal. They're notes for the coach: they never change a call.
- **Watch security prototype**, only on an iPad or laptop opened once with `?watch=1` (everyone else sees nothing new).
  A watch pairs with a passkey, calls to it are encrypted, and Settings → Watches lets a coach remove a watch so no device
  of the team sends it calls again.

**For players**
- An email with their own outing report after each game they pitch (a young player's goes to the parent account), and their
  season recap when the coach marks the season over.
- Their outings list and report pages in the portal, "At your best" on their home, and a public link to their recap they can
  share. Under 18: the link stays off until their parent approves it, and widening what it shows waits for the parent again.

## Before you start
1. **Look at the screenshots** (review section 7):
   - `C:/dev/pitch-caller-shots/build1/rv/outing__1440x900.png`: the outing report on a laptop.
   - `C:/dev/pitch-caller-shots/prerelease2/after/public-mix__390x844.png` (and the full page, `public__390x844.png`):
     the public recap's pitch mix on a phone, one card per pitch with every column labeled (fixed Nov 20; it was cut off
     after "Strike": `prerelease2/before/`). At 820 the table is unchanged: `prerelease2/after/public-mix__820x1180.png`.
   - `C:/dev/pitch-caller-shots/review/pdf-outing-p1.png`: the outing PDF, page 1.
   - `C:/dev/pitch-caller-shots/build3/rv/outing-section__1180x820.png`: outcome tracking on the coach's outing report.
   - `C:/dev/pitch-caller-shots/review/owner-team__1440.png` and `owner-hitter__390.png`: the owner off the staff.
   - `C:/dev/pitch-caller-shots/build3/r4/game-panel__390.png`: the game app's Notes badge and panel.
   - `C:/dev/pitch-caller-shots/build4/settings-watches-confirm__1440.png`: Settings → Watches.
   - New today: `C:/dev/pitch-caller-shots/prerelease/b1/player_home_390_motion_settled.png` (the player's home at 390
     after its entrance: the 6th outings row at full contrast).
2. **Back up pitchiq-prod.** Supabase dashboard → pitchiq-prod → Database → Backups: note the latest daily backup's
   time, and if the plan allows it take an on-demand backup (or a `pg_dump` from your PC with the session-pooler URL).
   Write down the time: it's the point a restore would go back to.
3. **Pick a time with no game being called.** No live game claimed on any team: a device claims a game by syncing its
   record as `live`, so in the SQL editor `select program_id, id, doc->>'date' from public.games where deleted_at is null
   and doc->>'status' = 'live';` should return nothing from today (an old row from a game never ended doesn't matter,
   but check its date). Ideally a weekday morning US time with no games scheduled. The app keeps working during the release, but the events
   migration takes a lock on `public.events` for milliseconds and would queue behind a sync in progress.
4. **Vercel production environment variables**, Vercel → the PitchIQ project → Settings → Environment Variables,
   Production:
   - `RESEND_API_KEY` set (the live key, not `re_test_…`), and `EMAIL_FROM` on the verified domain. Without the key the
     job records every email as `no_provider`; since Nov 20 (review S4) the first run after the key is set sends them,
     each once. That would be a burst of late emails, so set the key before the release anyway.
   - `SUPABASE_SERVICE_ROLE_KEY` set (the report job and the backfill check run with it).
   - Also already there from earlier releases and needed by the report job: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
     `CRON_SECRET`, `SITE_URL` (the production address; email links are built from it). No new variable is added by
     these builds.
5. **Hold production deploys back until the migrations are in** (recommended). Vercel → Settings → Environments →
   Production → turn **off** "Auto-assign Custom Production Domains". The merge to `main` then builds a production
   deployment but doesn't serve it until you press **Promote** (step 4 below). Without this, the new portal goes live
   minutes after the push while CI (about 1 h 25 min) and the migrations are still to come (see Gap risks).

## Release order (each step needs Drew)
1. **Merge into `main`, locally, and push once at the end** (one production build instead of four):
   1. `git checkout main && git pull` (expect `8ee2fdc`).
   2. `git merge --ff-only feat/logging-reports` (fast-forward: it's built on `8ee2fdc`).
   3. `git merge --ff-only feat/opponent-db`, then `git merge --ff-only feat/outcome-tracking` (each is built on the one
      before, so both fast-forward).
   4. `git merge feat/watch-security`: a merge commit with **four conflicts, all additive**. Resolve them as the review
      did (the resolved files are on the local throwaway branch `review/merge-stack-4`, `C:/dev/pc-review`, if you want to
      copy them: `git checkout review/merge-stack-4 -- <file>`):
      - `app/build.py`: keep both; `watch_sec.js` comes before `watch.js`, then `peak.js`.
      - `scripts/test-app.sh`: keep `import_opp_test`, `peak_test` and `watch_sec_test`.
      - `scripts/test-sql.sh`: keep both lists of tests.
      - `web/app/app/t/[team]/settings/page.tsx`: import both `markSeasonOver` and `removeWatch`, and keep both the
        Seasons and the Watches sections.
   5. **Rebuild the game app** rather than trusting the text merge: `cd app && python build.py`, then commit `app/dist` if
      it changed (on the throwaway merge it came out byte-identical). The game app version is already `1.4.0` on
      `feat/watch-security` (Nov 20), so it lands with this merge; `main` says `1.3.0`.
   6. `git push origin main`.
2. **CI must pass on `main`** (Actions → CI on the merge commit, all four jobs green, about 1 h 25 min) before the
   migrations. If it fails, stop here: with auto-assign off nothing has changed for anyone yet.
3. **Promote the migrations:** Actions → "Promote migrations to prod" → Run workflow on `main`, type `PROMOTE`, approve
   on the production environment. One run applies every pending file, in this order (production's last one is
   `20261115000000_v11_kinds.sql`). Read the run's dry-run step first: it should list exactly these seven.

   | # | Migration | What it does to existing rows | Lock |
   |---|---|---|---|
   | 1 | `20261118000000_build1_logging.sql` | Adds two nullable columns with no default to `public.events` (`style_applied`, `has_mix`) and a trigger that fills them for events written from now on. **Existing rows stay null** (null = written before this release). No table rewrite. | `ACCESS EXCLUSIVE` on `events` for milliseconds (59–64 ms on a 1,000,000-row, 1 GB copy; a concurrent read waited 3 ms). It queues behind any transaction open on `events`, which is why no game should be syncing. |
   | 2 | `20261118010000_reports.sql` | New tables (coach notes, seasons, frozen recaps, under-18 marks, public links, the mail log `report_mail`) and functions. Touches no existing table or row. | Milliseconds (new tables' foreign keys briefly lock `programs`). |
   | 3 | `20261118020000_report_backfill.sql` | New table `report_backfill`, filled with one row per game that's already final (seasons: none yet, the table is new in #2). Nothing existing changes. Those games are never emailed; their reports stay viewable. | None that blocks: it reads `games`. Seconds at most. |
   | 4 | `20261119000000_opponent_db.sql` | New tables (custom fields, suggestions, merge log) and functions. No existing rows. | Milliseconds. |
   | 5 | `20261119003000_owner_opponents.sql` | Replaces `pc_push`, `private.pc_can_read` and `private.pc_can_write` (the swap is atomic: a sync already running finishes on the old body); adds owner read policies on `teams`, `hitters` and `opp_merges`, and `pc_opp_suggestions_owner`. No rows change. | `ACCESS EXCLUSIVE` on `teams` and `hitters` for milliseconds each (adding a policy). |
   | 6 | `20261119010000_outcome_tracking.sql` | New tables `peak_baselines` and `outcome_findings`. No existing rows. The first report run afterwards fills them for every past outing, reading every event (a heavier first run). | Milliseconds. |
   | 7 | `20261119020000_watch_security.sql` | New table `team_watches` and three functions (`pc_watch_register` with `readd`, `pc_watch_remove`, `pc_watch_list`). No existing rows. | Milliseconds. |

   **Must go together:** #2 and #3, in the same promote, **before the report job can ever run**. The job runs from the
   new portal only (the daily cron at 10:41 UTC, and the game app's call after each sync); the portal now serving
   (`8ee2fdc`) has no report job, so with auto-assign off the order is safe by construction. If the run stops after #2
   and before #3, **don't promote the deployment**: run the body of `20261118020000_report_backfill.sql` in the SQL
   editor (it's safe to run twice), check `select count(*) from public.report_backfill`, then re-run the workflow.
   The workflow ends by checking that every public table has row-level security on: it must pass.
4. **Promote the Vercel deployment:** Vercel → Deployments → the production deployment built from the `main` commit you
   pushed → Promote. (Then turn "Auto-assign Custom Production Domains" back on.) This serves the new portal, the new
   game app at `/app/game/` and registers the report cron from `web/vercel.json`.
5. **Every iPad (and laptop used for games): open the game app once and check the version** under Game on the setup
   screen. Do it after the current game on that device; the app updates when it's reloaded between games.
   - New app: `PitchIQ 1.4.0 · engine 1.2.3`. Still the old one: `PitchIQ 1.3.0 · engine 1.2.3` (reload it again).
   - Cross-check from the database, after that device's first game syncs: its pitches carry the engine mix (the new
     app's logging), which the old app never sends: `select g.doc->>'deviceId' as device, bool_or(e.has_mix) as new_app, count(*) from public.events e join
     public.games g on g.program_id = e.program_id and g.id = e.game_id where e.synced_at > now() - interval '1 day' and
     e.doc->>'type' = 'pitch' group by 1;` A device showing `false` is still on the old app.
6. **Tag the release:** `git tag -a v1.4 -m "Builds 1-4: reports and recap, opponents, outcome tracking, watch
   security prototype"` on the `main` commit that was deployed, then `git push origin v1.4`. (Tags so far: `v1.0`, `v1.2`,
   `v1.2.1`; the game app now says 1.4.0, so the tag matches it.)

## Gap risks
| If… | What happens | How long it can safely last |
|---|---|---|
| **New portal before the migrations** (auto-assign was left on, so the portal went live at the push) | Coaches and players get errors on the new pages: reports, seasons, opponents, outcome tracking, Settings (Seasons, Watches), and possibly the player's home. The report job fails before sending anything (its first call, `pc_report_people`, doesn't exist yet), so **no wrong emails**. Old games still call and sync. | Minutes. If CI is still running, either promote the previous deployment back (Rollback) until CI and the migrations are done, or accept errors for ~1 h 30 min at a quiet time. |
| **Migrations in, old portal still serving** (the planned state between steps 3 and 4) | Nothing visible: the new tables are unused, `pc_push`'s new body is a superset (369 permission checks on the merged stack), and the events trigger fills the new columns. But a game that ends in this gap isn't in the backfill, so the new portal emails it once it's live (correct, just late). | Hours. Keep it to the same session; a gap of days sends a burst of late emails. Not tested directly: the old portal against the new schema (see Not verified). |
| **The promote stops part way** | The files before the failing one stay applied (the workflow's "Up to date afterwards" step and its log show which). After #2 without #3: if the new portal were live, the next sync or the 10:41 UTC cron would email **every past game to every coach and pitcher**. | Zero with the new portal live. With it held back: fix as in step 3 before promoting. |
| **Old iPad app against the new schema and portal** (a device not reloaded yet) | It calls and syncs as before (checked: `logging_sync_test`, and the season seed plays one game on `main`'s app build). Its pitches carry no engine mix (`has_mix` false/null), so those outings show less in outcome tracking; no drift notes on that iPad; its watch prototype (only with `?watch=1`) doesn't check the team's watch list, so a removed watch isn't enforced there. | A day. Update every device the same day. |
| **New game app against the old schema** (only if the new portal went live before the migrations) | Watch list calls fail (only with `?watch=1`); its call after a sync gets an error and is ignored; calling and syncing work. | Minutes, same as the first row. |
| **Only some branches released** (stopped after 1–3) | Works: 1–3 have no dependency on 4, and their migrations are #1–#6. Releasing 4 later adds #7 (dated last, so it still sorts after). The version bump is on 4, so the game app keeps saying `1.3.0` until then (use the database cross-check in step 5). Releasing 4 without 1–3 needs `v11_kinds_test`'s fix from build 1 for CI to pass, so don't. | Indefinitely. |
| **No Resend key on production** | Every email is recorded `no_provider`, nothing is sent. Since Nov 20 (S4 fixed for this case) the first run after the key is set sends each of them once, late; the backfill and joined-date rules still apply. | Hours: set the key and they go out on the next sync or cron. Days means a burst of stale emails. |
| **Report emails fail** (key set but rejected, provider down) | Each email the provider rejects is marked `failed` and **not retried** (that part of S4 is still open); one error in a team's run also stops that run for every later team (S4, S10); the next day's cron goes on from there. | Watch the first runs (Checks after going live). |

## Checks after going live
Create nothing: no game, no note, no season, no link.
1. **Owner:** sign in on production as yourself. The dashboard loads; open a team you're not on the staff of → Opponents →
   a team and a hitter: they load, and game history shows "Only the team's staff can see game history."
2. **Coach:** sign in as a coach (your own coach account, or have a coach sign in while you watch). Team → Reports → one
   **past** game → its summary and one pitcher's report open and the numbers look like that game. Opponents loads.
   Settings shows Seasons (don't press Mark season over).
3. **Player:** sign in as a player (or have one sign in). Home loads with their outings; one past outing's report opens.
4. **No emails for past games:** in the SQL editor, `select kind, status, count(*) from public.report_mail group by 1, 2;`
   returns no rows until a game ends after the release. `select count(*) from public.report_backfill where kind = 'game';`
   equals the number of games that were final at the promote. The Resend dashboard shows no report emails.
5. **The first report run:** the next day after 10:41 UTC, Vercel → Logs → `/api/reports/run`: status 200, and no
   "reports run failed". After the first game that ends after the release, `report_mail` gets that game's rows only,
   with status `sent`.
6. **A game in progress isn't touched:** if a device was mid-game during the release (it shouldn't be), it keeps calling
   on its loaded app; after it ends and syncs, the game's events are all there (`select count(*) from events where
   game_id = '…'` matches the pitch count) and the next reload picks up the new app.

## Rollback
**Portal / game app:** Vercel → Deployments → the previous production deployment, **built from `main @ 8ee2fdc`**
("Local scripts: read the local Supabase from Docker when the CLI is blocked") → Promote (Instant Rollback). The
database stays as it is: the old portal and the old game app don't use the new tables (the "migrations in, old portal"
row above). iPads that already loaded the new app keep it until reloaded; it calls and syncs against the same database.
Rolling forward again later: games that ended while rolled back aren't in the backfill, so they're emailed then.

**Migrations:** none has a down script, and none needs one for a portal rollback. Only if you must remove them, in
reverse order:

| # | Reversible? | Down step |
|---|---|---|
| 7 | Yes (loses the watch list) | `drop function public.pc_watch_register(uuid, text, text, text, boolean), public.pc_watch_remove(uuid, text), public.pc_watch_list(uuid); drop table public.team_watches;` |
| 6 | Yes (loses stored findings; the pages can work them out again) | `drop table public.outcome_findings, public.peak_baselines;` |
| 5 | Yes | First re-apply the previous bodies (as `create or replace`): `private.pc_can_read` from `20261114000000_game_plans.sql`, `private.pc_can_write` and `public.pc_push` from `20261106000000_pitchiq_teams.sql`, and `pc_opp_suggestion_decide` / `pc_opp_merge_log` from `20261119000000_opponent_db.sql`. Then `drop policy owner_opp_read on public.teams; drop policy owner_opp_read on public.hitters; drop policy owner_opp_read on public.opp_merges; drop function public.pc_opp_suggestions_owner(uuid, text), private.pc_owner_opp(uuid);` (the policies and the new bodies call `pc_owner_opp`, so it goes last). Prefer a forward fix. |
| 4 | Yes (loses custom fields, suggestions, merge log; hitter docs keep their values) | `drop function public.pc_opp_field_save(uuid, uuid, text, text, text, jsonb, int, boolean), public.pc_opp_suggestion_decide(uuid, uuid, boolean), public.pc_opp_merge_log(uuid, text, text); drop table public.opp_merges, public.opp_suggestions, public.opp_fields;` (after #5's down) |
| 3 | Yes, but **don't** while the new portal can run: without it the job emails every past game | `drop table public.report_backfill;` |
| 2 | Yes, but loses coach notes, seasons, frozen recaps, links, under-18 marks and the mail log | Drop its functions (`pc_mark_season_over`, `pc_set_minor18`, the `pc_share_*` functions, `pc_my_share_requests`, `pc_my_report`, `pc_public_recap`, `pc_report_people`, `pc_report_parent`, and the `private.pc_*` helpers it creates), then `drop table public.report_mail, public.recap_shares, public.minor_guardians, public.recap_versions, public.seasons, public.report_notes;` Not needed for a rollback. |
| 1 | Yes, no effect on anything else | `drop trigger pc_events_logging_cols on public.events; drop function private.pc_events_logging_cols(); alter table public.events drop column style_applied, drop column has_mix;` (dropping a column doesn't rewrite the table; same millisecond lock as adding it). |

## Not verified before release
- **The real watch** (Build 4 README desk test, on a real Bangle.js and Chrome): passkey pairing; whether the bond is
  really LE Secure Connections (`lesc: 1` is asked for; the watch or the OS may fall back); that an unpaired device can't
  connect or write; AES speed and Accept-to-buzz (under 300 ms) in full and pairing-only modes; battery over a soak;
  whether removing a watch also needs the OS bond removed before re-pairing shows the code again.
- **Real iPad Safari and phone Safari.** Everything ran in Chromium (Playwright) at 1440, 1180, 820 and 390.
- **Real email delivery:** Resend, the verified domain, spam folders, and the Vercel cron firing. Only the local fake
  inbox and direct calls to `/api/reports/run`.
- **The offline-laptop removal gap:** a laptop with no network uses its own watch list after a 2.5 s wait, so a removal
  made elsewhere reaches it only when it's back online (by design).
- **The old portal against the new schema** (the gap between steps 3 and 4, and a rollback). Every change is additive
  and the old game app's sync was checked, but `main`'s portal suites weren't run against the seven migrations.
- **Production-size timing:** the events lock was measured on a 1,000,000-row copy, not production; the first report
  run's cost on a team with several seasons (it reads every event for outcome tracking) wasn't measured, and it has 300 s.
- **Known, not fixed (review "should fix"):** S4's other half (an email the provider rejected, `failed`, is never retried; one error stops later teams' run; the `no_provider` half was fixed Nov 20), S5 (a game
  synced after "Mark season over" isn't added to the frozen recap), S10 (event reads page by offset with no order, so a
  team with more than 1,000 events in a game or season can skip or double rows), S8, S11.
