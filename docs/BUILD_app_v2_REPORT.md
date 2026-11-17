# PitchIQ app v2 (Floodlight): build report (Nov 17, 2026, after the second session)

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
2. **Show that the device is offline, and that it is syncing afterwards.** The captures show no indicator at all on the Game screen while offline or after reconnecting: the three states look identical. A quiet pill in the bar (alert colour offline, blue while syncing) would do it. It adds something to the screen, so it is yours to decide.
3. **Fold "Each count and pitch"** on the stats page behind a disclosure, or turn it into a count grid.
4. **A phone layout for the Game screen** with the call first and the count on one line.
5. **Hand-off with watches:** the Game Day hand-off URL cannot carry `watch=1`, so a coach using watches opens the game app once with it by hand.

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
