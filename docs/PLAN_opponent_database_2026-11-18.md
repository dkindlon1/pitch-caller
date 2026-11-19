# Plan: opponent database, Nov 18, 2026

Status: **plan, nothing built.** From FEATURES_next_2026-11-18.md section 4 and Drew's answers on Nov 18.
Items marked **(default)** are Claude's suggestion where Drew didn't decide.

## 1. What exists today (from the v1.1 / v1.2 docs; check in the repo before building)
- Opponent profiles with hitter cards, private to the team (RLS permission `manage_opponents`).
- Four scouting tags per hitter (v1.2 Part B): approach (aggressive / average / patient), spray (pull / all fields /
  oppo), swing path, off-speed hitter. Stored as `scoutTags`; unknown = no effect on the engine (tested bitwise).
- A hitter importer (CSV columns for the tags); a lineup scouting row in game setup.
- Engine: hitter spot memory (hard hits at a spot change the odds there a little), a power home-run term, power-hitter
  avoidance, the fitted approach and spray effects.

## 2. Drew's decisions
| Topic | Decision |
|---|---|
| Per hitter | Hot/cold zone grid; pitch checkboxes; free notes; speed / bunt / steal; ratings. |
| Ratings | Spray: pull side / mixed / oppo. Power, contact, speed: **1 / 2 / 3** plus an **Unknown** button. Unknown is stored as Unknown and shown as "Unknown", but the engine treats it as 2 (average). |
| Per team | Lineup history (auto-filled from games); team tendencies (checkboxes). |
| Custom fields | A fixed core set that can feed the engine, plus custom fields the owner creates (checkbox, dropdown, grid, text). Custom fields are coach info only; never reach the engine. |
| Editing | Owner always; coaches with the existing "manage opponents" permission. Players never see it. |
| Engine use | Map where the engine already has a term (spray, power); contact and speed are stored and shown, and reach the engine only after they're fit to data and pass a check. |
| Zone grid | 3×3 zone plus the chase ring, matching the game screen's spots; each tap cycles hot / neutral / cold. |
| After games | The system suggests rating and grid updates from what happened; nothing changes until a coach accepts. |
| Across seasons | Opponents and their hitters persist year to year; outing reports' at-bats attach to hitters automatically (from the reports plan). |

## 3. Hitter page
- **Header:** name, number, bats L/R, class year (optional) **(default)**, team, seasons seen.
- **Ratings:** spray (pull side / mixed / oppo; this is the existing spray tag, one field, not two), power 1–3,
  contact 1–3, speed 1–3, each with Unknown. The other existing tags (approach, swing path, off-speed) stay on the page.
- **Zone grid:** 3×3 + chase ring, hot / neutral / cold.
- **Pitch checkboxes:** crushes fastballs; chases sliders; chases curveballs; can't hit the changeup; late on velo;
  hits off-speed hard **(default list, Drew to edit)**.
- **Speed / small ball:** bunt threat, steal threat (checkboxes, with the speed rating).
- **Notes:** free text, coach-only.
- **History:** every at-bat against us across seasons (sequence, result, outing report link), newest first.
- **Suggestions:** pending "mark up-in hot?" style suggestions with Accept / Dismiss.
- **Custom fields** the owner added.

## 4. Team page
- Lineup history (from games), with dates and batting orders.
- Team tendencies: aggressive early, patient, bunts a lot, runs a lot, hit-and-run team **(default list)**.
- Roster across seasons; a merge tool for the same hitter entered twice.
- Custom fields.

## 5. What reaches the engine
| Field | Engine use |
|---|---|
| Spray | The existing fitted spray effect (unchanged). |
| Power 1–3 | The existing power terms: 3 = the current "power hitter" setting, 2 = default, 1 = a smaller-than-default power effect only if the engine's term supports it; otherwise 1 behaves like 2 **(default; check the code)**. |
| Approach, swing path, off-speed tags | Unchanged (existing). |
| Pitch checkboxes | "Hits off-speed hard" / "can't hit the changeup" map onto the existing off-speed tag; the rest are coach info until fit **(default)**. |
| Zone grid | A small prior in the hitter's spot memory: hot ≈ a couple of hard-hit swings' worth at that spot, cold the reverse; real at-bats outweigh it quickly **(default sizes, set by the existing spot-memory caps)**. |
| Contact, speed, bunt/steal | Stored and shown only, until fit to data and checked. |
| Team tendencies | Info only **(default)**; "aggressive early" could later seed the approach tag for unknown hitters. |
| Custom fields, notes | Never. |
| Unknown | Same as today's untagged hitter (engine sees average). |

Note (Nov 18, evening): the hitter model revamp (v1.3) runs in parallel. The engine mapping in this section waits
until v1.3 merges; the pages, data and suggestions can be built now.

## 6. Auto-suggestions
After each game's at-bats attach to hitters:
- Zone: a spot where he made hard contact 2+ times across games (or whiffed / was weak 3+ times) → suggest hot /
  cold **(default thresholds)**.
- Ratings: suggest only with enough at-bats (e.g. contact after 10+ PAs against us) **(default)**.
- Tags: the learner's existing hitter learning (approach) already suggests; shown in the same list.
- A dismissed suggestion stays quiet until the evidence grows clearly.

## 7. Data
- Extend the existing hitter doc: ratings (spray reuses `scoutTags.spray`), zone grid, checkboxes, notes, class year.
- New: team tendencies, custom field definitions (per organization) and values, suggestions, hitter merges.
- Importer: new CSV columns for power, contact, speed, zone grid.
- The game pack carries the opponent's engine-facing fields, so the iPad calls offline.

## 8. Proof
1. Everything Unknown / blank = identical calls to today (bitwise, Python and JS), like the v1.2 tag tests.
2. Each mapped field moves calls in the expected direction and within the existing caps.
3. Custom fields, notes, contact and speed don't change calls.
4. Permissions: players can't read opponents; coaches without the permission can't edit; signed-out denied.
5. A simulated two-season set: at-bats attach to the right hitters across seasons; merge works; suggestions fire at
   their thresholds and not before.

## 9. Build steps
1. Check the current hitter/opponent schema and engine power terms in the repo.
2. Data model + migration (dev first, then production with Drew's approval).
3. Hitter page + team page (portal, laptop and iPad, site v2 look).
4. Engine mapping (power, checkboxes → off-speed tag, zone prior) behind "Unknown = identical".
5. Custom fields.
6. History attach + suggestions.
7. Importer columns, game pack.
8. Proof steps 1–5, then Drew's go.

## 10. Open
- Pitch checkbox list and team tendency list (Drew to edit).
- Whether power 1 can make the engine *less* careful than default (depends on the current code).
