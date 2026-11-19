# Plan: the style layer (coach and pitcher style), Nov 18, 2026

Status: **plan, nothing built.** From FEATURES_next_2026-11-18.md section 1 and Drew's answers on Nov 18.
Items marked **(default)** are Claude's suggestion where Drew didn't decide.

## 1. What it is
Each coach and each pitcher has a style. The engine stays the main driver of every call; style **tilts** the
engine's mix toward what the coach or pitcher prefers, inside hard caps. Style off = today's engine, exactly.

## 2. Drew's decisions
| Topic | Decision |
|---|---|
| How style acts | Tilts percentages among calls already in the engine's mix. Never adds a call the engine left out. |
| Caps | Both a percentage cap and a run-cost cap. |
| Cap sizes | Strength Low / Medium / High = at most +8 / +15 / +20 percentage points to one call. Cost cap: style can't favor a call costing more than ~0.01 runs vs the best call. |
| Big counts (2-2, 3-2, 3-0, late and close) | Full percentage cap, cost cap halved (~0.005). |
| Hard rules | Never overridden (e.g. no chase at 3-0 / 3-1, second shake-off of a pitch = out for the at-bat, trust line). |
| What it captures | Pitch type by count group; location lean; big-spot lean. (Sequencing lean: not now.) |
| Evidence | Coach's own calls teach coach style; pitcher shake-offs (and what he threw instead) teach pitcher style; accepting the engine's call counts as mild agreement. |
| Questionnaire vs real calls | Questionnaire counts like ~30 real calls per situation group; real calls take over after that (real calls in the exact situation count more than what he said sitting down). |
| Coach vs pitcher conflict | Preferred calls within the engine's near-tie band → coach's style applies; outside it → pitcher's style applies. Engine stays the main input either way. |
| Questionnaire | Situation cards: pick pitch + spot, like calling a real pitch. Coach 15 cards, pitcher 8. Cards use their own staff's pitches (coach: rotates through his actual pitchers; pitcher: his own arsenal). Prompted at setup, skippable, retakeable. Skipped = pure engine until real calls teach it. |
| Scope | Coach style is per team. It's tied to the coach's account email, so he can import his style into another team: a **copy**, after which each team learns separately. Pitcher style follows the pitcher. |
| Archetype result | Each person sees his own; the owner and the team's coaches see everyone's. Not on public recaps. |
| Push-back | Notification when a style call breaks logic/a hard rule, or a style tendency has clearly cost runs. (No "style is working" notes.) |
| Notifications button | In the game app: style push-backs and peak-drift notes, count badge only. No sound, no pop-up. Same items in the post-game report. |
| Proven style | When a tendency is proven (as good as the engine or better over enough calls), its caps can widen up to 1.5×. Never past hard rules. |
| Coach controls | Toggle + Low / Medium / High strength, per game, changeable mid-game. |
| Proof | Style off = exact match; Drew grades scenario sets; simulated seasons confirm caps and run cost. |

## 3. How it works

### 3.1 Situation groups (the style "cells")
- **Pitch type by count group:** 0-0 / ahead / even / behind / two strikes / 3-ball (6 groups), each × hitter side
  (same / opposite). The lean is per pitch kind (fastball family, slider, curve, changeup…).
- **Location lean:** inside vs away, up vs down, edge vs attack the zone. One set per count group family
  (early, two strikes, 3-ball) **(default)**.
- **Big-spot lean:** runners in scoring position, or late and close (the engine's existing big-spot test): pitch
  kind and location lean in those spots.

### 3.2 Measuring a lean (surprise, not raw counts)
A coach who calls a lot of fastballs at 0-0 may just be agreeing with the engine. So a lean is measured **against
what the engine offered**: in each cell, how often he chose a call vs how often the engine's mix offered it.
- Lean for call type X in a cell = log((chosen X + prior) / (expected X from the engine's mixes + prior)).
- Questionnaire answers seed each cell they cover as ~30 pseudo-calls, measured against the engine's mix for that
  card's situation.
- Accepting the engine's call adds a small amount of "no lean" evidence (weight 0.25 of an override) **(default)**.
- Re-calls after a shake-off count for the pitcher, not the coach.
- Needs: each logged pitch stores the engine's **full mix** (not just the chosen call's probability). New log field.

### 3.3 Applying style to a call
1. Engine builds its mix as today.
2. Pick whose style applies (3.4).
3. Multiply each call's share by exp(k × lean), k set by strength; renormalize.
4. Clamp: no call gains more than the cap (8 / 15 / 20 points; up to 1.5× for a proven cell).
5. Cost cap: any call costing more than best + 0.01 runs (0.005 in big counts) can't gain share from style.
6. Hard rules applied last (they already exclude calls from the mix, so style can't bring them back).
7. Draw the call. Log the engine's mix, the styled mix and whose style applied.

### 3.4 Coach vs pitcher
For the situation, find each style's top tilted call. If both are inside the engine's near-tie band, the coach's
style applies; if not, the pitcher's. If only one has a style, it applies. Neither: engine alone.

### 3.5 Learning cadence
Style profiles update after End game (same worker as the learner), never mid-game **(default)**, matching the
learning spec's "learning never changes a profile mid-game". The coach's strength toggle does apply mid-game.

### 3.6 Proven tendencies
Per cell, compare the styled calls to the engine's own expected value and to outcomes, scored before each game like
the learner's scoreboard. A cell becomes "proven" after enough style-affected calls (~150 **(default)**) with the
style at least as good. Results are slow evidence, so expected value leads and outcomes confirm.

### 3.7 Push-back rules
- **Logic break:** a coach override or style answer that runs into a hard rule or clear baseball logic (e.g. chase
  at 3-0). The engine already blocks it for its own calls; the note explains why.
- **Costing runs:** a cell whose styled calls have cost more than a threshold over enough calls (threshold and minimum
  set from the sims **(default)**). The note says what and how much; the coach can turn that cell down or keep it.

### 3.8 Archetypes
Derived from the leans (for example aggressive in the zone vs expand, fastball-heavy vs off-speed-heavy, inside vs
away). Names are placeholders until Drew picks them ("The Attacker", "The Sequencer", "Pitch-to-Contact").

## 4. Screens
- **Portal, questionnaire:** card per situation (count, runners, outs, hitter side and type, the pitcher's arsenal
  and today's feel shown simply). Tap pitch, then spot, like the game screen. Progress, skip, retake. If no
  pitchers are entered yet, coach cards use a standard 4-pitch arsenal **(default)**. Laptop and iPad.
- **Portal, result:** archetype, plus a plain list of his main leans.
- **Portal, import:** "Import my style" on a team, matched by the coach's email.
- **Game app:** style toggle + strength; notifications button with a badge; the "why" ⓘ mentions when style moved
  the call.
- **Post-game report:** style notes + the override section (built with the reports feature).

## 5. Data (Supabase)
- `style_profiles`: team id, subject (coach user id or pitcher id), owner email, questionnaire answers, cell counts,
  proven flags, version, learner version. Row-level security: own row, plus owner and team coaches read.
- `style_imports`: source profile, target team, date (audit).
- Pitch events: add engine mix, styled mix, style applied (coach / pitcher / none), strength.
- Game pack: includes the active coach and pitcher style profiles, so the iPad calls offline.

## 6. Proof (before it ships)
1. **Style off = identical:** exact match over random situations and full calls (same method as the past
   same-engine tests). Python and JS parity.
2. **Property checks:** never adds a call; never exceeds the caps; cost cap holds; big-count halving holds; hard rules
   hold; proven widening never past 1.5×.
3. **Graded scenarios:** about 30 situations with a test coach and pitcher style; Drew grades each styled call.
4. **Simulated seasons:** synthetic coaches with known styles: learned leans recover the truth; a "neutral" coach
   isn't given a fake style; run cost per game stays inside a budget (~0.10 runs/game at High **(default)**, asked
   above that).
5. **Questionnaire check:** a test coach answering cards consistently gets the leans and archetype expected.

## 7. Build steps
1. Logging: engine mix, styled mix, whose style, strength on every pitch.
2. Style math in both engines (behind "style off = identical").
3. Learner: cell counts, questionnaire seeding, agreement weight, proven scoring.
4. Supabase tables + RLS + game pack.
5. Portal: questionnaire, result, import.
6. Game app: toggle, strength, notifications button.
7. Proof steps 1–5, then Drew's go.

## 8. Open
- Draft the 15 coach and 8 pitcher situation cards (Claude drafts, Drew grades). Done: CARDS_style_questionnaire_2026-11-18.md (approved).
- Archetype names.
- Run budget per game for style (default 0.10).
- Location lean granularity (default per count family).
