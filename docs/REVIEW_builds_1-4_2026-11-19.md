# Review of Builds 1–4 (Nov 19, 2026)

Independent review, fresh context (run on Opus 5.5; the brief asked for Fable 5.2). Every number below I re-ran myself on the local Supabase and read the output; logs are
in `C:/dev/pitch-caller-logs/rv/`. Nothing pushed to `main`, nothing deployed, no production migration. Diff reading was
split across four read-only reviewer agents (one per branch); I verified every finding listed here myself (code read, a
live probe, or a test) and dropped the ones that didn't hold.

## 1. Verdict

| Branch | Verdict |
|---|---|
| `feat/logging-reports` (1) | **Not ready**: the first report run in production emails every past game to everyone (blocker 1). Ready once that and the two under-18 gaps are fixed. |
| `feat/opponent-db` (2) | **Ready after fixes**: its blocker (owner on the staff could overwrite the team's own record) is fixed in this review; the should-fixes are small. |
| `feat/outcome-tracking` (3) | **Ready after fixes**: no call changes, nothing leaks; drift notes run over Drew's 0.35 line for pitchers who throw 58% strikes or fewer, and one missing try/catch can stop other teams' emails. |
| `feat/watch-security` (4) | **Ready after fixes** (and still needs the desk test): a head coach's own laptop can silently un-remove a removed watch; pairing doesn't ask for LE Secure Connections. |

## 2. Findings

Evidence logs: `C:/dev/pitch-caller-logs/rv/`. The role-by-role probes on the seeded season are `b3/probe.log` and `b3/probe2.log`; the script is `probe.js`.

### Blockers

**B1 (Build 1). The first report run in production emails every past game to everyone, and every new member gets a backlog.**
- **Where:** `web/lib/report_jobs.ts`.
  - `outingReports` takes every final game the team has ever played, with no date cutoff. `finalRecaps` does the same for every season.
  - Nothing checks when a person joined. The only guard is "not in `report_mail` yet", and in production `report_mail` starts empty.
- **Evidence** (`b3/probe.log`, section I): I added a coach to the seeded team today and ran the report job once. It returned `{"summaryMails":13,"recapMails":1}`: the new coach was sent 13 game summaries for past games and the spring final recap.
- **In production:** the first iPad sync or the daily cron would send one email per past outing to every pitcher with an account, and one per past game to every coach.
- **Proposed fix** (needs Drew's choice of window):
  - Only consider games whose `endedAt` is within N days (e.g. 7).
  - Skip `final_recap` for seasons that ended more than N days ago.
  - Skip people added after the game ended.
  - Either way, as a deploy step: pre-fill `report_mail` in the same migration with `status 'skipped'` rows for every existing final game and person.
- **Not fixed here:** the seeded season and its e2es are backdated to Feb–Oct, so the window touches the test fixtures, and the window is a product choice.

**B2 (Build 2), fixed in this review. An owner who is on the staff as a viewer or player could overwrite the team's own record, and an owner off the staff could plant a second "our team".**
- **Where:** `20261119003000_owner_opponents.sql`. `pc_push` guarded `isOurs` only `if role is null` (off the staff), and matched only the literal `true`. The game app treats any truthy `isOurs` as the team's own record.
- **Evidence** (`b3/probe2.log`, sections G and F):
  - With the viewer as the org's owner, the team's own record was renamed "Owned by viewer". With a player as owner, it became "Owned by ace".
  - The off-staff owner's push of `{isOurs: 1}` was applied.
- **Fix:** `feat/opponent-db` 7118d4e, merged into `feat/outcome-tracking` 48250ed.
  - The guard now applies whenever the write goes through the owner path without "manage opponents" or "manage roster", and treats any `isOurs` that isn't false or null as ours.
  - The read policy treats `isOurs` the same way.
  - The migration was never applied outside the local Supabase, so it was edited in place.
- **Tests:** three new checks in `rls_matrix_test`: owner-viewer refused; `isOurs: 1` and `"yes"` refused; the head coach still allowed.
  - Before the fix: `2 of 368 team check(s) FAILED` (`rls_before_fix.log`).
  - After the fix: `all 368 team checks passed`. `opp_rls` 27/27, `sync_test` and `sync_auth` pass.

### Should fix

| # | Build | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| S1 | 1 | **Clearing a player's under-18 mark puts his unapproved link live.** The migration's comment says such a link "never goes live on its own", but `pc_share_live` only asks for approval while the player is marked. | probe C: the coach clears the kid's mark, and `/r/<kid token>` goes from 404 to **200** with no parent approval | Store `approval_required` on `recap_shares` when the link is made while the player is marked, and check it in `pc_share_live`. |
| S2 | 1 | **After the parent approves, an under-18 player can widen what's public.** `pc_share_sections` keeps `approved_at`. | probe C: the parent approves summary only; the kid turns on heat maps, pitch by pitch and outings; `approved_at` is kept and the page stays 200 | When a marked player adds a section, clear the approval and email the parent again. |
| S3 | 1 | **The logging migration rewrites `events` twice under ACCESS EXCLUSIVE.** It adds two `STORED` generated columns, and only `logging_sync_test` reads them. | `20261118000000_build1_logging.sql` lines 8–9; grep finds no other reader | Drop the migration, or add both columns in one `ALTER TABLE` (one rewrite) in a quiet window, or use plain nullable columns with a batched backfill. Every iPad's sync waits while it runs. |
| S4 | 1 | **Report emails are never retried, and one error stops the run for every later team.** | `report_jobs.ts` lines 51–77 and 150 (code read): `claim()` blocks forever once a row exists (failed, no_provider, or a crashed `sending`). The team loop has no try/catch. `finalRecaps` inserts `version: 1` after a non-atomic check, so two runs at season end can collide | Let a claim take over `failed` or stale `sending` rows; add a try/catch per team; insert with `on_conflict … ignore-duplicates`. |
| S5 | 1 | **A game synced after "Mark season over" lands in no recap.** `refreeze` exists but nothing calls it. | `grep -rn refreeze web/` finds only its definition | Call `refreeze` when a newly complete game falls inside a closed season. |
| S6 | 1 | **Decisions to confirm.** (1) The pitcher's own report shows "Batting 3", not the hitter's name. Drew's rule is "everything but coach overrides, coach style notes and coach notes", but the build follows the older rule "players never see hitters". (2) A weak-contact hit, even a bloop single, counts as positive, where plan §2 lists any hit as negative. | `pc_report_event` drops `hitterId` for the pitcher view, and `reports_e2e` asserts it. In `report_outcomes.ts:53`, weak contact wins over "a hit" | Drew to rule on each. |
| S7 | 2 | **A spray tag from the portal can hide a lineup slot's engine tags, which could change a call.** In rare cases a lineup slot carries approach/path tags while its hitter record has none. If the portal then gives that hitter a spray tag, the slot's tags are ignored. Slot tags exist only when a slot had no hitter record when it was tagged. | `app/index.src.html:297`: `hitterTags` reads `(x && x.scoutTags) \|\| b.scoutTags`, and the portal writes `scoutTags = {spray}` on a hitter with no tags (`web/lib/opp_model.ts:100`). Not reproduced; `opponent_exact_test` doesn't cover it | Keep spray outside `scoutTags`, or merge the two key by key. |
| S8 | 2 | **Suggestions and merges can record a change that didn't happen, and lose at-bats.** Accepting a suggestion marks it accepted before the hitter push, and a merge is logged before it's pushed. If the push fails, the record says done but nothing changed. After a chained merge (A→B→C), A's at-bats drop out of C's suggestions. | `opponents/actions.ts`, `opp_suggest.ts:25` (code read) | Push first and record after; resolve alias chains to the root. |
| S9 | 3 | **Drift notes go over Drew's ≤ ~0.35 line for pitchers who throw fewer strikes, even with their own history.** The drift line leans toward a fixed "bad end" (45% strikes, from college priors), so a pitcher whose normal sits near it alarms more often. `peak_sim` only simulates a 64%-strike pitcher. | My simulation on the build's own `peak.js` (`scratchpad/coldstart.js`), 400 outings each with 8 outings of history: 64% strikes gives 0.29 notes per outing (in line with the report's 0.32); **58% gives 0.37, 55% gives 0.40, 50% gives 0.56**. With no history (first outing, or a new iPad), a 50% pitcher gets 0.61 notes, and 40% of outings show a false "clear" finding | Measure the line from his own normal rather than a fixed bad end, or scale it by level; add level priors (HS, travel); suppress notes and findings until a pitch has real history; add 55% and 50% pitchers to `peak_sim`'s targets. |
| S10 | 3 | **One failure in `storeOutcomes` stops other teams' emails, and its event reads can skip or double rows.** It has no try/catch inside the team loop, so any error (e.g. the migration not yet in production) stops outing and recap emails for every later team in the cron run. It reads events in pages by offset with no `order`, so a team with over 1,000 events can lose or double rows. | `report_jobs.ts:82` and `:240` | Wrap each team in a try/catch and run this after the mail work; add `&order=id`; select only the fields `peak.js` needs (today every sync downloads every event of every season). |
| S11 | 3 | **The staff report's "Drift notes in the game" are recomputed, not what the iPad showed.** | The iPad's log has no radar and uses only that device's history; the site uses events with radar and the whole team's history (`index.src.html:869`, `peak.js:220`) | Store the notes the device actually showed, or title the section "Drift notes (recomputed)". |
| S12 | 4 | **A head coach's laptop silently un-removes a removed watch.** Scenario: the head coach removes a watch in the portal while the game screen is open. On the next reconnect the watch gets a key again, and the removal is cleared on the server for good. | The game app calls `pc_watch_register` on every link, and for anyone who manages the roster, register sets `removed_at = null` (`20261119020000_watch_security.sql:36-43`). The app refreshes its removed list 3 s after boot, then every 30 s only while the watch card is on screen (`index.src.html:687-700`). `watch_rls_test` line 69 asserts the re-add path | Automatic registration must never clear `removed_at`; only a deliberate "add back" button sends a `readd` flag. Refresh the list before every key push. |
| S13 | 4 | **Pairing doesn't ask for LE Secure Connections.** Espruino defaults to legacy pairing. Anyone who records the one pairing exchange can recover the link key offline (the known Crackle attack) and read every game key after that. | `watch/bangle/pitchiq.app.js:289`: `NRF.setSecurity({ passkey, mitm: 1, display: 1 })` has no `lesc: 1` | Add `lesc: 1`, a check in `test.js`, and a desk-test item that Chrome and Windows pair with LESC. |
| S14 | 4 | **Smaller watch gaps: removal per browser, replay reset, silent expiry.** (1) Removal is keyed on Chrome's `device.id`, which differs per origin and profile, so a second laptop's row survives the first one's removal. (2) Each reconnect re-sends the key, which resets the watch's replay counter (`lastN`): an older frame is accepted again. **Reproduced** on the build's watch fake (`scratchpad/wt/replay_rekey.js`): calls #1–#3 shown; replaying #1 is dropped; after the same key is re-sent, replaying #1 is accepted, shown and buzzed. Writing a frame still needs the bonded link. (3) The 6-hour expiry restarts on every reconnect, and a link up for 6 hours drops calls while the sender still shows ✓. | code read; (2) reproduced | Key the list on an id the watch reports; keep `lastN` when the same key arrives again; re-send the key on a missed receipt. |

### Nits
- `report_audit.js` without `--runs` sets `RUNS = NaN` and silently skips Lighthouse ("median undefined" in my first run). With `--runs 3` it works.
- The Build 3 report's `outcome_rls_test` "1 FAIL" comes from the log summarizer counting the text "0 FAIL", not from the repo's runner.
- "Effectively wild" fires on 3 of the 4 seeded pitchers (4 of 4 in the follow-up run), so the threshold looks loose. On the coach's outing, "At his best: Effectively wild, pitches to contact" reads oddly.
- The frozen public recap's summary-only data still carries each outing's date and game id. The page strips them, so they reach only the site's server (no date in the HTML, checked). Strip them in SQL anyway.
- On a phone, the public recap's pitch-mix table cuts off after "Strike" with no cue that it scrolls sideways, and separator dots dangle at line starts in the header.
- The outing PDF's at-bat sequence line may clip at the right margin ("… / 2-2").
- axe (my extra pass, `post/axe_extra.log`): on the player's home at 390 wide, the outings table's 6th row fails contrast (#666 on #15141a, 3.15:1). The table is already on `main`; it looks like a row animation caught mid-fade. Not from these builds. The fields page, the owner's views and Settings are clean.
- The owner's hitter page (off the staff) still shows suggestions that quote at-bat counts ("3 strikeouts in 18 plate appearances"). That's opponent data by the decision, but it sits next to "Only the team's staff can see game history."

## 3. Claims checked

**Where:** "b3" means the stack top (b1 + b2 + b3, with this review's fixes) on a fresh seeded season. "merged" means all four builds merged onto `main` (throwaway branch). "b4" means `feat/watch-security` alone. "b1" and "b2" mean each branch alone.

**Counts:** totals that come from the seeded season (numbers on pages, outcome checks, archetype checks) change from seed to seed. For those, the claim that matters is "all agree", not the exact total.

**Logs:** `C:/dev/pitch-caller-logs/rv/<where>/`.

| Claim (report) | Re-run | Match |
|---|---|---|
| **Engine untouched on every branch** | `git diff` of `app/engine.js`, `engine_data.json`, hitter and learner files against each base: empty on all four | yes |
| B1 `logging_exact_test`: 699 pitches identical, 25/25 | b3 and merged: 699 pitches, 25/25 | yes |
| B1 `report_check --site`: 23,910/23,910 on 92 pages (23,463 on a fresh season) | b3 fresh: **23,470/23,470** (87 pages, 20,024 read); merged: **23,605/23,605** | yes (all agree) |
| B1 `reports_e2e` 33/33 | merged: **33/33**. On b3, 31/33: the two "one email per coach" checks failed because my backlog probe had added a coach to that season. Clean re-run: **33/33** on a re-seeded b3 season (`post/reports_e2e.log`) | yes |
| B1 `reports_rls` 67/67 | b3, merged: 67/67 | yes |
| B1 axe: 58 page states, 0 serious or critical | b3: 58 states, 0 | yes |
| B1 Lighthouse mobile medians 89 / 89 / 90, accessibility 100, CLS 0 | b3: **87** / 89 / 90, 100, 0.000 (target ≥ 85) | yes, within noise |
| B1 `npm test` 93/93 | b1: **93/93**; b3 and merged: 108/108 (with builds 2 and 3's tests) | yes |
| B1/B2/B3 every portal e2e passes (shell 43, offline 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38) | b3, b4, merged: identical counts, all rc 0 | yes |
| B2 `opponents_e2e` 28/28 (29/29 after follow-ups) | b3, merged: 29/29 | yes |
| B2 calls identical with every new field set: 449 pitches, 12/12 | b3, merged: 449, 12/12 | yes |
| B2 importer 7/7 | b3, merged: 7/7 | yes |
| B2 `opp_rls` 26/26 (27/27 after follow-ups) | 27/27 | yes |
| B2 follow-ups: `rls_matrix` 365/365 | 368/368 with this review's 3 new checks; the original 365 all pass | yes |
| B2 follow-ups: `owner_opp_e2e` 13/13 | 16/16 with this review's 3 new checks | yes |
| B3 `peak_sim`: 0% false "clear", 0.06 early signs, **0.320** false drift notes, catches 53% / 24% | b3, merged: 0.0%, 0.06, 0.320, 53%, 24% | yes (see S9: only for a 64%-strike pitcher) |
| B3 `outcome_check --site` 266/266, 184/184 | b3 fresh: **175/175**; merged: **237/237** | yes (all agree) |
| B3 `peak_test` 22/22 | 23/23 (the follow-ups added one) | yes |
| B3 drift notes change no call: 475 pitches identical (follow-ups: 14/14, notes really showing) | b3, merged: **463** pitches, 14/14, "drift notes really showed" | yes (the 475 was the overnight driver; the stricter driver plays 463) |
| B3 `drift_e2e` 7/7 | 7/7 | yes |
| B3 `outcome_rls` 9/9 | 9/9 | yes |
| B3 `archetype_e2e` 18/18 | b3: 17/17 (the kid's label wasn't "wild" on this seed, so one check is skipped); merged: 18/18 | yes |
| B4 crypto 22/22 | b4, merged: 22/22 | yes |
| B4 `watch_test` 106/106, watch app 80/80, `watch_e2e` 47/47 | b4: 106, 80, 47; merged: 106, 47 (and `fold_e2e` 112, `watch_optin_e2e` 17) | yes |
| B4 `watch_rls` 19/19, `watches_e2e` 11/11 | b4, merged: 19, 11 | yes |
| Every build: `tsc`, `next build`, site e2e pass | b3, b4, merged: all rc 0 (`next build` takes 6 s because it reuses the cache; the full build is in each run's `build.log`) | yes |
| Every build: `test-app.sh` passes | b3 rc 0 (3181 s); b4 rc 0 (2820 s); merged rc 0 (3204 s) | yes |
| Known on b1–b3: `review_test` 28/29 | 29/29 after the tidy-up (b1, b2, b3, merged) | fixed |
| Known on b4: `review_test` 28/29, `v11_kinds_test` fails | b4 alone: still both, as expected; merged: 29/29 and 14/14, and `test-sql.sh` as a whole rc 0 | yes |
| Merged stack: SQL tests | sync 38, review 29, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix 368, waitlist 22, v11_kinds 14, v12_sessions 11, logging_sync 10, reports_rls 67, opp_rls 27, outcome_rls 9, watch_rls 19: all rc 0 | — |

## 4. Tidy-ups

| Tidy-up | Change | Before | After |
|---|---|---|---|
| `review_test` (on `feat/logging-reports` 6d46443, merged into b2 and b3) | The member list is sorted in the test by code point instead of by Postgres's collation. The assertion and the product code are unchanged. | `FAIL accepted invites made them members (charter:caller coach:head coach2:head pitcher:player)`, 28/29 (`review_before_b1.log`) | 29/29 alone (`review_after_b1.log`) and in b3's full SQL run |
| Owner's empty game-history sections (on `feat/opponent-db` 2ee2de3, merged into b3) | For an owner off the staff, the team page drops "N games against us", the Seen / At-bats seen columns and the lineups, and the hitter page drops "Seen …", the totals line and "Every at-bat". Each shows one line instead: "Only the team's staff can see game history." No events are read for him. `owner_opp_e2e` gains 3 checks: both pages for the owner, plus the staff still seeing their history. | New checks against the old b3 site: **2 of 16 FAILED** (`owner_before_b3.log`) | **16/16** on the rebuilt b3 site (`owner_after_b3.log`) and on a fresh season (`b3/owner.log`) |

Also fixed and pushed: B2 above (owner `isOurs` guard, 7118d4e). Nothing else was changed on the branches.

## 5. Merge order and production steps

**Merge check** (throwaway local branch `review/merge-stack` in `C:/dev/pc-review`, never pushed):
- **1 → 2 → 3 onto `main`:** clean.
- **4 onto `main` alone:** clean.
- **4 after 1–3:** four textual conflicts, all additive:
  - `app/build.py`: `watch_sec.js` must come before `watch.js`, then `peak.js`.
  - `scripts/test-app.sh`: keep `import_opp_test`, `peak_test` and `watch_sec_test`.
  - `scripts/test-sql.sh`: keep both lists.
  - `settings/page.tsx`: import both `markSeasonOver` and `removeWatch`, and keep Seasons and Watches.
- **`app/dist`:** auto-merged; a fresh `build.py` gives byte-identical output.
- **Full suite on the merged result:** see section 3.

**Order:** merge 1, 2, 3, then 4. Rebuild `app/dist` after merging 4 rather than trusting the text merge. Because 4's copy of `v11_kinds_test` fails until it has 1's fix, merge 4 last.

**Production migrations (Drew to approve each), in this order** (updated Nov 19 after the review fixes; see `docs/REVIEW_FIXES_REPORT.md`):

| # | Migration | What it does to existing rows |
|---|---|---|
| 1 | `20261118000000_build1_logging.sql` | Adds two **nullable columns with no default** to `public.events` (`style_applied`, `has_mix`) and a trigger that fills them for events written from now on. There's no table rewrite, and the lock is held for milliseconds: on a 1,000,000-row, 1 GB events table it took 59 ms and a concurrent read waited 3 ms (the old version: 11.3 s, with a rewrite). **Existing rows keep both columns null**, meaning "written before this migration"; nothing reads them but the tests. |
| 2 | `20261118010000_reports.sql` | New tables (notes, seasons, frozen recaps, under-18 marks, public links, mail log) and functions. Public links now carry `approved_sections` and `paused`. It touches no existing table. Needs `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `SITE_URL` on Vercel, and the second cron entry in `vercel.json`. |
| 3 | `20261118020000_report_backfill.sql` | **New:** a table `report_backfill`, filled with one row for every game that is already final and every season that already exists. Nothing existing changes. Effect: none of those is ever emailed (their reports stay viewable), so only games finished after this migration send. **Apply it in the same deploy as #2, before the report job's cron or the game app's post-sync call can run.** |
| 4 | `20261119000000_opponent_db.sql` | New tables (custom fields, suggestions, merge log). No existing rows. |
| 5 | `20261119003000_owner_opponents.sql` | Replaces `pc_push`, `pc_can_read` and `pc_can_write`. Adds owner read policies on `teams`, `hitters` and `opp_merges` (any truthy `isOurs` is kept from him), and `pc_opp_suggestions_owner`, which gives the owner off the staff suggestions' questions only; he has no direct read of `opp_suggestions`. No rows change. The swap is atomic: calls already running finish on the old body. Each new policy calls a function per row, a small cost on every coach's read of teams and hitters. |
| 6 | `20261119010000_outcome_tracking.sql` | New tables `peak_baselines` and `outcome_findings`. No existing rows. The first report run fills them for every past outing, reading every event (S10, not changed by the fixes). |
| 7 | `20261119020000_watch_security.sql` | New table `team_watches` and three functions; `pc_watch_register` takes `readd` (only a deliberate re-add clears a removal). No existing rows. |

None of the seven has a down script. Undoing #5 means re-applying the `20261106000000_pitchiq_teams.sql` bodies. #1's columns and trigger can be dropped with no effect on anything else.

## 6. Not verified

- **A real iPad, phone Safari, or Bangle.js.** Everything ran in Chromium and the fakes. That leaves Build 4's whole desk-test list open: pairing, LESC, AES speed, Accept-to-buzz, battery, OS bond.
- **Real Resend delivery and the Vercel cron.** The local fake inbox only.
- **S7 (spray hiding slot tags)** is from reading the code; I didn't build a game that reproduces it.
- **S4, S5, S8, S10, S11, and parts (1) and (3) of S14** are from reading the code, not reproduced. S14's replay is reproduced on the watch fake.
- **The full `peak_sim` / `drift_exact_test` / `drift_e2e`** ran only inside `test-app.sh` (see section 3), not separately.
- **Production-sized tables.** Lock times for migration 1 and the cost of the report job on a multi-season team were not measured.

## 7. Screenshots to look at before saying go

1. `C:/dev/pitch-caller-shots/build1/rv/outing__1440x900.png`: the outing report on a laptop (full page, fresh season). Clean; every number labeled.
2. `C:/dev/pitch-caller-shots/build1/rv/public__390x844.png`: the public recap on a phone. Note the pitch-mix table cut off after "Strike".
3. `C:/dev/pitch-caller-shots/review/pdf-outing-p1.png`: the outing PDF, page 1 (rendered from `build1/rv/pdf-outing.pdf`). Its numbers match the web page.
4. `C:/dev/pitch-caller-shots/build3/rv/outing-section__1180x820.png`: outcome tracking on the coach's outing ("At his best: Effectively wild, …"; see the nit).
5. `C:/dev/pitch-caller-shots/review/owner-team__1440.png` and `owner-hitter__390.png`: the tidy-up, the owner off the staff with one line instead of empty game history.
6. `C:/dev/pitch-caller-shots/build3/r4/game-panel__390.png` and `build4/settings-watches-confirm__1440.png`: the game app's Notes badge and panel, and Settings → Watches. These are from the builds' own runs; I looked at them. Watches is the last decision point before the desk test.

Every other screen from this review is in `C:/dev/pitch-caller-shots/build1/rv/` (98 files), `build2/rv/` (29) and `build3/rv/` (33), at 1440, 1180, 820 and 390.

