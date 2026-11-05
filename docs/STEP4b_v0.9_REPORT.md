# v0.9 Steps 4b, 5 and 6 report: guardrail, landing, power, inside, matchup memory

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session. The command for each result is given.

## What was built

Every new term is behind its own flag, and every flag is off in `FLAGS_V07` and `FLAGS_V08`, so v0.7c and v0.8 still
reproduce their golden files exactly. `FLAGS_V09` = v0.8 plus the terms that passed their gates.

| Flag | Item | What it does | In `FLAGS_V09` |
|---|---|---|---|
| `guardrail_v09` | 10 | Removes v0.8's myopic guardrail. The never-pick windows on full cost stay. Three-ball counts still rank by myopic cost, so there are no setups there. | **on** |
| `landing_v09` | 9 | A pitch with at least 4 thrown today and a shrunk strike rate at or below 0.40 gives way to the pitches that are landing. With two strikes and fewer than three balls it can still be called as a chase; otherwise it is left out. If nothing is landing, the filter does nothing. | **on** |
| `matchup_memory` | 6 | Each earlier-trip whiff or called strike on a pitch class raises whiffs on that class by +0.107 logits (up to 4). Each earlier hard-hit ball on that class and spot lowers them by −0.346 (up to 2). The total is capped at ±0.5; HS and travel get ×0.6. These are Step 3's fitted values. | **on** |
| `inside_v09` | 3 (widened) | Fitted inside-vs-away differences on and near the plate, by pitch class, height and platoon side. See Step 5. | **off**: failed its gate |
| `power_avoid` | 8 | Not built. See item 8. | — |

The simulator now records each hitter's earlier-trip matchup record. The scenario grader passes each row's matchup list
to the engine. Neither has any effect unless the flag is on.

## Gates

| Item | Gate | Result |
|---|---|---|
| 10 guardrail | 3-pitch starter's changeup in at least 11 of 24 cells and at least 5% of calls, every level; no hard-rule break | **Pass.** Changeup in 14 of 24 cells at every level (v0.8: 0, 2 and 6). Changeup share 8.8% HS, 8.9% D3, 10.5% D1 (v0.8: 0%, 1.5%, 4.6%). No hard-rule row gets any Not-acceptable share. |
| 9 landing | E6, E8 and C7 pass; A4, E1 and E3 still pass | **E6 and C7 pass; A4, E1 and E3 still pass.** E8's wrong calls are gone (Not share 26% → 0%), but it still misses the 70% acceptable line (47%). The rest of the row is arguable calls: curveball chase 29% and fastball middle 24%. |
| 3 widened, inside | H4 and F6 improve | **Fail.** H4 stays at 0% acceptable. F6 gets worse (16% → 0%). |
| 6 matchup memory | (plan: built from the Step 3 fits) | No row breaks. I2 moves 12% → 14% acceptable, still failing. I1 already passed; I4 unchanged. |
| 8 power | H1 passes; rows with no scouting unchanged | Not built: no data-backed version moves H1. |

## Scenario suite (64 frozen rows; `python3 readthrough/scenarios.py v08 v08g v08l v08m v08i v09 ...`)

| Engine | Pass | Fixed vs v0.8 | Broken vs v0.8 | Rows with a Not-acceptable failure |
|---|---|---|---|---|
| v0.8 | 26 | — | — | C7 E6 E8 F5 H1 I4 |
| + guardrail only | 24 | A7 H3 | B8 D5 F3 G4 | C7 E6 E8 F5 H1 I4 |
| + landing only | 28 | C7 E6 | — | F5 H1 I4 |
| + matchup only | 26 | — | — | C7 E6 E8 F5 H1 I4 |
| + inside only | 28 | D1 H2 | — | C7 E6 E8 F5 H1 I4 |
| **v0.9 (guardrail, landing, matchup)** | **28** | **A7 C7 D3 E6 H3** | **D5 F3 G4** | **F5 H1 I4** |
| v0.9 + inside | 29 | A7 C7 D1 D3 E6 H2 | D5 F3 G4 | F5 H1 I4 |

No hard-rule row gets a Not-acceptable share under any version. D5, F3 and G4 break because the changeup and slider
return to the zone at 2-0 and 1-1. Your rows mark those calls arguable, not wrong. This is the trade you chose in Step
2 ("Wider window or off"). Landing rescues B8, which the guardrail change alone breaks.

## Item 8, power hitters: what the data says

The power grade already raises hard contact by the same logit amount on every pitch. Two Statcast tests checked whether
power should matter more in some places than others (`readthrough/step4b_power_fit.py`, `step4b_power_hr.py`). Each
hitter's power is his hard-hit rate in the *other* season, so it never shares a ball in play with the rows it predicts.

- **P1, power x zone, on hard contact: does not ship.** Power's slope is about the same in the heart (+0.21 logits per
  SD), on the edge (+0.24) and off the plate (+0.15); none of the differences is distinguishable from 0, and the held-out
  fit gets worse. On the logit scale, power hitters don't hit the middle disproportionately harder.
- **P3, power on home runs given hard contact: ships** (+0.112 logits per SD, 95% +0.05 to +0.17; held-out gain 2.3
  SD). A power hitter's hard contact leaves the park more often: 13.0% vs 10.0% from the top third of power to the
  bottom.
- **P4, that HR effect x heart: does not ship.**

What this means for H1: the engine already gives a power hitter more hard contact in the middle in absolute terms,
because the heart is where hard contact is common. P3 would add a little more value to his hard contact everywhere.
Neither reason argues strongly against FB middle at 2-0, where the alternative is a likely 3-0. On the current engine
(v0.9 flags, grade as frozen), H1 calls FB middle 67%, slider middle 18% and changeup middle 15%.

**H1 also has an error in the frozen file.** Row H1 sets `grades={"d": 5}`, which is *discipline* 5, not power. The
engine's power key is `w` (spec 8.2: contact c, power w, discipline d). Re-running H1 with `w` 5 gives the same call
on v0.8 (FB middle 100%), so the error doesn't change today's result. Still, the row doesn't test what it says.
Changing a frozen file needs your OK.

## Step 5, inside: what the data says

`readthrough/step5_inside_fit.py` covers MLB pitches on and near the plate (heart and edge), comparing the inner half
with the outer half at the same height. The same ship rule applies. All three outcomes pass the held-out test by a wide
margin: hard contact gains 12 SD, whiffs 13 SD, swings 21 SD. 22 of the 24 coefficients ship. The fastball-down
hard-contact effect is the only cell that doesn't. The biggest effects:

- **Elevated fastball inside:** hard contact 31% vs 52% away (−0.82 to −0.99 logits), fewer whiffs, many more swings.
- **Low off-speed inside:** more hard contact (+0.39 to +0.60). That's the backup slider or changeup that runs into the barrel.
- Inside pitches get swung at more and whiffed at less almost everywhere.

The term is built (`inside_v09`). It is centered: an inside target gets +½ of the fitted difference and an away target
−½, so the in/away average the outcome model was calibrated on doesn't move. It still doesn't make the engine go
inside in the scenario rows, for two reasons:

1. **Hit-by-pitch cost.** At D3, an up-in fastball call carries a 4.8% hit-by-pitch chance against 0.9% for up-away.
   That costs more than the jam effect saves. College HBP rates are real (4.2% of D3 PAs), and the level's HBP size is
   set by `fit_all.py`, which the rules say not to rerun. (The engine's in/away HBP split, 1.6 vs 0.3, is a v0.6
   assumption.)
2. **Centering makes up-away fastballs worse.** The data says those get hit harder, and in F6 FB up-away was one of the
   acceptable calls. F6 drops from 16% to 0%.

So the inside term ships by the Statcast rule and fixes D1 and H2, but fails your H4/F6 gate and hurts H3 (76% → 57%
with everything else on). Per the plan, it stays off in `FLAGS_V09`.

Inside share of calls, 3-pitch starter, both sides, by count (`readthrough/inside_by_count.py`, `results/step5/inside_by_count.txt`):
v0.8 1.8% / 0.2% / 1.0% (HS / D3 / D1); v0.9 without the term 1.2% / 0.2% / 0.7%; with it 3.0% / 6.7% / 6.5%, mostly
at 1-0, 2-0, 2-1 and 1-1. No target was set.

## Verification (all run in this session)

| Check | Result |
|---|---|
| v0.8 golden, Python and JS (`golden/golden_v08.py check`, `node golden/golden_v08.js`) | exact (largest difference 0) |
| v0.7c golden, Python and JS | exact |
| Python/JS parity, every v0.9 term on, 150 new cases. 40% have a non-landing pitch and 50% an earlier-trip matchup record (`PARITY_FLAGS=v09`) | pass (largest difference 9e-14) |
| Python/JS parity, v0.8, 150 cases | pass |
| Intent labels parity | 150/150 |
| `tests_v09_step4b.py` (guardrail, landing) / `tests_v09_step5.py` (inside) / `tests_v09_step6.py` (matchup) | 28 / 20 / 17 checks, all pass |
| `tests.py`, scenario grader tests (`readthrough/test_scenarios.py`), read-through tests (`readthrough/test_read.py`) | 19/19; all pass; all pass |
| App rebuilt (`app/build.py`); browser suites `v09_labels_e2e`, `gameday_e2e`, `replay_e2e`, `smoke` | all pass, no page errors (the app is still on `FLAGS_V08`) |
| Not rerun this step | the older v0.8 suites (`tests_v08*.py`). Every change here is behind a flag that is off in v0.8, and both v0.8 goldens are exact, but those suites were not run again |

## Not done / waiting on you

- **Item 8:** which version, if any, to build (question sent).
- **H1's grade key:** fix the frozen row (`d` → `w`) or leave it (question sent).
- **Inside term:** keep it off, or turn it on despite the gate (question sent).
- **E8:** accept item 9 with E8's remaining shortfall made of arguable calls only, or keep working it.
- The app is still on `FLAGS_V08`. It moves to v0.9 after the Step 7 read-through. The matchup record isn't wired into the app yet.
