# Call sheet: ci_tune_6_1_0_04 (ci tier)

188 table solves, 0.6 min. Count weights: engine at-bat chain.

| band | enforced | rule | eligible | passes | rate | max miss | result |
|---|---|---|---|---|---|---|---|
| B1 | yes | 98% / 3 pts | 510 | 391 | 76.7% | 14.1 pts | FAIL |
| B2 | yes | 98% / 3 pts | 510 | 468 | 91.8% | 4.1 pts | FAIL |
| B3 | yes | 98% / 3 pts | 576 | 382 | 66.3% | 40.0 pts | FAIL |
| B5 | yes | 98% / 3 pts | 48 | 17 | 35.4% | 14.4 pts | FAIL |
| B6 | yes | 98% / 3 pts | 528 | 142 | 26.9% | 65.0 pts | FAIL |
| B7 | yes | 98% / 3 pts | 48 | 16 | 33.3% | 12.0 pts | FAIL |
| B8a | yes | 98% / 3 pts | 96 | 78 | 81.2% | 42.8 pts | FAIL |
| B8b | yes | 98% / 3 pts | 72 | 72 | 100.0% | 0.0 pts | PASS |
| B8c | yes | 100% | 96 | 96 | 100.0% | 0.0 pts | PASS |
| B9 | yes | 100% | 264 | 253 | 95.8% | 0.4 pts | FAIL |
| B10 | yes | 100% | 288 | 288 | 100.0% | 0.0 pts | PASS |
| B11 | yes | 100% | 1104 | 1104 | 100.0% | 0.0 pts | PASS |
| B12 | yes | 100% | 192 | 192 | 100.0% | 0.0 pts | PASS |
| B13 | yes | 98% / 3 pts | 24 | 21 | 87.5% | 5.0 pts | FAIL |
| T1 | tracked | 98% / 3 pts | 24 | 5 | 20.8% | 5.0 pts | FAIL |
| T2 | tracked | 98% / 3 pts | 96 | 18 | 18.8% | 5.0 pts | FAIL |
| T3 | tracked | 98% / 3 pts | 96 | 81 | 84.4% | 4.3 pts | FAIL |
| T4 | tracked | 98% / 3 pts | 2 | 0 | 0.0% | 4.6 pts | FAIL |

## B1: No pitch type above 85%

Eligible 510, passes 391 (76.7%). Exempt (3-0, or one allowed pitch type): 66

Worst five:

- college_d3 two_pitch loaded1 same i4 3-1: misses by 14.1 pts
- hs two_pitch loaded1 same i4 3-1: misses by 14.0 pts
- college_d3 two_pitch on1_0 same i4 3-1: misses by 13.8 pts
- hs two_pitch on1_0 same i4 3-1: misses by 13.8 pts
- college_d3 two_pitch on3_1 same i4 3-1: misses by 13.8 pts

Share by pitch type: CB 4.2%, CH 12.4%, FB 67.2%, SL 16.2%

Share by target: chase 2.6%, down-away 18.8%, down-in 1.9%, middle 61.8%, up-away 11.2%, up-in 3.8%

## B2: Every allowed secondary (every allowed pitch but the top one) at least 5% (changeup to a same-side hitter 2%)

Eligible 510, passes 468 (91.8%). Exempt (3-0, or one allowed pitch type): 66

Worst five:

- college_d3 two_pitch loaded1 same i4 3-1: misses by 4.1 pts
- hs two_pitch loaded1 same i4 3-1: misses by 4.0 pts
- college_d3 two_pitch on1_0 same i4 3-1: misses by 3.8 pts
- hs two_pitch on1_0 same i4 3-1: misses by 3.8 pts
- college_d3 two_pitch on3_1 same i4 3-1: misses by 3.8 pts

Share by pitch type: CB 4.2%, CH 12.4%, FB 67.2%, SL 16.2%

Share by target: chase 2.6%, down-away 18.8%, down-in 1.9%, middle 61.8%, up-away 11.2%, up-in 3.8%

## B3: No single exact call above 60%, except 3-0 fastball

Eligible 576, passes 382 (66.3%)

Worst five:

- hs plus_changeup on1_0 same i4 3-2: misses by 40.0 pts
- hs plus_changeup on1_0 opp i4 3-2: misses by 40.0 pts
- college_d3 two_pitch loaded1 same i4 3-1: misses by 39.1 pts
- hs two_pitch loaded1 same i4 3-1: misses by 39.0 pts
- college_d3 two_pitch on1_0 same i4 3-1: misses by 38.8 pts

Share by pitch type: CB 3.7%, CH 14.2%, FB 67.6%, SL 14.5%

Share by target: chase 2.5%, down-away 17.7%, down-in 1.9%, middle 64.2%, up-away 10.3%, up-in 3.4%

## B5: Overall usage, chance-weighted over counts (FB, grade-3 and grade-5 secondaries in range)

Eligible 48, passes 17 (35.4%)

Worst five:

- college_d3 plus_changeup empty1 same i4 Changeup 11% not in 25%-50%: misses by 14.4 pts
- hs plus_changeup empty1 same i4 Changeup 11% not in 25%-50%: misses by 14.0 pts
- hs two_pitch on3_1 same i4 Fastball 92% not in 50%-78%; Curveball 8% not in 10%-35%: misses by 13.9 pts
- hs two_pitch empty1 same i4 Fastball 92% not in 50%-78%; Curveball 8% not in 10%-35%: misses by 13.8 pts
- hs two_pitch on1_0 same i4 Fastball 91% not in 50%-78%; Curveball 9% not in 10%-35%: misses by 13.4 pts


## B6: Middle share by count group (command 3+ arsenals; low_command +15 points)

Eligible 528, passes 142 (26.9%)

Worst five:

- college_d3 slider_best empty1 same i4 3-2: misses by 65.0 pts
- college_d3 slider_best empty1 opp i4 3-2: misses by 65.0 pts
- college_d3 slider_best on1_0 same i4 1-1: misses by 65.0 pts
- college_d3 slider_best on1_0 same i4 3-2: misses by 65.0 pts
- college_d3 slider_best on1_0 opp i4 3-2: misses by 65.0 pts

Share by pitch type: CB 4.0%, CH 15.4%, FB 64.9%, SL 15.7%

Share by target: chase 2.7%, down-away 19.4%, down-in 2.0%, middle 61.0%, up-away 11.2%, up-in 3.7%

## B7: Inside: >= 12% of fastball calls (chance-weighted) and >= 3% inside in at least half the non-three-ball counts

Eligible 48, passes 16 (33.3%)

Worst five:

- college_d3 slider_best loaded1 same i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 slider_best loaded1 opp i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 plus_changeup on1_0 same i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 plus_changeup on1_0 opp i4 FB inside 0.0%, median-count inside 0.0%: misses by 12.0 pts
- college_d3 plus_changeup on3_1 opp i4 FB inside 0.0%, median-count inside 4.2%: misses by 12.0 pts


## B8a: Runner on 1st, < 2 outs, < 2 strikes: down share no more than 2 points below bases empty, same outs

Eligible 96, passes 78 (81.2%)

Worst five:

- hs slider_best on1_0 same i4 1-1 down 0.0% vs empty 44.8%: misses by 42.8 pts
- hs two_pitch on1_0 same i4 1-1 down 0.0% vs empty 30.4%: misses by 28.4 pts
- college_d3 two_pitch on1_0 opp i4 1-1 down 4.6% vs empty 31.8%: misses by 25.2 pts
- hs two_pitch on1_0 opp i4 1-1 down 0.0% vs empty 24.8%: misses by 22.8 pts
- hs slider_best on1_0 opp i4 1-1 down 0.0% vs empty 22.8%: misses by 20.8 pts


## B8b: Runner on 3rd: off-speed share at least 60% of bases empty (per level, arsenal, count)

Eligible 72, passes 72 (100.0%)


## B8c: A pitch that isn't landing gets 0% with a runner on 3rd

Eligible 96, passes 96 (100.0%)


## B9: Repeats (3.1): no third straight exact call; not back after a foul straight back; a plain foul doesn't raise the repeat; a whiff keeps 90% of the pitch type

Eligible 264, passes 253 (95.8%)

Worst five:

- college_d3 slider_best empty1 opp i4 0-1 plain foul Changeup|down-away 27.8% vs 27.4%: misses by 0.4 pts
- college_d3 slider_best on1_0 same i4 0-1 plain foul Slider|down-away 29.9% vs 29.7%: misses by 0.2 pts
- college_d3 slider_best on1_0 opp i4 3-1 plain foul Fastball|middle 82.2% vs 81.9%: misses by 0.2 pts
- college_d3 plus_changeup on1_0 opp i4 3-1 plain foul Fastball|middle 76.9% vs 76.7%: misses by 0.2 pts
- college_d3 slider_best on1_0 same i4 3-1 plain foul Fastball|middle 84.7% vs 84.5%: misses by 0.2 pts


## B10: Fallback (3.2): nothing trusted -> the landing pitch with the highest confidence, 100%

Eligible 288, passes 288 (100.0%)


## B11: Hard rules: no chase at 3-0, 3-1 or 2-2; a shaken-off call is never called again

Eligible 1104, passes 1104 (100.0%)


## B12: Coach rules: CR1 (hit hard twice: that pitch at that spot 0%), CR2 (power 4+: no middle)

Eligible 192, passes 192 (100.0%)


## B13: Eye grade 1 (chaser) raises two-strike chase share by >= 5 points over eye 3

Eligible 24, passes 21 (87.5%)

Worst five:

- college_d3 slider_best empty1 opp i4 3-2 chase eye1 0.0% vs eye3 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-2 chase eye1 2.6% vs eye3 0.0%: misses by 2.5 pts
- college_d3 slider_best on1_0 opp i4 3-2 chase eye1 3.8% vs eye3 0.0%: misses by 1.2 pts


## T1: Contact grade 5 vs 1 moves two-strike chase share by >= 5 points

Eligible 24, passes 5 (20.8%)

Worst five:

- college_d3 slider_best empty1 same i4 1-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 1-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best on1_0 same i4 3-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 opp i4 1-2 chase c5 0.0% vs c1 0.0%: misses by 5.0 pts


## T2: Crowding raises the inside share of fastballs by >= 5 points

Eligible 96, passes 18 (18.8%)

Worst five:

- college_d3 slider_best empty1 same i4 3-0 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 3-1 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 0-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 1-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts
- college_d3 slider_best empty1 same i4 2-2 FB inside crowd 0.0% vs 0.0%: misses by 5.0 pts


## T3: Power grade 5 vs 3 moves calls beyond CR2's middle rule (TV distance on non-middle calls >= 5 points)

Eligible 96, passes 81 (84.4%)

Worst five:

- college_d3 plus_changeup empty1 same i4 0-2 TV 0.7%: misses by 4.3 pts
- college_d3 plus_changeup empty1 opp i4 0-2 TV 1.1%: misses by 3.9 pts
- college_d3 slider_best empty1 opp i4 0-2 TV 1.2%: misses by 3.8 pts
- college_d3 slider_best on1_0 opp i4 0-2 TV 1.3%: misses by 3.7 pts
- college_d3 plus_changeup on1_0 opp i4 0-2 TV 1.4%: misses by 3.6 pts


## T4: Engine whiff per swing on heart / edge fastballs within 3 points of Statcast (13.6-15.8% / 21-24%)

Eligible 2, passes 0 (0.0%)

Worst five:

- edge: engine 13.4% vs Statcast 21.0%-24.0%: misses by 4.6 pts
- heart: engine 6.4% vs Statcast 13.6%-15.8%: misses by 4.2 pts

