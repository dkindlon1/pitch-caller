# Changed calls, W = 4 -> 32 (ruling 32), from the proposed re-pin golden

Old `golden/golden_v13core.json`, new `C:/dev/pitchiq-data-final/p8/golden_v13coreW32.json` (500 golden-v11 inputs, same engine except `LEARN_PRIOR_W`). 250 cases carry a call; 182 carry `usage_by_call`. Call mix changed in 121; outputs outside the call and its derived fields (why, shaken, intent), i.e. probabilities, table, take, grade, ump, changed in 0 cases.

- Pick changed: **24**; top-share call changed: **10**; every changed case carries usage (learning-driven): **True**.

## College and MLB: 18

| case | level | count | learning | pick (0.5 draw) | top-share call | largest share move |
|---|---|---|---|---|---|---|
| 10 | mlb | 1-1 | yes | Fastball down-in -> Fastball down-away | same | 10.6% |
| 26 | mlb | 0-2 | yes | Slider down-away -> Curveball chase | Fastball down-away 20% -> Slider chase 19% | 5.2% |
| 28 | college_d3 | 1-2 | yes | Fastball down-away -> Fastball chase | same | 6.9% |
| 60 | mlb | 2-1 | yes | Fastball down-in -> Fastball up-away | Fastball up-away 45% -> Fastball down-in 42% | 10.2% |
| 84 | mlb | 3-2 | yes | Fastball down-in -> Fastball up-in | same | 24.0% |
| 96 | college_d1 | 2-2 | yes | Slider middle -> Curveball down-middle | same | 8.3% |
| 126 | college_d1 | 0-0 | yes | Slider down-away -> Fastball down-in | Fastball down-in 44% -> Slider down-away 46% | 8.0% |
| 140 | mlb | 1-2 | yes | Fastball up-in -> Slider down-middle | same | 6.0% |
| 150 | college_d3 | 1-2 | yes | Changeup chase -> Fastball down-away | same | 11.8% |
| 218 | mlb | 0-2 | yes | Fastball middle -> Fastball down-middle | same | 4.5% |
| 230 | mlb | 3-2 | yes | Fastball middle -> Slider down-middle | same | 7.0% |
| 262 | mlb | 2-2 | yes | Fastball up-in -> Slider down-away | Fastball up-in 55% -> Slider down-away 53% | 9.8% |
| 282 | mlb | 2-2 | yes | Fastball up-in -> Curveball down-away | Fastball up-in 57% -> Curveball down-away 51% | 12.5% |
| 306 | mlb | 3-2 | yes | Slider middle -> Fastball down-in | same | 8.9% |
| 400 | college_d3 | 1-2 | yes | Slider chase -> Fastball up-in | same | 6.1% |
| 418 | mlb | 0-1 | yes | Fastball down-away -> Curveball down-away | Curveball down-away 38% -> Fastball down-away 39% | 7.3% |
| 474 | college_d1 | 3-2 | yes | Slider down-away -> Fastball down-away | same | 11.8% |
| 492 | mlb | 1-1 | yes | Slider down-middle -> Fastball up-in | same | 8.1% |

## HS and travel (separate): 7

| case | level | count | learning | pick (0.5 draw) | top-share call | largest share move |
|---|---|---|---|---|---|---|
| 18 | travel | 1-2 | yes | Fastball chase -> Curveball up-away | same | 3.1% |
| 50 | travel | 3-2 | yes | Fastball down-in -> Changeup middle | Changeup middle 47% -> Fastball down-in 40% | 7.2% |
| 158 | hs | 2-2 | yes | Fastball middle -> Slider middle | Slider middle 40% -> Fastball middle 40% | 2.4% |
| 226 | travel | 0-2 | yes | Fastball down-away -> Slider down-away | Slider down-away 32% -> Fastball down-away 30% | 2.7% |
| 246 | travel | 0-0 | yes | Fastball chase -> Curveball middle | same | 6.0% |
| 370 | hs | 3-2 | yes | same | Fastball up-in 41% -> Slider down-away 50% | 11.3% |
| 464 | travel | 2-2 | yes | Fastball up-away -> Changeup down-away | same | 8.2% |
