# v1.0 scenario draft for review

## Changes to v0.9 rows

| row | change | reason |
|---|---|---|
| A7 | acceptable ['FB:any', 'CH:any'] -> ['FB:corners', 'FB:chase', 'CH:corners', 'CH:chase']; arguable ['SL:any'] -> ['SL:any', 'ANY:middle'] | FB:any / CH:any -> corners + chase; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |
| B9 | acceptable ['SL:zone'] -> ['SL:corners']; arguable ['FB:zone', 'SL:chase'] -> ['FB:zone', 'SL:chase', 'ANY:middle'] | SL:zone -> SL:corners; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |
| D3 | acceptable ['FB:corners', 'CH:zone'] -> ['FB:corners', 'CH:corners']; arguable ['SL:down', 'SL:chase'] -> ['SL:down', 'SL:chase', 'ANY:middle'] | CH:zone -> CH:corners; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |
| E4 | acceptable ['SL:zone', 'SL:chase'] -> ['SL:corners', 'SL:chase']; arguable ['FB:zone'] -> ['FB:zone', 'ANY:middle'] | SL:zone -> SL:corners; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |
| F5 | last -> ["Changeup", "down-away", "foul", "back"] | the row says 'hit hard foul'; the input only said 'foul' (PLAN_v1.0.md R7) |
| F8 | acceptable ['FB:zone'] -> ['FB:corners']; arguable ['SL:any'] -> ['SL:any', 'ANY:middle'] | FB:zone -> FB:corners; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |
| H3 | acceptable ['FB:away', 'OS:any'] -> ['FB:away', 'OS:corners', 'OS:chase']; arguable ['FB:up-in', 'FB:down-in', 'ANY:middle'] -> ['FB:up-in', 'FB:down-in', 'ANY:middle'] | OS:any -> OS:corners + OS:chase; Drew's Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable |

## New rows (39). v0.9 result shown: acceptable / not-acceptable share

| id | hard | situation | why | acceptable | arguable | not acceptable | v0.9 acc / not |
|---|---|---|---|---|---|---|---|
| P1 |  | 0-0, plus changeup, opposite-side hitter | Get ahead; the plus changeup is a strike pitch to opposite-side hitters | FB:corners, CH:down | ANY:middle, SL:corners, CH:up | ANY:chase | 16% / 0% |
| P2 |  | 2-0, plus changeup, opposite-side hitter | A trusted plus changeup is a fine pitch in a hitter's count | FB:zone, CH:down | CH:up, CH:middle, SL:zone, ANY:chase |  | 42% / 0% |
| P3 |  | 1-2, plus changeup, opposite-side hitter | Put him away with the plus changeup | CH:down, CH:chase, FB:chase, FB:up | SL:any, ANY:middle, FB:down |  | 46% / 0% |
| P4 |  | 1-2, plus changeup, same-side hitter | Same side: the slider away, the high fastball, and the changeup still play | SL:chase, SL:down-away, CH:chase, CH:down, FB:chase, FB:up | ANY:middle, FB:down, SL:down-in |  | 57% / 0% |
| P5 | yes | 3-1, plus changeup, opposite-side hitter | No chase at 3-1; the plus changeup can get it over | FB:zone, CH:zone | SL:zone | ANY:chase | 100% / 0% |
| P6 |  | 0-2, plus changeup landing 8 of 10, runner on 3rd, 1 out | A changeup that's landing is still the put-away pitch with a runner on 3rd | CH:chase, CH:down, FB:up, FB:chase | SL:any, ANY:middle, FB:down |  | 84% / 0% |
| S1 |  | 0-0, sinker, runner on 1st, 0 outs | Sinker down for a double-play ball | ANY:down | ANY:up, ANY:middle | ANY:chase | 38% / 0% |
| S2 |  | 1-1, sinker, runner on 1st, 1 out | Get the ground ball | ANY:down | ANY:up, ANY:middle, ANY:chase |  | 35% / 0% |
| S3 |  | 2-1, sinker, runner on 1st, 0 outs | Behind in the count, the sinker down still gets a ground ball | FB:down, FB:middle, OS:down | FB:up, OS:up, OS:middle, ANY:chase |  | 100% / 0% |
| S4 |  | 0-2, sinker, runner on 1st, 1 out | Two strikes: expand, or down for a ground ball | ANY:chase, ANY:down, FB:up | ANY:middle, OS:up |  | 87% / 0% |
| L1 |  | 0-0, 8th, up 1, bases empty, 1 out | Late and close: get ahead with a good strike | ANY:corners | ANY:middle | ANY:chase | 61% / 0% |
| L2 |  | 1-1, 9th, up 1, runner on 2nd, 2 outs | The pivotal pitch with the tying run on 2nd | ANY:corners | SL:chase, ANY:middle |  | 70% / 0% |
| L3 |  | 3-2, 8th, tied, runner on 1st, 2 outs | Full count late: a strike with a pitch that's landing | FB:zone, SL:zone | CH:zone | ANY:chase | 81% / 0% |
| L4 |  | 0-2, 9th, up 1, runners on 1st and 2nd, 2 outs | Expand or finish to end it | ANY:chase, ANY:corners | ANY:middle |  | 98% / 0% |
| L5 |  | 2-0, top 8th, we're away, down 1, bases empty, 0 outs | Don't walk the leadoff man late | FB:zone, SL:zone | CH:zone | ANY:chase | 100% / 0% |
| L6 |  | 1-2, bottom 9th, tied, runner on 3rd, 1 out | Strikeout pitch with the winning run on 3rd | FB:up, FB:chase, SL:chase, SL:down-away, CH:down | ANY:middle, CH:chase, FB:down |  | 75% / 0% |
| R1 |  | 0-0, runner on 2nd, 1 out | Get ahead with a good strike | ANY:corners | ANY:middle | ANY:chase | 62% / 0% |
| R2 |  | 1-1, runner on 2nd, 0 outs | Pivotal pitch with a runner in scoring position | ANY:corners | SL:chase, ANY:middle |  | 33% / 0% |
| R3 |  | 2-1, runner on 3rd, 1 out, infield in | Behind with the infield in: a ground ball holds him | ANY:down, FB:corners | ANY:middle, OS:up, ANY:chase |  | 0% / 0% |
| R4 |  | 0-2, runners on 2nd and 3rd, 1 out | Expand or finish | ANY:chase, ANY:corners | ANY:middle |  | 100% / 0% |
| R5 | yes | 3-1, runner on 2nd, 2 outs | No chase at 3-1 | FB:zone, SL:zone | CH:zone | ANY:chase | 100% / 0% |
| R6 |  | 1-2, runner on 2nd, 2 outs | Expand or finish | ANY:chase, ANY:corners | ANY:middle |  | 89% / 0% |
| K1 |  | 0-0, two-pitch (FB, SL) | Get ahead; a slider up hangs | FB:corners, SL:down | ANY:middle, SL:up | ANY:chase | 52% / 0% |
| K2 |  | 2-1, two-pitch (FB, SL) | Behind: a strike with either pitch, the slider down | FB:zone, SL:down | SL:up, SL:middle, ANY:chase |  | 100% / 0% |
| K3 |  | 1-2, two-pitch (FB, SL) | Put-away: slider off the zone or the high fastball | SL:chase, SL:down, FB:chase, FB:up | ANY:middle, FB:down, SL:up |  | 44% / 0% |
| K4 |  | 0-0, four-pitch, opposite-side hitter | Get ahead with a good strike | ANY:corners | ANY:middle | ANY:chase | 21% / 0% |
| K5 |  | 2-0, four-pitch | A hitter's count: fastball strike, or a trusted off-speed down | FB:zone, OS:down | OS:up, OS:middle, ANY:chase |  | 100% / 0% |
| K6 |  | 1-2, four-pitch, same-side hitter | Put-away: off-speed off the zone or down, or the high fastball | OS:chase, OS:down, FB:up, FB:chase | ANY:middle, FB:down, OS:up |  | 51% / 0% |
| Q1 |  | 0-2, FB up-away called strike, then FB up-away fouled straight back | He was right on it: don't go back there yet | SL:chase, SL:corners, CH:chase, CH:corners, FB:up-in, FB:down, FB:chase | ANY:middle | FB:up-away | 69% / 12% |
| Q2 |  | 0-1, FB up-in pulled foul | He's early on the inside fastball | FB:away, SL:corners, SL:chase, CH:corners, CH:chase | FB:up-in, FB:down-in, ANY:middle |  | 54% / 0% |
| Q3 |  | 1-1, SL down-away ball, then FB up-away fouled the other way | An away pitch fouled the other way is normal contact | ANY:corners | ANY:middle, ANY:chase |  | 8% / 0% |
| Q4 |  | 1-2, FB up-away called strike, SL down-away ball, CH down-away foul (no read) | A plain foul: nothing learned | ANY:chase, ANY:corners | ANY:middle |  | 64% / 0% |
| N1 |  | 0-2, FB up-away called strike, SL down-away swinging strike | After two away pitches the inside fastball is a fine third | FB:in, FB:up-away, FB:chase, OS:chase, OS:down | ANY:middle, FB:down-away |  | 60% / 0% |
| N2 |  | 1-1, hitter crowds the plate, opposite-side hitter | Pitch inside to a hitter who crowds | FB:in | FB:away, OS:any, ANY:middle |  | 0% / 0% |
| N3 |  | 0-0, hitter crowds the plate, power grade 4 | Crowds the plate and has power: in, and off the middle | FB:in, OS:down | FB:away, OS:up | ANY:middle, ANY:chase | 13% / 63% |
| T1 |  | 1-1, nothing trusted (FB 0.40, SL 0.42, CH 0.35), no landing record | Nothing trusted: his most trusted pitch | SL:corners, SL:chase | SL:middle, FB:any, CH:any |  | 47% / 0% |
| T2 |  | 2-1, nothing trusted (FB 0.40, SL 0.42, CH 0.35); slider landing 2 of 12, fastball 7 of 12 | Nothing trusted and the slider isn't landing: go with what's landing | FB:zone | CH:any, FB:chase | SL:any | 0% / 100% |
| W1 | yes | 0-2, runner on 3rd, 1 out, slider landing 0 of 4 | Runner on 3rd: no dirt ball with a pitch that isn't landing | FB:up, FB:chase, FB:corners, CH:chase, CH:down | ANY:middle, CH:up | SL:any | 70% / 25% |
| W2 | yes | 1-2, high school, two-pitch (FB, CB), runner on 3rd, 0 outs, curveball landing 2 of 12 | Runner on 3rd: no dirt ball with a pitch that isn't landing | FB:corners, FB:chase | FB:middle | CB:any | 52% / 30% |

## Tracked rows (hitter model; graded, not gated)

| row | reason |
|---|---|
| F6 | the late-on-fastball read acts only through the hitter timing terms (P08 / timing_B) |
| F7 | the out-front-on-soft-stuff read acts only through the hitter timing terms |
| H2 | contact grade's effect on two-strike calls is hitter math (band T1) |
| H4 | crowding's effect on inside value is hitter math (band T2) |
| N2 | crowding (band T2) |
| N3 | crowding (band T2); the middle part is CR2 and stays enforced in B12 |
