# v1.3 fits: situation effects and hitter traits, college (PROVISIONAL, Nov 21)

**PROVISIONAL.** These numbers come from the college data in hand, and they will move as the scrapes land. Nothing
here is graded or approved, and nothing is wired into either engine, the app or the simulator (`engine.py`, `app/` and
`simulate.py` are untouched). 2026 was never loaded: every season goes through `assert_not_heldout` / `fit_seasons`,
and the tests trip the guard in every path. Tuning uses seasons up to 2024; 2025 is for validation. D1 is the only
level eligible for a fit. D2 and D3 are run on the data that exists and are labeled **THIN**.

Buildout prompt Part 3, items 3 and 4 (plan 3.3, 3.4, 1.3, 1.4).

| | |
|---|---|
| Code | `hitter_data/fit_traits_data.py` (loader, hitter keys), `hitter_data/fit_situation.py`, `hitter_data/fit_traits.py` |
| Entry points (for `refit_all`) | `python -m hitter_data.fit_situation [--levels D1,D2,D3] [--boot 500]` (200 s) and `python -m hitter_data.fit_traits [--train 2022-2024] [--prefill 2025]` (70 s) |
| Outputs (not in git) | `C:/dev/pitchiq-data/fits/situation_effects.json`, `fits/traits_summary.json`, `fits/prefill/{D1,D2,D3}_2025.json`, logs in `fits/logs/` |
| Tests | `python3 tests_fit_traits.py`: 42 checks on a synthetic fixture with no real data. Wired into `scripts/test-app.sh` |

## 1. Hitter key

`level | season | team id | last name | first initial`
- **Team id:** `pa.bat_school` (the school id from update.py's `team_school` map) when it is set, else `n:` plus the
  printed team name, normalised.
- **Name:** `parse.name_key` gives (last name, first initial).
- **Bare names:** within a team-season, a bare last name is merged into the single initial seen with it. If two or more
  initials share that last name, the bare-name PAs are **ambiguous** and dropped from the hitter fits.

How often a key is ambiguous:

| Level | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|
| D1 | 14 of 322,106 PAs | 74 of 314,612 | 140 of 310,882 | 679 of 758,965 (0.09%, 5 name groups) |
| D2 | 0 | 0 | 18 of 135,323 | 208 of 161,879 (0.13%) |
| D3 | 18 | 0 | 12 | 0 |

Errors the key can't detect:
- Two players on one team with the same last name and initial.
- One school printed two ways (two keys). 26% of D1 2025 PAs are on `n:` team ids.
- `team_school` merging several schools into one id. One D1 2025 id has 235 games, so it is clearly several teams.
  Hitters with the same name there would merge, and that id's team strength is wrong.

D1 2025 has 9,121 keys. Teams with 20 or more games carry a median of 19 keys (90th percentile 30). 3,007 hitters
have at least 100 PAs.

## 2. Situation effects (plan 3.3)

**Model (per pitch).** The pitch outcome is the harness's `pitch_5way` (take-ball incl. HBP / take-strike / whiff /
foul / in play). It is a multinomial logit with per-count intercepts plus the effect terms. The intercepts alone equal
the per-count frequencies, which is the harness's `base_count` = `v1.2_recal` bar. So each gain is measured against
exactly the bar the pass rule uses.

The effects:
- **tto:** a quadratic in pitcher batters faced before the PA divided by 9, capped at 36. It is smooth, with no
  third-time step.
- **risp:** a runner on second or third.
- **late_close:** the engine / harness rule.
- **prev:** the previous pitch was a whiff or a foul, vs a take (ball or called strike). Separate terms with one strike
  and with two strikes.

**Data.**
- Fit: full games 2017-2024, with recency weight 0.5^((2024 - season) / 2).
- Validation: 2025 full games.
  - D1: 6,210 games, 1.87 M pitches.
  - D2: 736 games, 196 k pitches.
  - D3: 220 games, 63 k pitches.
- The count-only loss on D1 2025 is 1.4464, in line with the harness's 1.4470.

**The bar.** The plan sets no size: "ships only on validation gain". So the bar used here is the harness's proposed
pass rule: gain > 2 SE **and** gain ≥ 0.002 nats per pitch (`MIN_EFFECT`, proposed, Drew decides). The SE is the
largest of the harness's game, home-team and two-team bootstrap SEs (B = 500).

### 2.1 Validation gain on 2025 (nats per pitch; positive = better than count-only)

| Level | Effect | Gain alone (SE) | z | Drop-one gain (SE) | Given slot (SE) | Clears bar |
|---|---|---|---|---|---|---|
| D1 | tto | +0.00067 (0.00005) | +13.1 | +0.00068 (0.00005) | +0.00072 (0.00005) | no |
| D1 | risp | +0.00029 (0.00003) | +8.8 | +0.00029 (0.00003) | +0.00028 (0.00003) | no |
| D1 | late_close | +0.00004 (0.00002) | +1.7 | +0.00004 (0.00002) | +0.00004 (0.00002) | no |
| D1 | prev | +0.00086 (0.00006) | +13.8 | +0.00086 (0.00006) | +0.00084 (0.00006) | no |
| D1 | all four | +0.00187 (0.00009) | +19.9 | | | no |
| D2 (THIN) | tto | +0.00091 (0.00017) | +5.4 | +0.00090 (0.00017) | +0.00094 (0.00017) | no |
| D2 (THIN) | risp | +0.00031 (0.00008) | +3.7 | +0.00030 (0.00008) | +0.00028 (0.00008) | no |
| D2 (THIN) | late_close | -0.00001 (0.00003) | -0.4 | -0.00001 (0.00003) | -0.00001 (0.00003) | no |
| D2 (THIN) | prev | +0.00078 (0.00018) | +4.2 | +0.00079 (0.00018) | +0.00075 (0.00018) | no |
| D2 (THIN) | all four | +0.00198 (0.00021) | +9.3 | | | no |
| D3 (THIN) | tto | +0.00066 (0.00027) | +2.5 | +0.00065 (0.00026) | +0.00069 (0.00028) | no |
| D3 (THIN) | risp | +0.00002 (0.00008) | +0.3 | +0.00002 (0.00008) | +0.00000 (0.00007) | no |
| D3 (THIN) | late_close | +0.00008 (0.00009) | +0.8 | +0.00006 (0.00008) | +0.00007 (0.00009) | no |
| D3 (THIN) | prev | +0.00056 (0.00030) | +1.9 | +0.00057 (0.00030) | +0.00053 (0.00030) | no |
| D3 (THIN) | all four | +0.00131 (0.00042) | +3.1 | | | no |

- **No single effect clears the 0.002 bar at any level.** Taken together, the four come close on D1 (+0.0019) and
  D2 (+0.0020, SE 0.0002).
- **With the 2-SE rule alone,** these would pass: D1 tto, prev and risp; D2 tto, prev and risp; D3 tto.
  Late-and-close fails everywhere.
- The effects add up: the drop-one gains equal the gains alone.
- **"Given slot"** adds lineup slot (batter quality) to both sides of the comparison. Slot 1 bats at bf 0, 9, 18 and so
  on, so tto alone partly measures the slot. The tto gain holds, and grows slightly.
- **Per ball in play** (secondary: out / 1B / 2B / 3B / HR, with tto, risp and late_close), no effect reaches 2 SE.
  D1, all three together: +0.00016 (SE 0.00006).

### 2.2 Effect sizes (percentage points, averaged over the 2025 pitch mix, full model)

| Level | Effect | Swing | Called strike / take | Whiff / swing | Foul / swing | In play / swing |
|---|---|---|---|---|---|---|
| D1 | TTO bf 9 vs 0 (given slot) | +2.6 | -0.2 | -1.1 | -0.4 | +1.5 |
| D1 | TTO bf 18 vs 0 (given slot) | +4.1 | -0.3 | -2.0 | -0.7 | +2.7 |
| D1 | TTO bf 27 vs 0 (given slot) | +4.5 | -0.4 | -2.6 | -0.9 | +3.5 |
| D1 | RISP | +1.1 | -2.4 | +0.8 | -0.3 | -0.5 |
| D1 | late and close | +0.2 | +0.9 | +2.1 | -0.2 | -1.9 |
| D1 | after whiff vs take, 1 strike | +0.9 | -1.0 | +8.5 | -1.9 | -6.7 |
| D1 | after foul vs take, 1 strike | -1.5 | -1.5 | -3.1 | +2.9 | +0.2 |
| D1 | after whiff vs take, 2 strikes | -1.6 | +0.3 | +6.8 | -1.5 | -5.3 |
| D1 | after foul vs take, 2 strikes | -0.6 | -0.9 | -3.4 | +1.9 | +1.5 |
| D2 | TTO bf 18 vs 0 (given slot) | +5.0 | -0.2 | -2.1 | -0.4 | +2.5 |
| D2 | RISP | +1.4 | -2.0 | +0.3 | -0.0 | -0.3 |
| D2 | after whiff vs take, 1 strike | +0.5 | +0.9 | +9.1 | -0.9 | -8.2 |
| D3 | TTO bf 18 vs 0 (given slot) | +5.0 | -0.4 | -1.5 | +0.5 | +1.0 |

The full D2 / D3 tables are in `situation_effects.json`.

**Times through the order.** Each time through, hitters swing more and whiff less, with more contact. The curve is
concave: +2.6 points of swing by the second time through, +4.1 by the third, +4.5 by the fourth, and no step. Hits per
ball in play don't rise; D1 is −0.6 points at bf 18. So the effect is on swing and contact, not on the hard-contact
term v1.2 used to carry.

Confounds that the box score can't separate:
- Pitchers who go deep are better than average.
- Bullpen changes reset bf.

**RISP.** Hitters swing a little more, and the called-strike share of takes falls 2.4 points. That is at least partly
the pitcher's location from the stretch, not the hitter.

**Previous pitch.** The biggest single gain. After a whiff, the next swing whiffs 7-9 points more often; after a foul,
the next contact is more often a foul. **Most of this is probably the matchup persisting within the PA** (a whiff-prone
hitter, or a pitcher with good stuff), not the hitter reacting. A per-hitter contact trait (section 3) and pitcher
quality would absorb part of it. This needs testing jointly with the traits before anything is read as "in-at-bat
learning".

## 3. Hitter traits (plan 3.4)

**Method.**
- Per hitter-season, each part is a penalised one-parameter logit, offset by the level-season's per-count average.
- The talent SD (tau) is the covariance of odd-game and even-game estimates across hitters. The variance moment
  estimate agrees on D1: early 0.137 vs 0.132, contact 0.155 vs 0.144, power 0.141 vs 0.154.
- Split-half reliability uses odd vs even games in date order, Spearman-Brown corrected, over hitters with at least
  60 PAs.
- Each hitter is shrunk toward his slot × team prior by R = tau_res² / (tau_res² + SE²).
- Units are tau, so 1.0 = one hitter SD. These are the simulator's trait units.
- Training seasons: 2022-2024. Validation: 2025.

| Level | Part | Tau (logit per SD) | Placeholder (`TRAIT_SIZE`) | Split-half r → SB, train | SB, 2025 | 2024 shrunk → 2025 raw r (slope) | Prior R², train / 2025 |
|---|---|---|---|---|---|---|---|
| D1 | early (swing 0-0/1-0/0-1) | **0.36** | 0.35 | 0.63 → **0.77** | 0.76 | 0.63 (0.83) | 0.03 / 0.01 |
| D1 | ts_swing (2-strike swing) | **0.23** | 0.30 | 0.29 → 0.45 | 0.56 | 0.42 (0.83) | 0.01 / 0.00 |
| D1 | ts_foul (2-strike foul / contact) | **0.14** | 0.30 | 0.10 → 0.17 | 0.28 | 0.13 (0.75) | 0.02 / −0.02 |
| D1 | contact (whiff / swing) | **0.38** | 0.35 | 0.49 → **0.66** | 0.70 | 0.54 (0.77) | 0.06 / 0.08 |
| D1 | power (XBH / BIP) | **0.39** | 0.30 | 0.35 → 0.52 | 0.59 | 0.46 (0.77) | **0.31 / 0.26** |
| D1 | spray (pull share, hand known) | **0.24** | none (recorded only) | 0.40 → 0.57 | 0.61 | 0.35 (0.67) | 0.04 / −0.02 |
| D2 THIN | early / ts_swing / ts_foul | 0.32 / 0.26 / 0.18 | | 0.62 / 0.47 / 0.27 | 0.68 / 0.52 / 0.34 | 0.50 / 0.21 / 0.06 | |
| D2 THIN | contact / power / spray | 0.43 / 0.46 / 0.24 | | 0.63 / 0.61 / 0.53 | 0.66 / 0.67 / 0.61 | 0.48 / 0.56 / 0.52 | power 0.33 / 0.29 |
| D3 THIN | early / ts_swing / ts_foul | 0.51 / 0.27 / 0.19 | | 0.70 / 0.46 / 0.25 | 0.63 / 0.58 / 0.42 | 0.13 / 0.08 / 0.04 | |
| D3 THIN | contact / power / spray | 0.42 / 0.42 / 0.27 | | 0.54 / 0.52 / 0.59 | 0.59 / 0.59 / 0.50 | 0.38 / 0.52 / 0.41 | power 0.23 / 0.20 |

How to read it:
- The split-half SB is the reliability at the median hitter's sample. D1 medians: early 131 pitches, contact 118
  swings, power 71 balls in play, ts_foul 33 two-strike contacts.
- D3 swing traits have only ~200 hitters with letters in training.

Findings:
- **Early and contact sizes are about right** (0.36 and 0.38 vs the placeholders 0.35 and 0.35). **Power is a bit
  larger** (0.39 vs 0.30).
- **The two-strike pieces are smaller.** Swing is 0.23 and foul 0.14, vs 0.30 each.
- **The two-strike trait isn't one trait in the data.** The true-score correlation of 2-strike swing and 2-strike foul
  is **−0.22** (D1 and D2). The simulator moves both together with one `two_strike` trait. The composite written here
  is (z_swing + z_foul) / sqrt(2 + 2·max(rho, 0)), and the two parts are also written separately in the prefill.
  - **Recommendation:** split it into two traits, or keep two-strike swing only. The foul part has reliability 0.17-0.28.
- **Shrinkage is roughly calibrated.** The slopes of 2025 raw on 2024 shrunk are 0.77-0.83 on D1. Real talent
  change between seasons pushes them below 1, so the shrinkage is at worst slightly light.

### 3.1 Priors: lineup slot × team strength

**Team strength** is the team's runs scored per game in the level-season, z-scored over teams, times n / (n + 10) for
n games. So a thin team's adjustment is pulled toward 0. It is runs scored, with no opponent adjustment.

The prior is weighted least squares of each hitter's estimate on modal slot (1-9) plus team z × slot group (1-3 / 4-6 /
7-9). Logit offsets from the level average, D1, training seasons:

| Part | Slot 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | Team z slope (1-3 / 4-6 / 7-9) |
|---|---|---|---|---|---|---|---|---|---|---|
| early (swing) | −0.09 | +0.01 | +0.08 | +0.10 | +0.08 | +0.05 | +0.05 | +0.04 | −0.00 | −0.04 / −0.05 / −0.07 |
| whiff (minus contact) | −0.22 | −0.15 | −0.10 | −0.01 | −0.01 | −0.01 | +0.08 | +0.09 | +0.02 | −0.06 / −0.05 / −0.08 |
| power (XBH) | −0.03 | +0.06 | +0.19 | +0.15 | +0.01 | −0.04 | −0.06 | −0.15 | −0.28 | +0.24 / +0.25 / +0.18 |
| spray (pull) | −0.01 | +0.00 | +0.08 | −0.00 | +0.09 | +0.02 | −0.02 | −0.01 | −0.08 | +0.03 / +0.06 / +0.02 |

- **Only power has a useful prior:** R² 0.31 in training, 0.26 on 2025. One team-z unit is worth about +0.24 logits of
  XBH per ball in play.
- Leadoff hitters swing less early and whiff least. Better teams' hitters swing less early and whiff less.
- Elsewhere the prior explains ≤ 8%. For an unknown hitter, the slot × team prior is close to the level average except
  in power.
- The D2 / D3 tables are in `traits_summary.json`. D2 looks like D1, with larger team slopes (contact −0.12 to −0.17).

### 3.2 The six presets, sized from real hitters (D1, training hitter-seasons with ≥ 100 PAs)

- Each group is the top 15% of hitters on the named trait. Free swinger is the top 15% on (early − contact) / √2.
- The values are the group means of the shrunk traits, in hitter SDs. Posterior means are unbiased for a group selected
  on the data, so these estimate the group's true mean.
- 391 of 2,603 hitter-seasons per group.

| Preset | Rule | early | two_strike | contact | power | spray | Placeholder (simulate.py) |
|---|---|---|---|---|---|---|---|
| aggressive_early | top 15% early | **+1.38** | +0.26 | −0.09 | −0.04 | +0.03 | early +1.5 |
| patient | bottom 15% early | **−1.39** | −0.27 | +0.40 | −0.14 | +0.01 | early −1.5, two_strike −0.5 |
| power | top 15% power | +0.08 | −0.10 | −0.25 | **+1.13** | +0.24 | power +1.5, contact −1.0 |
| contact | top 15% contact | −0.29 | −0.05 | **+1.35** | −0.31 | −0.01 | contact +1.5, power −0.5 |
| free_swinger | top 15% early − contact | **+0.99** | +0.18 | **−0.93** | +0.13 | +0.08 | early +1.5, contact −1.0, power +0.5 |
| two_strike_battler | top 15% two_strike | +0.32 | **+0.97** | +0.03 | −0.12 | +0.06 | two_strike +1.5, contact +0.5 |

The D1 2025 groups give nearly the same vectors (aggressive early +1.21, power +1.13, contact +1.36, free swinger
+0.88 / −0.96).

How they compare with the placeholders:
- The **headline traits are close** for aggressive early, patient and contact (about 1.4 vs 1.5).
- **Power is smaller** (1.13). It carries **much less of a contact penalty** (−0.25 vs −1.0) and some pull (+0.24).
- **Free swinger is +1.0 / −0.9 / +0.1**, vs +1.5 / −1.0 / +0.5.
- **Two-strike battler is +0.97**, with no contact plus (+0.03 vs +0.5).
- **Contact hitters lose a little power** (−0.31 vs −0.5).

D2 (THIN, 121 per group) has the same shape:
- aggressive early +1.23;
- patient −1.19;
- power +1.24;
- contact +1.26;
- free swinger +0.91 / −0.92;
- battler +0.85.

D3 (THIN, 74 per group) is smaller everywhere (early ±0.8-1.0, contact +0.88), because its swing traits barely have
letters.

### 3.3 Prefill files

`C:/dev/pitchiq-data/fits/prefill/{level}_2025.json` holds `{meta, hitters: {hitter id: record}}`.
- The record has team, modal slot, season PAs, printed hand and team-strength z.
- For each trait it has `value`, `se` (posterior SD) and `prior`, all in hitter SDs, plus n, reliability, shrunk and raw
  logits.
- `two_strike` carries its two parts.
- `contact`'s logits are the whiff effect (negative = fewer whiffs); its `value` has the sign flipped.
- Each hitter's own 2023-2025 PAs under the same key are pooled, with weight 0.5^(age / 2).
- Priors come from his 2025 slot and team.
- 2025 is used here only as the hitter's own observations. Tau, priors and presets were tuned on 2022-2024.

| Level | Hitters | With ≥ 100 PAs in 2025 | Hand printed (spray estimated) |
|---|---|---|---|
| D1 | 9,049 | 3,007 | 2,654 |
| D2 (THIN) | 4,463 | | |
| D3 (THIN) | 5,517 | | |

Among D1 hitters with at least 100 PAs, the SD of the prefilled values is 0.81 (early), 0.85 (contact), 0.77 (power),
0.61 (two_strike) and 0.54 (spray). That is the expected ~sqrt(reliability).

## 4. Open issues

1. **The bar.** No situation effect reaches 0.002 nats per pitch. If Drew keeps `MIN_EFFECT` at 0.002, none ships.
   Under 2 SE alone, tto, prev and risp ship at D1. The decision belongs with the harness's open `MIN_EFFECT`
   question.
2. **The previous-pitch effect** is probably mostly matchup persistence. Refit it with per-hitter traits (and a pitcher
   term) before reading it as in-at-bat behaviour.
3. **TTO** is confounded with which pitchers go deep. Starter-only or within-pitcher fits would separate that.
4. **Two-strike trait.** The data says swing and foul aren't one trait (rho ≈ −0.2). The simulator's single
   `two_strike` should split, or drop the foul part. This is a `simulate.py` change for whoever owns it.
5. **Spray** needs the batter's hand: 29% of D1 2025 hitters in the prefill have it. Hand could be inferred from roster
   pages or switch / opposite-field patterns.
6. **Key quality.** Some `team_school` ids absorb several schools (one D1 id has 235 games in 2025). One school printed
   two ways splits its hitters. Transfers and level changes are not linked across seasons.
7. **D3** swing traits rest on a few hundred hitters with letters, and its stability numbers are near zero. D2 / D3
   priors and presets are THIN.
8. **The simulator constants weren't changed** (Part 5 placeholders). The fit sizes above are candidates:
   - early 0.36;
   - contact 0.38;
   - power 0.39;
   - two-strike swing 0.23;
   - two-strike foul 0.14;
   - the preset table.
