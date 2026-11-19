# Plan: outing reports and season recap, Nov 18, 2026

Status: **plan, nothing built.** From FEATURES_next_2026-11-18.md section 3 and Drew's answers on Nov 18.
Items marked **(default)** are Claude's suggestion where Drew didn't decide. Analytics is a main pillar of the company,
so these screens get the same design quality as site v2.

## 1. Drew's decisions
| Topic | Decision |
|---|---|
| Report contents | Pitch mix + results; hitter by hitter; overrides + style notes; location map; heat map with 4 categories. |
| Heat map categories | Strikes, balls, positive outcomes, negative outcomes. |
| Positive / negative | Standard split: positive = whiff, called strike, foul with 2 strikes, weak contact / out; negative = hard contact, hit, ball four, HBP. |
| Heat map grid | Both views, toggled: where it was **called** and where it **landed**. |
| Delivery | Built right after End game; coaches and the pitcher get an email with a link to the portal page. Always findable later from the pitcher, hitter and opponent pages. |
| Pitcher's view | His full outing (mix, heat maps, hitter by hitter, his own shake-offs and style notes). Coach overrides, coach style push-backs and coach notes stay staff-only. |
| Coach notes | Per outing and per at-bat; staff-only by default, with a "share with pitcher" toggle per note. |
| Multi-pitcher games | A report per pitcher plus one game summary for coaches. |
| Opponent link | Each hitter's at-bats and notes appear on his opponent page automatically and carry across seasons (detail in the opponent database plan). |
| Season recap timing | Final recap when the coach marks the season over, sent automatically to coaches and the pitcher; a live "season so far" anytime. |
| Recap comparison | Level averages from the public level data the engine already uses, labeled as such; real opt-in benchmarks later. |
| Public link | The pitcher picks sections: summary stats on by default; heat maps, pitch by pitch and the outing list are toggles. Excluded pitches stay excluded. Coach notes and style are never public. |
| Look | Site v2 Floodlight liquid-glass look on the web; a clean light PDF export for printing and email. Recap also viewable on the website and downloadable. |

## 2. Outing report (one per pitcher per game)
1. **Header:** pitcher, opponent, date, line (IP, pitches, strikes, K, BB, H, hard contact), level.
2. **Pitch mix + results:** per pitch: share, strike %, whiff %, hard contact %, by count group (0-0 / ahead / even /
   behind / two strikes / 3-ball) and hitter side.
3. **Heat maps:** a pitch filter (all / each pitch), a layer switch (strikes · balls · positive · negative) and a
   view switch (called · landed). Grid = the logged cells (zone, edges, chase). "Landed" needs location logging; if
   it's off for a pitch, that pitch appears only in "called", and the map says how many were left out.
4. **Hitter by hitter:** each at-bat's sequence (pitch, spot, result), the result, plus "what worked" (positive
   outcomes) and "who hurt us" (negative outcomes, hard contact). Per-at-bat notes.
5. **Overrides and style** (staff view): each override and shake-off, what the engine had, what was thrown, and what
   followed (that pitch and the rest of the at-bat). Push-backs and peak-drift notes from the game's notifications.
6. **Outcome tracking conclusions:** filled in by the outcome-tracking feature (next plan); the section is empty until
   then.
7. **Notes:** per outing.

### Outcome definitions (every layer uses these)
- **Strike:** called strike, swinging strike, foul, or ball in play. **Ball:** any ball (incl. ball four), HBP.
- **Positive:** whiff, called strike, foul with 2 strikes, weak contact, or an out in play. A foul with fewer than 2
  strikes counts as positive too, since it adds a strike **(default)**.
- **Negative:** hard contact, a hit, ball four, HBP.
- **Neither:** a ball that isn't ball four.
- When contact quality wasn't logged: an out in play = positive, a hit = negative **(default)**.

## 3. Game summary (coaches)
Staff line, each pitcher's line and pitch count, the game's overrides, and links to each outing report.

## 4. Season recap (per pitcher)
- **Season so far:** live, anytime, on the pitcher's page.
- **Final:** when the coach marks the season over: built, emailed to coaches and the pitcher, and frozen as a version.
- Contents: season line; per-pitch mix and results; heat maps (same 4 layers × 2 views); trends across outings
  (strike %, whiff %, velo if logged); outing list linking each outing report; level-average comparison
  ("K% vs D3 average", labeled "public level data").
- **Share:** a public link (unguessable, revocable), a PDF download, and a page on the website. The pitcher picks which
  sections are public; summary stats are on by default. **(default)** for players under 18 the parent account turns
  the public link on.
- Coach notes, style and overrides are never on the public recap.

## 5. Delivery and data
- Built from the raw pitch events in Supabase after End game sync (same raw data the learner replays). Nothing in a
  report is stored separately except coach notes and the frozen final recap.
- Emails through Resend (already in the stack): "Your outing report is ready" with a link; sign-in needed except for a
  public recap link.
- Row-level security: staff see all of their team's reports; a pitcher sees only his own, minus staff-only parts;
  public links serve only the sections the pitcher made public.
- Offline games: the report is built when the game syncs.

## 6. Proof
1. Every number in a report is recomputed by an independent script straight from the raw events and must match.
2. Outcome definitions: unit tests per result type, including fouls, unlogged contact and ball four.
3. Heat maps: called vs landed counts add up; pitches without location are excluded from "landed" and counted.
4. Permissions: a pitcher can't see staff-only parts or another pitcher's report; a public link shows only the chosen
   sections (tested signed out).
5. PDF and web render checked on laptop, iPad and iPhone Safari (screens looked at, not assumed).
6. A simulated season charted through the app produces a full recap with no gaps.

## 7. Build steps
1. Report data layer (queries over raw events, outcome definitions) + the independent check script.
2. Outing report page (portal) with heat maps and both views.
3. Notes (per outing, per at-bat, share toggle) + permissions.
4. Game summary.
5. Email on End game.
6. Season so far + final recap + freeze.
7. Public link, section toggles, parent approval, PDF export, website view.
8. Proof steps 1–6, then Drew's go.

## 8. Open
- Recap design pass (layout and charts at site v2 quality).
- Whether trends include velo when it's only sometimes logged (default: shown only when logged in 3+ outings).
