# Changed calls from the E-7 fix (ruling 41: J7 plus_opp x RHO_L at HS / travel), b74abdb -> cdaf0eb

Goldens: old `golden/golden_v13core.json`, new `C:/dev/pitchiq-data-final/p11/golden_v13coreE7.json` (500 golden-v11 inputs). 250 cases carry a call.

- Call mix changed by 0.05 points or more (or pick / top changed): **8** (HS / travel 8, other levels 0).
- Pick (0.5 draw) changed: **6**; top-share call changed: **1**.
- Cases off HS / travel with ANY output changed: **0** 
- Menus that moved by less than 0.05 points (ripple through the PA table; not listed): 1.
- HS / travel cases with an output outside the call (and why / shaken / intent) changed: **8**; which outputs (values changed, largest change): table 2024 (0.2542), walk 8 (0.0501). The credit is a cost term, so in eligible cases the PA table's per-count policies (and the table / walk estimate) move with it.
- Listed HS / travel moves on the **same side: 0**; opposite side but not J7-eligible: 0; J7-eligible: 8.
- The only code change is `coach_credit` / `coachCredit`'s plus_opp term (x RHO_L: 0.6 at HS / travel, 1 elsewhere).

## HS and travel

| case | level | count | usage | pick | top-share call | largest move | side / J7-eligible | old menu (top 5) | new menu (top 5) |
|---|---|---|---|---|---|---|---|---|---|
| 68 **pick** | travel | 3-2 | no | Slider down-in -> Slider middle | Slider down-in 58.0% -> 44.6% | 13.4% | opp / yes | Slider down-in 58.0%, Slider middle 25.6%, Fastball chase 16.4% | Slider down-in 44.6%, Slider middle 32.4%, Fastball chase 16.4%, Slider up-in 6.6% |
| 78 **pick** **top** | hs | 0-0 | yes | Slider down-middle -> Slider down-away | Slider down-in 22% -> Slider middle 24% | 8.8% | opp / yes | Slider down-in 21.8%, Slider middle 21.4%, Slider down-middle 17.2%, Slider down-away 16.3%, Slider up-away 12.0% | Slider middle 24.0%, Slider down-middle 19.4%, Slider down-away 18.4%, Slider up-away 13.8%, Slider down-in 13.0% |
| 106 **pick** | hs | 1-2 | yes | Changeup chase -> Curveball down-away | Changeup down-away 31.0% -> 25.4% | 5.6% | opp / yes | Changeup down-away 31.0%, Changeup chase 19.8%, Fastball chase 6.1%, Fastball down-away 6.0%, Curveball up-away 5.4% | Changeup down-away 25.4%, Changeup chase 15.1%, Curveball up-away 7.2%, Curveball down-away 7.0%, Curveball middle 7.0% |
| 166 | hs | 0-2 | yes | Changeup down-away | Changeup down-away 61.6% -> 63.1% | 1.5% | opp / yes | Changeup down-away 61.6%, Changeup chase 38.4% | Changeup down-away 63.1%, Changeup chase 36.9% |
| 206 **pick** | travel | 2-2 | yes | Slider down-in -> Slider middle | Slider down-in 80.0% -> 23.0% | 57.0% | opp / yes | Slider down-in 80.0%, Changeup down-away 4.7%, Curveball down-away 3.9%, Curveball middle 3.3%, Changeup down-middle 3.1% | Slider down-in 23.0%, Slider down-away 18.2%, Slider middle 15.8%, Slider down-middle 14.2%, Changeup down-away 11.0% |
| 298 **pick** | hs | 1-0 | yes | Fastball down-away -> Fastball down-middle | Changeup down-away 48.4% -> 29.7% | 18.7% | opp / yes | Changeup down-away 48.4%, Fastball down-away 17.2%, Fastball down-middle 11.6%, Fastball down-in 9.4%, Fastball up-away 8.7% | Changeup down-away 29.7%, Fastball down-away 17.9%, Fastball down-middle 12.6%, Fastball down-in 10.1%, Changeup middle 9.7% |
| 300 **pick** | hs | 1-2 | yes | Changeup down-away -> Curveball down-away | Fastball chase 33.3% -> 33.3% | 5.7% | opp / yes | Fastball chase 33.3%, Changeup down-away 23.8%, Changeup chase 18.9%, Curveball down-away 16.6%, Changeup up-away 7.3% | Fastball chase 33.3%, Curveball down-away 21.7%, Changeup down-away 18.9%, Changeup chase 13.2%, Changeup up-away 12.8% |
| 464 | travel | 2-2 | yes | Changeup down-away | Slider middle 36.3% -> 38.1% | 2.2% | opp / yes | Slider middle 36.3%, Changeup down-away 23.7%, Fastball up-away 17.1%, Fastball down-away 15.8%, Fastball down-middle 7.1% | Slider middle 38.1%, Changeup down-away 21.9%, Fastball up-away 16.0%, Fastball down-away 14.6%, Fastball down-middle 9.3% |

## Other levels: 0


## The 6 HS rows Drew grades (golden cases)

| case | level | count | moved? | old menu | new menu |
|---|---|---|---|---|---|
| #92 | travel | 0-0 | no | Curveball middle 18.2%, Curveball down-away 15.7%, Curveball down-middle 13.9%, Curveball up-away 11.2%, Fastball down-away 7.9% | Curveball middle 18.2%, Curveball down-away 15.7%, Curveball down-middle 13.9%, Curveball up-away 11.2%, Fastball down-away 7.9% |
| #154 | hs | 3-0 | no | Fastball middle 30.0%, Changeup up-in 23.2%, Changeup up-away 17.8%, Changeup down-in 17.0%, Changeup down-away 12.1% | Fastball middle 30.0%, Changeup up-in 23.2%, Changeup up-away 17.8%, Changeup down-in 17.0%, Changeup down-away 12.1% |
| #476 | travel | 3-1 | no | Fastball up-away 21.9%, Fastball up-in 21.6%, Fastball down-away 14.4%, Fastball down-in 8.8%, Curveball middle 8.7% | Fastball up-away 21.9%, Fastball up-in 21.6%, Fastball down-away 14.4%, Fastball down-in 8.8%, Curveball middle 8.7% |
| #410 | travel | 3-2 | no | Curveball middle 42.0%, Slider middle 36.1%, Fastball middle 15.9%, Fastball down-in 5.9% | Curveball middle 42.0%, Slider middle 36.1%, Fastball middle 15.9%, Fastball down-in 5.9% |
| #246 | travel | 0-0 | no | Fastball up-in 36.3%, Curveball middle 11.6%, Curveball down-middle 8.7%, Curveball down-away 7.2%, Curveball down-in 6.8% | Fastball up-in 36.3%, Curveball middle 11.6%, Curveball down-middle 8.7%, Curveball down-away 7.2%, Curveball down-in 6.8% |
| #460 | hs | 2-2 | no | Fastball down-away 49.3%, Fastball middle 46.0%, Fastball up-away 4.7% | Fastball down-away 49.3%, Fastball middle 46.0%, Fastball up-away 4.7% |

## Read-through, v12 suite (98 rows)

Pass: 85 -> 85 of 98.

| row | moved? | passed | old top calls | new top calls |
|---|---|---|---|---|

Rows whose menu moved: **0** of 98.

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

## E rows (edge_rows.json: two-strike menus, every level, starter / reliever, same / opposite side)

| level | row | moved? | old menu (top 5) | new menu (top 5) |
|---|---|---|---|---|
| hs | 0-2|starter (HS q5, FB / SL / CH)|opp | **moved** (10.2%) | Fastball chase 24.7%, Slider down-in 21.2%, Slider down-away 12.8%, Slider chase 9.8%, Slider down-middle 8.0% | Fastball chase 25.0%, Slider down-away 11.8%, Slider down-in 10.9%, Slider down-middle 8.8%, Slider middle 8.6% |
| hs | 1-2|starter (HS q5, FB / SL / CH)|opp | **moved** (46.2%) | Slider down-in 65.6%, Fastball chase 11.4%, Fastball down-away 8.2%, Fastball up-away 8.2%, Fastball up-in 5.5% | Slider down-in 19.4%, Slider middle 13.8%, Slider down-away 13.8%, Fastball chase 13.2%, Slider down-middle 11.9% |
| hs | 2-2|starter (HS q5, FB / SL / CH)|opp | **moved** (18.8%) | Slider down-in 35.8%, Slider middle 24.2%, Fastball down-away 9.6%, Fastball middle 8.1%, Fastball up-away 7.0% | Slider middle 29.0%, Slider down-in 17.0%, Slider down-middle 14.0%, Fastball down-away 9.8%, Fastball middle 7.8% |

E rows that moved: **3** of 80.
