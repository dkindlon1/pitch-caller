# Call sheet: ci_v09 (ci tier)

188 table solves, 1.0 min. Count weights: MLB pitch frequency by count (until 3.8).

| band | enforced | rule | eligible | passes | rate | max miss | result |
|---|---|---|---|---|---|---|---|
| B1 | yes | 98% / 3 pts | 300 | 298 | 99.3% | 3.1 pts | FAIL |
| B2 | yes | 98% / 3 pts | 300 | 300 | 100.0% | 0.0 pts | PASS |
| B3 | yes | 98% / 3 pts | 576 | 360 | 62.5% | 40.0 pts | FAIL |
| B5 | yes | 98% / 3 pts | 48 | 11 | 22.9% | 50.0 pts | FAIL |
| B6 | yes | 98% / 3 pts | 528 | 53 | 10.0% | 65.0 pts | FAIL |
| B7 | yes | 98% / 3 pts | 48 | 0 | 0.0% | 12.0 pts | FAIL |
| B8a | yes | 98% / 3 pts | 96 | 76 | 79.2% | 25.3 pts | FAIL |
| B8b | yes | 98% / 3 pts | 72 | 53 | 73.6% | 24.0 pts | FAIL |
| B8c | yes | 100% | 96 | 80 | 83.3% | 100.0 pts | FAIL |
| B9 | yes | 100% | 264 | 126 | 47.7% | 100.0 pts | FAIL |
| B10 | yes | 100% | 288 | 96 | 33.3% | 100.0 pts | FAIL |
| B11 | yes | 100% | 1104 | 1104 | 100.0% | 0.0 pts | PASS |
| B12 | yes | 100% | 192 | 32 | 16.7% | 100.0 pts | FAIL |
| B13 | yes | 98% / 3 pts | 24 | 24 | 100.0% | 0.0 pts | PASS |
| T1 | tracked | 98% / 3 pts | 24 | 3 | 12.5% | 5.0 pts | FAIL |
| T2 | tracked | 98% / 3 pts | 96 | 10 | 10.4% | 5.0 pts | FAIL |
| T3 | tracked | 98% / 3 pts | 96 | 34 | 35.4% | 5.0 pts | FAIL |
| T4 | tracked | 98% / 3 pts | 2 | 0 | 0.0% | 4.6 pts | FAIL |

## B1: No pitch type above 85%

Eligible 300, passes 298 (99.3%)

Worst five:

- college_d3 plus_changeup empty1 same i4 3-2: misses by 3.0 pts
- college_d3 plus_changeup on3_1 same i4 3-2: misses by 2.2 pts

Share by pitch type: CB 9.4%, CH 20.9%, FB 47.5%, SL 22.1%

Share by target: chase 1.1%, down-away 23.0%, down-in 0.5%, middle 61.1%, up-away 13.2%, up-in 1.0%

## B2: Every allowed secondary (every allowed pitch but the top one) at least 5% (changeup to a same-side hitter 2%)

Eligible 300, passes 300 (100.0%)

Share by pitch type: CB 9.4%, CH 20.9%, FB 47.5%, SL 22.1%

Share by target: chase 1.1%, down-away 23.0%, down-in 0.5%, middle 61.1%, up-away 13.2%, up-in 1.0%

## B3: No single exact call above 60%, except 3-0 fastball

Eligible 576, passes 360 (62.5%)

Worst five:

- college_d3 slider_best empty1 same i4 3-1: misses by 40.0 pts
- college_d3 slider_best empty1 opp i4 3-1: misses by 40.0 pts
- college_d3 slider_best on1_0 same i4 2-0: misses by 40.0 pts
- college_d3 slider_best on1_0 same i4 2-1: misses by 40.0 pts
- college_d3 slider_best on1_0 same i4 3-1: misses by 40.0 pts

Share by pitch type: CB 5.1%, CH 29.8%, FB 52.4%, SL 12.6%

Share by target: chase 2.0%, down-away 17.3%, down-in 0.8%, middle 68.1%, up-away 11.0%, up-in 0.8%

## B5: Overall usage, chance-weighted over counts (FB, grade-3 and grade-5 secondaries in range)

Eligible 48, passes 11 (22.9%)

Worst five:

- hs plus_changeup loaded1 opp i4 Changeup 100% not in 25%-50%: misses by 50.0 pts
- college_d3 plus_changeup loaded1 opp i4 Fastball 1% not in 40%-70%; Changeup 99% not in 25%-50%: misses by 48.9 pts
- hs plus_changeup loaded1 same i4 Fastball 1% not in 40%-70%; Changeup 99% not in 25%-50%: misses by 48.9 pts
- hs plus_changeup on3_1 opp i4 Fastball 14% not in 40%-70%; Changeup 86% not in 25%-50%: misses by 36.4 pts
- hs plus_changeup on1_0 opp i4 Fastball 14% not in 40%-70%; Changeup 86% not in 25%-50%: misses by 36.3 pts


## B6: Middle share by count group (command 3+ arsenals; low_command +15 points)

Eligible 528, passes 53 (10.0%)

Worst five:

- college_d3 slider_best loaded1 opp i4 3-2: misses by 65.0 pts
- college_d3 slider_best empty1 same i4 3-2: misses by 65.0 pts
- college_d3 slider_best on1_0 same i4 1-1: misses by 65.0 pts
- college_d3 slider_best on1_0 same i4 3-2: misses by 65.0 pts
- college_d3 slider_best on1_0 opp i4 3-2: misses by 65.0 pts

Share by pitch type: CB 5.3%, CH 29.9%, FB 51.2%, SL 13.5%

Share by target: chase 2.1%, down-away 18.9%, down-in 0.9%, middle 65.2%, up-away 12.0%, up-in 0.9%

## B7: Inside: >= 12% of fastball calls (chance-weighted) and >= 3% inside in at least half the non-three-ball counts

Eligible 48, passes 0 (0.0%)

Worst five:

- college_d3 slider_best on1_0 same i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 slider_best on1_0 opp i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 slider_best loaded1 same i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 slider_best loaded1 opp i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 plus_changeup empty1 same i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts


## B8a: Runner on 1st, < 2 outs, < 2 strikes: down share no more than 2 points below bases empty, same outs

Eligible 96, passes 76 (79.2%)

Worst five:

- hs two_pitch on1_0 opp i4 1-1 down 0.0% vs empty 27.3%: misses by 25.3 pts
- college_d3 two_pitch on1_0 same i4 0-1 down 31.5% vs empty 55.4%: misses by 21.9 pts
- hs slider_best on1_0 same i4 1-1 down 0.0% vs empty 22.9%: misses by 20.9 pts
- college_d3 two_pitch on1_0 opp i4 1-1 down 11.0% vs empty 30.4%: misses by 17.3 pts
- hs two_pitch on1_0 same i4 1-1 down 0.0% vs empty 19.1%: misses by 17.1 pts


## B8b: Runner on 3rd: off-speed share at least 60% of bases empty (per level, arsenal, count)

Eligible 72, passes 53 (73.6%)

Worst five:

- hs two_pitch 0-0: off-speed 0.0% on 3rd vs 39.9% empty: misses by 24.0 pts
- hs two_pitch 0-1: off-speed 0.0% on 3rd vs 39.2% empty: misses by 23.5 pts
- college_d3 two_pitch 0-1: off-speed 0.0% on 3rd vs 39.2% empty: misses by 23.5 pts
- college_d3 two_pitch 0-0: off-speed 0.0% on 3rd vs 39.1% empty: misses by 23.4 pts
- hs two_pitch 1-1: off-speed 0.0% on 3rd vs 38.1% empty: misses by 22.8 pts


## B8c: A pitch that isn't landing gets 0% with a runner on 3rd

Eligible 96, passes 80 (83.3%)

Worst five:

- college_d3 plus_changeup on3_1 opp i4 [land_0of4] 0-2 Changeup 100.0%: misses by 100.0 pts
- college_d3 plus_changeup on3_1 opp i4 [land_2of12] 0-2 Changeup 100.0%: misses by 100.0 pts
- college_d3 plus_changeup on3_1 same i4 [land_0of4] 0-2 Changeup 71.9%: misses by 71.9 pts
- college_d3 plus_changeup on3_1 same i4 [land_2of12] 0-2 Changeup 71.9%: misses by 71.9 pts
- college_d3 plus_changeup on3_1 opp i4 [land_0of4] 1-2 Changeup 71.9%: misses by 71.9 pts


## B9: Repeats (3.1): no third straight exact call; not back after a foul straight back; a plain foul doesn't raise the repeat; a whiff keeps 90% of the pitch type

Eligible 264, passes 126 (47.7%)

Worst five:

- college_d3 slider_best empty1 same i4 3-1 rp1 Fastball|middle 100.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 3-1 rp2 Fastball|middle 100.0%: misses by 100.0 pts
- college_d3 slider_best on1_0 same i4 2-0 rp1 Fastball|middle 100.0%: misses by 100.0 pts
- college_d3 slider_best on1_0 same i4 3-0 rp1 Fastball|middle 100.0%: misses by 100.0 pts
- college_d3 slider_best on1_0 same i4 2-1 rp1 Fastball|middle 100.0%: misses by 100.0 pts


## B10: Fallback (3.2): nothing trusted -> the landing pitch with the highest confidence, 100%

Eligible 288, passes 96 (33.3%)

Worst five:

- college_d3 slider_best empty1 same i4 [trust_toplanding_bad] 0-0 Fastball 0.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [trust_toplanding_bad] 1-0 Fastball 0.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [trust_toplanding_bad] 2-0 Fastball 0.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [trust_toplanding_bad] 3-0 Fastball 0.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [trust_toplanding_bad] 0-1 Fastball 0.0%: misses by 100.0 pts


## B11: Hard rules: no chase at 3-0, 3-1 or 2-2; a shaken-off call is never called again

Eligible 1104, passes 1104 (100.0%)


## B12: Coach rules: CR1 (hit hard twice: that pitch at that spot 0%), CR2 (power 4+: no middle)

Eligible 192, passes 32 (16.7%)

Worst five:

- college_d3 slider_best empty1 same i4 [grade_w5] 3-0 CR2 middle 100.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [grade_w5] 3-1 CR2 middle 100.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [grade_w5] 3-2 CR2 middle 100.0%: misses by 100.0 pts
- college_d3 slider_best empty1 same i4 [cr1_hard2] 3-1 CR1 FB middle 100.0%: misses by 100.0 pts
- college_d3 slider_best on1_0 same i4 [grade_w5] 1-0 CR2 middle 100.0%: misses by 100.0 pts


## B13: Eye grade 1 (chaser) raises two-strike chase share by >= 5 points over eye 3

Eligible 24, passes 24 (100.0%)


## T1: Contact grade 5 vs 1 moves two-strike chase share by >= 5 points

Eligible 24, passes 3 (12.5%)

Worst five:

- college_d3 slider_best empty1 same i4 1-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 0-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 1-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 3-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts


## T2: Crowding raises the inside share of fastballs by >= 5 points

Eligible 96, passes 10 (10.4%)

Worst five:

- college_d3 slider_best empty1 same i4 3-0 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-1 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 0-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 1-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 2-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts


## T3: Power grade 5 vs 3 moves calls beyond CR2's middle rule (TV distance on non-middle calls >= 5 points)

Eligible 96, passes 34 (35.4%)

Worst five:

- college_d3 slider_best empty1 same i4 2-0 TV 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-0 TV 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-1 TV 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-2 TV 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 1-0 TV 0.0%: misses by 5.0 pts


## T4: Engine whiff per swing on heart / edge fastballs within 3 points of Statcast (13.6-15.8% / 21-24%)

Eligible 2, passes 0 (0.0%)

Worst five:

- edge: engine 13.4% vs Statcast 21.0%-24.0%: misses by 4.6 pts
- heart: engine 6.4% vs Statcast 13.6%-15.8%: misses by 4.2 pts

