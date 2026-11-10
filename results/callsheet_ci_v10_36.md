# Call sheet: ci_v10_36

Tier `ci`, 264 plate appearances x 12 counts, 27s.
Count weights: real MLB frequency from Statcast (Phase 3.8 will replace this with the engine's own chain).

## Bands

| Band | What | Mode | Result | Detail |
|---|---|---|---|---|
| B1 | No pitch type above 85% | enforced | **FAIL** | 92.8% of 2766 hold (need 98%), worst miss 15.0 pt (need <= 3.0) |
| B2 | Every allowed secondary at least 5% (same-side changeup 2%) | enforced | **FAIL** | 94.6% of 5055 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| B3 | No exact call above 60%, except 3-0 fastball | enforced | **FAIL** | 95.6% of 15338 hold (need 98%), worst miss 40.0 pt (need <= 3.0) |
| B5 | Overall usage, chance-weighted over counts | enforced | **FAIL** | 50.0% of 160 hold (need 98%), worst miss 33.1 pt (need <= 3.0) |
| B6 | Middle share by count group (command 3+) | enforced | **FAIL** | 19.0% of 2904 hold (need 98%), worst miss 84.8 pt (need <= 3.0) |
| B7 | Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations | enforced | **FAIL** | 3.3% of 120 hold (need 98%), worst miss 50.0 pt (need <= 3.0) |
| B8a | Down share with a runner on 1st within 2 pt of bases empty | enforced | **FAIL** | 82.3% of 96 hold (need 98%), worst miss 15.4 pt (need <= 3.0) |
| B8b | Off-speed share with a runner on 3rd at least 60% of bases empty | enforced | **FAIL** | 87.5% of 24 hold (need 98%), worst miss 3.5 pt (need <= 3.0) |
| B8c | A pitch that isn't landing gets 0% with a runner on 3rd | enforced | **pass** | 0/96 situations miss (must be 0) |
| B9 | RP2: after a foul straight back that exact call gets 0% | enforced | **pass** | 0/144 situations miss (must be 0) |
| B10 | Fallback picks a pitch that is landing, not the most confident | enforced | **pass** | 0/144 situations miss (must be 0) |
| B11 | Hard rules: no chase at 3-0/3-1 | enforced | **pass** | 0/528 situations miss (must be 0) |
| B12 | CR1 bans the mashed spot; CR2 keeps a power hitter off the middle | enforced | **pass** | 0/576 situations miss (must be 0) |
| B13 | Low eye grade raises two-strike chase by 5 pt over eye 3 | enforced | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| T1 | Contact grade 5 vs 1 moves two-strike chase by 5 pt | tracked | **FAIL** | 16.7% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T2 | Crowding raises fastball inside share by 5 pt | tracked | **FAIL** | 25.0% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T3 | Power grade 5 vs 3 moves calls off the middle | tracked | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |

**Enforced failures: 8** B1, B2, B3, B5, B6, B7, B8a, B8b

### B1: No pitch type above 85%

199 of 2766 eligible situations miss. Worst five:

- `hs/plus_changeup/empty_0out/opp/mid/base/2-2` — top pitch 100.0% (miss 15.0 pt)
- `college_d3/plus_changeup/on1_0out/same/mid/base/3-2` — top pitch 100.0% (miss 15.0 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/base/3-2` — top pitch 100.0% (miss 15.0 pt)
- `college_d3/plus_changeup/on3_1out/opp/mid/base/3-2` — top pitch 100.0% (miss 15.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/base/3-2` — top pitch 100.0% (miss 15.0 pt)

### B2: Every allowed secondary at least 5% (same-side changeup 2%)

275 of 5055 eligible situations miss. Worst five:

- `college_d3/plus_changeup/empty_0out/same/mid/base/3-2/Slider` — Slider 0.0% < 5% (miss 5.0 pt)
- `college_d3/plus_changeup/empty_0out/opp/mid/base/3-2/Slider` — Slider 0.0% < 5% (miss 5.0 pt)
- `college_d3/plus_changeup/empty_1out/same/mid/base/3-2/Slider` — Slider 0.0% < 5% (miss 5.0 pt)
- `college_d3/plus_changeup/empty_1out/opp/mid/base/3-2/Slider` — Slider 0.0% < 5% (miss 5.0 pt)
- `college_d3/plus_changeup/on1_0out/same/mid/base/3-1/Slider` — Slider 0.0% < 5% (miss 5.0 pt)

### B3: No exact call above 60%, except 3-0 fastball

681 of 15338 eligible situations miss. Worst five:

- `college_d3/two_pitch/loaded_1out/same/mid/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/2-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/3-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/opp/mid/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/opp/mid/base/2-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)

### B5: Overall usage, chance-weighted over counts

80 of 160 eligible situations miss. Worst five:

- `hs/plus_changeup/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 83.1% outside 25%-50% (miss 33.1 pt)
- `hs/plus_changeup/loaded_1out/same/mid/Changeup` — Changeup (grade 5) 79.1% outside 25%-50% (miss 29.1 pt)
- `hs/plus_changeup/loaded_1out/opp/mid/FB` — fastball 15.8% outside 40%-70% (miss 24.2 pt)
- `hs/plus_changeup/on1_0out/opp/mid/Changeup` — Changeup (grade 5) 72.8% outside 25%-50% (miss 22.8 pt)
- `college_d3/plus_changeup/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 72.4% outside 25%-50% (miss 22.4 pt)

### B6: Middle share by count group (command 3+)

2351 of 2904 eligible situations miss. Worst five:

- `college_d3/slider_best/on1_0out/same/mid/grade_d5/0-1` — middle 94.8% > 10% (miss 84.8 pt)
- `college_d3/slider_best/on1_0out/opp/mid/grade_d5/0-1` — middle 82.5% > 10% (miss 72.5 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/grade_d5/0-1` — middle 79.8% > 10% (miss 69.8 pt)
- `college_d3/slider_best/on1_0out/same/mid/base/1-1` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/0-0` — middle 100.0% > 35% (miss 65.0 pt)

### B7: Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations

116 of 120 eligible situations miss. Worst five:

- `college_d3/plus_changeup/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/on1_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/slider_best/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/slider_best/empty_0out/opp/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)

### B8a: Down share with a runner on 1st within 2 pt of bases empty

17 of 96 eligible situations miss. Worst five:

- `hs/two_pitch/on1_0out/same/mid/0-0` — down 0.0% vs empty 17.4% (miss 15.4 pt)
- `hs/slider_best/on1_0out/same/mid/1-1` — down 0.0% vs empty 15.8% (miss 13.8 pt)
- `hs/two_pitch/on1_0out/opp/mid/1-1` — down 0.0% vs empty 15.0% (miss 13.0 pt)
- `hs/slider_best/on1_0out/opp/mid/1-1` — down 0.0% vs empty 14.4% (miss 12.4 pt)
- `hs/slider_best/on1_0out/same/mid/0-0` — down 8.1% vs empty 22.3% (miss 12.2 pt)

### B8b: Off-speed share with a runner on 3rd at least 60% of bases empty

3 of 24 eligible situations miss. Worst five:

- `hs/two_pitch/loaded_1out/same/mid` — off-speed 17.6% vs empty 32.4% (ratio 0.54) (miss 3.5 pt)
- `hs/two_pitch/loaded_1out/opp/mid` — off-speed 17.7% vs empty 32.4% (ratio 0.55) (miss 3.2 pt)
- `college_d3/two_pitch/loaded_1out/same/mid` — off-speed 19.6% vs empty 32.9% (ratio 0.60) (miss 0.1 pt)

## Share of calls (chance-weighted, base variants)

| Pitch kind | Share |
|---|---|
| FB | 44.8% |
| CH | 27.6% |
| SL | 17.5% |
| CB | 10.1% |

| Target | Share |
|---|---|
| middle | 64.3% |
| down-away | 21.2% |
| up-away | 11.8% |
| chase | 1.4% |
| up-in | 0.8% |
| down-in | 0.6% |
