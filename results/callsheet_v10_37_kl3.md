# Call sheet: v10_37_kl3

Tier `ci`, 264 plate appearances x 12 counts, 34s.
Count weights: real MLB frequency from Statcast (Phase 3.8 will replace this with the engine's own chain).

## Bands

| Band | What | Mode | Result | Detail |
|---|---|---|---|---|
| B1 | No pitch type above 85% | enforced | **FAIL** | 86.6% of 2728 hold (need 98%), worst miss 14.5 pt (need <= 3.0) |
| B2 | Every allowed secondary at least 5% (same-side changeup 2%) | enforced | **FAIL** | 92.5% of 4932 hold (need 98%), worst miss 4.5 pt (need <= 3.0) |
| B3 | No exact call above 60%, except 3-0 fastball | enforced | **FAIL** | 95.0% of 15272 hold (need 98%), worst miss 40.0 pt (need <= 3.0) |
| B5 | Overall usage, chance-weighted over counts | enforced | **FAIL** | 51.9% of 160 hold (need 98%), worst miss 17.0 pt (need <= 3.0) |
| B6 | Middle share by count group (command 3+) | enforced | **FAIL** | 43.5% of 2904 hold (need 98%), worst miss 65.0 pt (need <= 3.0) |
| B7 | Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations | enforced | **FAIL** | 9.2% of 120 hold (need 98%), worst miss 50.0 pt (need <= 3.0) |
| B8a | Down share with a runner on 1st within 2 pt of bases empty | enforced | **FAIL** | 82.3% of 96 hold (need 98%), worst miss 56.4 pt (need <= 3.0) |
| B8b | Off-speed share with a runner on 3rd at least 60% of bases empty | enforced | **pass** | 100.0% of 24 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| B8c | A pitch that isn't landing gets 0% with a runner on 3rd | enforced | **pass** | 0/96 situations miss (must be 0) |
| B9 | RP2: after a foul straight back that exact call gets 0% | enforced | **pass** | 0/144 situations miss (must be 0) |
| B10 | Fallback picks a pitch that is landing, not the most confident | enforced | **pass** | 0/144 situations miss (must be 0) |
| B11 | Hard rules: no chase at 3-0/3-1 | enforced | **pass** | 0/528 situations miss (must be 0) |
| B12 | CR1 bans the mashed spot; CR2 keeps a power hitter off the middle | enforced | **pass** | 0/576 situations miss (must be 0) |
| B13 | Low eye grade raises two-strike chase by 5 pt over eye 3 | enforced | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |
| T1 | Contact grade 5 vs 1 moves two-strike chase by 5 pt | tracked | **FAIL** | 33.3% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T2 | Crowding raises fastball inside share by 5 pt | tracked | **FAIL** | 25.0% of 12 hold (need 98%), worst miss 5.0 pt (need <= 3.0) |
| T3 | Power grade 5 vs 3 moves calls off the middle | tracked | **pass** | 100.0% of 12 hold (need 98%), worst miss 0.0 pt (need <= 3.0) |

**Enforced failures: 7** B1, B2, B3, B5, B6, B7, B8a

### B1: No pitch type above 85%

366 of 2728 eligible situations miss. Worst five:

- `hs/two_pitch/on3_1out/same/mid/base/2-0` — top pitch 99.5% (miss 14.5 pt)
- `hs/two_pitch/empty_1out/same/mid/base/2-0` — top pitch 99.5% (miss 14.5 pt)
- `hs/two_pitch/loaded_1out/same/mid/base/3-1` — top pitch 99.4% (miss 14.4 pt)
- `college_d3/two_pitch/on3_1out/same/mid/base/2-0` — top pitch 99.3% (miss 14.3 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/1-0` — top pitch 99.3% (miss 14.3 pt)

### B2: Every allowed secondary at least 5% (same-side changeup 2%)

369 of 4932 eligible situations miss. Worst five:

- `hs/two_pitch/on3_1out/same/mid/base/2-0/Curveball` — Curveball 0.5% < 5% (miss 4.5 pt)
- `hs/two_pitch/empty_1out/same/mid/base/2-0/Curveball` — Curveball 0.5% < 5% (miss 4.5 pt)
- `hs/two_pitch/loaded_1out/same/mid/base/3-1/Curveball` — Curveball 0.6% < 5% (miss 4.4 pt)
- `college_d3/two_pitch/on3_1out/same/mid/base/2-0/Curveball` — Curveball 0.7% < 5% (miss 4.3 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/1-0/Curveball` — Curveball 0.7% < 5% (miss 4.3 pt)

### B3: No exact call above 60%, except 3-0 fastball

756 of 15272 eligible situations miss. Worst five:

- `college_d3/two_pitch/loaded_1out/same/mid/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/same/mid/base/3-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/opp/mid/base/2-0/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `college_d3/two_pitch/loaded_1out/opp/mid/base/3-1/Fastball|middle` — Fastball|middle 100.0% (miss 40.0 pt)
- `hs/plus_changeup/empty_0out/same/mid/base/3-2/Changeup|middle` — Changeup|middle 100.0% (miss 40.0 pt)

### B5: Overall usage, chance-weighted over counts

77 of 160 eligible situations miss. Worst five:

- `hs/two_pitch/empty_0out/same/mid/FB` — fastball 95.0% outside 50%-78% (miss 17.0 pt)
- `hs/two_pitch/on1_0out/same/mid/FB` — fastball 94.8% outside 50%-78% (miss 16.8 pt)
- `hs/two_pitch/empty_0out/opp/mid/FB` — fastball 94.2% outside 50%-78% (miss 16.2 pt)
- `hs/two_pitch/on3_1out/same/mid/FB` — fastball 93.9% outside 50%-78% (miss 15.9 pt)
- `hs/plus_changeup/loaded_1out/opp/mid/Changeup` — Changeup (grade 5) 65.6% outside 25%-50% (miss 15.6 pt)

### B6: Middle share by count group (command 3+)

1640 of 2904 eligible situations miss. Worst five:

- `college_d3/slider_best/empty_1out/opp/mid/grade_d5/2-2` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/plus_changeup/empty_0out/same/mid/base/3-2` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/plus_changeup/empty_0out/opp/mid/base/1-1` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/plus_changeup/empty_0out/opp/mid/base/3-2` — middle 100.0% > 35% (miss 65.0 pt)
- `college_d3/plus_changeup/empty_1out/same/mid/base/3-2` — middle 100.0% > 35% (miss 65.0 pt)

### B7: Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations

109 of 120 eligible situations miss. Worst five:

- `college_d3/plus_changeup/empty_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/empty_0out/opp/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/on1_0out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/on1_0out/opp/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)
- `college_d3/plus_changeup/loaded_1out/same/mid/half` — inside >= 3% in 0% of non-3-ball counts (miss 50.0 pt)

### B8a: Down share with a runner on 1st within 2 pt of bases empty

17 of 96 eligible situations miss. Worst five:

- `hs/slider_best/on1_0out/same/mid/1-1` — down 0.0% vs empty 58.4% (miss 56.4 pt)
- `hs/two_pitch/on1_0out/same/mid/1-1` — down 0.0% vs empty 42.8% (miss 40.8 pt)
- `hs/slider_best/on1_0out/opp/mid/1-0` — down 0.0% vs empty 41.0% (miss 39.0 pt)
- `hs/slider_best/on1_0out/opp/mid/1-1` — down 0.0% vs empty 36.9% (miss 34.9 pt)
- `hs/two_pitch/on1_0out/opp/mid/1-1` — down 0.0% vs empty 31.9% (miss 29.9 pt)

## Share of calls (chance-weighted, base variants)

| Pitch kind | Share |
|---|---|
| FB | 62.2% |
| CH | 17.3% |
| SL | 17.3% |
| CB | 3.2% |

| Target | Share |
|---|---|
| middle | 48.8% |
| down-away | 31.4% |
| up-away | 15.9% |
| up-in | 1.8% |
| chase | 1.7% |
| down-in | 0.5% |
