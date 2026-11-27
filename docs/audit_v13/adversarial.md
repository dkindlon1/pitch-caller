# PitchIQ V1.3 — adversarial audit

Scope: I drove `engine.py` on the lead's checkout (tip c602f1c), read-only, with `app/engine.js` for the JS side. Harness and
scripts are in `/home/claude/audit/adv/` (`h.py` has the base arsenal FB 3/4 .80 ride 86, SL 4/3 .75 tight 78, CH 3/2 .60 fade 77,
`gen.py` is a fixed-seed random generator, and each script's raw output sits beside it as `*.out`). The box was heavily loaded
(load ~14), so I kept samples small: about 330 live calls in total, all seeded.

## 1. Verdict
**C+.** I found no crash and no break of a hard rule's letter: no chase at 3-0/3-1/2-2, the second shake really is out,
the not-landing block holds when he's behind, and Python matches JS to 5e-14 on random rich states. But three spirit-level
breaks give a coach a confidently wrong call in a real game: a pitch that **isn't landing gets aimed at the heart**, a pitch
he **just shook off comes straight back**, and an off-speed pitch that was **mashed gets moved to the middle** instead of
losing calls.

## 2. Findings

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| A1 | MAJOR | When an off-speed pitch isn't landing, the engine aims it at the heart ("get it over" with a pitch that isn't landing) | `nl22.py` (`nl22_*.out`). Slider 0-for-12 vs 6 expected: D3 2-2 slider-middle **39%→54%** (slider total 57→54); D3 1-1 **15→32%**; D1 2-2 30→40%; HS 2-2 41→48%. Cause: `wild_today` widens the miss, so the heart maximizes strikes, and nothing prices the hanger. `HANGER=0.0` and `HANGER_GATE=0.0` (engine.py:1257,1261; zone_v13 `class.hanger_gate` absent), checked with `python3 -c "import engine as e; print(e.HANGER, e.HANGER_GATE)"` → `0.0 0.0`. BUILD report l.443/712: "no H passes, so H stays 0". But E2 fails at **every** H, H=0 included (it doesn't depend on H), and HG-1b/HG-2 pass from H≥1. Ruling 3 (DECISIONS l.322) says H "stays 0 **if the rows pass without it**", and they don't (HG suite 4/5 at H=0). `hg.py` (Python-only monkeypatch, H=1): D3 2-2 not-landing slider-middle 54→**32%**, D3 1-1 32→**8%**, D1 2-2 40→26%. Calls with no landing data don't change. | A coach sees "Slider, middle" at 2-2 for a pitcher who can't find his slider. This contradicts the owner rule ("get it over" off-speed only when it's landing) and ruling 3's hanger gate. | Size H per ruling 3. H≈1.0 passes every row that depends on H. It's a data-only change in `zone_v13.json`; both engines read `class.hanger_gate`. Re-run the HG rows and E-rows. | CHANGES-CALLS (only when off-speed `wild_today`>0). NEEDS-OWNER-RULING. I couldn't verify whether the 2026 holdout scoring touches `wild_today`. |
| A2 | MAJOR | After every pitch has been shaken off once, the next call re-calls the pitch he **just** shook off | `shake.py` and `shake.js` (identical in Python and the JS the app runs). 3-pitch, shakes [SL, CH, FB]: next call is FB 48.8 / SL 39.7 / CH 11.5, exactly the unshaken mix. 2-pitch (common at HS), shook FB then CB: CB (just shaken) **37%** at 0-0 (HS, D3), **67%** HS 1-2, **61%** D3 1-2 (`scen2.out`). Code: engine.py:3106-3115, app/engine.js:1725. Once `allowed_calls` is empty, the fallback re-opens everything not shaken twice, ignoring order. | Owner hard rule: "Never re-call a pitch just shaken off." A pitcher who shakes twice in a row gets the pitch he just refused about half the time. | In the fallback, also drop `exclude[-1]`'s pitch when anything else is left. Nov 14's "a shaken-once pitch may come back" still holds, just not the one he just refused. Same change in JS. | Changes calls only in the all-shaken state. NEEDS-OWNER-RULING (small); otherwise SAFE-NOW (restores the documented rule). |
| A3 | MAJOR | The "mashed" penalty is per target height, so a mashed off-speed pitch moves up or into the middle instead of losing calls | `scen2.out`. D3 0-2 base: SL 54%, SL down-away 35%. Hit hard 2× at down targets: SL **49%** (−5), SL up-away **0→24%**. Hit hard 2× down + 2× up: SL still **41%**, and **SL middle 41% is the top call** at 0-2. D1 same pattern (SL middle 37%). At 1-1, `hard\|SL\|down-away:2` leaves SL at 39.5% vs 39.7% and only empties that spot (`ab_damage.out`). Code: `mashed()` engine.py:259 groups by `target_height`, and the middle is its own height. | Owner: "mashed twice in a game = large soft penalty". Here the pitch keeps nearly all its share, and with A1's H=0 the escape route is the heart. | Add a pitch-level part (all hard-hit counts for the kind today, any height), or carry the penalty into the middle once both other heights are mashed. | CHANGES-CALLS, NEEDS-OWNER-RULING |
| A4 | MINOR | A coaching read is an on/off switch, and one read throws it fully | `reads.out`, D3 1-1: timing FB **0.19 → 0.20** moves FB 50.8→**78.5%** and FB up/in **0→78%**. The app's timing is an EMA (`0.35*(signal-t)`, index.src.html:392), so a single "late" read (0.35) fires the full `late_fb` credit (COACH_RULE, engine.py:~292, READ_T 0.2). | "Can one lucky outcome swing calls hard?" Yes: about 28 points off one read. The direction is what the owner asked for. The step, and firing on a single observation, are the questions. | Ramp the credit from READ_T to ~2×READ_T (owner sets the slope). Same for `early_os`. | CHANGES-CALLS, NEEDS-OWNER-RULING |
| A5 | MINOR | Better command can lower a pitch's share and make its own best call more expensive | `mono2.py`/`m2rep.py`, D2 0-2, CH 5/2 firm, SI 5/2, SL 1/1: CH command 2→3→4→5 gives share **49.0→45.7→46.0→43.5%**, and CH best equilibrium cost 0.1446→0.1465→0.1440→0.1468 (worse at 5 than at 2). D1 0-2 curveball command 3→5: 47.6→45.7%. That's 2 of 18 random +2 command jumps. Grade +2: 0 of 18 dropped. Grade/command/conf +1: worst drop 0.5 pt in about 60 states (`mono_*.out`). | Owner: "better stuff never makes a pitch a worse call." Small and limited to two-strike counts. I haven't isolated the mechanism: the sit game's response or the chase landing model are the likely causes. | Diagnose first (pure-sit costs vs equilibrium), then decide. | NEEDS-OWNER-RULING |
| A6 | MINOR | Edge of the confidence band: a 2-point step at the cutoff, and share falls as confidence rises | `band.out`, D3 1-1 slider conf .4499→36.5%, .4501→**34.5%**, .46→34.6%, .55→36.1%. D3 0-2 46.1→44.7. HS 0-2 56.2→55.3. Cause: `solve_table` uses `allowed_calls(arsenal, sc)` without band extras, so a pitch at weight .999 is in the root but missing from every continuation count, then appears at .4501. | Owner: "0.10 band, no cliff". The size is small (≤2.4 pts). | Weight the table by the band too (or solve it with band pitches included). | CHANGES-CALLS |
| A7 | MINOR | `check_inputs` doesn't range-check grade, command, conf, pitch_count, damage or timing | `degen.out`: grade 9 → FB **100%**; grade 0 accepted (FB 17%); conf 1.7 and -0.5 accepted; pitch_count -20 accepted; `hitter_damage FB (5.0,40)` → FB 0%; timing 5.0 → FB 100% (`ab_damage.out`). Normal app paths clamp: learner `clamp15`/`gradeOk`, damage clamped to ±1 with seed n≤8, timing EMA bounded. | A bad import, portal edit or future bug silently yields a scripted 100% call. | Reject out of range in `check_inputs` / `checkInputs`. No change for valid inputs. | SAFE-NOW |
| A8 | MINOR | Python `call_v08` ignores `home` unless the caller passes `win`; JS `callV08` computes it | `homewin.py`/`.js`, same state (2-1, R2, 1 out, tie 9th, home): PY FB 52.1/SL 47.9/CH 0 vs JS 53.9/45.0/1.1. Existing harnesses set `win` by hand. | A trap for new Python read-throughs and audits, which can grade rows the app would never show. The app itself isn't affected. | Mirror JS: compute `win` in `call_v08` when `home` is set and `win` isn't. | SAFE-NOW |

**Observations (defensible, not filed as bugs):**
- **O1, late-and-close step:** a binary temperature halving (`is_big_spot`). Travel, tie, RISP, inning 4→5 of 7 moves the mix by TV 0.13 (type 10 pts) (`p_inning.out`). By design: "randomness scales with stakes".
- **O2, repeat after a whiff only shows with two strikes:** at 1-1, slider down-away is 12.2% after a whiff and 12.2% after a ball. At 1-2 it's 32.3% vs 27.7% (ball) vs 13.5% (foul) (`r6.py`). The fitted whiff term matters little before two strikes.
- **O3, the HS floor does much of the calling:** in many HS/travel states the FB share sits exactly on the floor (0.400 at 2-2, 0.333 at 1-2). Raising any pitch's grade, command or confidence moves nothing (`mono_*.out`). HS 2-2 type shares stay 60/40 from n=0 to 48 repeated calls (`ab_usage.out`). This is accepted (rulings 16/37), but it means the engine's own HS preference sits below the 10th-percentile real HS pitcher in those states.
- **O4, repeated calls:** at realistic counts (D3 2-2 top call slider-middle repeated 4/8/12 times) its share goes 39→34→29→26%. Ruling 32 already accepts this. At an unrealistic n=48, FB at D3 2-2 goes from 37% to 0%.
- **O5, D3 1-1 FB location:** FB is never called up or in (0% across up-in/up-away/down-in). Thin location variety, but it could be data-driven.

## 3. Scenarios run (all seeded; scripts in `/home/claude/audit/adv/`)
| Test | Result |
|---|---|
| Hard rule: no chase at 3-0/3-1/2-2 | Holds by construction (`targets()`), and no chase appeared in any 3-0/3-1/2-2 output across every script, fallbacks included (one-pitch, all untrusted, all shaken, not landing, floor). |
| Second shake = out | `["Slider","Slider"]` → SL 0%. FB shaken twice with SL untrusted (.2) → SL 100%. One-pitch shaken twice → FB (shakes set aside, so there's always a call; defensible). |
| Not-landing block (behind counts / 0-0) | SL 1/8 vs 5 expected: 0-0 / 2-0 / 2-1 / 3-1 / 3-2 → SL 0%. Comeback (since_thrown 9) at 3-1 → SL 0% (priced out, not blocked). All three not landing at 3-1 → filter stands down, FB 96%. |
| Irrelevant perturbations (`perturb2.py`, 12 states each, mostly college) | Arsenal order reversed: TV 0.0000. Name casing: 0.0000. grade ±0.01: ≤0.0018. pitch count 74→75: ≤0.0009. batters faced 18→19 (third time through): 0.0000. Inning 4→5: 0 except the late-and-close step (O1). |
| Monotonicity (`mono.py`, `mono2.py`) | grade/command/conf +1, ~60 states: worst −0.5 pt. grade +2, 18 states: 0 drops. command +2, 18 states: 2 drops (−3.0, −1.9) → A5. |
| Weaker hitter (`weak2.py`) | Lower contact or power → more zone (D1 0-0: power 1 → 63% zone vs power 5 → 49%; D1 3-1: weak 100% vs strong 67%). With all three grades dropped, poor discipline → more chase (59% at D1 0-2): correct. HS 1-1 is slightly non-monotone (contact grade 1/3/5 → 58/49/55% zone). |
| Degenerate (`degen.py`) | One-pitch pitcher fine (0-2 FB down-away 61 / up-away 28 / chase 10). All untrusted → most-trusted pitch. Grade 1 and 5 everywhere sane. 150 pitches → shifts to off-speed (FB 40→27%). Inning 13 with extras runner fine. Bases loaded 3-0 up or down 10 → FB middle 100%. Walk-off 3-1 R3 → FB 65% (FB middle 59%). Bases loaded 3-2 2 out tie 9th avg slider: SL 54.7 / FB 45.3 (owner accepted about 47/53). 12-foul at-bat fine. Impossible counts, outs and levels rejected. |
| Intentional walk (`scen2.py`) | Never suggested: bases empty, bases loaded (tie and up 1), R2R3 2 out tie 9th even vs a grade-5 hitter, R3 0 out walk-off spot. Conservative, nothing absurd. |
| In-game learning abuse (`abuse.py`) | Matchup caps hold (`succ\|SL` 2→400: +0.8 pt; `hard\|..` 2→400: no further change). Familiarity 1000 → FB −10 pts (capped by fam_cap). Damage and timing only blow up with out-of-range inputs (A7). Learner `serve()`: total ±1.0, step 0.15/game, clamp 1–5, damage ±1, seed n≤8 (read in learner.js:622-690, 698-775, not fuzzed). |
| Python vs JS (`parity.py`/`parity.js`) | 28 random states with landing, timing, tags, crowding, hitter grades, a shaken pitch and the last pitch: **0 mismatches, worst 5.4e-14** (`par_*.out`). The one gap is the API difference in A8. |

Minimal reproductions (run from `/home/claude/audit/adv`, `from h import *`):
```python
# A1: a slider that isn't landing gets aimed at the heart at 2-2
shares(ars(), Situation(2,2,0,E,level="college_d3"))                                    # SL middle 39%
shares(ars(), Situation(2,2,0,E,level="college_d3", landing_today={"Slider":(0,6.0,12)}))  # SL middle 54%
# A2: the pitch just shaken off comes back
shares(ars(), Situation(1,1,0,E), exclude=["Slider","Changeup","Fastball"])             # FB 48.8% (just shaken)
# A3: slider mashed low twice and high twice → slider middle is the top call at 0-2
shares(ars(), Situation(0,2,0,E, matchup={"hard|SL|down-away":2,"hard|SL|up-away":2}))  # SL middle 41%
```

## 4. What I could not verify
- Whether sizing H (A1) or changing the mash/shake rules would move the one-shot 2026 holdout. I don't know if the Step-6 scoring
  computes `wild_today` or shake states. I assume shake and matchup states aren't in pitch-level log loss, but I didn't check.
- A1's H=1 test is a Python-only monkeypatch. I didn't re-run the HG/E graded rows or the JS side with it. JS reads the same table key,
  so it should match, but I didn't run it.
- A5's mechanism (sit-game response vs the chase landing model) isn't isolated.
- I didn't fuzz the learner over many games (I read the code only). Sample sizes are small because of box load, so rarer breaks
  may exist. Only two JS parity seeds (28 states) were run.
