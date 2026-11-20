# Review fixes: report (Nov 19, 2026)

Drew's decisions on `docs/REVIEW_builds_1-4_2026-11-19.md` (`docs/PROMPT_review_fixes_2026-11-19.md`).

**How this was done**
- Local Supabase only. Nothing on `main`, nothing deployed, no production migration. Commits are as Claude, and only the feature branches were pushed.
- Every fix has a test that I ran on the old code (it fails) and on the new code (it passes), and I read both outputs.
- Logs are in `C:/dev/pitch-caller-logs/rv/` (`fix_*`, `merged_fix/`).

**Branches**
- `feat/logging-reports` 4fa875e
- `feat/opponent-db` 6d394c4 (merges b1)
- `feat/outcome-tracking` 5bcbfc8 + 2c210cb (merges b2)
- `feat/watch-security` 2862b3a

## Per finding

| # | Branch | What changed | Before (old code) | After |
|---|---|---|---|---|
| 1 | b1 | **Email backfill.** New migration `20261118020000_report_backfill.sql` marks every game already final and every existing season as emailed, per game and season rather than per person. The report job skips those for email only, so past reports stay viewable. | `report_backfill_e2e` against the old job: a coach added today got **16 emails** (14 past game summaries, 2 past final recaps): `2 of 9 backfill check(s) FAILED` | **9/9**: the new coach gets 0. After a new game ends: exactly its 5 emails (one summary to each of the 4 coaches including the new one, and the pitcher's outing email), then none again on a second run. Also passes on the merged stack. |
| 2 | b1 | **Under 18, mark cleared.** Links his parent never approved are paused. They stay off until he turns one on (`pc_share_resume`, "Turn the link on" on his panel), or his parent approves it. | `reports_rls_test`, the review's steps: after the coach cleared the mark, the link went **live** | Stays off; he turns it on: live. Also the parent approving turns a paused link on. |
| 3 | b1 | **Under 18, widened sections.** `approved_sections` records what the parent approved. A live link serves chosen AND approved. Widening waits for the parent (it's listed on `/app/approve` and emails them again); narrowing is served at once. | After approval, the kid widened to heat maps, pitch by pitch and outings, and **all four were served** | Only the approved summary is served until the parent approves; then all four. Narrowing is served at once. `reports_rls_test`: 7 checks failed on the old SQL; **78/78** now. Page-level (probe on the live b1 site): both gaps closed. |
| 4 | b1 | **Lock-free logging migration.** Plain nullable columns, no default, and a trigger fills them for new writes. Old rows stay null; the only reader is a test, and `logging_sync_test` still passes. | `logging_lock_test` on **1,000,000 rows (1 GB)** with the old migration: **AccessExclusiveLock 11.3 s, table rewritten** (relfilenode changed); a read alongside it waited **11.3 s** | **59 ms**: AccessExclusiveLock and ShareRowExclusiveLock each held ~45 ms, **no rewrite**; the read waited **3 ms**. Old rows null, new rows filled. Identical calls: `logging_exact_test` 699 pitches, 25/25. Recount: `report_check` 23,416/23,416 (b1), 23,706/23,706 (merged). `test-sql.sh` runs the test at 20,000 rows. |
| 5 | b2 | **Owner off the staff and suggestions.** The owner path no longer reads `opp_suggestions` rows, whose text and counts come from games. `pc_opp_suggestions_owner` returns kind, spot or rating, and value only, and the page words it ("Mark middle hot?"). | `owner_opp_e2e`: the owner saw "Mark middle hot? **3 hard-hit balls there.**" `rls_matrix`: the new check failed | `owner_opp_e2e` **18/18**: the owner sees "Mark middle hot?" and the staff see the evidence. `rls_matrix` **369/369**; unit 16/16. Also fixed: `opponents_e2e`'s grid check could fail depending on the seed (a suggestion accepted earlier in the test marks a cell on the same hitter); it now compares with the hitter's grid before the taps. |
| 6 | b3 | **Drift threshold scaled to the pitcher.** The strike-rate line now sits `STRIKE_GAP` (0.4 × share) below his own normal, instead of toward the level's fixed 45%. Retuned to share 0.2 (prior 4, SE shift 0.5, p 0.9 unchanged). `peak_sim` now checks every strike rate. `outcome_check.js` follows the same rule in its own copy. | `peak_sim 200`, false notes per steady outing at 50 / 55 / 58 / 64 / 70% strikes: **0.580 / 0.465 / 0.370** / 0.265 / 0.285 (3 targets missed) | **0.260 / 0.315 / 0.290 / 0.210 / 0.275** (200 outings); 0.205 / 0.235 / 0.258 / 0.245 / 0.246 at 800. All-night flat slider caught **34 / 48 / 52 / 52 / 62%** (was 28 / 41 / 45 / 45 / 57). Drift notes still change no call: `drift_exact_test` 14/14, 463 pitches identical with notes showing; `drift_e2e` 7/7. |
| 7 | b4 | **A stale laptop can't undo a removal.** `pc_watch_register` clears a removal only on a deliberate re-add (`readd`, by a roster manager). The watch link waits for the team's answer before sending any key; the device's own list decides only if no answer comes in 2.5 s (offline). Only a watch just picked in the chooser may be re-added. | `watch_rls_test`: the head coach's automatic registration returned `{"ok":true}` and **undid the removal**. `watch_test`: a laptop reconnecting before its list refresh sent **1 key** after the removal | `watch_rls` **21/21** (the stale registration stays removed; a pitch caller can't re-add; a deliberate re-add works). `watch_test` **108/108**: 0 keys after the drop, the watch forgotten. `watches_e2e` 11/11. |
| 8 | b4 | **Stronger pairing.** `NRF.setSecurity` asks for `lesc: 1`. The README desk test now has: confirm the bond is LE Secure Connections, confirm an unpaired device can't connect, and the removal check with a second laptop that still has the watch connected. | `watch/bangle/test.js`: `lesc: undefined` | Asked for (`lesc: 1`). Whether the Bangle and the OS actually bond with LESC is the desk test. |
| 9 | b4 | **No replay after a key re-send.** The same game key arriving again (every reconnect) keeps the watch's message count and inning; only a different key starts over. The sender's numbers already count up through the whole game. | The review's reproduction on the fake: replaying call #1 after the key was re-sent was **accepted** (shown, buzzed); an earlier inning's call too | Both dropped; the next real call shows, and a new game's key starts over. `watch/bangle/test.js` **88/88**; `watch_sec_test` 22/22 (the shared crypto block is unchanged); `watch_e2e` 47/47, `fold_e2e` 112/112, `watch_optin_e2e` 17/17. |

## Merged stack

The whole stack merged again (throwaway local branch `review/merge-stack-2` in `C:/dev/pc-review`, never pushed): 1 → 2 → 3 clean, then 4. The same four additive conflicts as in the review (`app/build.py`, `test-app.sh`, `test-sql.sh`, `settings/page.tsx`); `app/dist` was rebuilt after merging 4 (byte-identical to the text merge). Logs: `rv/merged_fix/`.

| Check | Result on the merged stack |
|---|---|
| Seed (13 games through the game app) | ok, 0 warnings |
| Recounts: `report_check --site` / `outcome_check --site` | **23,706/23,706** / **215/215** agree |
| Identical calls (`test-app.sh`) | logging 699 pitches 25/25; opponents 449 pitches 12/12; drift notes 463 pitches 14/14 |
| `peak_sim` | 8/8 targets: false notes 0.260 / 0.315 / 0.290 / 0.210 / 0.275 at 50 / 55 / 58 / 64 / 70% strikes; 0% false "clear" |
| e2es | `reports_e2e` 33/33, `report_backfill_e2e` 9/9, `opponents_e2e` 29/29, `owner_opp_e2e` 18/18, `archetype_e2e` 18/18, `watches_e2e` 11/11; the 8 portal e2es (shell 43, offline 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38) all rc 0 |
| SQL (each alone) | sync 38, review 29, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix **369**, waitlist 22, v11_kinds 14, v12_sessions 11, logging_sync 10, reports_rls **78**, logging_lock 5, opp_rls 27, outcome_rls 9, watch_rls **21**: all rc 0; `test-sql.sh` as a whole rc 0 |
| `logging_lock_test`, 1,000,000 rows | 64 ms, no rewrite, a concurrent read waited 3 ms |
| Watch suites | `watch_sec_test` 22, `watch_test` 108, watch app 88, `watch_e2e` 47, `fold_e2e` 112, `watch_optin_e2e` 17 |
| Web | `tsc`, `npm test` 109/109, `next build`, site e2e: all rc 0 |
| `scripts/test-app.sh` | **rc 0** (3093 s) |
| axe | `report_audit`: 58 page states, 0 serious or critical. My extra pass (fields, the owner's views, Settings with Seasons and Watches, the player's home): clean, apart from the faded 6th row of the outings table on the player's home at 390 wide. That row is already on `main` (`pq-minitxt` and the table come from main's player home), not from these builds, as in the review. |
| Role probes (`probe.js`) | Every hole from the review is closed. The one line it still flags ("ace reads report_notes") is the 2 notes a coach shared with him, by design. |

## Production migrations, in order

The table in section 5 of `docs/REVIEW_builds_1-4_2026-11-19.md` is updated to match. In short:
1. `20261118000000_build1_logging.sql`: two nullable columns and a trigger on `events`. No rewrite, milliseconds of lock; existing rows stay null.
2. `20261118010000_reports.sql`: new tables and functions (links now carry `approved_sections` and `paused`); no existing table touched.
3. `20261118020000_report_backfill.sql` (**new**): one row per existing final game and season in a new table; nothing existing changes. **Same deploy as #2, before the report cron or the game app's post-sync call can run.**
4. `20261119000000_opponent_db.sql`: new tables.
5. `20261119003000_owner_opponents.sql`: replaces `pc_push` / `pc_can_read` / `pc_can_write` (atomic), adds owner read policies and `pc_opp_suggestions_owner`; no rows change.
6. `20261119010000_outcome_tracking.sql`: new tables, filled on the first report run.
7. `20261119020000_watch_security.sql`: new table and functions (`pc_watch_register` with `readd`).

## Still not verified

- **The real watch** (README desk test):
  - passkey pairing in Chrome;
  - **that the bond is actually LE Secure Connections** (`lesc: 1` is asked for; Espruino or the OS may fall back);
  - that an unpaired device can't connect or write;
  - AES speed and Accept-to-buzz (under 300 ms) in full and pairing-only modes;
  - battery over a soak;
  - whether removing a watch also needs the OS bond removed before re-pairing shows the code again.
- **Offline removal:** a laptop with no network keeps using its own list after a 2.5 s wait. A removal made elsewhere reaches it only once it's back online. That's by design: the removal can't win without hearing about it.
- **New members after the backfill:** a coach added mid-season still gets the emails for games finished after the migration but before they joined. Drew's decision covered the backfill only; the review's "skip people added after the game ended" was not built.
- **Real iPad / phone Safari, real Resend and the Vercel cron:** as before, Chromium and the local fakes only.
- **Production-size timing:** the lock test used 1,000,000 synthetic rows (1 GB); production's events table wasn't measured.
