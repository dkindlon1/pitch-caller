# Plan: pitch outcome tracking and peak profile, Nov 18, 2026

Status: **plan, nothing built.** From FEATURES_next_2026-11-18.md section 2 and Drew's answers on Nov 18.
Items marked **(default)** are Claude's suggestion where Drew didn't decide.

## 1. What it is
Track how each of a pitcher's pitches does in specific situations and over a game, compare it to his own normal, and
turn that into plain conclusions for coaches. Example: a slider nobody touches the first time through that gets
softer contact the third time through. Mostly data for coaches; the engine uses a finding only after it passes the
learner's trait gate.

## 2. Drew's decisions
| Topic | Decision |
|---|---|
| Breakdowns | Per pitch, by: time through the order (1st / 2nd / 3rd+), pitch count (0–25 / 26–50 / 51–75 / 76+), runners (empty vs on, i.e. stretch), hitter type + side (same / opposite, plus scouting tags when set). Count group is already in the reports. |
| Peak profile = | His normal per pitch, weighted toward recent outings. Drift = falling below his own normal. Never claims to know how he feels. |
| Peak metrics | Whiff %, strike %, hard contact % per pitch; velo and miss distance when radar / location were logged. |
| Recency | Last ~5 outings count most; the rest of the season still counts; partly resets at a new season. |
| In-game drift note | Balanced: fires when a pitch is clearly below his normal over at least ~8 of that pitch tonight. Goes to the notifications button (badge only) and the outing report. |
| When conclusions show | Clear findings shown normally; weaker ones labeled "early sign"; noise hidden. |
| Format | A plain sentence plus a small chart behind it. |
| Engine use | Only after the trait gate (learnable + actually changes runs), with small caps. |
| Situational rule (Drew) | A pitch still doing well in a situation (e.g. the 0-1 slider) isn't written off because it's getting hit elsewhere. Findings are per situation, never a blanket "stop throwing it". |

## 3. How it works

### 3.1 Baseline ("his normal")
- Per pitch and metric: a rate with an uncertainty, built from his outings with weights (last ~5 outings heavy,
  older ones fading, about half weight carried into a new season **(default)**).
- New pitcher or new pitch: starts from the level average for that pitch kind and profile, so early numbers aren't
  wild.

### 3.2 Breakdown findings (reports)
- Each breakdown cell (pitch × variable × bucket, e.g. slider × 3rd time through) is compared to his baseline for
  that pitch, with shrinkage toward the baseline so small cells don't swing.
- **Clear** = the difference is well outside noise (about 95% confidence); **early sign** = likely but not certain
  (about 80%) **(default)**.
- **Many cells, few real effects:** with 4 variables × several buckets × each pitch, some cells will look different by
  chance. A false-discovery control keeps "clear" honest, and each report shows at most ~5 findings, strongest first
  **(default)**.
- Sentence template: "[Pitch] [metric] goes from [baseline] to [cell] [bucket]" + sample size, e.g. "Slider whiffs
  drop from 38% to 21% the 3rd time through (31 sliders)". Chart: the metric across that variable's buckets.
- Findings that hold across several outings move from the outing report into the season view.

### 3.3 Peak drift (in-game)
- After each pitch, for each pitch kind with at least ~8 thrown tonight: compare tonight's whiff %, strike % and hard
  contact % (and velo / miss distance if logged) to his normal.
- Fires when there's high probability (~90% **(default)**) that tonight is meaningfully below normal (at least a
  quarter of the way to the level's "bad" end **(default)**).
- Note wording: "His slider isn't missing bats like usual (2 whiffs on 14 vs about 30%)". Situation-specific when the
  drop is in one situation only.
- One note per pitch per metric per game, updated rather than repeated.
- The engine's in-game "landing today" and confidence already react to strikes; drift notes are information for the
  coach and don't change calls.

### 3.4 Peak archetype
His normal also gives a simple label for what he is at his best (e.g. "strike thrower, slider for whiffs"), shown on
his profile and in the recap's private view **(default)**. Separate from the style archetype.

### 3.5 Reaching the engine (the gate)
These map onto traits the learner already has machinery for (LEARNING_SPEC 5.7): times through the order, from the
stretch, the fatigue curve (pitch count), platoon split per pitch. A finding becomes an engine trait only if it passes
the gate: learnable within a season of realistic data, and changes his calls by a measurable amount of runs. Then it
uses the learner's caps and flags. Until then, it's report-only.

## 4. Data
- Uses the raw pitch events already logged (count, outs, runners, batters faced, pitch count, result, contact quality,
  location cell, velo when logged, hitter side and tags).
- Times through the order: from batters faced and the lineup slot (already logged).
- Stored: each pitcher's baseline (rebuilt after each game) and the findings per outing. The game pack carries the
  baseline so drift notes work offline.

## 5. Proof
1. Simulated seasons with planted effects (e.g. slider whiffs drop 15 points the 3rd time through): found as "clear"
   at a realistic rate; with no planted effect, no "clear" findings beyond the false-discovery rate.
2. Drift: planted mid-game drops fire within a realistic number of pitches; steady outings fire rarely (target: under 1
   false note per 5 outings **(default)**).
3. Every number recomputed from raw events by an independent script.
4. Situational rule: a pitch doing well in one situation and badly in another gets two separate findings, not a
   blanket one.
5. Drift notes don't change calls (style off, drift on = identical calls).

## 6. Build steps
1. Baseline builder (server, after End game) + level-average starting points.
2. Breakdown findings + false-discovery control + sentence and chart.
3. Drift checker in the game app (offline, from the game pack) → notifications button.
4. Report and recap sections (plugs into PLAN_reports_recap_2026-11-18.md section 2.6).
5. Peak archetype label.
6. Proof steps 1–5; then the trait gate runs on these traits as real data comes in.

## 7. Open
- Pitch count buckets per level (HS starters throw fewer pitches; defaults are the same for now).
- Peak archetype labels.
