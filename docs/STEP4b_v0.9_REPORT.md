# v0.9 Steps 4b, 5 and 6 report: guardrail, landing, power, inside, matchup memory

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session; the command for each result is given.

Every new term is behind its own flag. All of them are off in `FLAGS_V07` and `FLAGS_V08`, so v0.7c and v0.8 still
reproduce their golden files exactly. `FLAGS_V09` turns on the four that were built:

| Flag | Item | What it does |
|---|---|---|
| `guardrail_v09` | 10 | Takes v0.8's myopic guardrail off. The never-pick windows on full cost stay. Three-ball counts still rank by myopic cost (no setups). |
| `landing_v09` | 9 | A pitch with at least 4 thrown today and a shrunk strike rate at or below 0.40 gives way to the pitches that are landing. With two strikes and fewer than three balls it can still be called as a chase; otherwise it is left out. If nothing is landing, the filter stands down. |
| `inside_v09` | 3 (widened) | Fitted inside-vs-away differences on and near the plate, by pitch class, height and platoon side (Step 5 below). |
| `matchup_memory` | 6 | Earlier-trip whiffs and called strikes on a pitch class raise whiffs on it (+0.107 each, up to 4); an earlier hard-hit ball on that class and spot lowers them (−0.346 each, up to 2). Total capped at ±0.5; HS and travel ×0.6. |

Item 8 (`power_avoid`) was not built. See below.

RESULTS_PLACEHOLDER
