# Overnight summary: Builds 1–4 (Nov 18–19, 2026)

Rules held all night:
- Local Supabase only.
- Nothing on `main`: no push, no merge, no tag.
- No deploy, no production migration.
- No engine math or hitter-model change in any build: each build's engine diff is empty, and Builds 2 and 3 each have
  a calls-identical test proving it.

Each branch has its own report (`docs/BUILDn_REPORT.md`, with every command and result) and a progress file. Screenshots
are on disk, not in git.

## Build 1: logging + outing reports + season recap
- **Status:** done, pushed. **Branch:** `feat/logging-reports`.
- **Proof:**
  - `test-app.sh` passes.
  - `report_check --site`: 23,910/23,910 numbers on 92 pages agree with an independent recount.
  - `reports_e2e`: 33/33.
  - `rls_matrix`: 347/347.
  - `reports_rls`: 67/67.
  - Every portal e2e passes.
- **Fixed in the night:** signed-out visitors could call `pc_public_recap`. The site's server now calls it with the
  service key.
- **Open:** `v11_kinds_test` fails by construction for any migration newer than v1.1. It asserts the v1.1 migration is
  the newest file. I didn't edit the test; a fix is proposed in the report. It fails the same way on Builds 2 and 3.
- **Look at first** (`C:/dev/pitch-caller-shots/build1/picks/`):
  - `1-outing-report__laptop-1440.png`
  - `4-public-recap__phone-390.png`
  - `5a-pdf-outing-page1.png`

## Build 2: opponent database (pages and data)
- **Status:** done, pushed. **Branch:** `feat/opponent-db`.
- **Built:** sections 3, 4, 6 and 7. Section 5's engine mapping is skipped, as instructed.
- **Proof:**
  - `opponents_e2e`: 28/28. It covers ratings 1/2/3 and Unknown, the zone grid and chase ring, checkboxes, the team
    page, merge, custom fields and suggestions.
  - Suggestions: 15/15 unit tests.
  - Importer: 7/7.
  - **Calls identical with every new field set:** 449 pitches, field for field.
  - `opp_rls`: 26/26.
  - Build 1's page check: 23,112/23,112.
  - Everything else passes, apart from the known `v11_kinds_test` and the baseline's `review_test` failure.
- **Look at first** (`C:/dev/pitch-caller-shots/build2/r2/`):
  - `hitter__1440x900.png`
  - `team__1180x820.png`
  - `hitter__390x844.png`

## Build 3: outcome tracking + peak profile
- **Status:** done, pushed. **Branch:** `feat/outcome-tracking`.
- **Built:**
  - The baseline ("his normal").
  - Findings with false-discovery control (Benjamini–Hochberg), each with a sentence and a small chart.
  - The report and recap section, replacing Build 1's placeholder.
  - The game app's drift check, feeding a **Notes button with a count badge only** (no sound, no pop-up).
  - The peak archetype label.
- **Proof:**
  - No planted effect: **0% of simulated seasons show a false "clear" finding.**
  - Planted effects are found: 25 points over 24 outings flagged clear 68%.
  - Drift: **0.18 false notes per steady outing** (target under 0.2).
  - The independent number check agrees: 266/266, and 167/167 on a second season.
  - **Drift notes change no call:** 475 pitches identical, field for field.
  - Notes button e2e: 7/7.
  - Build 1's page check: 23,318/23,318.
  - Everything else passes, apart from the same known two.
- **Look at first** (`C:/dev/pitch-caller-shots/build3/`):
  - `r3/outing-section__1180x820.png`: findings and charts.
  - `r4/game-panel__390.png`: the Notes button and panel in the game app.
  - `r3/home-top__390.png`: "At your best" on a player's home.

## Build 4: watch security (fake-tested)
- **Status:** done (on fakes), pushed. **Branch:** `feat/watch-security` (from `main`).
- **Built** (plan section 5 steps 1–6):
  - Shared crypto: AES-128, CMAC, per-inning keys, a 16-byte sealed message.
  - Passkey pairing settings on the watch.
  - A fresh game key per game, accepted only over the bonded link and kept in memory only.
  - End-game wipe and 6-hour expiry.
  - A team watch list with Remove in the portal (Settings → Watches).
  - README desk-test additions.
- **Proof** (plan section 4 items 1–5, all on the fakes):
  - Crypto: 22/22. Published AES and CMAC vectors on both sides, an independent OpenSSL build, matching keys for
    innings 1–255.
  - Attacks the watch rejects silently: all 128 single-bit tampers, replays, wrong inning, wrong game, a key over an
    unbonded link, plain text.
  - End-game wipe and 6 hours on the fake clock.
  - Every write within 20 bytes.
  - The whole watch flow still works end to end on the fakes: `watch_test` 86, `watch_e2e` 41, the watch app's own
    test 68.
  - Permissions: 19/19. Portal: 11/11.
  - Everything else passes, apart from the same known two.
- **Not verified** (needs the real watch; also in the README's desk-test list):
  - Pairing in Chrome.
  - That an unpaired device can't connect or write.
  - AES speed and Accept-to-buzz delay (target under 300 ms).
  - Programmable off.
  - Battery over a soak.
  - Whether the OS bond needs removing by hand.
- **Look at first:**
  - `C:/dev/pitch-caller-shots/build4/settings-watches-confirm__1440.png`
  - `settings-watches-removed__1440.png`
  - The README's new desk-test list: `watch/bangle/README.md`.

## Needs Drew's decision
1. **Drift sensitivity (Build 3).** The plan's default line alarmed about 1 outing in 3. The chosen settings alarm about 1
   in 5 but catch only 28% of a slider that goes flat all night (12% when it drops mid-game). Keep "rarely wrong, often
   silent", or accept more false notes for about twice the catches? The sweep is in `BUILD3_PROGRESS.md`.
2. **Archetype wording for players (Build 3).** "Effectively wild" shows on the player's own home. Soften it for
   players, or show it to staff only?
3. **Owner editing of opponents (Build 2).** The plan says "owner always". Today an owner who isn't on the staff can't
   read team data. Changing that is a permission decision.
4. **Plan default lists (Build 2):** pitch checkboxes and team tendencies. Edit as you like.
5. **`v11_kinds_test` (all builds):** approve the proposed fix (apply later migrations after the v1.1 step), or another.
6. **Build 1 proposals:** one email per outing vs per game; a real 13–17 parent invite; whether to hide the opponent's
   name in a pitcher's own report; logging double plays.
7. **Watch (Build 4).** If the Bangle's AES is too slow at the desk test, the plan's fallback is pairing-only
   encryption for the prototype.

## Housekeeping done
- My Python edits on Windows had rewritten about 35 files per branch with Windows (CRLF) line endings. Each branch has
  a commit putting them back to Unix (LF) endings, with no content change (diff empty ignoring CR).
- `main` still has 17 CRLF files of its own; they're untouched.
