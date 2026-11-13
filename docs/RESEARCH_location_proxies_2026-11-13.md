# Research: public proxies for miss direction and inside pitching (Nov 13, 2026)

For `docs/PLAN_v1.2_2026-11-13.md`. Statcast doesn't record the catcher's target, so this doc checks what public data can
and can't say about **where a pitcher meant to throw**, **which way he misses**, and **what inside pitching costs** at
each level. Every number below was run in this session; scripts in `research_v12/`, outputs in `results/v12/`.

## Data pulled

| Source | What | Size | Use |
|---|---|---|---|
| Statcast MLB 2024, 2025 (`fetch_statcast.py`, unchanged) | every 4th day, Apr 5–Sep 25 | 88 files, 340,378 pitches (same totals as v1.1 Step 0) | inside shares, HBP by location, 3-0 split |
| **Statcast Single-A (Florida State League, Hawk-Eye)**, 2024, 2025 (`research_v12/fetch_minors.py`, new) | Savant minor-league search, same days | 88 files; 48,981 + 47,544 pitches | the lowest level with public pitch locations |
| OpenCommand 2025 (`targets.csv.gz`, `pbp_info.csv.gz`) | catcher targets inferred from broadcast video, per pitch | 641,147 pitches with a target (2025 regular season) | **research check only** (CC BY-NC-SA; Drew's O3). Nothing here feeds a shipped number |

College pitch locations: none public. Searches found program write-ups (Iowa's command score, Inside Edge for MLB) and
paid charting (SIS, Synergy, 6-4-3 Charts); no free college location data.

## 1. Which way do misses go? (OpenCommand, research check)

`research_v12/oc_miss_direction.py`; `results/v12/opencommand_naive_check.txt`.

- **The "inferred" target can't show a lean.** Mean miss is 0.0 in. for every pitch type, and each pitcher's odd-pitch
  and even-pitch means correlate **negatively** (−0.12 to −0.76). The inferred target is centred on each pitcher's own
  pitches by construction. Not usable for direction.
- **The "naive" target (where the glove was before release)** gives this, in inches (arm side +, up +):

  | Kind | Mean lateral miss | Mean vertical miss | Arm-side share of misses over 6 in. | Lean after removing the pull toward the middle* |
  |---|---|---|---|---|
  | Four-seam | +1.6 | +3.8 | 63% | about +1.1 |
  | Sinker | +2.7 | +0.5 | 70% | about +2.7 |
  | Cutter | −0.1 | +0.8 | 50% | about −1.0 |
  | Slider | −0.8 | −3.8 | 44% | about −2.2 |
  | Curve | +0.1 | −5.3 | 50% | about −0.8 |
  | Changeup | +2.8 | −5.3 | 69% | about +3.5 |

  \*Average of the arm-side-target and glove-side-target means. From an edge target, misses also come back toward the
  middle by 2–3 in. (the "pull").
- **The lateral lean follows the pitch's own movement.** Arm-side runners (sinker, changeup) lean arm side; sliders lean
  glove side; curves and cutters are close to even. This is the coaching claim "the miss follows the run".
- **Each pitcher's lean is stable between halves of his season** (r 0.87–0.91; pitchers differ by an SD of 2.1–2.7 in.).
  That stability is overstated: it also carries each catcher's setup habits and each pitcher's target mix, so it is
  **not** evidence that a lean is learnable from an amateur log.
- **What it can't support:** sizes for shipped defaults (license), the vertical numbers (catchers set up low, so a
  fastball "misses up" mostly because the glove started low), and anything at amateur levels.

## 2. A Statcast-only check: 3-0 fastballs

`research_v12/location_proxies.py`. At 3-0 the target is mostly "a strike". The mean crossing point splits into a part
fixed to the **pitcher's** side (arm side for both batter sides: a lean, or an aim in his own frame) and a part fixed to
the **batter's** side (intent).

| | Pitcher-frame (arm side) part | Batter-frame (inside) part |
|---|---|---|
| MLB sinker 2024 / 2025 | **+2.0 ± 0.5 / +2.6 ± 0.4 in.** | −1.5 / −0.4 |
| MLB four-seam 2024 / 2025 | +0.4 ± 0.3 / +0.9 ± 0.3 | −1.2 / −1.7 |
| Single-A sinker 2024 / 2025 | +0.7 ± 0.7 / +0.2 ± 0.8 | +0.2 / +0.3 |
| Single-A four-seam 2024 / 2025 | +0.7 ± 0.5 / 0.0 ± 0.5 | 0.0 / −0.8 |

The MLB sinker's +2–2.6 in. agrees with OpenCommand's naive +2.7, from a different method. Caveats: which pitchers
reach 3-0 isn't random, and sinker pitchers' catcher setups and the handedness mix they face aren't controlled; the
pitcher-frame part could also be an aim in his own frame, not a miss. Single-A samples are too
small to see it (±0.7). **Support:** direction and rough size of an average sinker lean at MLB. **Not:** a per-pitcher
lean (no targets), amateur levels, or off-speed (3-0 is almost all fastballs).

## 3. What inside pitching costs: hit batters by level

`results/v12/proxies_mlb_2024.txt`, `proxies_mlb_2025.txt`, `proxies_singleA_2024_2025.txt`. "Body zone" = crossed
14+ in. toward the batter from plate centre.

| | MLB 2024 / 2025 | Single-A 2024 / 2025 |
|---|---|---|
| HBP per PA | 1.02% / 0.99% | **2.03% / 1.91%** |
| Share of pitches reaching the body zone | 4.9% / 4.8% | 6.7% / 6.6% (×1.37) |
| HBP given the body zone | 0.051 / 0.051 | 0.078 / 0.074 (×1.5) |
| HBP by exact crossing point (+18 / +21 / +24 in.) | 0.046, 0.110, 0.172 / 0.036, 0.098, 0.239 | 0.051, 0.101, 0.257 / 0.033, 0.111, 0.220 |
| Four-seam crossing the inside third vs same-side hitters | 27.6% / 28.5% | **34.9% / 34.0%** |
| Sinker crossing the inside third vs same-side hitters | 47.9% / 47.5% | **41.1% / 41.2%** |
| Same-side vs opposite-side HBP given body zone (four-seam) | 0.087 vs 0.031 / 0.083 vs 0.035 | 0.120 vs 0.033 / 0.122 vs 0.032 |

- **Single-A's 2× HBP rate splits about 45 / 55** between more pitches reaching the body (deeper misses) and more of
  those hitting the batter. Given the exact crossing point, the hit rate is the same as MLB, so the second part is also
  location (deeper inside within the zone). That supports Drew's answer that college's excess is "both, about equally".
- **Lower pro levels still pitch inside.** Single-A four-seams cross the inside third to same-side hitters *more* often
  than MLB, despite twice the hit batters. Drew's D3 estimate (Nov 13): "often, 20–35%".
- **Same-side pitches that reach the body hit the batter 2.4–3.8× as often** as opposite-side ones (arm-side run into the
  hitter vs glove-side break away from him).
- **College rule:** the NCAA rule awards first base when the pitch is in the batter's box and he makes no move into it,
  without the pro requirement to try to avoid it, and college hitters are coached to "wear it". So college's
  hit-given-near-body is plausibly above Single-A's, as Drew's split says.

## 4. What the engine charges today (`results/v12/engine_inside_price.txt`)

A sinker (command 3) at 1-0 to a same-side hitter, HBP per pitch:

| | up-in / down-in | middle | down-away |
|---|---|---|---|
| MLB | 0.51% | 0.11% | 0.09% |
| D1 | 2.86% | 0.72% | 0.53% |
| D3 | **3.73%** | 0.97% | 0.69% |
| HS | 3.39% | 0.90% | 0.63% |

D3 charges **7.3× MLB** per inside pitch, while real HBP per PA is about **4×** (D3 4.2% vs MLB 1.0%). The cause is
circular: `calib.py` fits the level HBP price against the engine's own calls (`evaluate`, the cached policy per level ×
pitcher × side). The engine almost never throws inside at college, so the price has to be high to reproduce college's
hit-batter rate, and the high price keeps the engine from throwing inside.

Where ×0.53 comes from: if D3 pitchers threw inside as often as MLB pitchers, college's 4× HBP rate would mean about 4×
MLB's per-inside price, 4 × 0.51% ≈ 2.0%, vs today's 3.73% → ×0.53. A rough estimate; Step 2's reference-mix fit
replaces it.

**Probe** (`research_v12/probe_hbp_scale.py`, no engine change kept): row P1 (sinker in, 1-0, same side, D3) by count
(0-0, 1-0, 0-1, 1-1, 2-1, 0-2, 1-2, 2-2) as the D3 price is scaled:

| D3 price | Sinker in | Four-seam in (P7 arsenal) |
|---|---|---|
| ×1.00 (today) | 6 6 4 0 0 0 0 0% | 0% everywhere |
| ×0.53 (the non-circular estimate) | 10 **23** 13 13 1 0 0 0% | 0 0 4 0 0 0 0 0% |
| ×0.35 | 19 20 19 22 9 0 1 0% | 7 0 8 0 0 0 0 0% |
| ×0.20 (MLB's price) | 20 21 20 26 20 5 6 0% | 8 0 11 0 0 1 0 0% |

The price explains most of the sinker gap. It doesn't explain the four-seam: even at MLB's price, D3 four-seams go inside
0–11%, while MLB-level calls go inside 19%. Something else at college holds them back (a v1.2 diagnosis step).

## 5. Directional misses change inside risk both ways (`results/v12/lean_hbp_geometry.txt`)

Lateral miss ~ Normal(target + lean, σ), HBP by crossing point from §3 (MLB):

| Inside-third target, lean toward the batter | −2.7 | −1.5 | 0 | +1.5 | +2.7 in. |
|---|---|---|---|---|---|
| HBP per pitch, σ 8 in. | ×0.48 | ×0.67 | 1.0% | ×1.46 | **×1.94** |
| HBP per pitch, σ 11 in. | ×0.62 | ×0.77 | 2.8% | ×1.29 | ×1.56 |

An arm-side-running sinker (+2.7) to a same-side hitter nearly **doubles** the hit-batter risk of an inside target. The
same lean pulls that pitcher's away target over the middle third (23% → 29% at σ 8). A glove-side-leaning slider gets
safer inside to an opposite-side hitter's back foot and riskier away. So a lean makes some inside pitches riskier and
some away pitches riskier, as Drew expected; the data in each spot decides.

## 6. Can the app's grid show a lean? (`results/v12/grid_lean_sim.txt`)

What the app stores per pitch today (code at `14e0ad2`):
- **Target:** the called spot (`quad`: up-in, up-away, down-in, down-away, chase, middle, down-middle), relative to the
  batter. Drew (Nov 13): the catcher "shades it / sets up middle-ish", so the called spot isn't the glove.
- **Landed:** only if the optional "Also log where each pitch ended up" toggle is on (`S.setup.logLoc`, separate from
  the four logging tiers): a 5×5 catcher's-view cell (`res.locCell`, inner 3×3 = the zone, outer ring = "just off"), or
  **"Way off" with no direction** (`index.src.html:1416-1429`). Editing a logged location clears its cell (`:1471`).
- **Hands:** pitcher hand and batter side aren't on the event; they come from the pitcher / hitter records and
  `sit.same_side` (switch hitters derived).
- **Learner:** reads no landed cell (`learner.js` has no `locCell`); only the setup check, the "look" and the matchup spot
  keys use it.
- **No bullpen charting mode.** `sessions` holds TrackMan / Rapsodo uploads, which carry plate location but no target.

Simulation, lateral axis, edge target, true lean 0 or 2.5 in., pull toward the middle 0.3:

| Estimator | Bias (lean 2.5, σ 8 / 11) | SD at 60 pitches (σ 8 / 11) |
|---|---|---|
| A. Today's log (way-off dropped) | −4.1 / −5.6 in. | 0.9 / 1.1 |
| B. Directional "Way off" | −2.1 / −2.6 | 1.0 / 1.3 |
| C. B, averaged over arm-side and glove-side targets | **−0.0 / −0.2** | **1.0 / 1.4** |

The grid is fine enough (a cell is about 6.7 in. and adds little noise). What's missing is a direction on "Way off" and
targets on both sides of the plate. With both, a 2.5-in. lean shows at 2 SE after about **60 (σ 8) to 110 (σ 11)**
charted pitches of that pitch.

## 7. What each proxy supports

| Proxy | Supports | Can't support |
|---|---|---|
| OpenCommand naive targets | direction of the average lean by pitch type at MLB; that leans differ by pitcher | shipped numbers (license); vertical lean; amateur levels |
| OpenCommand inferred targets | nothing about direction (de-meaned per pitcher) | — |
| Statcast 3-0 split | average MLB sinker lean +2–2.6 in. arm side; four-seam small | per-pitcher leans; off-speed; amateur (Single-A too noisy) |
| Statcast HBP by crossing point | the HBP curve by distance inside; same vs opposite side; HBP grows fast with a lean toward the batter | targets (crossing ≠ aim) |
| Single-A Statcast | a lower level's inside shares and HBP split (reach vs hit) | college rules and hitters |
| Dispersion asymmetry within clusters | not run: a pitcher's targets are a mixture, so skew within a cluster mixes intent and miss | — |
| College | Drew's coaching estimates (inside 20–35%; HBP excess from both causes) | any measured location |

**Bottom line:** nothing public supports fitting a per-pitch lean for an amateur pitcher. Public data does support the
**structure** (leans exist, follow the pitch's movement, change HBP risk sharply), the **HBP curve by location**, and
**breaking the circular HBP price** with a reference inside mix. The plan ships the structure at the even-miss default,
re-prices college HBP, and adds the logging to learn each pitcher's lean from his own pitches.

## Sources
- [OpenCommand dataset (Hugging Face)](https://huggingface.co/datasets/tomdoyo/open-command); [FanGraphs: Cutters and Command](https://fantasy.fangraphs.com/cutters-and-command/)
- [SIS: catcher mitt location and fastball command](https://www.sportsinfosolutions.com/2021/07/12/using-catcher-mitt-location-to-evaluate-fastball-command)
- [Marquee: intended zone primer](https://www.marqueesportsnetwork.com/intended-zone-primer-what-is-it-and-how-does-it-impact-the-cubs/)
- [FanGraphs: Revisiting the Kirby Index](https://blogs.fangraphs.com/revisiting-the-kirby-index/); [Wharton: xCTRL](https://wsb.wharton.upenn.edu/introducing-xctrl-a-probabilistic-approach-to-pitch-location-accuracy/)
- [Iowa Baseball Managers: quantifying command](https://medium.com/iowabaseballmanagers/quantifying-command-to-enhance-pitcher-development-9bb00a2a0b61)
- [FanGraphs: college hit-by-pitch rule and rates](https://blogs.fangraphs.com/sometimes-you-hit-the-ball-sometimes-the-ball-hits-you); [ESPN: hit-by-pitch rates](https://www.espn.com/mlb/story/_/id/49464076); [FOX Sports: Misericordia HBP record](https://www.foxsports.com/stories/mlb/the-college-baseball-team-shattering-hbp-records-is-playing-for-the-d-iii-world-series)
- [Baseball Savant: Statcast search (MLB, minors)](https://baseballsavant.mlb.com/statcast_search)
