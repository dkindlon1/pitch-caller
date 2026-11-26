# Changed calls from the floor fix (ruling 33), bb63e33 -> the fix

Goldens: old `C:/dev/pitchiq-data-final/p8/golden_v13coreW32.json`, new `C:/dev/pitchiq-data-final/p9/golden_v13coreFloor.json` (500 golden-v11 inputs). 250 cases carry a call.

- Call mix changed by 0.05 points or more (or pick / top changed): **19** (HS / travel 19, other levels 0).
- Pick (0.5 draw) changed: **11**; top-share call changed: **1**.
- Cases off HS / travel with ANY output changed: **0** 
- Menus that moved by less than 0.05 points (ripple through the PA table; not listed): 27.
- HS / travel cases with an output outside the call (and why / shaken / intent) changed: **48**; which outputs (values changed, largest change): table 11122 (0.1015), walk 45 (0.0047). The floor also applies to the PA table's per-count policies (ruling 8), so the table and the walk estimate move; probs / take / grade / ump do not.
- Every move is **floor-driven**: the only code change is `apply_fb_floor` / `floorArr`. The fastball-class share before -> after is shown per case (the floor total is unchanged; only where it goes moved).

## HS and travel (floor-driven)

| case | level | count | usage | pick | top-share call | largest move | FB share | old menu (top 5) | new menu (top 5) |
|---|---|---|---|---|---|---|---|---|---|
| 42 **pick** **top** | hs | 0-1 | no | Fastball chase -> Fastball up-away | Fastball up-away 15% -> Slider down-away 12% | 6.5% | 38.5% -> 38.5% | Fastball up-away 15.2%, Slider down-away 12.4%, Fastball down-away 12.0%, Fastball chase 11.3%, Slider chase 10.8% | Slider down-away 12.3%, Slider chase 10.6%, Slider up-away 9.3%, Slider down-middle 9.2%, Fastball up-away 8.7% |
| 98 | travel | 2-1 | no | Fastball down-away | Slider middle 41.7% -> 41.7% | 8.8% | 58.3% -> 58.3% | Slider middle 41.7%, Fastball down-away 29.2%, Fastball down-middle 29.1% | Slider middle 41.7%, Fastball down-away 24.8%, Fastball down-middle 24.7%, Fastball middle 8.8% |
| 100 **pick** | travel | 2-0 | yes | Fastball up-in -> Curveball middle | Fastball up-in 66.7% -> 35.4% | 31.3% | 66.7% -> 66.7% | Fastball up-in 66.7%, Curveball middle 23.6%, Curveball down-middle 8.5%, Changeup middle 1.2% | Fastball up-in 35.4%, Curveball middle 23.6%, Curveball down-middle 8.6%, Fastball middle 7.7%, Fastball up-away 7.2% |
| 116 **pick** | hs | 1-0 | no | Fastball down-in -> Curveball middle | Fastball down-in 63.6% -> 42.7% | 20.9% | 63.6% -> 63.6% | Fastball down-in 63.6%, Curveball middle 21.8%, Curveball down-middle 11.0%, Changeup down-away 3.5% | Fastball down-in 42.7%, Curveball middle 21.8%, Curveball down-middle 11.0%, Fastball middle 7.2%, Fastball down-away 6.9% |
| 120 | travel | 1-1 | yes | Slider middle | Fastball down-away 17.2% -> 16.5% | 0.7% | 61.8% -> 61.8% | Fastball down-away 17.2%, Fastball middle 16.2%, Fastball down-middle 16.0%, Slider middle 12.3%, Slider down-away 11.9% | Fastball down-away 16.5%, Fastball middle 15.5%, Fastball down-middle 15.4%, Slider middle 12.3%, Slider down-away 11.9% |
| 210 | travel | 1-1 | yes | Changeup down-away | Slider middle 37.3% -> 37.3% | 0.3% | 13.6% -> 13.6% | Slider middle 37.3%, Changeup down-away 28.8%, Changeup middle 20.3%, Fastball down-away 4.4%, Fastball down-middle 2.8% | Slider middle 37.3%, Changeup down-away 28.8%, Changeup middle 20.3%, Fastball down-away 4.1%, Fastball down-middle 2.8% |
| 246 **pick** | travel | 0-0 | yes | Curveball middle -> Curveball down-middle | Fastball up-in 42.3% -> 36.3% | 7.4% | 53.6% -> 53.6% | Fastball up-in 42.3%, Curveball middle 11.4%, Fastball chase 11.3%, Curveball down-middle 8.7%, Curveball down-away 7.3% | Fastball up-in 36.3%, Curveball middle 11.6%, Curveball down-middle 8.7%, Curveball down-away 7.2%, Curveball down-in 6.8% |
| 254 | hs | 3-0 | yes | Fastball middle | Fastball middle 79.5% -> 78.3% | 1.2% | 83.7% -> 83.7% | Fastball middle 79.5%, Slider down-middle 5.8%, Curveball down-in 4.3%, Fastball down-middle 4.2%, Slider down-in 3.5% | Fastball middle 78.3%, Slider down-middle 5.7%, Fastball down-middle 5.4%, Curveball down-in 4.4%, Slider down-in 3.5% |
| 266 | travel | 0-1 | yes | Fastball down-away | Slider down-away 35.1% -> 35.2% | 0.3% | 64.9% -> 64.8% | Slider down-away 35.1%, Fastball down-away 21.7%, Fastball middle 16.3%, Fastball down-middle 15.5%, Fastball up-away 11.3% | Slider down-away 35.2%, Fastball down-away 21.8%, Fastball middle 16.4%, Fastball down-middle 15.6%, Fastball up-away 11.0% |
| 316 **pick** | travel | 1-0 | yes | Fastball middle -> Curveball middle | Fastball middle 63.6% -> 47.3% | 16.3% | 63.6% -> 63.6% | Fastball middle 63.6%, Curveball middle 36.4% | Fastball middle 47.3%, Curveball middle 36.4%, Fastball down-middle 16.3% |
| 358 **pick** | travel | 1-0 | no | Fastball down-away -> Curveball middle | Fastball down-away 63.6% -> 27.7% | 36.0% | 63.6% -> 63.6% | Fastball down-away 63.6%, Curveball middle 23.9%, Curveball down-middle 12.4% | Fastball down-away 27.7%, Curveball middle 24.0%, Fastball middle 20.4%, Fastball down-middle 15.5%, Curveball down-middle 12.4% |
| 360 **pick** | travel | 1-1 | yes | Slider middle -> Slider up-away | Fastball down-away 24.2% -> 12.4% | 11.8% | 45.5% -> 45.5% | Fastball down-away 24.2%, Fastball up-away 21.2%, Slider middle 11.8%, Slider down-away 11.4%, Slider up-away 8.5% | Fastball down-away 12.4%, Slider middle 11.8%, Slider down-away 11.4%, Fastball up-away 10.9%, Slider up-away 8.5% |
| 374 | hs | 1-2 | yes | Changeup down-away | Changeup down-away 72.4% -> 72.4% | 1.2% | 3.3% -> 3.3% | Changeup down-away 72.4%, Curveball middle 24.2%, Fastball up-in 3.3% | Changeup down-away 72.4%, Curveball middle 24.2%, Fastball up-in 2.1%, Fastball down-in 1.2% |
| 420 | travel | 0-0 | yes | Fastball middle | Fastball down-away 26.8% -> 26.8% | 0.3% | 90.1% -> 90.2% | Fastball down-away 26.8%, Fastball middle 25.7%, Fastball down-middle 24.2%, Fastball up-away 13.5%, Curveball middle 8.2% | Fastball down-away 26.8%, Fastball middle 25.7%, Fastball down-middle 24.2%, Fastball up-away 13.5%, Curveball middle 7.9% |
| 434 **pick** | hs | 0-0 | yes | Slider down-away -> Fastball middle | Slider down-middle 27.9% -> 27.9% | 0.1% | 53.6% -> 53.6% | Slider down-middle 27.9%, Fastball middle 22.0%, Slider down-away 17.1%, Fastball down-middle 13.0%, Fastball down-away 10.0% | Slider down-middle 27.9%, Fastball middle 22.1%, Slider down-away 17.1%, Fastball down-middle 13.0%, Fastball down-away 10.0% |
| 464 | travel | 2-2 | yes | Changeup down-away | Slider middle 36.3% -> 36.3% | 7.1% | 40.0% -> 40.0% | Slider middle 36.3%, Changeup down-away 23.7%, Fastball up-away 20.8%, Fastball down-away 19.2% | Slider middle 36.3%, Changeup down-away 23.7%, Fastball up-away 17.1%, Fastball down-away 15.8%, Fastball down-middle 7.1% |
| 472 **pick** | travel | 1-1 | no | Curveball up-away -> Curveball middle | Fastball down-away 45.5% -> 41.7% | 3.7% | 45.5% -> 45.5% | Fastball down-away 45.5%, Curveball up-away 27.5%, Curveball middle 27.0% | Fastball down-away 41.7%, Curveball middle 27.4%, Curveball up-away 27.2%, Fastball up-away 3.7% |
| 476 **pick** | travel | 3-1 | no | Fastball up-in -> Fastball down-away | Fastball up-away 33.6% -> 21.9% | 14.4% | 66.7% -> 66.7% | Fastball up-away 33.6%, Fastball up-in 33.1%, Curveball middle 8.7%, Curveball down-middle 5.6%, Curveball down-in 5.6% | Fastball up-away 21.9%, Fastball up-in 21.6%, Fastball down-away 14.4%, Fastball down-in 8.8%, Curveball middle 8.7% |
| 496 **pick** | hs | 2-1 | yes | Slider down-middle -> Fastball down-away | Fastball middle 48.6% -> 26.3% | 22.3% | 70.8% -> 70.8% | Fastball middle 48.6%, Slider down-middle 10.5%, Slider down-away 9.6%, Slider down-in 9.0%, Fastball down-middle 6.4% | Fastball middle 26.3%, Fastball down-middle 12.9%, Slider down-middle 10.5%, Fastball down-away 10.0%, Slider down-away 9.6% |

## Other levels: 0


## The 6 HS rows Drew grades (golden cases)

| case | level | count | moved? | old menu | new menu |
|---|---|---|---|---|---|
| #92 | travel | 0-0 | no | Curveball middle 18.2%, Curveball down-away 15.7%, Curveball down-middle 13.9%, Curveball up-away 11.2%, Fastball down-away 7.9% | Curveball middle 18.2%, Curveball down-away 15.7%, Curveball down-middle 13.9%, Curveball up-away 11.2%, Fastball down-away 7.9% |
| #154 | hs | 3-0 | no (under 0.05 points) | Fastball middle 30.0%, Changeup up-in 23.2%, Changeup up-away 17.8%, Changeup down-in 17.0%, Changeup down-away 12.1% | Fastball middle 30.0%, Changeup up-in 23.2%, Changeup up-away 17.8%, Changeup down-in 17.0%, Changeup down-away 12.1% |
| #476 | travel | 3-1 | **moved** (largest share move 14.4%) | Fastball up-away 33.6%, Fastball up-in 33.1%, Curveball middle 8.7%, Curveball down-middle 5.6%, Curveball down-in 5.6% | Fastball up-away 21.9%, Fastball up-in 21.6%, Fastball down-away 14.4%, Fastball down-in 8.8%, Curveball middle 8.7% |
| #410 | travel | 3-2 | no | Curveball middle 42.0%, Slider middle 36.1%, Fastball middle 15.9%, Fastball down-in 5.9% | Curveball middle 42.0%, Slider middle 36.1%, Fastball middle 15.9%, Fastball down-in 5.9% |
| #246 | travel | 0-0 | **moved** (largest share move 7.4%) | Fastball up-in 42.3%, Curveball middle 11.4%, Fastball chase 11.3%, Curveball down-middle 8.7%, Curveball down-away 7.3% | Fastball up-in 36.3%, Curveball middle 11.6%, Curveball down-middle 8.7%, Curveball down-away 7.2%, Curveball down-in 6.8% |
| #460 | hs | 2-2 | no | Fastball down-away 49.3%, Fastball middle 46.0%, Fastball up-away 4.7% | Fastball down-away 49.3%, Fastball middle 46.0%, Fastball up-away 4.7% |

## Read-through, v12 suite (98 rows)

Pass: 85 -> 85 of 98.

| row | moved? | passed | old top calls | new top calls |
|---|---|---|---|---|
| B8 | **moved** | True -> True | Fastball middle 35.1%, Fastball down-middle 26.1%, Fastball down-away 21.4%, Fastball up-away 17.3% | Fastball middle 35.1%, Fastball down-middle 26.1%, Fastball down-away 21.4%, Fastball up-away 17.3% |
| D10 | **moved** | True -> True | Slider middle 13.9%, Fastball middle 11.5%, Fastball down-away 10.2%, Slider down-middle 10.2% | Slider middle 13.9%, Fastball middle 11.5%, Fastball down-away 10.2%, Slider down-middle 10.2% |
| E8 | **moved** | True -> True | Fastball down-away 32.3%, Curveball middle 30.1%, Curveball down-away 18.5%, Curveball down-middle 18.0% | Curveball middle 30.2%, Fastball down-away 25.4%, Curveball down-away 18.5%, Curveball down-middle 18.0% |
| G4 | **moved** | True -> True | Fastball middle 26.1%, Slider middle 24.5%, Fastball down-middle 19.1%, Fastball down-away 16.0% | Fastball middle 26.0%, Slider middle 24.5%, Fastball down-middle 19.1%, Fastball down-away 16.0% |
| J3 | **moved** | True -> True | Curveball middle 21.4%, Curveball down-middle 16.6%, Curveball down-away 12.7%, Fastball down-away 11.3% | Curveball middle 21.7%, Curveball down-middle 16.7%, Curveball down-away 12.8%, Fastball down-away 10.9% |

Rows whose menu moved: **5** of 98.

## HG-1 to HG-4 (HG suite, 5 rows)

Pass: 4 -> 4 of 5.

| row | moved? | passed | old top calls | new top calls |
|---|---|---|---|---|
| HG-1a | no | True -> True | Fastball down-away 16.5%, Fastball middle 13.0%, Fastball down-middle 12.9%, Slider middle 11.1% | Fastball down-away 16.5%, Fastball middle 13.0%, Fastball down-middle 12.9%, Slider middle 11.1% |
| HG-1b | no | True -> True | Fastball middle 13.9%, Fastball down-middle 13.8%, Fastball down-away 12.1%, Changeup down-middle 10.8% | Fastball middle 13.9%, Fastball down-middle 13.8%, Fastball down-away 12.1%, Changeup down-middle 10.8% |
| HG-2 | no | False -> False | Slider down-away 20.4%, Changeup down-away 18.2%, Curveball down-away 14.6%, Fastball down-away 14.4% | Slider down-away 20.4%, Changeup down-away 18.2%, Curveball down-away 14.6%, Fastball down-away 14.4% |
| HG-3 | no | True -> True | Fastball middle 16.9%, Fastball down-middle 15.0%, Slider middle 12.6%, Fastball down-away 12.5% | Fastball middle 16.9%, Fastball down-middle 15.0%, Slider middle 12.6%, Fastball down-away 12.5% |
| HG-4 | no | True -> True | Fastball middle 100.0% | Fastball middle 100.0% |

Rows whose menu moved: **0** of 5.
