# Changed calls from the learning weight W = 4 -> 32 (ruling 28), 500 golden-v11 inputs

Same inputs, same engine otherwise; only `LEARN_PRIOR_W` differs. 250 of 500 cases carry a call (250 are probability-only cases); 182 of those carry a `usage_by_call` (calls already made in this count today), and only those can change. Pick = `call.pick` (the engine's pick at a 0.5 draw); top = the highest-share call.

- Cases whose call mix changed at all: 120 (all carry usage: True); pick changed: 24; top-share call changed: 10.
- HS / travel: 112 cases, 75 with usage, top-share call changed in 4.
- Outputs other than the call mix (probs, table, take, grade, ump) that changed: 0.

| case | level | count | W=4 top | W=32 top | largest share move |
|---|---|---|---|---|---|
| 26 | mlb | 0-2 | Fastball|down-away 20% | Slider|chase 19% | 5.2% |
| 60 | mlb | 2-1 | Fastball|up-away 45% | Fastball|down-in 42% | 10.2% |
| 126 | college_d1 | 0-0 | Fastball|down-in 44% | Slider|down-away 46% | 8.0% |
| 262 | mlb | 2-2 | Fastball|up-in 55% | Slider|down-away 53% | 9.8% |
| 282 | mlb | 2-2 | Fastball|up-in 57% | Curveball|down-away 51% | 12.5% |
| 418 | mlb | 0-1 | Curveball|down-away 38% | Fastball|down-away 39% | 7.3% |
| 50 | travel | 3-2 | Changeup|middle 47% | Fastball|down-in 40% | 7.2% |
| 158 | hs | 2-2 | Slider|middle 40% | Fastball|middle 40% | 2.4% |
| 226 | travel | 0-2 | Slider|down-away 32% | Fastball|down-away 30% | 2.7% |
| 370 | hs | 3-2 | Fastball|up-in 41% | Slider|down-away 50% | 11.3% |
