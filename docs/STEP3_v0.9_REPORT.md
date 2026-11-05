# v0.9 Step 3 report: Statcast tests for side to side and matchup memory (no engine change)

Date: 2026-11-05. Branch `v0.9-work`. Script `readthrough/step3_fits.py`; full output in `results/step3/step3_fits.txt`
and `.json`. Everything below was run in this session.

**Data:** Statcast, every 4th day of the 2024 and 2025 regular seasons, re-downloaded in Step 2 with `fetch_statcast.py`. That gives 337,195 pitches: 172,167 in 2024 (train) and 165,028 in 2025 (held out).

**Method:** the same as `seq_fit.py`, which produced v0.8's fit: logistic models with the spec's controls and pitcher and batter random intercepts. Every term is tested on top of the shipped v0.8 terms (timing, eye level, familiarity), so a gain means something v0.8 doesn't already have.

**Ship rule** (v0.8's): the held-out log-loss gain must exceed 2 game-clustered bootstrap SDs, and the coefficient's 95% interval must exclude 0.

## Item 3, side to side: does not ship

| Test | Outcome | Coefficient (se) | Held-out gain (2 SD bar) | Result |
|---|---|---|---|---|
| T1 inside → away | whiff on a swing | −0.075 (0.029) | −4.3e-5 (5.4e-5) | no ship |
| T1 away → inside | whiff on a swing | +0.084 (0.031) | −3.0e-5 (6.9e-5) | no ship |
| T1 inside → away | hard contact on a ball in play | +0.079 (0.043) | 6.8e-5 (1.3e-4) | no ship |
| T1 away → inside | hard contact on a ball in play | −0.061 (0.040) | 2.0e-4 (1.8e-4) | no ship (interval includes 0) |

- **T1:** no direction improves held-out predictions of whiffs. In-sample, the whiff signs run against the idea: moving inside to away slightly *lowers* whiffs.
- **T2, one pitch or a fading memory:** the last pitch only, and side memories at 0.8, 0.9 and 0.95, all give held-out gains of about 0 or below. The best was 0.8 at −1.3e-6.
- **T3, by speed change (report only):** inside to away with a 5+ mph speed drop lowers whiffs (−0.106, se 0.051). Without a drop, the effect is about 0.
- **T4, mechanism (report only):** on swings at away fastballs, contact is 0.64 inches *deeper* after an inside fastball than after an away one (95% −0.90 to −0.39; n 7,732 and 12,414). Deeper means later. This is the opposite of "the inside fastball makes him start earlier", and the effect is small either way.

**Result:** the side term stays off, as the plan requires. This is a null result for MLB batters on average. It doesn't show the coaching idea is wrong for particular hitters or lower levels, which no available data can test.

The widened part of item 3, how rarely the engine goes inside (1.8% of calls), is an engine-side question rather than a Statcast one. It is taken up in Step 5 against scenarios H4 and F6.

## Items 5 and 6, matchup memory: two terms ship

Matchup memory here means what happened in this pitcher's earlier plate appearances against this batter, in this game. It is tested beyond familiarity, which v0.8 already counts.

| Test | What it counts | Outcome | Coefficient (se) | Held-out gain (2 SD bar) | Result |
|---|---|---|---|---|---|
| M1 | earlier-trip whiffs and called strikes on this pitch class (capped at 4) | whiff on a swing | **+0.107 (0.022)** | 3.6e-4 (1.4e-4) | **ship** |
| M1 | same | hard contact | −0.010 (0.029) | −3.9e-5 | no ship |
| M2 | earlier-trip hard-hit balls on this class and spot (capped at 2) | whiff on a swing | **−0.346 (0.094)** | 1.6e-4 (9.6e-5) | **ship** |
| M2 | same | hard contact | +0.160 (0.097) | 1.2e-4 (1.2e-4) | no ship |
| M3 | M1 × third time through (report only) | whiff on a swing | −0.016 (0.035) | — | no difference |

**What it means:**

- **M1:** a pitch class that got whiffs or called strikes in earlier trips keeps getting more whiffs later. MLB hitters don't adjust away from what beat them earlier in the game. This supports your I2 row (go back to what worked).
- **M2:** after a hitter barrels a class at a spot, he whiffs less on it there. This supports avoiding what he hit (I1, I4).
- **M3:** neither effect changes the third time through.

64,520 pitches had an earlier-trip success on their class, and 3,950 had an earlier-trip hard-hit ball on their class and spot, so M2 rests on less data.

**What gets built (Step 6):** the matchup-memory term, using the fitted whiff coefficients only. Per plan, it is an outcome-weighted extension of familiarity, under the familiarity cap, with every fitted value restated for college (×1.0) and high school and travel (×0.6). The hard-contact effects did not ship, so they are not used.

## Not run

Any engine change. Lower-level data (none is available). The side term phase 2, which was conditional on phase 1 and is not needed.
