# PitchIQ V1.3 audit: elite pitching coach (call quality)

## 1. Verdict
**Grade C-.** V1.3 handles hitter reads, times through the order, shake-offs, 3-0 and the plus-pitch platoon spots well. But
at college it breaks the owner's hard 3-1 / hitter's-count rule in 11 of 18 test cells. Drew's own graded read-through
drops from 94/98 (v1.2.3) to 85/98: 10 rows he graded in v1.0 now fail, and nobody has ruled on them. And a single "landing
hot" read turns the call into one pitch (94-100%) in almost every count. I would not call a college game with it as is.

All numbers below come from driving `engine.call_v08` directly. Scripts are in `/home/claude/audit/coach/` and every one
takes the repo path as its first argument. "v1.2.3" means `main` (8bcf909, shallow-cloned to `/home/claude/audit/coach/main`;
its engine files are unchanged since v1.2.3 per the build log). "V1.3" means `/home/claude/pitch-caller` @ c602f1c.
AVG3 = the tests.py average starter: FB 3/3 .80, SL 3/3 .75, CH 3/3 .65.

## 2. Findings (ranked by how much they would hurt a coach in a real game)

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| C1 | BLOCKER | College hitter's counts break the owner's HARD rule: 3-1 top pitch 42-44% (rule: 55-70%), floor (top type at least 50% at 2-0/2-1/3-1) fails in 11/18 cells | `tfail.py <repo> grid`. V1.3 D1 empty: 2-0 FB 47.8, 2-1 39.0, 3-1 43.3; D1 R1: 54.0 / 39.7 / 42.3; D3 empty: 46.2 / 37.4 / 43.5; D3 R1 2-1 40.2, 3-1 43.2; D3 R3 2-1 48.4. v1.2.3, same cells: all 27 at or above 50%, 3-1 at 55.3-71.2. HS passes only because the fastball floor holds every cell exactly at the table value (66.7/58.3/66.7) | 3-1 D1 mix is FB mid 37 / **CH mid 31** / SL mid 26. The least-trusted pitch (CH conf .65) outranks the slider (.75) at 3-1 and is the single top call at D3 2-0 (CH mid 29%). That is the opposite of "best pitch being controlled today". 3-1 with a runner on 1st: FB 71% -> 42% | Owner ruling. Either wire the ruling-8 guard (top type at least 50% at 2-0/2-1/3-1) for college, or find why off-speed middle got cheap. Restoring v1.2's flat hanger (e.HANGER=0.5) only moves D1 3-1 FB 43->49, 2-0 48->54, 2-1 39->47 (`hang.py`). A policy-layer floor should not touch the Step 6 hitter-model log loss, which scores outcome predictions, but I did not verify that | CHANGES-CALLS, NEEDS-OWNER-RULING |
| C2 | BLOCKER (pre-existing, worse in V1.3) | One "landing hot" read makes the engine call one pitch in nearly every count | `hot.py`: D1 AVG3, slider 8/10 and FB 10/15 at pitch 45. V1.3 slider share 0-0 **100**, 1-1 94, 2-0 95, 2-1 99, 3-1 95, 1-2 77, 3-2 83. v1.2.3: 98/83/85/89/83/82/69. With `COACH_RULE['hot']=0`, V1.3 is 36/33/31/39/34/41/51. The 0.03-run credit alone adds about 60 points. Scenario `c31off_*`: 3-1 with FB 4/10 and SL 8/10 gives **Slider middle 100%** at HS, D3 and D1 (v1.2.3: 100% slider over 2 spots, top spot 64-73%) | The hitter can sit slider until hot_fade kicks in at 1.2x the slider's normal share, about 10 straight sliders. That breaks "must not be predictable" and the 55-70% 3-1 band. The read is also wildly uneven: on tests.py's 1-2 R3 row the same credit moves only +13.6 points (below Drew's 20-point bar), while at 0-0 it moves +64 | Bound the read's effect, not its size in runs: for example cap the hot pitch's share gain (+20-30 points) or scale the credit by the count's temperature. Then re-grade C5 | CHANGES-CALLS |
| C3 | BLOCKER (process) | 10 of Drew's graded read-through rows that pass on v1.2.3 now fail. The readiness page (report Part 12) does not list it | `python3 readthrough/scenarios.py --suite v12` on each engine: **v1.2.3 94/98** (fails only proposed P2, P3, P5, P7). **V1.3 85/98** (fails A2, A6, C5, D6, E2, F5, F6, H4, I2, J7, all graded by Drew in v1.0, plus S6f, S7f, P7). Acceptable shares v1.2.3 -> V1.3: A2 72.7->53.5, F6 85.1->66.8, H4 89.2->62.0, I2 79.3->60.8, J7 86.0->65.5, E2 76.4->66.4; F5 not-acceptable 0->10.3. DECISIONS_refit_v13 has no ruling on these rows; ruling 44 covers test suites, not graded rows | The owner's proof bar is "his rules as hard checks + graded rows". The rows that fail are his core coaching rows (3-1 hard rule, squared up, late on the fastball, crowding, went back, plus pitch away) | Put the 13 failing rows in front of Drew with these menus before the merge | NEEDS-OWNER-RULING |
| C4 | MAJOR | "Fouled straight back -> not that pitch there again" no longer holds | `tfail.py <repo> reads`. squared_up: CH down-away off 24.6 -> on **9.6** (bar: on at most 1%). v1.2.3: 8.3 -> **0.0**. Scenario `o2back_D1` (0-2, slider fouled straight back): SL down-away 10.2 -> 6.3 (v1.2.3 9.1 -> 0) | The engine re-calls the exact pitch and spot the hitter just timed, about 1 time in 10 | Raise `COACH_RULE['squared_up']` (0.005) until F5 passes, or treat (pitch, spot) after a "back" foul as excluded for the next pitch. Narrow blast radius (fires only on a coach "back" read) | CHANGES-CALLS (small) |
| C5 | MAJOR | HS fastball floor overrides "the pitch he's controlling today" at 3-1, then falls off a cliff | `tfail.py land`: HS 3-1 with SL 8/10 and FB 4/10 (both against his own expectation): **FB stays 66.7%**, slider 21.6->24.0 (the tests.py failure). v1.2.3: FB 55->46, SL 24->34. `cliff.py`, HS 3-1 by FB strikes out of 10: V1.3 6:67% 5:67% 4:67% **3:0%**; v1.2.3 58/55/51/48/(2:0). D1 cliff 33%->0% (v1.2.3 52%->0%) | At HS a struggling fastball is still forced at 3-1 until one more ball deletes it entirely. Breaks "pitch confidence matters more, especially at lower levels" and the spirit of "no cliff" | Make the floor yield smoothly to the landing estimate (scale the floor by how far the fastball is under expectation), and smooth the not-landing block (pre-existing) | CHANGES-CALLS, NEEDS-OWNER-RULING (ruling 16) |
| C6 | MAJOR | No hanger penalty at all, including for off-speed that isn't landing (owner: "hanger penalty only when that pitch isn't landing") | `python3 -c "import engine as e; print(e.HANGER, e.HANGER_GATE)"` prints `0.0 0.0` (v1.2 used a flat 0.5). Scenario `hs2n_02` (HS 0-2, curve 2-for-9 today): **Curve middle 15.5 + down-middle 15.0 + up-away 9.5, curve in the dirt 0%**; v1.2.3 had curve chase 9.3, curve middle 7.9. Build report: HG-2 (0-2 curve middle) fails at H=0 | A curve he can't land gets thrown over the heart at 0-2 while the bounce curve disappears. This is the HS coach's worst nightmare call | Owner ruling on H (the build's grid found no H that passes E2 and HG together, so the rows conflict) | CHANGES-CALLS, NEEDS-OWNER-RULING |
| C7 | MAJOR | HS two-pitch, shaky curve (cmd 2, conf .45): full count calls curve middle 23% | Scenario `hs2s_32`: V1.3 FB mid 74.7 / **CB mid 22.7**; v1.2.3 FB 95 / CB 5. A6 (HS two-pitch 3-1, curve .62): curve middle 33% (acceptable 66.7 < 70) | A 3-2 get-it-over curve the kid can't command, 1 pitch in 4 | Same root as C1 and C6 (off-speed middle got cheap). Check after either fix | CHANGES-CALLS |
| C8 | MAJOR | No chase at 1-2 at college ("edges fine with two strikes as long as chase stays available"); climb-the-ladder row fails | `chase.py`, chase share at 1-2: V1.3 D3/D1, AVG3 and four-pitch: **0%** in all 4 cells; v1.2.3 6-9%. 0-2 is similar between engines (6-17% vs 13-22%). S7f (late whiff on the riding FB up, 1-2): FB above the zone 0% (floor 5%) | 1-2 is the prime chase count. With every 1-2 pitch in or at the zone, hitters can shorten up | Ties to the count layer; owner ruling on a minimum two-strike chase | NEEDS-OWNER-RULING |
| C9 | MAJOR (pre-existing) | Owner rule "unknown hitter = lineup-slot average adjusted by team strength" isn't implemented | `grep -in "lineup\|team_strength" engine.py`: nothing. `app/index.src.html:284` hitterGrades returns null without coach grades or a learned model, so the 3-hole and 9-hole hitters get identical calls. Same on main | Without scouting (most HS/D3 games), the cleanup hitter is pitched like the 9-hole hitter | Slot priors per level (needs data) | NEEDS-DATA |
| C10 | MINOR | Bases loaded, 3-2, 2 out, tie 9th, average slider: V1.3 leans slider past the owner's stated OK | `bl32_D1`: SL 57 (mid 46, down-mid 11) / FB 41; D3 SL 58 / FB 42. Owner's OK: slider middle ~47 / FB ~53. v1.2.3: 48/48. Engine's own walk-off risk (ball+WP+HBP): SL mid 31.4% vs FB mid 27.8% (`bl.py`) | Slightly riskier walk-off-walk profile than the owner endorsed | Show Drew | NEEDS-OWNER-RULING |
| C11 | MINOR | Hit-hard-one-side read puts 56% on a single spot at 1-1 | `hardin_11`: FB down-away **55.6%** (v1.2.3 top call 25%) | Predictable spot in a neutral count | Part of the C2 fix (bound read effects) | CHANGES-CALLS |

**The tests.py failures the brief named are real coaching regressions, not stale bars:**
- **3-1 at 37-43% and the hitter's-count floor (37% lowest):** C1. v1.2.3 meets both bars in every cell, and both bars are the
  owner's stated hard rule.
- **Slider-landing row at HS (22->24%):** C5. The HS floor pins the fastball, and v1.2.3 moved +11 points at every level.
- **Coaching reads:** squared_up (C4) is a real loss of an owner rule. "hot" at +13.6 points fails on that row, but the same
  credit is +60 points elsewhere (C2). The read is mis-sized by count, not just too small.
- I did not judge LAND_GAIN, realism K or exact-v1.0. They are not call-quality items.

## 3. Scenarios run (70 per engine; `scen.py <repo> out.json`, `cmp.py`; results in `v13.json` / `main.json`)
Shares are pitch type (%); the top call is in brackets. "OK" means an elite coach would sign off.

| Situation | v1.2.3 | V1.3 | Coach read |
|---|---|---|---|
| 0-0 leadoff, unknown hitter, D1 / D3 / HS | FB 51 / 52 / 53 | FB 44 / 46 / 54, 100% strike targets | OK at HS; college FB is light but acceptable |
| 3-0 (runner on 2nd) D1 / D3 / HS | FB 78 / 72 / 70 | FB 98 / 91 / 84, chase 0 | OK (tightest at 3-0) |
| 3-1 neutral D1 / D3 / HS | FB 58 / 57 / 55 | FB 43 / 43 / 67 (floor) | **C1** |
| 3-1, FB 4/10 and SL 8/10 (legacy records) | SL 100 over 2 spots | **SL middle 100** | **C2** |
| 3-1 four-pitch D1 starter | FB 50 | FB 44, CH 24, SL 24 | C1 |
| 2-2 bases loaded, 2 out, tie 9th, D1 | FB 38 / SL 33 / CH 28 | SL 40 / FB 31 / CH 29, chase 0 | OK (zone at 2-2) |
| 3-2 same | SL 48 / FB 48 | SL 57 / FB 41 | C10 |
| 0-2, slider fouled straight back | SL down-away 9.1 -> 0 | 10.2 -> 6.3 | **C4** |
| 1-2 after a CH down-away whiff | CH 23 | CH down-away 29.6 (control 22.3) | OK: repeat after whiff, and better than v1.2.3 |
| R3, 1 out, infield in vs back | down 86 / 75% | down targets 99.9 / 95.2% | OK |
| 1st & 2nd, 0 out, sinker | SI 92 (middle 36), down 40% | SI 66, down targets 71.0% (SI up-in 17) | OK (GB rule at least 70%; same-side sinker in) |
| HS two-pitch, shaky curve, 0-0 / 1-1 / 2-1 | FB 84 / 83 / 91 | FB 86 / 84 / 92 | OK |
| same, 0-2 | FB 83, FB chase 22 | FB 72, curve 28 (curve middle 7.7, no curve chase) | Weak; see C6 |
| same, 3-2 | CB 5 | **CB middle 23** | **C7** |
| HS curve 2-for-9, 2-1 / 0-2 | FB 100 / curve 40 | FB 100 / **curve 60, middle 15.5** | 2-1 OK; 0-2 is **C6** |
| D1 four-pitch, 1st / 2nd / 3rd time through, 0-0 and 1-2 | +-5 pts | within 1 pt | OK: no cliff (barely any effect) |
| Plus SL + plus CH, 1-2, opposite side | CH 64 / SL 25 | CH 67 (away 44, chase 22), back-foot SL 21 | OK |
| same, same side | CH 40 / SL 34 | SL 43 / CH 41 / FB 15 | Acceptable |
| Power hitter, FB middle hit hard once / twice (1-1) | - | FB middle 9.0 -> 8.4 / -> 0; FB type share unchanged (moves down) | OK: small once, large twice, not a ban on the pitch |
| 2-0 vs power hitter | - | FB middle 22% | OK (owner says valid) |
| Late on FB / out front on soft / crowding | - | FB up/in 0 -> 69 / OS down 37 -> 86 / FB in 0 -> 63 | OK (20+ points) |
| Slider shaken once / twice / SL then CH | - | SL 0 / 0 / FB+CB only | OK (engine side; app persistence not checked) |
| Slider 2/10: 2-0 / 0-2 | - | SL 0 / SL 40 | OK (not landing: blocked behind, usable ahead) |
| 0-2 / 1-2 / 2-2 neutral | - | chase 17 / **0** / 0 | 1-2 is **C8** |

Other checks: the tests.py reads (`tfail.py reads`) pass on 6 of 8 (late_fb, early_os, crowd, away, went_back, plus_opp all
move 20+ points); squared_up and hot fail (C4, C2). No chase at 3-0/3-1 held in every scenario I ran (chase 0).

## 4. What I could not verify
- **Whether a policy-layer fix for C1/C2 leaves the Step 6 result intact.** I believe Step 6 scores the hitter model's
  outcome predictions on real pitches, not the call policy, but I did not read `hitter_data/final_test.py` closely enough
  to be sure. Any fix still moves calls, so the graded rows and goldens would need re-grading.
- **The JS twin (`app/engine.js`).** All results are from the Python engine. Parity is the lead's / CI's area.
- **App shake-off handling.** I didn't check that the app keeps the once/twice shake list for the whole at-bat and clears it
  at the next batter. The engine side is correct.
- **Real college pitch-type usage by count.** That data isn't in the repo. My "college 3-1 FB ~43% is too low" rests on the
  owner's stated rule and coaching norms, not on data I checked.
- **Hot-read decay over a real game.** I measured single calls at pitch 45. I estimated how long the 94-100% slider run lasts
  (until hot_fade starts at 1.2x normal share) from the code; I did not simulate it.
- **Process note:** my first scenario run wrote `v13.json` into the lead's checkout (the script had chdir'd). I moved it to
  `/home/claude/audit/coach/` within minutes. `git status` there now shows only the lead's own `web/lib/engine_data_d3.json`
  change.
