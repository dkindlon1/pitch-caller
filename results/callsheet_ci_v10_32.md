# Call sheet: ci_v10_32

Tier `ci`, 264 plate appearances x 12 counts, 27s.
Count weights: real MLB frequency from Statcast (Phase 3.8 will replace this with the engine's own chain).

## Bands

| Band | What | Mode | Result | Detail |
|---|---|---|---|---|
| B1 | No pitch type above 85% | enforced | **pass** | 99.9% of 1890 hold (need 98%), worst miss 1.5 pt (need <= 3.0) |
| B2 | Every allowed secondary at least 5% (same-side changeup 2%) | enforced | **pass** | 100.0% of 2562 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| B3 | No exact call above 60%, except 3-0 fastball | enforced | **FAIL** | 92.2% of 12061 hold (need 98%), worst miss 40.0 pt (need <= 3.0) |
| B5 | Overall usage, chance-weighted over counts | enforced | **FAIL** | 32.4% of 142 hold (need 98%), worst miss 48.9 pt (need <= 3.0) |
| B6 | Middle share by count group (command 3+) | enforced | **FAIL** | 15.7% of 2904 hold (need 98%), worst miss 85.4 pt (need <= 3.0) |
| B7 | Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations | enforced | **FAIL** | 3.3% of 120 hold (need 98%), worst miss 50.0 pt (need <= 3.0) |
| B8a | Down share with a runner on 1st within 2 pt of bases empty | enforced | **FAIL** | 81.2% of 96 hold (need 98%), worst miss 18.2 pt (need <= 3.0) |
| B8b | Off-speed share with a runner on 3rd at least 60% of bases empty | enforced | **FAIL** | 54.2% of 24 hold (need 98%), worst miss 15.1 pt (need <= 3.0) |
| B8c | A pitch that isn't landing gets 0% with a runner on 3rd | enforced | **FAIL** | 8/96 situations miss (must be 0) |
| B9 | RP2: after a foul straight back that exact call gets 0% | enforced | **pass** | 0/144 situations miss (must be 0) |
| B10 | Fallback picks a pitch that is landing, not the most confident | enforced | **pass** | 0/144 situations miss (must be 0) |
| B11 | Hard rules: no chase at 3-0/3-1 | enforced | **pass** | 0/528 situations miss (must be 0) |
| B12 | Coach rules CR1 and CR2 (Phase 3.5) | pending | **pending** | needs CR1/CR2; not in this engine |
| B13 | Low eye grade raises two-strike chase by 5 pt over eye 3 | enforced | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| T1 | Contact grade 5 vs 1 moves two-strike chase by 5 pt | tracked | **FAIL** | 16.7% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T2 | Crowding raises fastball inside share by 5 pt | tracked | **FAIL** | 25.0% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T3 | Power grade 5 vs 3 moves calls off the middle | tracked | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |

**Enforced failures: 7** B3, B5, B6, B7, B8a, B8b, B8c

### B1: No pitch type above 85%

2 of 1890 eligible situations miss. Worst five:

- `college_d3/plus_changeup/on3_1out/same/mid/grade_d1/3-2` — top pitch 86.5% (miss 1.5 pt)
- `college_d3/plus_changeup/empty_1out/same/mid/last_whiff/3-2` — top pitch 86.2% (miss 1.2 pt)

### B3: No exact call above 60%, except 3-0 fastball

942 of 12061 eligible situations miss. Worst five:

- `college_d3/plus_changeup/on1_0out/same/mid/base/1-1/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/base/1-1/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/base/2-1/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/base/1-1/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/base/2-1/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)

### B5: Overall usage, chance-weighted over counts

96 of 142 eligible situations miss. Worst five:

- `hs/plus_changeup/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 98.9% outside 25%-50% (miss 48.9 pt)
- `hs/plus_changeup/loaded_1out/same/mid/Changeup` — Changeup (grade 5) 98.8% outside 25%-50% (miss 48.8 pt)
- `college_d3/plus_changeup/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 89.8% outside 25%-50% (miss 39.8 pt)
- `hs/plus_changeup/loaded_1out/opp/mid/FB` — fastball 1.1% outside 40%-70% (miss 38.9 pt)
- `hs/plus_changeup/loaded_1out/same/mid/FB` — fastball 1.2% outside 40%-70% (miss 38.8 pt)

### B6: Middle share by count group (command 3+)

2449 of 2904 eligible situations miss. Worst five:

- `college_d3/slider_best/on1_0out/same/mid/grade_d5/0-1` — middle 95.4% > 10% (miss 85.4 pt)
- `college_d3/slider_best/on1_0out/opp/mid/grade_d5/0-1` — middle 77.7% > 10% (miss 67.7 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/grade_d5/0-1` — middle 76.7% > 10% (miss 66.7 pt)
- `college_d3/slider_best/empty_1out/opp/mid/grade_c1/3-2` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/slider_best/empty_1out/opp/mid/crowding/3-2` — middle 100.0% > 35% (miss 65.0 pt)

### B7: Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations

116 of 120 eligible situations miss. Worst five:

- `college_d3/plus_changeup/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/on1_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/slider_best/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/slider_best/empty_0out/opp/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)

### B8a: Down share with a runner on 1st within 2 pt of bases empty

18 of 96 eligible situations miss. Worst five:

- `college_d3/two_pitch/on1_0out/opp/mid/1-1` — down 0.0% vs empty 20.2% (miss 18.2 pt)
- `hs/two_pitch/on1_0out/same/mid/0-0` — down 0.0% vs empty 17.4% (miss 15.4 pt)
- `hs/slider_best/on1_0out/same/mid/1-1` — down 0.0% vs empty 15.8% (miss 13.8 pt)
- `hs/plus_changeup/on1_0out/same/mid/0-0` — down 0.0% vs empty 15.1% (miss 13.1 pt)
- `hs/two_pitch/on1_0out/opp/mid/1-1` — down 0.0% vs empty 15.0% (miss 13.0 pt)

### B8b: Off-speed share with a runner on 3rd at least 60% of bases empty

11 of 24 eligible situations miss. Worst five:

- `hs/two_pitch/loaded_1out/same/mid` — off-speed 10.6% vs empty 30.5% (ratio 0.35) (miss 15.1 pt)
- `hs/two_pitch/loaded_1out/opp/mid` — off-speed 10.8% vs empty 30.5% (ratio 0.35) (miss 14.8 pt)
- `hs/two_pitch/on3_1out/same/mid` — off-speed 11.9% vs empty 30.5% (ratio 0.39) (miss 12.6 pt)
- `hs/two_pitch/on3_1out/opp/mid` — off-speed 12.1% vs empty 30.5% (ratio 0.40) (miss 12.2 pt)
- `college_d3/two_pitch/loaded_1out/same/mid` — off-speed 13.8% vs empty 26.4% (ratio 0.52) (miss 4.5 pt)

### B8c: A pitch that isn't landing gets 0% with a runner on 3rd

8 of 96 eligible situations miss. Worst five:

- `college_d3/plus_changeup/on3_1out/same/mid/landing_0of4/0-2/Changeup` — Changeup isn't landing but gets 100.0% (miss 100.0 pt)
- `college_d3/plus_changeup/on3_1out/same/mid/landing_2of12/0-2/Changeup` — Changeup isn't landing but gets 100.0% (miss 100.0 pt)
- `college_d3/plus_changeup/on3_1out/opp/mid/landing_0of4/0-2/Changeup` — Changeup isn't landing but gets 100.0% (miss 100.0 pt)
- `college_d3/plus_changeup/on3_1out/opp/mid/landing_2of12/0-2/Changeup` — Changeup isn't landing but gets 100.0% (miss 100.0 pt)
- `college_d3/plus_changeup/on3_1out/opp/mid/landing_0of4/1-2/Changeup` — Changeup isn't landing but gets 73.9% (miss 73.9 pt)

## Share of calls (chance-weighted, base variants)

| Pitch kind | Share |
|---|---|
| FB | 49.0% |
| CH | 30.2% |
| SL | 14.7% |
| CB | 6.2% |

| Target | Share |
|---|---|
| middle | 63.0% |
| down-away | 20.5% |
| up-away | 13.1% |
| chase | 1.7% |
| up-in | 0.9% |
| down-in | 0.7% |
