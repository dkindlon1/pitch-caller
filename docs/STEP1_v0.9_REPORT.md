# v0.9 Step 1 report: read-through tool and baseline (no engine change)

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session; outputs are in `results/` as listed.

## Gate

| Gate item | Status |
|---|---|
| Tool tests pass | `readthrough/test_read.py` 15/15; `readthrough/test_scenarios.py` 11/11 |
| You approve the acceptable-call lists | Done Nov 5: 64 rows frozen, sha256 `8c2721624d11…` (fa57d07) |
| Baseline read of v0.7c and v0.8 delivered | Scenario grading (`docs/STEP1_v0.9_SCENARIO_BASELINE.md`), 72 paired games, the four baseline reports and a graded read (below) |
| The simulator change leaves every call unchanged | Seed 11 at D3 replayed under v0.7c and v0.8: every original log column identical |

**What the tool covers that the plan asked for, and what it doesn't:**

- **Steal-threat check:** the simulator has no steal-threat input, so this check can't run on games. Scenario D6 covers it.
- **JS parity:** the planned "JavaScript gives the same calls on 100 plate appearances" test was not run separately. The logs don't store full engine state. The v0.8 golden test (500 cases, JS within 3.7e-13) and the 150-case parity check cover the same engine code.

## The games

72 games: 3 levels (HS, D3, D1) × 3 starters (2, 3 and 4 pitches) × 4 seeds × 2 engines. Paired seeds, so both engines face the same hidden lineups. There is no scouting: the engine learns each hitter only from the game's own log. That gave 5,769 pitches for v0.7c and 5,842 for v0.8. The logs are in `runs/readthrough/`, which is gitignored and can be regenerated with `readthrough/run_games.py`. Summaries and review packs are in `results/readthrough/`.

## Automatic checks (your Nov 5 rules)

| | v0.7c | v0.8 |
|---|---|---|
| Hard-rule violations (chase at 3-0/3-1, chase at 2-2, re-called shake-off) | 7 (4 chases at 2-2 from before that rule existed; 3 re-called shake-offs) | **0** |
| First two calls of a PA off the zone | 1 | 0 |
| Chase at 3-2, bases loaded | 0 | 0 |
| Same pitch, same spot after a non-whiff | 754 (13.1%) | 955 (16.3%) |
| Two-strike calls to the middle (reported) | 37% | 47% |
| Elevated before two strikes, runner on 3rd, < 2 outs (reported) | 8% | 15% |
| Low breaking ball that isn't landing, runner on 3rd, < 2 outs (reported) | 17 | 7 |

In v0.8, 763 of the 955 repeats are to the middle, mostly right after a ball. Under your rules that's allowed, so the flag mostly measures the middle preference. The 192 repeats to other spots are the ones worth a coach's eye.

## Graded read (`results/readthrough/read_grades.md`)

Each call was graded on the game state, the previous pitches, the engine's top three calls and its why line, under your Nov 5 rules.

| Random sample | Calls | Wrong | Questionable |
|---|---|---|---|
| v0.8 (50 high-stakes, 50 other) | 100 | 2 | 6 |
| v0.7c (30 high-stakes, 30 other) | 60 | 1 | 7 |

All 8 flagged v0.7c calls were also read. 7 are wrong under your current rules: 4 chases at 2-2 and 3 re-called shake-offs. The eighth, the early-waste flag, followed a first-pitch chase that got a whiff; I graded it fine, which makes it a weak flag.

**What the wrong and questionable calls have in common:**

- **Pitches that aren't landing (both wrong v0.8 calls).** A 2-2 slider landing 3 of 13, and a 1-0 slider landing 3 of 12. Three of the six questionable v0.8 calls are also landing problems. This matches the scenario failures E6, E8 and C7, which are new item 9.
- **The rest are things your rules call Arguable.** Repeating after a called strike, an elevated fastball with a runner on third before two strikes, and a slider middle again right after a foul.

The samples are small, and half of each is drawn from high-stakes spots. Treat these as rough signals, not rates per 100 pitches. A wider read (the full packs) and a fresh-context reviewer are available if you want them.

## Baseline reports (`results/readthrough/baseline_reports.md`)

### 1. Usage by count (from the games)

| | v0.7c | v0.8 | MLB reference |
|---|---|---|---|
| First-pitch fastball | 55.6% | 65.6% | about 58% |
| First-pitch strike | 50.7% | 55.1% | just under 62% |
| Reach a pitcher's count | 35.1% | 35.8% | 44.9% to 51.0% |
| Reach a hitter's count | 26.0% | 24.6% | 16.8% to 20.0% |
| 1-1 goes to 1-2 | 48.7% | 46.3% | — |

v0.8 is a little better than v0.7c on early strikes and count paths. Both are far from MLB, which is expected for amateur command. In 0-2 and 1-2 counts, v0.8 calls a chase on 16% and 5% of pitches (v0.7c: 23% and 13%).

### 2. Arsenal balance (engine queried in every count, both sides)

The main finding of Step 1: **v0.8's guardrail rules most of the arsenal out of most counts.** It allows only calls within 0.010 runs × the level scale of the cheapest immediate call, so the third and fourth pitches rarely survive it.

| Default starter (FB, SL, CH) | v0.7c changeup | v0.8 changeup | v0.8 slider |
|---|---|---|---|
| High school | 8.7% of calls, allowed in 24/24 cells | 0.0%, allowed in 0/24 | allowed in 14/24 |
| D3 | 8.4%, 24/24 | 1.5%, 2/24 | 14/24 |
| D1 | 9.9%, 24/24 | 4.6%, 6/24 | 14/24 |

As a result, the fastball takes 66–72% of calls in every 3- and 4-pitch setup in v0.8, all flagged over-called. In the games, v0.8 had exactly one allowed call (almost always fastball middle) on 39–49% of pitches at 2-0, 3-0 and 3-1. v0.7c's rate was 16–28%. You decided not to force extra mixing in hitter's counts, so this is reported, not counted as a failure.

This also bears on the plan:

- **Item 7 (two-strike chases):** the guardrail is the first lead to test for why chases fell.
- **Item 2, Part B:** its planned fix tightens this same tolerance in early counts, which would narrow the mix further. It should not be built without a look at this first.

### 3. Predictability (from the games)

A predictor that sees only what a hitter sees beats always-guess-fastball by 3.7 points overall for v0.8 (v0.7c: 4.5). It is most predictable with two strikes: +13 to +16 points at 0-2, 1-2 and 2-2 for both engines. Within a plate appearance, v0.8 throws a fastball after a fastball 72% of the time (v0.7c: 62%); the within-PA correlation is +0.24. That's reported, not gated (decision 7).

### 4. Platoon audit (engine queried)

The direction is right for 3- and 4-pitch starters, with more changeups to opposite-side hitters and more breaking balls to same-side hitters. But the gaps are only 1–3 points. With a two-pitch starter, neither engine changes its mix by hitter side at all. In v0.8 the changeup share is so small (0–5%) that the opposite-side changeup barely exists.

## What Step 1 changes in the plan (for you to decide)

1. **Item 2, Part B (`early_delta`).** It would tighten the guardrail the baseline shows is already too tight. Recommendation: hold Part B until the guardrail is understood.
2. **The guardrail itself.** It is a candidate root cause for the fastball-heavy mix, the missing changeup, the thin platoon split, the single-call hitter's counts and possibly the two-strike chase drop (item 7). The item 7 investigation in Step 2 starts there.

## Not run

Anything on a real iPad. The fresh-context reviewer (not authorized yet). A JS replay of game calls (see the Gate section).
