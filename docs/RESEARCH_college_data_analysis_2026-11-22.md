# College data analysis: D1 / D2 / D3 box scores, through 2025

**Date:** 2026-11-22.

**Source:** `C:\Users\kindl\Downloads\college-baseball-data\archive.sqlite3`, packaged 2026-11-22 12:33 ET. Read-only.
- 119,021 games and 11,460,098 play lines.
- Collection is still incomplete. Jobs pending: D1 games 125,027; D2 games 13,596; D3 games 10,294.

**2026 is held out.** It was counted for coverage only, never analysed.

**How it was run:**
- Parsed on Drew's PC with `derived/extract.py`. The outputs are in `derived/`, not in git.
- Analysed in the cloud with `load.py`, `prep.py`, `analyze.py` and `export.py`.
- Every number below comes from that code, run with its output captured.
- This is an independent cross-check. The repo's `hitter_data` parser (v3) is the source of truth for fits.

**Dashboard:** https://claude.ai/artifact/3BKivvexGZcFtasxK8yEDA. HS / travel has its own:
https://claude.ai/artifact/TEUeZmcjgb1fTMU9crsheY.

## Checks on the data
- **Duplicates:** 2,264 games dropped as duplicates (same date, teams, score and opening plays). StatCrew pages are left out, because they group plays into lines.
- **Count replay:** 98.5% of pitch strings replay to the count the box score shows. The prework's parser v3 got 99.18%.
- **Plate appearances:** the median game has 79. Strikeouts with a string end in S 70.2% of the time and in K 29.7%.
- **Divisions:** each team's division comes from matching the athletics site that hosts the game page to `schools.athletics_url`. That matched 780 team names.
- **Unmatched opponents** (often NAIA or juco) count for the matched side. Their per-pitch rates match in-division games within half a point.
- **A "full game"** is one where at least 90% of PAs have a consistent string. A first-pitch "(0-0)" ball in play counts as consistent.
- **D1 2025 coverage is 0.657**, which matches the prework's 0.66.
- **Impossible counts:** 6 pitches at 4-ball counts were dropped.

## Coverage
| Level | 2025 games | 2025 full | Share | 2026 share (counted only) | Full games 2018–25 | Recency-weighted |
|---|---|---|---|---|---|---|
| D1 | 9,478 | 6,226 | 0.657 | 0.853 | 19,826 | 11,005 |
| D2 | 6,375 | 1,880 | 0.295 | 0.695 | 4,216 | 2,804 |
| D3 | 6,854 | 689 | 0.101 | 0.823 | 1,130 | 902 |

The weight halves every 2 seasons back from 2025.

2025 game counts grew a lot since the prework (D2 2,144 → 6,375; D3 1,589 → 6,854). Full games grew too: D2 736 → 1,880 and D3 220 → 689. But the full-game share fell, because most of the new games have no pitch strings.

## Do full games look like the rest? (2025, game-clustered SE)
| Level | K gap (full − rest) | BB gap |
|---|---|---|
| D1 | +0.82 pts ± 0.14 | −0.30 ± 0.11 |
| D2 | −0.18 ± 0.18 | −0.65 ± 0.14 |
| D3 | +0.14 ± 0.28 | −0.11 ± 0.22 |

Every gap is under 1 point. D1's K gap and D2's BB gap are larger than 2 SE.

## Findings
1. **Per-PA rates, 2025:**

   | Level | K | BB | HBP | HR | BABIP | Runs per team-game |
   |---|---|---|---|---|---|---|
   | D1 | 19.3% | 11.4% | 3.5% | 2.7% | .335 | 6.04 |
   | D2 | 17.3% | 11.2% | 3.7% | 2.3% | .348 | 6.81 |
   | D3 | 16.4% | 11.1% | 4.1% | 1.6% | .352 | 6.73 |

   Runs per team-game use games where both teams are in the same division, all seasons through 2025.

2. **College hitters miss the least of any level.** Whiff per swing: D1 22.4%, D2 21.6%, D3 20.1%, against HS / travel at 24.6%.
   - Single-A runs 25–31% by count group. College is lower than Single-A in every group.
   - BBCOR bats and weaker pitching at D2 / D3 are the likely reasons.

3. **Swing rates are nearly the same across D1, D2 and D3.** Overall swing rate is about 43% at each.
   - College swings more than HS / travel (40.7%) and a little less than Single-A in hitter's and even counts.
   - At two strikes, college hitters (57%) are close to Single-A (58.3%) and well above HS (52.3%).

4. **The division gaps are mostly in contact, not in approach.** The count shape is shared and the level sets the size. That favours the "shared + offset" variant in the level-split check for D2 / D3. Let the check decide. **(default expectation)**

5. **Strikeouts by season:** K% rose to a 2020 peak (D1 21.6%) and has eased since (D1 19.3% in 2025). Walks crept up (D1 10.4% in 2019 → 11.4% in 2025). Recency weighting matters here.

6. **Pitches per PA:** D1 3.76, D2 3.68, D3 3.68.

## Implications for v1.3
- **D2 / D3 can be fit.** Drew dropped the 50% coverage rule on Nov 22. Fitting uses borrowing, and the pass bar decides.
- **D3 is the thinnest level.** It has about 217k fit pitches, against 970k for D2 and 7.0M for D1. Its count layer should lean on borrowing from D2.
- **HBP rises as the level falls** (D1 3.5%, D2 3.7%, D3 4.1%). Check each level's engine HBP target against this.
- **There is no pitch type, velocity or location in college box scores.** Those effects come from the HS table, Statcast and the zone table.
- **Times through the order** at college needs pitcher tracking from the "X to p for Y" substitution lines. It wasn't done here, and it's a candidate term for Claude Code.

## Caveats
- This parser is simpler than parser v3. Small differences from the repo's numbers are expected.
- Games with no matched division for either team are excluded from division rates.
