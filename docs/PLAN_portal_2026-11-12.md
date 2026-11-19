# PitchIQ portal: screens and structure plan (Nov 12, 2026)

Status (Nov 12, 10:20 pm): **signed off by Drew and live.** Phases P0, P1 and P2, motion, a style pass, a Web Interface Guidelines pass and the restyled game app are merged to `main` (commit ad12c46, a fast-forward from `portal`; CI passed on `main`; Vercel production deployed it at 9:48 pm). The game-plans migration is on production (promote run 43357986821, applied 10:18 pm). See section 8.
Written from the code on `website` at e6b22ac and the project docs.

Note (Nov 18): the look described here (black, white, seam red, Instrument Sans) was later replaced by the Floodlight
v2 look; see BUILD_app_v2_REPORT.md. The structure, permissions and Game Day flow still stand.

## Drew's decisions (Nov 12)
- **Look:** the portal switches to the website's black, white and seam-red glass. Build a brand new glassy dashboard.
- **Game setup:** set up in the portal, and launch games from the portal on any device.
- **Who sees the game plan:** controlled by the organization's owner.
- **No live view:** nobody sees a game in progress except the single device calling it.
- **Game app look (later the same day):** the iPad game screens move to the portal's style too.
- **Sign-off (10 pm):** "looks really good, merge it and sign everything off."

## 1. What exists today (read from the code)

The portal is not empty. It works, but it looks like a plain list of links rather than a product.

| Route | What it does now |
|---|---|
| `/login`, `/join/[token]`, `/auth/confirm` | Sign in, accept an invite link, confirm email |
| `/app` | "Your teams": team cards with your role, orgs you own with billing status, data downloads, "Start an organization" |
| `/app/new` | Start an organization: name, number of teams, pay by card |
| `/app/billing`, `/app/exports` | Stripe billing per org; data downloads sent on a lapse |
| `/app/t/[team]` | Coach team home: next game + "Prep game" button (just opens the game app), available today (pitch-count rule), uploads waiting for review, pitcher availability table, last 5 games (a bare list) |
| `/app/t/[team]/roster`, `/roster/[pitcher]`, `/stats`, `/uploads` | Roster, a pitcher's page, his stats, his uploads and proposed values |
| `/app/t/[team]/opponents`, `/opponents/[opp]` | Opponent teams and their hitters |
| `/app/t/[team]/staff` | Coaches with a role preset and an Advanced toggle list, players, pending invites, parent-email approval |
| `/app/t/[team]/settings` | Team name, time zone, pitch-count rule and daily limit |
| `/app/me/[team]/[pitcher]/…` | Player portal: Home, Arsenal, Uploads, Stats, Profile, What the engine learned (parent picks which child) |
| `/admin`, `/admin/org/[org]`, `/admin/audit` | Drew's super admin view: sign-ups, orgs, audit log |
| `/app/game/` | The iPad game app (separate static page with its own service worker): Game, Data, Roster, Setup |

**Permissions already in the database** (`lib/team.ts`):
- Roles (presets): Head coach, Pitching coach, Pitch caller, Viewer, Player.
- Toggles: `call_games`, `edit_grades`, `review_uploads`, `manage_opponents`, `manage_roster`, `manage_staff`.
- Presets: Head = all six; Pitching = call, grades, uploads, opponents; Caller = call, opponents; Viewer = none.
- Org owner is separate from the staff (can own without being a coach). Drew is super admin.

So the permission system the tiles need already exists. The plan is mostly a new shell and layout over it, one real
new flow (game prep), and a few new screens.

**Gaps found while reading:**
- **Game prep doesn't exist in the portal.** "Prep game" only opens the iPad app, and all game setup (opponent,
  lineup, staff, catcher, level, home/away, innings, umpire, what you'll log) happens on the iPad's Setup screen.
- **The iPad makes the `games` record at the first pitch** (`roster.js:151`: "the Game plan screen will make it ahead,
  as planned"). The database already supports a `planned` status, but nothing creates one ahead of time.
- **Learner flags** (learned value vs the coach's grade: Accept / Keep mine) live only on the iPad.
- **Recent games** are a bare list; there's no game review screen.
- **The portal still knows four pitch kinds** (`lib/docs.ts`). v1.1 Step 5 brings it to six; new screens should be
  built for six from the start.

## 2. The idea: a glass launcher, then a dock

1. **Home is a launcher.** After sign-in you land on one glass dashboard: a "Next game" hero card on top, a grid of
   app-style tiles below, and a "Needs you" feed on the side. **Tiles only appear for what your permissions allow.**
2. **Inside any screen, the same icons stay in a dock** (a left rail on a laptop, a bottom dock on an iPad), so you
   never have to go back home to switch. The dock is built from the same list as the tiles, so they can't disagree.
3. **Game Day is the main tile.** It walks you through setting up the game, saves it, and then opens the game app
   straight into that game.

### Tile rules
- **Hide** a tile when you can't use it at all. **Show it read-only** when you can look but not change (e.g. a Pitch
  caller sees Roster but can't add pitchers). No locked/greyed tiles teasing features you'll never get.
- **One source of truth:** a new `lib/nav.ts` maps each tile to the permission(s) it needs, built on the existing
  `PRESET_PERMS` and `TOGGLES`. The launcher, the dock and every page's server check read it. The server keeps
  checking on every page and action as it does today (RLS + `teamFor`), so hiding a tile is never the security.
- **Team switched off (billing):** tiles stay, a glass banner says nothing syncs until billing is done, and the
  Game Day tile is disabled. **Locked out:** only Data downloads (and Billing for the owner).
- **Badges** on tiles for things waiting: uploads to review, learner flags, pending invites.

### Tiles by who you are

| Tile | Head | Pitching | Caller | Viewer | Owner (not staff) | Player / parent | Needs |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Game Day | ✓ | ✓ | ✓ | plan only, if the owner allows | | | `call_games` (or `view_plan`, read only) |
| Roster | edit | view + grades | view | view | | | edit = `manage_roster`, grades = `edit_grades` |
| Opponents | edit | edit | edit | view | | | edit = `manage_opponents` |
| Games (history + review) | ✓ | ✓ | ✓ | ✓ | | | any coach |
| Team stats | ✓ | ✓ | ✓ | ✓ | | | any coach |
| Reviews (uploads) | ✓ | ✓ | | | | | `review_uploads` |
| Learning (flags) | ✓ | ✓ | | | | | `edit_grades` |
| Staff | ✓ | | | | invite coaches | | `manage_staff` / `manage_roster` |
| Settings | ✓ | | | | | | `manage_roster` |
| Organization + Billing | | | | | ✓ | | org owner |
| My page, Arsenal, Uploads, Stats, What it learned, Profile | | | | | | ✓ | player |
| Admin | | | | | | | super admin only |

A coach on several teams gets the team switcher in the top bar; tiles change with the role on that team.

## 3. Screens

### A. Shell and entry
1. **Sign in / join / confirm** (restyle). Same flows; glass card over the site's stadium-light backdrop so it feels
   like walking in from the marketing site.
2. **Team picker** (only if you're on 2+ teams or own an org). One team goes straight to its launcher.
3. **App shell:** top glass bar (PitchIQ mark, team switcher, sync/billing status, account menu), the dock, and a
   backdrop. Glass needs something busy behind it (the site's own rule), so the backdrop is a dark, slowly moving
   stadium-light/seam image, not a flat colour.

### B. Coach screens
4. **Launcher home** (`/app/t/[team]`, rebuilt).
   - Hero: **Next game** (opponent, date, home/away, status: not set up / planned / ready on iPad / live / final) with
     "Set up game" or "Open game".
   - Tile grid (section 2).
   - **Needs you** feed: uploads waiting, learner flags, pitchers not eligible today, pending invites, billing.
   - Small glance numbers: available today (x of y), last game's pitch count leader, pitches this week.
5. **Game Day: game prep wizard** (new, the main new flow; see section 4).
6. **Roster** (restyle): pitcher cards (number, hand, role, arsenal chips in pitch colours, availability pill), add by
   paste, archive.
7. **Pitcher page** (restyle + extend): arsenal and grades, stats panel (exists), uploads and proposed values,
   availability and recent outings, **What happened next** (noted on Nov 12: out rate after a strike vs a ball by count
   and pitch; data already in `pc_pitch_rows`).
8. **Opponents** (restyle): teams, their hitters (bats, tags), what was learned about each hitter across games.
9. **Games** (new): season list (date, opponent, result, pitch count, who pitched).
10. **Game review** (new): one game pitch by pitch: each call, what was thrown, the result, shake-offs and coach
    overrides, by inning and by pitcher, plus a per-pitcher line. Read from the synced events.
11. **Team stats** (new): staff-wide numbers (strike %, first-pitch strike %, whiff %, usage by count) with the same
    10-pitch minimum sample as the pitcher page.
12. **Reviews** (restyle of "uploads waiting"): one inbox of TrackMan/Rapsodo uploads and proposed values to approve.
13. **Learning** (new in the portal): the learner's flags (learned value vs the coach's grade) with Accept / Keep mine,
    the same actions the iPad has, written through `pc_push`.
14. **Staff** (restyle): people as cards; the role preset as a segmented control; Advanced opens the six toggles;
    invite sheet; parent approvals.
15. **Settings** (restyle): team name, time zone, level, pitch-count rule.

### C. Owner screens
16. **Organization**: teams in the org (add/remove team), who's head coach on each, transfer ownership.
17. **Billing** (restyle): plan, next invoice, card, status; lapse and lock explained plainly.

### D. Player / parent screens
18. **Player launcher** (`/app/me/...`): his own hero card (last outing, next eligible day), tiles for My page, Arsenal,
    Uploads, Stats, What it learned, Profile. A parent with two kids switches child in the top bar. Nothing about
    teammates, opponents or the game plan, as today.
19. Those six pages restyled. Uploads get a drag-and-drop glass drop zone with the "ignore this pitch / developing" picks.

### E. Admin (Drew)
20. Admin stays functional; restyle last.

## 4. Game Day: set it up here, open it on the iPad

Today every game is set up on the iPad. The plan moves the setup to the portal (laptop or iPad), saves it as a
**planned game**, and the game app opens straight into it. The iPad's Setup screen stays for changes during the game,
because changes must apply mid-game.

**Wizard steps** (one glass sheet, a step rail across the top, every step can be skipped back to):
1. **Game:** date and time, opponent (pick, or add a team in one line), home/away, scheduled innings, extras runner,
   level (team default).
2. **Our staff:** today's available pitchers with eligibility from the pitch-count rule (ineligible ones shown with
   the date they're eligible, not hidden), the starter, the catcher and how well he blocks.
3. **Their lineup:** batting order from the opponent's hitters by number, bats R/L/S, add new hitters inline; a
   hitter seen before shows a small "learned from N games" chip.
4. **How you'll chart:** what you'll log (the four tiers), log where each pitch ended up, radar readings, umpire zone.
5. **Review and open:** one summary card. **Save game** writes the planned game; **Open on this iPad** opens
   `/app/game/?game=<id>`. On the iPad it then runs the existing "get ready for offline" check (sync, opens with no
   signal, today's staff and opponent on the device).

**What has to change underneath (the only engine/app work in this plan):**
- A `plan` object on the `games` record (opponent, lineup, staff, starter, catcher, level, home/away, innings, extras,
  umpire, logging tier), written by the portal through `pc_push` with status `planned`.
- The game app: on boot and after a sync, list today's planned games; `?game=<id>` or a "Start this game" button
  loads its plan into Setup and starts the game on that record instead of making a new one at the first pitch.
- Status shown back in the portal: planned → ready on iPad (the device pulled it) → live → final.
- Tests: the planned game round-trips portal → Supabase → iPad, and a game set up on the iPad alone still works.

## 5. Look

- **Decided (Nov 12): the portal moves onto the website's design system** (ink #000, chalk #F4F4F1, seam red #F04A3E,
  pitch colours on data only, Instrument Sans, the website's glass recipe) instead of the older Pitch Caller system in
  `globals.css`. Signing in from the site should feel like the same product. The website doc currently says the portal
  keeps the Pitch Caller system, so this reverses that.
- The **game app** was first left as it was; later on Nov 12 Drew asked for it to match the portal, done in commit
  ad12c46 (section 8). Its day/night themes stay, now as a white card by day and the portal's charcoal glass by night.
- Glass on chrome (bars, dock, tiles, sheets); solid surfaces where numbers are read (tables, stats) so they stay crisp.
- Tiles: large icon, label, badge; press and hover lift; a soft light that follows the pointer (the site's highlight).
  Custom icon set drawn for PitchIQ (no stock icon pack).
- Works on a laptop and an iPad (portal decision from Nov 5); phones get a single column for players and parents.
- Built with the UI skills Drew added (taste, Vercel web guidelines, frontend-design), and reviewed for accessibility.

## 6. Build order

| Phase | What | Notes |
|---|---|---|
| P0 | Design tokens into the portal, app shell (top bar, dock, backdrop), `lib/nav.ts` tile registry | Done, live |
| P1 | Launcher home + Needs you feed, team picker, player launcher | Done, live |
| P2 | Game Day wizard + planned game record + game app opens it | Done, live |
| P3 | Restyle existing screens: roster, pitcher page, opponents, staff, settings, billing, player pages | Six pitch kinds if v1.1 Step 5 has landed |
| P4 | New screens: Games, Game review, Team stats, Learning flags, What happened next | Read-only first, then Accept/Keep mine |
| P5 | Later: live view of a game in progress for other coaches, notifications, admin restyle | Live view needs sync during the game, not only after |

## 7. Open questions
1. **An iPad that dies mid-game:** the game stays claimed by that device, so no other device can open it. Recovering
   means bringing the same device back. A "release this game" action for the head coach or owner was not built.
2. **"Games", "Team stats" and "Learning" tiles (P4)** aren't built, so they don't show yet.
3. **Phase P3:** the existing screens (roster, pitcher page, opponents, staff, settings, billing, player pages) picked
   up the new look through the shared styles, but haven't been redesigned screen by screen.
4. **Previews use the production database.** Branch previews on Vercel point at pitchiq-prod; the dev project is paused.

## 8. What was built (Nov 12) and the checks run

**Look and shell** (`web/app/portal.css` rewritten, `web/app/app/_frame/`):
- Website tokens (ink, chalk, seam red #F04A3E, pitch colours on data only), Instrument Sans, the website's glass recipe.
- Behind everything, the hero film's ballpark frame, graded black and white and darkened at the edges, so the glass has
  light to blur. Solid dark panes for tables and forms.
- One frame for every signed-in screen: a glass bar (ball mark, organization, team switcher, account menu) and the dock.
- The older pages' class names are kept and restyled, so every existing screen already uses the new look. The old
  `--pc-*` tokens point at the new values inside the portal.
- Custom line icons (home plate, jersey, bat and ball, clipboard, zone and others), no stock pack.

**Launcher** (`/app/t/[team]`, `/app/me/[team]/[pitcher]`):
- The next game is a white ticket (see the style pass below). When live it shows only "It's being called on one device".
- Tiles come from `web/lib/nav.ts`, the one list behind both the tiles and the dock. The dock steps aside on the
  launcher at laptop width; on an iPad or phone it's a bar at the bottom.
- "Needs you" (uploads to review, pitch-count rule, pitchers resting), "Who can pitch" (the old availability table),
  "Recent games". A player gets his own card and tiles.

**Game Day** (`/app/t/[team]/games`, `/new`, `/[game]`, `/[game]/edit`, `/[game]/open`):
- Five steps: game; our staff (eligibility from the pitch-count rule, a second tap makes the starter, catcher); their
  lineup ("Fill from their roster", new names join their roster); charting (tier, locations, radar, umpire); review.
- It saves a `games` record with status `planned`, in the game app's own shape (`web/lib/gameplan.ts`, unit tested).
- "Start on this device" makes a single-use Supabase magic link on the server (never emailed) and passes it in the
  address's `#fragment`. The game app exchanges it for its own session, joins or syncs the team, and starts the game
  on that record with the plan's staff (starter on the mound), opponent, lineup, catcher, charting and umpire. It pushes
  the record as live on that device straight away (the claim).
- A second device opening a live game is refused. The game app also offers today's planned game when it opens on its
  own (for the installed iPad app, which on iOS doesn't share Safari's storage).

**Who sees the plan** (`supabase/migrations/20261114000000_game_plans.sql`, on production since 10:18 pm Nov 12):
- A new toggle, `view_plan` ("See the game plan"). It's in no preset, because calling games already shows the plan.
- Only the organization's owner switches it. Another staff manager keeps it as it is, and sending a different value is
  refused.
- `games` and `packs` are readable only by coaches who call games or have it, directly and through `pc_pull`.
- `pc_game_list` gives every coach the schedule (date, opponent, home or away, start time, status), never the lineup
  or staff. The Staff screen's Advanced list shows the switch, disabled for everyone but the owner.

**Fixes found on the way:**
- Tapping "Next: Review" saved the game, because React reused the Next button as the submit button mid-click.
  The test caught it; fixed.
- On a first visit the game app's offline worker reloaded the page partway through. The hand-off now survives it by
  keeping the open (and the unused one-time sign-in) for that tab until it's used; the update code is main's.

**Checks run (output read), on a real local Supabase:**
- `rls_matrix_test` all 347 pass, including the new game-plan section. `sync_test` 38, `client_review_test`,
  `sync_auth_test`, `app_sync_e2e`, `waitlist_test` all pass. `scripts/check-rls.sql` passes.
- `review_test` has 1 failure ("accepted invites made them members"), which is the same without this change: the local
  Supabase Postgres sorts "coach2" before "coach".
- `web/tests/gameplan_e2e.js` (new, in CI): tiles by role, the setup sheet, the saved record, the viewer kept out and
  then let in by the owner, the hand-off, the game app starting on the record, the claim, the second device refused,
  the planned-game offer, and the hand-off failing a second time.
- `portal_e2e`, `shell_e2e`, `billing_e2e`, `player_admin_e2e`, `uploads_e2e`, `retention_e2e`, `offline_game_e2e`
  pass. `offline_game_e2e`'s "update takes over after the game" check is timing-sensitive on the dev machine (fails some
  runs, also with main's update code); it passes in CI.
- Web typecheck clean; unit tests 50 of 50; `scripts/test-app.sh` every step.
- Screens checked at 1440x900, 820x1180 and 390x844.

**Motion, commit eb97589:** panels, tiles and rows fade and rise on their own elements in order (glass keeps its
blur); counts count up; chart lines trace; wizard steps slide; menus pop; pointer light on glass; shimmering
placeholders while loading; reduced motion turns it all off.

**Style pass, commit bcf97de:** stitches removed; the next game is a white ticket (calendar block, matchup, readiness
line); one white focal point per screen; brighter night (stadium-light band into charcoal #121316, frosted reading
surfaces); buttons size to their label; clearer inputs; plain names instead of raw values. Three rounds of screenshots.

**Web Interface Guidelines pass, same commit:** skip link, tile heading and focus rings, scroll padding, menus close
on Escape or outside click; setup sheet without autofocus, ellipsis placeholders, first error focused, unsaved-changes
warning, Intl times; in-place confirm for "Take it off the schedule"; color-scheme, theme-color, touch-action, safe
areas. Kept: sentence case (PitchIQ's design system).

**Game app in the portal's look, commit ad12c46:** Instrument Sans inlined (works offline); dimmed ballpark photo
behind glass; chalk-white primary buttons; portal pitch colours and ball mark; white-card day theme with deeper pitch
colours; theme-color follows day and night; softer call glow; tap-twice × removals; lineup grades stacked; "1 pitch".
Checks: smoke, d0, db, gameday, replay, rules, travel, v08, v09 labels and matchup, v10 steps 1/3/5, stage2, security,
gameplan, portal and offline_game e2e pass. Screens checked landscape, portrait and day.

**Release (Nov 12, Drew signed off):**
- `main` fast-forwarded from b318098 to ad12c46 (42 commits: the website and the portal). CI passed on `main`.
- Vercel production deployed ad12c46 at 9:48 pm.
- Promote run 43357986821 (started and approved by Drew): dry run listed only `20261114000000_game_plans`, applied it,
  confirmed the database up to date and passed the row-level-security check. Production's migration list now ends at
  `game_plans`.

**Still worth doing:**
- Look at it on a real iPad and in Safari, including the installed app picking up "Today's game is set up. Start it"
  (iOS keeps the installed app's storage separate from Safari's).
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set on the Vercel production deployment, or "Start on this device" falls back
  to the game app asking for the password.
