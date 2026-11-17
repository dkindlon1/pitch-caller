# PitchIQ app v2 (Floodlight): build report (Nov 17, 2026)

Branch `app/v2-floodlight`, from `site/v2-alive` at 9273064 (it had not merged into `main`). Nothing was pushed to `main`, merged, tagged, deployed or migrated; every test ran against local Supabase only. Working notes and every reading I took without asking are in `docs/APP_V2_PROGRESS.md`.

**Where it stands:** both the portal and the game app are on Floodlight and every automated check passes except one budget (a long task on the first pitch of each at-bat, which is the engine's own solve time). It is not at "9 on every axis": the scores below say where it falls short, and the screen-by-screen visual loop the brief asked for was done properly on the three anchor screens and the entry, and by contact sheet for the rest.

## What was redesigned
- **One token source.** `web/lib/tokens/floodlight.json` generates `web/app/floodlight.css` (the site and the portal import it) and `app/assets/floodlight.css` (the game app inlines it). The site's values are unchanged. `web/lib/tokens.test.ts` fails on drift, on a hand-set shared token, on seam red or Instrument Sans coming back, and on contrast under the targets.
- **Type.** Archivo and Hanken Grotesk, full-Latin cuts for the app, inlined in the game app. The call, the sign, the scoreboard and every big figure use a fixed condensed heavy cut (`archivo-cond-app.woff2`), because Playwright's Windows WebKit drew the variable width axis wrong; the fixed cut removes that risk on an iPad.
- **Colour.** Blue for selected controls, the mix, confidence bars, loading. Green only for the call card, the sign, the target, Accept and "On both watches". One alert colour (night `#f0a06a`, day `#9a3f0e`). Pitch palette validated with the dataviz validator: day passes all pairs; night passes adjacent pairs but not every pair for colour-blind readers (blue against violet), so every pitch mark also carries its sign number or letters.
- **Game app** (`app/assets/game.css`, small changes in `index.src.html`, `roster.js`, `build.py`): night glass and a finished day theme; the call spans the card in condensed type and is never truncated or animated; candidate calls are blue bars and the called one is green; Accept is the one green button and settles to "Accepted"; the watch pill is green, blue or alert by state; 48 px targets; the result keys fit on the first screen of an iPad in landscape with the location grid on.
- **Portal** (`web/app/portal.css` rewritten, about 20 component files touched): Floodlight backdrop in CSS (no photo), glass bar that tightens on scroll, dock and tabs lit blue where you are, the next game as a ticket, solid panels for tables and forms, entry screens on the film's rest frame, a shared pitcher header, the stats page with headline figures, a pitch-mix bar, strike-rate bars, a tinted usage-by-count table and token-coloured charts. Screens fill in once per visit and not on a revisit.
- **Not redesigned one by one:** billing, exports, admin, staff, settings, opponents, team picker and the player pages inherit the new system and were checked on sheets at four sizes, but I did not give each its own layout pass. Icons were not redrawn.

## Scores (mine, harsh; 9 is the bar)
| Screen | Type | Colour | Layout | Motion | Numbers | Glance | Interact | Craft | iPad | Phone | A11y |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Game screen, night | 9 | 9 | 9 | 8 | 9 | 9 | 8 | 9 | 9 | 7 | 9 |
| Game screen, day | 9 | 9 | 9 | 8 | 9 | 9 | 8 | 8 | 9 | 7 | 9 |
| Game: Data, Roster, Setup, Watches | 8 | 8 | 7 | 7 | 8 | n/a | 8 | 7 | 8 | 7 | 9 |
| Entry (sign in, join, reset) | 9 | 9 | 9 | 7 | n/a | n/a | 8 | 9 | 9 | 9 | 9 |
| Coach launcher | 9 | 9 | 9 | 8 | 8 | n/a | 8 | 9 | 9 | 8 | 9 |
| Pitcher page and stats | 9 | 9 | 8 | 8 | 9 | n/a | 7 | 8 | 8 | 8 | 9 |
| Game Day list, wizard, review | 9 | 9 | 8 | 8 | 8 | n/a | 8 | 8 | 8 | 8 | 9 |
| Roster, opponents, staff, settings | 8 | 8 | 7 | 7 | 8 | n/a | 7 | 7 | 8 | 7 | 9 |
| Player pages | 8 | 9 | 8 | 7 | 8 | n/a | 7 | 7 | 8 | 8 | 9 |
| Billing, exports, team picker, admin | 8 | 8 | 6 | 7 | 7 | n/a | 7 | 6 | 7 | 7 | 9 |

Why not 9:
- **Motion:** entrances, fills, presses and the bar are in, but I did not tune them frame by frame, and sheets and menus do not slide yet.
- **Interaction:** charts have native tooltips only; no hover layer or cross-highlighting.
- **Game app on a phone:** the count strip fills the first screen and the call sits below it.
- **Inherited screens:** correct and consistent, but plain; billing, exports and admin sit in a narrow left column.
- **Stats:** "Each count and pitch" is a 48-row table.

## Checks (all run by me or re-read from the log)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | 60 of 60, including the six token drift checks |
| `npm run build` | compiled |
| `npm run e2e` (site) | all site checks passed |
| `portal_e2e`, `shell_e2e`, `gameplan_e2e`, `billing_e2e`, `player_admin_e2e`, `uploads_e2e`, `retention_e2e`, `offline_game_e2e` | all pass, tests unchanged: 30, 43, 38, 52, 24, 33, 10, 22 checks (run twice; the second time on the final build) |
| `rls_matrix_test` | all 347 team checks passed |
| `app/watch_e2e.js`, `app/watch_test.js` | all passed |
| `scripts/test-app.sh` | every step passes except `v11_fixture_test` under Git Bash, where its `tar` call rejects a Windows drive-letter path (7 of 8); with Windows' own `tar` first on the path the same test passes 8 of 8. Python regressions, parity, golden, the reproducible build and 13 browser suites all pass |
| axe, every portal shot at four sizes (242) | 0 serious or critical |
| axe, every game state, both themes, four sizes (192) | 0 serious or critical |
| Lighthouse mobile x3 (production build, local) | launcher 91/91/91, pitcher 91/90/90, pitcher stats 88/88/90, Game Day 93/91/91, wizard 91/91/91; accessibility 100; layout shift 0 |
| Game trace (`node app/perf_v2.js`) | pitch logged to call painted: median 44 to 47 ms, max 113 ms; layout shift 0; call never faded in. **Long task budget missed:** 53 to 85 ms on the first pitch of each at-bat |
| WebKit and Firefox (`node web/tests/app_browsers.js`) | all passed |

- The long task is the engine's `makeCall` (53 to 66 ms measured inside it; the screen render is 2 to 3 ms). The old build traces the same (69 to 74 ms). With the CPU slowed four times it is about 410 ms, old and new alike.
- On Windows the portal e2es need a launcher shim (`NODE_OPTIONS=--require`) because they start `npx` without a shell. The tests are unchanged; the shim lives outside the repo.

## Test selectors changed
- `app/smoke.js`: the font probe loads Archivo and Hanken Grotesk instead of Instrument Sans (it only prints).
- No assertion changed. Markup changes that kept the tests passing unchanged: the wizard's staff buttons now take their name from visible text (name first, then number); the charting picks lost a duplicate `aria-pressed`; the "way off" buttons show an arrow with their label hidden.

## Proposals for Drew (not built)
1. **Move the at-bat solve off the main thread** (the game app already has a worker). It is the only thing over the 50 ms budget, and on a slow iPad it is a 0.4 s pause once per hitter. It touches the engine's call path, so it is yours to decide.
2. **Fold "Each count and pitch"** on the stats page behind a disclosure, or turn it into a count grid. It changes what shows by default.
3. **A phone layout for the Game screen** that puts the call first and the count in one line. The phone is not a target today.
4. **Seam-free hand-off with watches:** the Game Day hand-off URL cannot carry `watch=1`, so a coach using watches opens the game app once with it by hand.

## Not verified
- **A real iPad, in sun, with gloves; real Safari; the installed iPad app; real watches.** Everything ran in headless Chromium, plus Playwright WebKit and Firefox on Windows.
- **The 1 m glance test** was done by shrinking screenshots to 40%, not on a device.
- **Screen readers** were not run.
- **Two game states** have no capture of their own: offline-and-syncing and a second device refused. Both need a signed-in program; `offline_game_e2e` passes and their notices use the restyled alert styles.
- **Reference work:** ten marketing-page captures only; TrackMan, Rapsodo, Whoop and F1 timing were blocked. No live product UI was studied.
- **Three docs the brief lists are not in the repo** on any branch (`PLAN_portal_2026-11-12.md`, `BUILD_watch_prototype_REPORT.md`, `RESEARCH_color_schemes_2026-11-16.md`), and the `frontend-design` skill is not installed here.
- **Hover, pressed and disabled states** were not shot one by one; focus was shot on the launcher only.
- **Reduced motion** was checked by measurement on the game screen and three portal screens (launcher, pitcher stats, wizard): no element animating or transitioning, all content fully shown. It was not shot screen by screen.

## Look at these first
1. `docs/app-v2-shots/final/game-flow.mp4` (Game Day hand-off, ten pitches with Accept, a shake-off, a pitching change, end of game)
2. `docs/app-v2-shots/final/game/sheet__night__ipad-l__1.png` and `sheet__day__ipad-l__1.png` (every game state, both themes)
3. `docs/app-v2-shots/build/game-2x/closeup-call__night.png` (the call card at 2x)
4. `docs/app-v2-shots/final/browsers/webkit__game-night.png` (the call in WebKit with the fixed condensed cut)
5. `docs/app-v2-shots/final/coach-portal.mp4` and `player-portal.mp4`
6. `docs/app-v2-shots/final/portal/sheet__laptop__1.png` to `__2.png` and `sheet__phone__1.png` (every portal screen)
7. `docs/app-v2-shots/before/game/sheet__ipad-l__night.png` and `before/portal/sheet__laptop__1.png` (where it started)
8. `docs/app-v2-shots/build/game-p1/glance-1m__ipad-l.png` (the call at arm's length)

## Running it
- Local database: `npx supabase@2.122.1 start`. Dev: `bash web/tests/dev_local.sh 3111`. Production build: `npm run build` in `web/`, then `bash web/tests/start_local.sh 3120`.
- Seed: `node web/tests/app_seed.js --url http://localhost:3120` (resets the local database).
- Captures: `node web/tests/app_shots.js --url ... --out <dir> [--axe]`, `node app/shots_v2.js --out <dir> [--axe]`, `python web/tests/app_sheets.py`.
- Game app build on Windows: `PYTHONUTF8=1 python app/build.py`. Tokens: `node web/scripts/tokens.mjs`.
- Raw captures and extracted frames stay on this PC (gitignored); sheets, picks and recordings are committed.
