# v0.9 Step 2 report: race to two strikes, the guardrail and two-strike chases (no engine change)

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session; outputs are in `results/step2/`.

## 1. Item 2, Part A: the race to two strikes

There were 90 paired-seed games per engine: 30 per level, across 2-, 3- and 4-pitch starters, with no scouting. The script is `readthrough/race_check.py` and the output is `results/step2/race_check.json`.

| Level | Engine | Pitcher's count | Hitter's count | First-pitch strike | Early-ball | 1-1 → 1-2 | K | BB |
|---|---|---|---|---|---|---|---|---|
| HS | v0.7c | 33.9% | 29.2% | 48.9% | 0.0% | 47.4% | 18.8% | 17.2% |
| HS | v0.8 | 31.2% | 28.5% | 50.6% | 0.0% | 42.9% | 16.3% | 16.3% |
| D3 | v0.7c | 30.9% | 28.6% | 47.5% | 0.1% | 42.7% | 15.2% | 15.4% |
| D3 | v0.8 | 33.0% | 25.0% | 53.5% | 0.0% | 42.4% | 14.1% | 13.5% |
| D1 | v0.7c | 32.8% | 27.2% | 52.2% | 0.1% | 46.5% | 18.8% | 15.1% |
| D1 | v0.8 | 34.8% | 24.2% | 52.9% | 0.0% | 49.4% | 17.7% | 12.8% |

Walks and strikeouts are listed for context only, since walk rate is not a criterion. With 30 games per level, v0.8 walks fewer batters than v0.7c at every level. The old 8-game comparison (15.2% against 12.8%) pointed the other way.

**Decision rule** (from the plan): no engine change if v0.8's pitcher's-count rate is at most 1 point below v0.7c's, its first-pitch strike rate at most 2 points below, and its early-ball rate at most 3 points above.

- **D3 and D1 pass:** no engine change.
- **HS fails on the pitcher's-count rate:** 2.7 points below, against an allowance of 1. The standard error of that difference is about 2 points at roughly 1,140 PAs per engine, so the miss is within noise. Part B, the fix this would trigger, is on hold by your decision. HS is also where the guardrail removes the changeup completely (section 2), so the HS number should be re-measured after any guardrail change.
- **Three-ball counts:** no plate appearance that reached three balls opened with two off-zone calls in v0.8 (v0.7c: 0.3%).
- **Count values:** both engines order the counts the way MLB wOBA does (rank correlation 0.89, with one swap near 0-0, 1-0 and 2-1).
- **What steers v0.8's early-count calls:** the why lines at 0-0, 1-0, 0-1 and 1-1 are spread across the umpire read, the game situation, timing, the hitter's guess and eye level. No single term dominates. At 1-0, 14% of calls are "only call allowed", which is the guardrail again.

## 2. Item 10: the guardrail

The script is `readthrough/diag_guardrail.py` and the output is `results/step2/guardrail_diag.json`. The engine's root call was copied with the guardrail made variable. The copy reproduces v0.8 exactly on 40 golden cases. Only the root call applies the guardrail; the table solve does not.

| Guardrail | Changeup share, default starter (HS / D3 / D1) | Changeup in the mix (of 24 cells) | Fastball share | Scenarios passed |
|---|---|---|---|---|
| v0.8: every call within 0.010 runs × scale of the cheapest immediate call | 0.0 / 1.5 / 4.6% | 0 / 2 / 6 | 66–72% | 26/64 |
| **Setups only: blocks only calls that cost more now and win on future value (the spec's stated purpose)** | **7.6 / 6.3 / 8.4%** | **12 / 11 / 12** | 60–69% | **27/64** (fixes A7, H3; breaks G4) |
| 0.030 (v0.7c's pitch window), or off | 8.8 / 8.9 / 10.5% | 14 / 14 / 14 | 56–62% | 24/64 (fixes A7, H3; breaks B8, D5, F3, G4) |

For comparison, v0.7c used the changeup about 8.4–9.9% of the time. At 0.030 the guardrail removes nothing that the full-cost windows don't already remove, so it is the same as switching it off. The six rows with Not-acceptable calls (C7, E6, E8, F5, H1, I4) fail under every variant, so they belong to items 8, 9 and 5–6.

**Conclusion:** the guardrail is the cause of the missing changeup and the fastball-heavy mix. Applying it only to setups, which is what the spec says it is for, brings back most of the changeup and does best on the scenarios.

**Gate problem:** the planned gate says "changeup allowed in most counts". Even with no guardrail the changeup is in the mix in only 14 of 24 cells, because the never-pick windows remove it in the rest. The gate needs a number that can actually be met. A proposal is in the questions.

## 3. Item 7: why two-strike chases dropped

Scripts: `readthrough/diag_chase.py` and `readthrough/eye_chase_by_count.py`. Outputs: `results/step2/chase_diag.json` and `eye_chase_by_count.json`. Each v0.8 change was switched back one at a time, with the engine queried at 0-2 and 1-2 for D3 and HS, default and four-pitch starters, both sides.

| Setting | Chase share at 0-2 and 1-2 |
|---|---|
| v0.7c | 11.6% |
| v0.8 | 5.6% |
| v0.8, guardrail at any setting | 3.2–3.8% |
| v0.8 with v0.7c's hand-set sequencing bonus back on | 14.4% |
| v0.8 with the eye-level effect on chase swings at the spec's +0.25 (fit: −0.253) | 20.2% |
| v0.8 with that effect at 0 | 12.3% |
| v0.8 with both eye-level effects at 0 | 14.4% |
| Every other v0.8 change, one at a time | 4.6–7.0% |

The drop comes from the Statcast-fitted eye-level terms, which replaced v0.7c's hand-set sequencing bonus. The fit says MLB hitters chase less when a pitch's height is far from what they've been seeing.

The Statcast pull was downloaded again, 88 days across 2024 and 2025, and the chase fit was rerun with the same controls and ship rule, split by count. It reproduces the shipped value exactly.

| Pitches outside the zone | Effect on chase swings | 95% interval | Ship rule |
|---|---|---|---|
| All counts (as shipped) | −0.253 | −0.345 to −0.160 | passes |
| Two strikes | **−0.418** | −0.595 to −0.242 | passes |
| Fewer than two strikes | −0.173 | −0.282 to −0.064 | passes |
| Two strikes, below the zone | −0.583 | −0.837 to −0.330 | gain under 2 SD |
| Two strikes, above the zone | −0.309 | −0.613 to −0.006 | gain under 2 SD |

**Conclusion:** the penalty is stronger with two strikes, not weaker. The MLB data supports v0.8 calling fewer two-strike chases, so an item 7 fix that adds chases back would go against the evidence. The caveat is that this is MLB hitters; no available data tests high school or D3 hitters.

## Not run

Any engine change. Anything on a real iPad. Item 2 Part B (on hold). Rerunning the full Step 1 read-through on a guardrail variant; that comes when a variant is built behind its flag.
