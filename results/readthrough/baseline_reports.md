# v0.9 Step 1 baseline reports: v0.7c and v0.8

No scouting anywhere (every hitter at the default). Ranges and comparisons, not pass/fail. MLB figures are benchmarks, not college targets.

## 1. Usage by count (from the read-through games)

| | v07 | v08 | MLB reference |
|---|---|---|---|
| First-pitch fastball | 55.6% | 65.6% | about 58% |
| First-pitch strike | 50.7% | 55.1% | just under 62% |
| Reach a pitcher's count (0-2, 1-2, 2-2) | 35.1% | 35.8% | 44.9% to 51.0% |
| Reach a hitter's count (2-0, 3-0, 3-1) | 26.0% | 24.6% | 16.8% to 20.0% |
| First two calls both off the zone | 0.1% | 0.0% | — |
| 1-1 goes to 1-2 (not 2-1) | 48.7% | 46.3% | — |

Fastball / chase / middle / inside share of calls, by count:

| Count | v07 FB · chase · middle · in | v08 FB · chase · middle · in |
|---|---|---|
| 0-0 | 56% · 1% · 50% · 8% (n 1620) | 66% · 1% · 47% · 9% (n 1596) |
| 1-0 | 57% · 0% · 68% · 8% (n 778) | 77% · 0% · 58% · 8% (n 696) |
| 0-1 | 53% · 2% · 32% · 11% (n 539) | 65% · 1% · 31% · 12% (n 631) |
| 1-1 | 56% · 1% · 58% · 7% (n 543) | 69% · 0% · 55% · 7% (n 556) |
| 2-0 | 63% · 0% · 83% · 6% (n 343) | 78% · 0% · 80% · 8% (n 294) |
| 2-1 | 65% · 0% · 83% · 6% (n 362) | 74% · 0% · 74% · 5% (n 349) |
| 1-2 | 42% · 13% · 17% · 4% (n 423) | 44% · 5% · 31% · 4% (n 431) |
| 0-2 | 40% · 23% · 9% · 5% (n 233) | 38% · 16% · 21% · 3% (n 264) |
| 3-0 | 66% · 0% · 93% · 2% (n 125) | 67% · 0% · 94% · 2% (n 121) |
| 3-1 | 64% · 0% · 89% · 6% (n 169) | 74% · 0% · 89% · 7% (n 193) |
| 2-2 | 45% · 1% · 42% · 5% (n 397) | 47% · 0% · 52% · 5% (n 409) |
| 3-2 | 54% · 0% · 93% · 3% (n 237) | 59% · 0% · 85% · 7% (n 302) |

## 2. Arsenal balance (engine queried in every count, both sides)

Usage = average share of calls over the 12 counts and both sides. Gap = how much worse the pitch's best call is than the best call overall, in runs, averaged over the counts where it is allowed. Flags: under-called (gap under 0.005 runs at the level's scale but under 5% of calls), over-called (over 60% of calls with 3+ pitches).

| Engine | Level | Staff | Pitch | Usage | Mean gap (runs) | Allowed in | Flag |
|---|---|---|---|---|---|---|---|
| v07 | hs | two_pitch | Fastball | 76.1% | 0.0 | 24/24 |  |
| v07 | hs | two_pitch | Curveball | 23.9% | 0.0309 | 24/24 |  |
| v07 | hs | default | Fastball | 53.2% | 0.0067 | 24/24 |  |
| v07 | hs | default | Slider | 38.1% | 0.0202 | 24/24 |  |
| v07 | hs | default | Changeup | 8.7% | 0.0551 | 24/24 |  |
| v07 | hs | four_pitch | Fastball | 47.5% | 0.0059 | 24/24 |  |
| v07 | hs | four_pitch | Slider | 31.1% | 0.0207 | 24/24 |  |
| v07 | hs | four_pitch | Curveball | 11.5% | 0.0349 | 24/24 |  |
| v07 | hs | four_pitch | Changeup | 9.9% | 0.0388 | 24/24 |  |
| v07 | college_d3 | two_pitch | Fastball | 79.3% | 0.0 | 24/24 |  |
| v07 | college_d3 | two_pitch | Curveball | 20.7% | 0.0323 | 24/24 |  |
| v07 | college_d3 | default | Fastball | 58.9% | 0.0032 | 24/24 |  |
| v07 | college_d3 | default | Slider | 32.7% | 0.0206 | 24/24 |  |
| v07 | college_d3 | default | Changeup | 8.4% | 0.0533 | 24/24 |  |
| v07 | college_d3 | four_pitch | Fastball | 52.4% | 0.0031 | 24/24 |  |
| v07 | college_d3 | four_pitch | Slider | 26.5% | 0.0211 | 24/24 |  |
| v07 | college_d3 | four_pitch | Curveball | 11.2% | 0.0332 | 24/24 |  |
| v07 | college_d3 | four_pitch | Changeup | 9.8% | 0.0365 | 24/24 |  |
| v07 | college_d1 | two_pitch | Fastball | 77.9% | 0.0 | 24/24 |  |
| v07 | college_d1 | two_pitch | Curveball | 22.1% | 0.0228 | 24/24 |  |
| v07 | college_d1 | default | Fastball | 59.1% | 0.002 | 24/24 |  |
| v07 | college_d1 | default | Slider | 31.0% | 0.015 | 24/24 |  |
| v07 | college_d1 | default | Changeup | 9.9% | 0.036 | 24/24 |  |
| v07 | college_d1 | four_pitch | Fastball | 51.8% | 0.002 | 24/24 |  |
| v07 | college_d1 | four_pitch | Slider | 24.8% | 0.0154 | 24/24 |  |
| v07 | college_d1 | four_pitch | Curveball | 12.5% | 0.0228 | 24/24 |  |
| v07 | college_d1 | four_pitch | Changeup | 10.8% | 0.0252 | 24/24 |  |
| v08 | hs | two_pitch | Fastball | 83.0% | 0.0002 | 24/24 |  |
| v08 | hs | two_pitch | Curveball | 17.0% | 0.0075 | 10/24 |  |
| v08 | hs | default | Fastball | 65.8% | 0.0036 | 23/24 | over-called: more than 60% of calls |
| v08 | hs | default | Slider | 34.2% | 0.0043 | 14/24 |  |
| v08 | hs | default | Changeup | 0.0% | None | 0/24 |  |
| v08 | hs | four_pitch | Fastball | 65.7% | 0.0042 | 24/24 | over-called: more than 60% of calls |
| v08 | hs | four_pitch | Slider | 29.7% | 0.0055 | 14/24 |  |
| v08 | hs | four_pitch | Curveball | 3.8% | 0.0195 | 5/24 |  |
| v08 | hs | four_pitch | Changeup | 0.8% | 0.021 | 1/24 |  |
| v08 | college_d3 | two_pitch | Fastball | 86.9% | 0.0 | 24/24 |  |
| v08 | college_d3 | two_pitch | Curveball | 13.1% | 0.005 | 8/24 |  |
| v08 | college_d3 | default | Fastball | 72.0% | 0.0013 | 24/24 | over-called: more than 60% of calls |
| v08 | college_d3 | default | Slider | 26.5% | 0.0061 | 14/24 |  |
| v08 | college_d3 | default | Changeup | 1.5% | 0.0168 | 2/24 |  |
| v08 | college_d3 | four_pitch | Fastball | 69.1% | 0.0016 | 24/24 | over-called: more than 60% of calls |
| v08 | college_d3 | four_pitch | Slider | 22.9% | 0.0069 | 14/24 |  |
| v08 | college_d3 | four_pitch | Curveball | 6.9% | 0.0139 | 8/24 |  |
| v08 | college_d3 | four_pitch | Changeup | 1.1% | 0.0193 | 2/24 |  |
| v08 | college_d1 | two_pitch | Fastball | 81.9% | 0.0 | 24/24 |  |
| v08 | college_d1 | two_pitch | Curveball | 18.1% | 0.0038 | 10/24 |  |
| v08 | college_d1 | default | Fastball | 71.0% | 0.0007 | 24/24 | over-called: more than 60% of calls |
| v08 | college_d1 | default | Slider | 24.4% | 0.0043 | 14/24 |  |
| v08 | college_d1 | default | Changeup | 4.6% | 0.0112 | 6/24 |  |
| v08 | college_d1 | four_pitch | Fastball | 66.2% | 0.0008 | 24/24 | over-called: more than 60% of calls |
| v08 | college_d1 | four_pitch | Slider | 20.1% | 0.0048 | 14/24 |  |
| v08 | college_d1 | four_pitch | Curveball | 10.7% | 0.0092 | 12/24 |  |
| v08 | college_d1 | four_pitch | Changeup | 3.0% | 0.0117 | 5/24 |  |

## 3. Predictability by count (from the read-through games)

A predictor that sees only what a hitter sees (count, last pitch type, last result), trained on the other games, guesses fastball or off-speed. Edge = its accuracy minus always guessing fastball. Higher edge = more predictable.

| Count | v07 edge (n) | v08 edge (n) |
|---|---|---|
| 0-0 | +0.0% (1620) | +0.0% (1596) |
| 1-0 | +0.0% (778) | +0.0% (696) |
| 0-1 | +8.5% (539) | +2.7% (631) |
| 1-1 | +4.4% (543) | +2.3% (556) |
| 2-0 | +0.0% (343) | +0.0% (294) |
| 2-1 | +3.3% (362) | +0.0% (349) |
| 1-2 | +13.5% (423) | +15.5% (431) |
| 0-2 | +18.5% (233) | +14.4% (264) |
| 3-0 | +0.0% (125) | +8.3% (121) |
| 3-1 | +3.6% (169) | +2.1% (193) |
| 2-2 | +15.6% (397) | +13.0% (409) |
| 3-2 | +4.2% (237) | +5.0% (302) |
| **All** | +4.5% | +3.7% |
| Behind in the count | +1.4% | +1.5% |

Consecutive fastballs (reported, not a gate, decision 7):

| | v07 | v08 |
|---|---|---|
| Correlation, consecutive pitches by a pitcher | +0.15 | +0.22 |
| Correlation within a PA | +0.16 | +0.24 |
| Fastball after a fastball (within a PA) | 61.6% | 72.3% |
| Fastball after an off-speed pitch | 45.5% | 47.8% |

## 4. Platoon audit (engine queried in every count)

Expected by coaches: more changeups to opposite-side hitters; more breaking balls to same-side hitters, mostly away.

| Engine | Level | Staff | Changeup opp / same | More CH vs opposite? | Breaking same / opp | More breaking vs same? | Breaking away share (same side) |
|---|---|---|---|---|---|---|---|
| v07 | hs | two_pitch | — | — | 23.9% / 23.9% | no | 24.7% |
| v07 | hs | default | 9.6% / 7.9% | yes | 38.7% / 37.4% | yes | 44.7% |
| v07 | hs | four_pitch | 10.7% / 9.2% | yes | 43.2% / 42.0% | yes | 40.5% |
| v07 | college_d3 | two_pitch | — | — | 20.7% / 20.7% | no | 45.8% |
| v07 | college_d3 | default | 9.0% / 7.7% | yes | 33.2% / 32.2% | yes | 40.9% |
| v07 | college_d3 | four_pitch | 10.7% / 9.0% | yes | 38.4% / 37.2% | yes | 37.8% |
| v07 | college_d1 | two_pitch | — | — | 22.1% / 22.1% | no | 27.6% |
| v07 | college_d1 | default | 10.9% / 8.9% | yes | 31.6% / 30.4% | yes | 40.8% |
| v07 | college_d1 | four_pitch | 11.9% / 9.7% | yes | 38.1% / 36.7% | yes | 35.1% |
| v08 | hs | two_pitch | — | — | 17.0% / 17.0% | no | 26.1% |
| v08 | hs | default | 0.0% / 0.0% | no | 35.4% / 32.9% | yes | 45.8% |
| v08 | hs | four_pitch | 1.5% / 0.0% | yes | 33.9% / 33.1% | yes | 38.9% |
| v08 | college_d3 | two_pitch | — | — | 13.1% / 13.1% | no | 32.9% |
| v08 | college_d3 | default | 3.1% / 0.0% | yes | 27.5% / 25.5% | yes | 46.1% |
| v08 | college_d3 | four_pitch | 2.2% / 0.0% | yes | 30.7% / 28.9% | yes | 41.1% |
| v08 | college_d1 | two_pitch | — | — | 18.1% / 18.1% | no | 40.2% |
| v08 | college_d1 | default | 5.1% / 4.1% | yes | 24.7% / 24.0% | yes | 43.8% |
| v08 | college_d1 | four_pitch | 5.4% / 0.7% | yes | 32.5% / 29.2% | yes | 36.1% |
