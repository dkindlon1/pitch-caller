# Call sheet: v09

Tier `full`, 1260 plate appearances x 12 counts, 102s.
Count weights: real MLB frequency from Statcast (Phase 3.8 will replace this with the engine's own chain).

## Bands

| Band | What | Mode | Result | Detail |
|---|---|---|---|---|
| B1 | No pitch type above 85% | enforced | **FAIL** | 99.6% of 8787 hold (need 98%), worst miss 11.7 pt (need <= 3.0) |
| B2 | Every allowed secondary at least 5% (same-side changeup 2%) | enforced | **FAIL** | 99.9% of 14542 hold (need 98%), worst miss 3.6 pt (need <= 3.0) |
| B3 | No exact call above 60%, except 3-0 fastball | enforced | **FAIL** | 93.8% of 68686 hold (need 98%), worst miss 40.0 pt (need <= 3.0) |
| B5 | Overall usage, chance-weighted over counts | enforced | **FAIL** | 52.0% of 3016 hold (need 98%), worst miss 50.0 pt (need <= 3.0) |
| B6 | Middle share by count group (command 3+) | enforced | **FAIL** | 18.2% of 13860 hold (need 98%), worst miss 85.4 pt (need <= 3.0) |
| B7 | Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations | enforced | **FAIL** | 30.4% of 1584 hold (need 98%), worst miss 50.0 pt (need <= 3.0) |
| B8a | Down share with a runner on 1st within 2 pt of bases empty | enforced | **FAIL** | 72.0% of 1536 hold (need 98%), worst miss 35.0 pt (need <= 3.0) |
| B8b | Off-speed share with a runner on 3rd at least 60% of bases empty | enforced | **FAIL** | 60.4% of 480 hold (need 98%), worst miss 21.3 pt (need <= 3.0) |
| B8c | A pitch that isn't landing gets 0% with a runner on 3rd | enforced | **FAIL** | 8/96 situations miss (must be 0) |
| B9 | Repeat rules (Phase 3.1) | pending | **pending** | needs Situation.history and the RP1/RP2 rules; not in this engine |
| B10 | Fallback when nothing is trusted (Phase 3.2) | pending | **pending** | needs the candidates() fallback change; not in this engine |
| B11 | Hard rules: no chase at 3-0/3-1 | enforced | **pass** | 0/2520 situations miss (must be 0) |
| B12 | Coach rules CR1 and CR2 (Phase 3.5) | pending | **pending** | needs CR1/CR2; not in this engine |
| B13 | Low eye grade raises two-strike chase by 5 pt over eye 3 | enforced | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| T1 | Contact grade 5 vs 1 moves two-strike chase by 5 pt | tracked | **FAIL** | 16.7% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T2 | Crowding raises fastball inside share by 5 pt | tracked | **FAIL** | 25.0% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T3 | Power grade 5 vs 3 moves calls off the middle | tracked | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |

**Enforced failures: 9** B1, B2, B3, B5, B6, B7, B8a, B8b, B8c

### B1: No pitch type above 85%

39 of 8787 eligible situations miss. Worst five:

- `college_d3/changeup_first/on3_1out/same/late_close/base/2-2` — top pitch 96.7% (miss 11.7 pt)
- `college_d1/changeup_first/on13_1out/opp/late_close/base/3-2` — top pitch 95.6% (miss 10.6 pt)
- `college_d3/plus_changeup/on23_2out/same/late_close/base/2-2` — top pitch 94.7% (miss 9.7 pt)
- `college_d3/plus_changeup/on3_1out/same/late_close/base/2-2` — top pitch 92.9% (miss 7.9 pt)
- `college_d3/plus_changeup/on2_1out/opp/late_close/base/1-2` — top pitch 92.4% (miss 7.4 pt)

### B2: Every allowed secondary at least 5% (same-side changeup 2%)

14 of 14542 eligible situations miss. Worst five:

- `college_d1/plus_changeup/on23_2out/opp/late_close/base/3-2/Slider` — Slider 1.4% < 5% (miss 3.6 pt)
- `college_d1/plus_changeup/on13_1out/opp/late_close/base/3-2/Slider` — Slider 2.4% < 5% (miss 2.6 pt)
- `college_d3/slider_best/loaded_1out/opp/late_close/base/3-2/Changeup` — Changeup 2.6% < 5% (miss 2.4 pt)
- `college_d3/avg_changeup/on3_0out/opp/late_close/base/3-2/Changeup` — Changeup 2.6% < 5% (miss 2.4 pt)
- `college_d3/plus_changeup/on3_1out/same/late_close/base/2-2/Slider` — Slider 3.0% < 5% (miss 2.0 pt)

### B3: No exact call above 60%, except 3-0 fastball

4228 of 68686 eligible situations miss. Worst five:

- `hs/avg_changeup/empty_0out/same/mid/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `hs/avg_changeup/empty_0out/same/mid/base/2-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `hs/avg_changeup/empty_0out/same/mid/base/3-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `hs/avg_changeup/empty_0out/same/late_close/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `hs/avg_changeup/empty_0out/same/late_close/base/3-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)

### B5: Overall usage, chance-weighted over counts

1448 of 3016 eligible situations miss. Worst five:

- `college_d3/changeup_first/loaded_1out/opp/late_close/Changeup` — Changeup (grade 5) 100.0% outside 25%-50% (miss 50.0 pt)
- `hs/changeup_first/loaded_1out/same/mid/Changeup` — Changeup (grade 5) 100.0% outside 25%-50% (miss 50.0 pt)
- `hs/changeup_first/loaded_1out/same/late_close/Changeup` — Changeup (grade 5) 100.0% outside 25%-50% (miss 50.0 pt)
- `hs/changeup_first/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 100.0% outside 25%-50% (miss 50.0 pt)
- `hs/changeup_first/loaded_1out/opp/late_close/Changeup` — Changeup (grade 5) 100.0% outside 25%-50% (miss 50.0 pt)

### B6: Middle share by count group (command 3+)

11334 of 13860 eligible situations miss. Worst five:

- `college_d3/slider_best/on1_0out/same/mid/grade_d5/0-1` — middle 95.4% > 10% (miss 85.4 pt)
- `hs/four_pitch/on1_0out/opp/late_close/base/0-1` — middle 78.6% > 10% (miss 68.6 pt)
- `college_d3/slider_best/on1_0out/opp/mid/grade_d5/0-1` — middle 77.7% > 10% (miss 67.7 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/grade_d5/0-1` — middle 76.7% > 10% (miss 66.7 pt)
- `hs/sinker_gb/loaded_1out/opp/mid/base/3-2` — middle 100.0% > 35% (miss 65.0 pt)

### B7: Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations

1102 of 1584 eligible situations miss. Worst five:

- `hs/changeup_first/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `hs/changeup_first/empty_0out/same/late_close/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `hs/changeup_first/on1_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `hs/changeup_first/on1_0out/same/late_close/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `hs/changeup_first/on1_0out/opp/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)

### B8a: Down share with a runner on 1st within 2 pt of bases empty

430 of 1536 eligible situations miss. Worst five:

- `college_d3/two_pitch/on1_0out/opp/late_close/1-1` — down 0.0% vs empty 37.0% (miss 35.0 pt)
- `college_d1/plus_changeup/on1_0out/opp/late_close/0-0` — down 0.0% vs empty 31.9% (miss 29.9 pt)
- `college_d3/plus_changeup/on1_1out/same/mid/0-1` — down 20.6% vs empty 51.6% (miss 29.0 pt)
- `hs/changeup_first/on1_1out/same/late_close/1-1` — down 0.0% vs empty 27.2% (miss 25.2 pt)
- `college_d1/plus_changeup/on1_1out/opp/mid/1-0` — down 0.0% vs empty 27.2% (miss 25.2 pt)

### B8b: Off-speed share with a runner on 3rd at least 60% of bases empty

190 of 480 eligible situations miss. Worst five:

- `hs/two_pitch/on23_2out/same/mid` — off-speed 9.5% vs empty 38.8% (ratio 0.25) (miss 21.3 pt)
- `hs/two_pitch/on23_2out/same/late_close` — off-speed 9.6% vs empty 38.8% (ratio 0.25) (miss 21.1 pt)
- `hs/two_pitch/on23_2out/opp/mid` — off-speed 9.8% vs empty 38.7% (ratio 0.25) (miss 20.8 pt)
- `hs/two_pitch/on23_2out/opp/late_close` — off-speed 10.0% vs empty 38.7% (ratio 0.26) (miss 20.5 pt)
- `hs/four_pitch/on23_2out/same/mid` — off-speed 19.6% vs empty 69.5% (ratio 0.28) (miss 19.1 pt)

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
| FB | 50.4% |
| CH | 27.7% |
| SL | 17.3% |
| CB | 4.6% |

| Target | Share |
|---|---|
| middle | 54.8% |
| down-away | 24.5% |
| up-away | 12.3% |
| up-in | 3.5% |
| down-in | 2.7% |
| chase | 2.2% |
