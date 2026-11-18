# PitchIQ app v2 (Floodlight): build report

## Round 4 (Nov 17, night)

**What changed**
1. **Watch switch in Setup (approved).**
   - Where the browser has Web Bluetooth, Setup always shows "Use watches on this device", a real switch at 48 px.
   - The full Watches card (connect, receipts, signs) shows only once watch mode is on, through the switch or `?watch=1`.
   - The setting is the same stored flag `?watch=1` / `?watch=0` set. Turning it on or off saves, then reloads the app once.
   - Without Web Bluetooth (the iPad) there is still no Watches row at all. I read "always in Setup" as "always, on devices that can use watches", to keep the earlier decision that the iPad shows no watch UI.
   - `watch_e2e`: line 93's assertion now says the switch shows, off, and no Watches card until watch mode is on (as approved). Line 74 got a selector-only change: its "no Web Bluetooth" section runs in Chromium, which does have Bluetooth, so the new row titled "Watches" tripped a text match. The check now looks for the card element; the assertion is unchanged.
   - `watch_optin_e2e`: 17 checks. New: switch on, so the card shows and the setting survives a reload. Switch off, so the card is hidden and the Game screen has a call but no Accept and no watch status. A hand-off link with no `?watch` follows the saved setting, both on and off.
2. **game_mix_e2e flakiness: pre-existing, found and fixed.**
   - 5 runs on 6037440: 0 failures, but runs 3 and 4 differed from the others (seeds 57, 69, 81 and 11).
   - 5 runs on d1e138a: 0 failures; run 5 differed (seed 21).
   - So the variance is older than round 3. Round 3's one failure (4 games over 70%) was the same variance landing at the limit.
   - **Cause:** the app sets `DB.warm = false` only after several awaits in its start-up, so for a few milliseconds after `DB.ready` the flag read `undefined`. The test waits for `DB.warm !== false`, which passes on `undefined`. When it checked inside that window, it started pitching before the start-up learning had run, and the learning then landed mid-game.
   - **Proof:**
     - Forcing an early start reproduces the variant games exactly (seed 57 tier 2: Slider 53 / Fastball 24 / Changeup 5; seed 69 tier 3; seed 11 tier 3).
     - Ruled out: key presses arriving before a call was made (0 in every traced game, also at 4x and 6x slower CPU), clock reads, record ids (they use `crypto`, not `Math.random`).
     - 63 traced games across three parallel runs were identical.
   - **Fix (app, not test):** `DB.warm` is `false` from the moment `DB` exists, and it settles to `true` on the no-database and database-error paths too. Only the test reads the flag.
   - **Result:** in 8 of 8 loads, `DB.warm` read `false` at the instant `DB.ready` turned true. After the fix, 6 runs on a95b522 (5 in a row, plus 1 inside the suite list) agree game by game: 52.1% average top pitch and 3 games over 70% every time. They match the path both old commits took in most of their runs.
   - The limit was not touched.
3. **IBB at 1180x740: 28 px to spare (was 8).**
   - Taken from spacing only, in the landscape layout for screens up to 920 px tall: the gap between the strip and the panels 14 to 10 px, panel top padding 14 to 10, the runner-controls row 6/4 to 4/2, the location box padding 6 to 4.
   - Result keys 50 to 48 px (the floor).
   - Kept: the 6 px gap between result keys (a gloved miss must not land on the next key), the 48 px location grid, and the call's size.
   - `fold_e2e` now also requires at least 24 px under the lowest required item in every state and size (112 checks).
4. **The intentional-walk check.** There is no intentional-walk button in the app: in the IBB state the app shows the suggestion "Worth considering the intentional walk here." and the coach signals the walk. So `fold_e2e` now requires that suggestion to be visible in the IBB state. A button that issues the walk would be a new action; I haven't built one.

**Checks** (each suite alone, on a95b522; logs in `$TEMP/appv2-checks/r10`)

| Check | Result |
|---|---|
| `tsc`, `npm test`, `next build` | clean; 60 of 60 (including the token drift checks); compiled |
| site e2e | all site checks passed |
| `portal_e2e`, `shell_e2e`, `gameplan_e2e`, `billing_e2e`, `player_admin_e2e`, `uploads_e2e`, `retention_e2e`, `offline_game_e2e` | all pass: 30, 43, 38, 52, 24, 33, 10, 22 (252) |
| `rls_matrix_test` | 347 passed |
| `scripts/test-app.sh` | every step passes up to `v11_fixture_test`, which stops under Git Bash on its `tar` path (known); it passes 8 of 8 with Windows' `tar`. Every later step was run alone and passes, including the 15 browser suites |
| `watch_e2e` / `watch_optin_e2e` / `fold_e2e` / `sync_pill_e2e` | all passed / 17 / 112 / 16 |
| `game_mix_e2e` | 6 of 6 pass, identical game by game |
| axe: 240 game captures, 242 portal captures | 0 serious or critical |
| Lighthouse mobile x3 (medians) | launcher 91, pitcher 90, pitcher stats 87, Game Day 90, wizard 90; accessibility 100; layout shift 0 |
| WebKit and Firefox | pass |
| Game trace | call painted median 47 ms, max 99 ms; longest task 64 to 70 ms (the engine's at-bat solve; still over 50 ms, still out of scope) |

The round script itself died after the last `game_mix_e2e` run. A stray line I left in it when patching the script was a syntax error. No test hung. The steps it skipped (the game-by-game comparison, the contact sheets) were run by hand, and the round's local server left on port 3120 was stopped.

**Not verified:** a real iPad in Safari (740 px is your figure); real watches; the switch's reload on a real Android or ChromeOS device (tested in Chromium with stand-in watches); that `game_mix_e2e` can never vary again. The cause I found is fixed and the runs after the fix agree game by game, but a one-in-50-games event can't be proven absent in a few runs.

**Captures (2x):** `docs/app-v2-shots/final/picks/r4-ibb__day__1180x740.png`, `r4-switch-off__night.png`, `r4-switch-off-focus__night.png`, `r4-switch-on__day.png`.

---


## Round 3 (Nov 17, evening): Accept above the fold, and the approved items

**Blocker: fixed and checked.** On an iPad in landscape, Accept ended at 830 px (off the bottom at 820, fully below the fold in Safari's roughly 740). Accept and the rest of the call's action row now sit inside the call card, right under the call's words. The reasons, read-out and target come after. Landscape screens up to 920 px tall get a packed layout. Every in-game target stays at 48 px or more: the location grid is unchanged and the result keys are 50 px.
- **New check, `app/fold_e2e.js` (84 checks, all pass):**
  - States: accept-ready, accepted (both watches and one), not-on-watch, shake-off, get-it-over and IBB, each with two watches connected so Accept is present.
  - Sizes: both themes, at 1180x820 and 1180x740.
  - Pass rule: with the page at the top and never scrolled, the call's words, sign, where, Accept, the watch status and all six result keys must be inside the viewport.
  - Tightest case: IBB at 740, because runner controls add a row; its lowest key ends at 732 px.
  - It is in `scripts/test-app.sh`.
- **`app/shots_v2.js`:** no longer scrolls `.call-acts` into view on an iPad or a laptop (it still does on a phone, which is not a target). It has a new 1180x740 view (`ipad-l-safari`) and can be required as a module.
- **Long watch status:** "Not on Bangle.js c3d4: give the sign" wraps inside its pill, so the row stays on one line and nothing is cut.

**Approved items**
- **Offline/syncing pill in the game bar.**
  - It shows only on a device signed in to a team: "Offline" (quiet outline), "Syncing" (blue), then "Synced" for 4 s.
  - It reads the sync's own state and changes nothing in the sync.
  - Test: `app/sync_pill_e2e.js`, 16 checks: the call never moves, and the pill is a screen-reader status. The real offline flow was captured too.
  - Limit: after the signal returns in the middle of a game it does not say "Syncing", because the app never syncs during a game (existing behavior; the game goes up when it ends).
- **"Each count and pitch"** is folded behind a disclosure, with a line saying what's inside (row count and which rates). It opens and closes by click and by Enter, on laptop and phone.
- **Watch mode remembered.**
  - Checking showed the device already keeps watch mode once the app has been opened with `?watch=1`, so a Game Day hand-off after that already opens with watches. My earlier proposal said otherwise; it was wrong.
  - New test: `app/watch_optin_e2e.js` (9 checks) proves it, using a hand-off-style link with no `?watch`, and confirms nothing changes without Web Bluetooth.
  - I also built a switch in Setup ("Use watches on this device"), but it breaks an existing `watch_e2e` assertion ("no Watches card until it's opened once with ?watch=1"), so I took it back out. It is proposal 6 below.

**Checks on the final code** (each run alone; logs in `$TEMP/appv2-checks/r9`)

| Check | Result |
|---|---|
| `tsc`, `npm test`, `next build` | clean; 60 of 60; compiled |
| site e2e and the eight portal e2es | all pass, 252 portal checks, tests unchanged |
| `rls_matrix_test` | 347 passed |
| `scripts/test-app.sh` | on the committed build every step passes up to `v11_fixture_test`, which stops under Git Bash on its `tar` path (known; it passes 8 of 8 with Windows' own `tar`); every later step was run by hand and passes, apart from `game_mix_e2e` (next row). `watch_e2e`, `sync_pill_e2e` and `game_mix_e2e` were re-run after the Setup switch was taken out |
| `watch_e2e`, `watch_test`, `fold_e2e`, `watch_optin_e2e`, `sync_pill_e2e` | all pass |
| `game_mix_e2e` | failed once in the full run (4 games over 70%, limit 3), then passed three runs in a row. It is seeded but not fully repeatable, and it sits exactly at its limit. I don't believe this round caused it, but I can't prove that |
| axe, 240 game captures and 242 portal captures | 0 serious or critical |
| Lighthouse mobile x3 | launcher 91, pitcher 90, pitcher stats 88, Game Day 90, wizard 90 (medians); accessibility 100; layout shift 0 |
| WebKit and Firefox | pass |
| Game trace | call painted median 44 to 47 ms, max 102 ms; longest task 71 to 74 ms (the engine's at-bat solve, not in scope this round) |

**Selectors changed in tests:** none. No existing test file was edited. The three new tests were added to `scripts/test-app.sh`.

**Not verified this round:** a real iPad in Safari (the 740 px height is the figure you gave; I didn't measure Safari's bars myself); real watches; the pill's "Syncing" state through a real sync. Its states are proven with a stand-in that marks the device as signed in and flips the busy flag; the real offline state was captured against local Supabase.

**Look at these first (round 3)**
1. `docs/app-v2-shots/final/picks/r3-accept-ready__night__1180x740.png` and `r3-accept-ready__day__1180x820.png`
2. `docs/app-v2-shots/final/picks/r3-ibb__day__1180x740.png` (the tightest state)
3. `docs/app-v2-shots/final/picks/r3-not-on-watch__2x.png` (the action row at 2x, with the laptop view under it)
4. `docs/app-v2-shots/final/picks/r3-pill-offline.png`, `r3-fold-closed__laptop.png`, `r3-fold-open__phone.png`
5. `docs/app-v2-shots/final/game/sheet__night__ipad-l__1.png` and `sheet__day__ipad-l__1.png` (every state, re-shot)
6. `docs/app-v2-shots/final/game-flow.mp4` (re-recorded on this build)

---

# Earlier rounds

Branch `app/v2-floodlight`, from `site/v2-alive` at 9273064 (it had not merged into `main`). Nothing was pushed to `main`, merged, tagged, deployed or migrated; every test ran against local Supabase only. Working notes, and every reading I took without asking, are in `docs/APP_V2_PROGRESS.md`.

**Where it stands:** the portal and the game app are on Floodlight, and every automated check passes except one budget: a long task on the first pitch of each at-bat, which is the engine's own solve time and is the same on the old build. The first session did the three anchor screens and the entry properly and left the rest inheriting the system. This session gave every remaining portal screen its own layout, finished the interaction states, and captured the game states that were missing. It is still not "9 on every axis": the table below says where it falls short and why.

## What was redesigned
- **One token source.** `web/lib/tokens/floodlight.json` generates `web/app/floodlight.css` (site and portal) and `app/assets/floodlight.css` (inlined in the game app). `web/lib/tokens.test.ts` fails on drift, on a hand-set shared token, on seam red or Instrument Sans coming back, and on contrast under target.
- **Type and colour.** Archivo and Hanken Grotesk, inlined in the game app; a fixed condensed heavy cut for the call and every big figure. Blue for what is being weighed or selected, green only for the call, one alert colour, a validated six-pitch palette that always carries the pitch's sign or letters.
- **Game app.** Night glass and a finished day theme; the call spans the card and is never animated; candidates are blue bars, the call is green; Accept settles to "Accepted" and the watch pill confirms. This session: the call's location words got real word spacing ("KEEP IT DOWN" read as "KEEPIT DOWN"), the pitch-count line in the scoreboard shows in full on two lines (it was cut to "3…"), and selects and tick boxes are drawn in the app's style in both themes.
- **Portal, screen by screen (this session).**
  - Billing: the plan is a ticket (team count, state, paid-through date, card button); teams table with the add form beside it; lapsed and locked states use the same ticket.
  - Staff: one aligned row per person (initial, email, preset, Advanced, Save, Remove); the invite form stays beside the list; counts on headings.
  - Roster: number in the condensed figures beside the name, quiet row actions, Invite as a small button; a card per pitcher on a phone.
  - Settings and Profile: one setting per row, name on the left, control on the right.
  - Opponents: glass cards with the hitter count as the figure; the detail page has the add form beside the table.
  - Player home: tiles fill the row; each outing shows its pitch mix as a small bar in the pitch colours. Learned: each grade on its 1 to 5 scale, a ring where it was entered and a blue dot where the engine reads it.
  - Admin: tabs and the audit note on one line, two headline figures, staff rows, support beside the tables. Exports, new organization, password: centred single columns with a boxed empty state.
  - Charts: hovering or tapping a point or a mix segment shows a small sheet with its numbers, kept inside the chart's panel.
  - Frame: on an iPad or phone the dock scrolls the current screen into view (Settings and Billing were cut off), page content stops clear of it, and in-page sheets (remove, invite, Advanced) slide in. Icons redrawn at a 1.8 stroke.
- **Interaction states.** Hover, focus, pressed and disabled were shot as 2x close-ups and fixed: tiles and buttons did not lift or press because the entrance animation held their transform; that is fixed. Disabled fields now look disabled.

## Scores (mine, harsh; 9 is the bar)
| Screen | Type | Colour | Layout | Motion | Numbers | Glance | Interact | Craft | iPad | Phone | A11y |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Game screen, night | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 7 | 9 |
| Game screen, day | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 7 | 9 |
| Game: Data, Roster, Setup, Watches | 9 | 9 | 8 | 8 | 8 | n/a | 9 | 8 | 9 | 7 | 9 |
| Entry (sign in, join, reset) | 9 | 9 | 9 | 8 | n/a | n/a | 9 | 9 | 9 | 9 | 9 |
| Coach launcher | 9 | 9 | 9 | 9 | 9 | n/a | 9 | 9 | 9 | 9 | 9 |
| Pitcher page and stats | 9 | 9 | 8 | 9 | 9 | n/a | 9 | 9 | 9 | 8 | 9 |
| Game Day list, wizard, review | 9 | 9 | 9 | 8 | 9 | n/a | 9 | 8 | 9 | 8 | 9 |
| Roster, staff, settings, opponents | 9 | 9 | 9 | 8 | 9 | n/a | 9 | 9 | 9 | 9 | 9 |
| Player pages | 9 | 9 | 9 | 8 | 9 | n/a | 9 | 9 | 9 | 8 | 9 |
| Billing, team picker, exports | 9 | 9 | 9 | 8 | 9 | n/a | 9 | 8 | 9 | 9 | 9 |
| Admin | 9 | 9 | 8 | 8 | 9 | n/a | 8 | 8 | 8 | 7 | 9 |

Why not 9 everywhere:
- **Motion (8s):** I read the recordings as frame sheets at 12 fps, not frame by frame at full size. No pops or late arrivals showed, and the call is fully drawn in its first frame, but that is a coarser look than the brief asked for.
- **Game app on a phone (7):** the count strip fills the first screen and the call sits below it. The phone is not a target for the game app; a layout is proposed below.
- **Game Data, Roster, Setup (8 on layout and craft):** consistent and finished in both themes, but they kept their first-session layouts; only their controls changed this session.
- **Pitcher stats (8 on layout, phone):** "Each count and pitch" is still a 48-row table.
- **Wizard on a phone (8):** in the lineup step a long hitter name is cut inside its field ("Jackson Ree").
- **Admin (7 to 8):** laid out for a laptop; its wide tables scroll sideways on a phone.
- **Accessibility is 9, not 10:** axe is clean everywhere, but no screen reader was run.

## Checks (run on the final build; I read each log)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | 60 of 60, including the six token drift checks |
| `npm run build` | compiled |
| `npm run e2e` (site) | all site checks passed |
| The eight portal e2es | all pass, 252 checks, tests unchanged (detail under "Last round") |
| `rls_matrix_test` | all 347 team checks passed (run with `PGURL` set to the local Supabase database) |
| `app/watch_test.js`, `app/watch_e2e.js` | all passed |
| `scripts/test-app.sh` | every step passes; one needs Windows' own `tar` (detail under "Last round") |
| axe, every portal shot at four sizes (242, production build) | 0 serious or critical |
| axe, every game state, both themes, four sizes (192) | 0 serious or critical |
| Lighthouse mobile x3 (production build, local) | launcher 91/91/91, pitcher 86/90/92, pitcher stats 87/88/87, Game Day 85/90/90, wizard 90/90/90; accessibility 100; layout shift 0.000. These ran while a second copy of the check script was running by mistake, so they are, if anything, pessimistic |
| Game trace (`node app/perf_v2.js`) | pitch logged to call painted: median 42 to 55 ms, max 129 ms (budget 200); layout shift 0; call never shown faded or mid-animation. **Long-task budget missed:** 69 to 91 ms on the first pitch of an at-bat |
| WebKit and Firefox (`node web/tests/app_browsers.js`) | all browser checks passed |
| Reduced motion | launcher, pitcher stats and wizard: 0 elements animating or transitioning, content complete 150 ms after load. Game screen measured in the first session |

- The long task is the engine's `makeCall`; the old build traces the same. With the CPU slowed four times it is 0.4 to 0.5 s once per hitter.
- One regression was caught by `portal_e2e` and fixed: a wide table widened the phone launcher to 423 px. The suite passes again.
- A mistake of mine: one round of checks ran as two overlapping copies, which made the e2es collide. Those results were thrown away and the suites re-run alone.

### Last round
Run alone, on the final build, after the last CSS change:
- `npm run e2e` (site): all site checks passed.
- `portal_e2e` 30, `shell_e2e` 43, `gameplan_e2e` 38, `billing_e2e` 52, `player_admin_e2e` 24, `uploads_e2e` 33, `retention_e2e` 10, `offline_game_e2e` 22: all pass, 252 checks, test files unchanged.
- `scripts/test-app.sh`: the Python suites, parity, golden and the reproducible-build check pass, and the script then stops at `v11_fixture_test` under Git Bash, where its `tar` call rejects a Windows drive-letter path (7 of 8). With Windows' own `tar` first on the path that test passes 8 of 8. Every step after it was then run by hand in the script's order and passes: `lean_test`, `hitter_tags_test`, `watch_test`, the Bangle app test, `smoke.js`, and the twelve browser suites (`rules_e2e` through `watch_e2e`). On this PC the script also needs `python3` to resolve to the real Python (the Store alias has no numpy).

## Test selectors changed
- `app/smoke.js` (first session): the font probe loads Archivo and Hanken Grotesk instead of Instrument Sans (it only prints).
- No assertion changed and no test file was edited this session. Markup that changed around text the tests read kept that text intact (for example a roster link still reads "#17 Caleb Foster").
- New scripts, captures only: `web/tests/app_state_shots.js` (offline and second-device states), `web/tests/app_interact_shots.js` (hover, focus, pressed, disabled, reduced motion).

## Proposals for Drew (not built)
1. **Move the at-bat solve off the main thread.** It is the only thing over the 50 ms budget. It touches the engine's call path.
2. ~~Show that the device is offline, and that it is syncing afterwards~~: built in round 3. The captures show no indicator at all on the Game screen while offline or after reconnecting: the three states look identical. A quiet pill in the bar (alert colour offline, blue while syncing) would do it. It adds something to the screen, so it is yours to decide.
3. ~~Fold "Each count and pitch"~~ (built in round 3): on the stats page behind a disclosure, or turn it into a count grid.
4. **A phone layout for the Game screen** with the call first and the count on one line.
5. ~~Hand-off with watches~~: withdrawn. The device already remembers watch mode once opened with `?watch=1` (see round 3).
6. ~~A watch switch in Setup~~: built in round 4, approved. **A watch switch in Setup** ("Use watches on this device", shown only where Web Bluetooth exists, kept on the device), so nobody has to type `?watch=1`. It was built and works, but it contradicts the existing `watch_e2e` assertion "no Watches card until it's opened once with ?watch=1". It needs your OK to change that assertion before it goes back in.

## Not verified
- **A real iPad, in sun, with gloves; real Safari; the installed iPad app; real watches.** Everything ran in headless Chromium, plus Playwright WebKit and Firefox on Windows.
- **The 1 m glance test** was done by shrinking screenshots, not on a device.
- **Screen readers** were not run.
- **Reference work is thin.** One live look this session (Vercel's Geist table, computed styles only) plus the first session's marketing-page captures. TrackMan, Rapsodo, Hawk-Eye and Whoop sit behind sign-in; no live sports product UI was studied.
- **Three docs the brief lists are not in the repo** (`PLAN_portal_2026-11-12.md`, `BUILD_watch_prototype_REPORT.md`, `RESEARCH_color_schemes_2026-11-16.md`), and the `frontend-design` skill is not installed here.
- **Interaction states** were shot for the portal (22 close-ups); the game app's pressed and focus states were not shot one by one.
- **Recordings** were reviewed as 12 fps frame sheets, not at full size.
- **Day-theme contrast of the alert banner** ("This iPad isn't ready for offline") passes axe but looked a little soft to the worker who captured it; I did not measure it separately.

## Look at these first
1. `docs/app-v2-shots/final/game-flow.mp4` (Game Day hand-off, pitches with Accept, a shake-off, a pitching change, end of game)
2. `docs/app-v2-shots/final/game/sheet__night__ipad-l__1.png` and `sheet__day__ipad-l__1.png` (every game state, both themes, re-shot on the final build)
3. `docs/app-v2-shots/final/picks/game-scoreboard-and-second-device.png` (the scoreboard with the full pitch-count line, and the second-device notice); the offline and refused states are beside it in `final/picks/`
4. `docs/app-v2-shots/final/portal/sheet__laptop__1.png` and `__2.png` (every portal screen)
5. `docs/app-v2-shots/final/portal/sheet__phone__1.png` to `__3.png`
6. `docs/app-v2-shots/final/picks/billing__laptop__fold.png`, `staff__laptop__fold.png`, `me-home__laptop__fold.png`, `roster__phone__fold.png` (this session's screens at full size)
7. `docs/app-v2-shots/final/picks/tile-hover.png`, `tile-pressed.png`, `chart-tip.png`, `disabled.png` (interaction states at 2x)
8. `docs/app-v2-shots/final/coach-portal.mp4` and `player-portal.mp4`

## Running it
- Local database: `npx supabase@2.122.1 start`. Dev: `bash web/tests/dev_local.sh 3111`. Production build: `npm run build` in `web/`, then `bash web/tests/start_local.sh 3120`.
- Seed: `node web/tests/app_seed.js --url http://localhost:3120` (resets the local database).
- Captures: `node web/tests/app_shots.js --url ... --out <dir> [--axe]`, `node app/shots_v2.js --out <dir> [--axe]`, `node web/tests/app_interact_shots.js --url ... --out <dir>`, `node web/tests/app_state_shots.js`, `python web/tests/app_sheets.py`.
- Game app build on Windows: `PYTHONUTF8=1 python app/build.py`, then `node web/scripts/game-shell.mjs`. Tokens: `node web/scripts/tokens.mjs`.
- Run one check script at a time: the e2es each reset the local database and start their own server.
- Raw captures and extracted frames stay on this PC (gitignored); sheets, picks and recordings are committed.
