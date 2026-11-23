# v1.3 fits: situation effects and hitter traits, college and HS / travel (PROVISIONAL, Nov 21)

**PROVISIONAL.** These numbers come from the college data in hand, and they will move as the scrapes land. Nothing
here is graded or approved, and nothing is wired into either engine, the app or the simulator (`engine.py`, `app/` and
`simulate.py` are untouched). 2026 was never loaded: every season goes through `assert_not_heldout` / `fit_seasons`,
and the tests trip the guard in every path. Tuning uses seasons up to 2024; 2025 is for validation. D1 is the only
level eligible for a fit. D2 and D3 are run on the data that exists and are labeled **THIN**. HS / travel (Perfect
Game, one pooled level `hs`) is in section 5.

Buildout prompt Part 3, items 3 and 4 (plan 3.3, 3.4, 1.3, 1.4).

| | |
|---|---|
| Code | `hitter_data/fit_traits_data.py` (loader, hitter keys), `hitter_data/fit_traits_hs.py` (HS loader), `hitter_data/fit_situation.py`, `hitter_data/fit_traits.py` |
| Entry points (for `refit_all`; the default levels are D1,D2,D3,hs) | `python -m hitter_data.fit_situation --boot 500` (240 s) and `python -m hitter_data.fit_traits` (110 s). One level: `--levels hs`. The HS database is `--hs-db`, default `C:/dev/pitchiq-data/hs/hs.sqlite3` |
| Outputs (not in git) | `C:/dev/pitchiq-data/fits/situation_effects.json` (levels D1, D2, D3, hs, hs_full_length), `fits/traits_summary.json`, `fits/prefill/{D1,D2,D3,hs}_2025.json`, logs in `fits/logs/` |
| Tests | `python3 tests_fit_traits.py`: 58 checks on synthetic college and HS fixtures with no real data. Wired into `scripts/test-app.sh` |

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
   **Done (ruling 11, Nov 22, `feat/hitter-v13-core`):** `simulate.py` and `app/worlds.js` now have `two_strike_swing`
   (size 0.23) and `two_strike_foul` (size 0.14) in place of `two_strike`. Traits are set by preset or `HITTERS`, never
   drawn, so the fitted rho isn't imposed; the presets carry the real groups' joint values. Preset two-strike parts (D1
   groups under the section 3.2 rules, split on the D1 2025 prefill, whose composites match section 3.2):
   - patient: swing −0.25, foul −0.11 (was two_strike −0.5);
   - two_strike_battler: swing +0.93, foul +0.44 (was two_strike +1.5).
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
   The two two-strike sizes and the presets' two-strike parts are now in the simulator (item 4); the rest are still
   placeholders.

## 5. HS / travel (Perfect Game), level `hs` (PROVISIONAL)

HS and travel are one pooled model (plan section 11), and bat type is not read.

**Data.**
- Source: `C:/dev/pitchiq-data/hs/hs.sqlite3`, opened read-only.
- Seasons: 2022-2025 are used (7,462 games). 2026 is never loaded (`load_hs_season` calls the guard).
- Split: tune on 2022-2024, validate on 2025.

**Key.** `hs | season | Perfect Game player id` (`batter_id`).
- One key per player per season, across teams. The same id links seasons.
- 30-47 PAs per season have no id: 0.03%. No name ambiguity is possible.
- Team id is the printed team name. PG names are event-specific ("... 17U ..."), so team strength is per event team.
- **Thin per player.** A player-season is a few tournaments: median 6 PAs, 90th percentile ~15, 99th ~32. Only
  2,100-2,900 players a season reach 12 PAs.
  - The trait floors are lower here: 12 PAs for tau and the prior, 25 for presets, and 3 opportunities per half for
    split-half.

### 5.1 Situation effects (2025 validation, nats per pitch, same bar)

The data: fit 2022-2024 full-log games (recency-weighted), validated on 2025 (1,921 games, 405 k pitches). Late and
close uses 7 scheduled innings for every game.

| Set | Effect | Gain alone (SE) | z | Given slot (SE) | Clears bar |
|---|---|---|---|---|---|
| hs, all games | tto | +0.00067 (0.00011) | +6.3 | +0.00072 (0.00011) | no |
| hs, all games | risp | +0.00007 (0.00004) | +1.7 | +0.00008 (0.00004) | no |
| hs, all games | late_close | +0.00002 (0.00003) | +0.8 | +0.00003 (0.00003) | no |
| hs, all games | prev | +0.00129 (0.00014) | +9.1 | +0.00125 (0.00014) | no |
| hs, all games | **all four** | **+0.00203 (0.00019)** | +10.7 | | **yes, as a group (just)** |
| hs, reached the 7th only | tto / risp / late_close / prev | +0.00070 / +0.00006 / +0.00001 / +0.00130 | | | no |
| hs, reached the 7th only | all four | +0.00203 (0.00028) | +7.3 | | yes, as a group (just) |

- **No single effect clears 0.002.** The four together reach it by a hair (+0.00203), on all games and on full-length
  games alike.
- With the 2-SE rule alone, tto and prev pass; risp and late-and-close don't.
- The previous-pitch effect is larger here than in college (+0.0013 vs +0.0009). It carries the same caveat: it is
  probably mostly the matchup persisting within the PA.

**Tournament-format confound.**
- About half of pool games stop before the 7th on the time limit or run rule. In those games "late" is never reached,
  and the half-innings near the end are cut short.
- Rerun on games that reached the 7th only (`hs_full_length`: 847 validation games): the pitch-level gains are
  unchanged (tto +0.00070, prev +0.00130, late-and-close +0.00001). So the early endings don't create or hide these
  effects.
- Two things do differ:
  - **The count-only loss** is 1.4625 on full-length games vs 1.4440 on all. Games that reach the 7th are a different
    mix: closer games, likely better teams.
  - **RISP per ball in play** shows +2.5 points of hits on all games, +0.5 points beyond 2 SE (+0.00049 nats per ball in
    play). On full-length games it is only +0.3 points and not significant. That points at blowout / run-rule games
    (weak defense with runners on) or base-state reconstruction in them, not at the hitter.

Effect sizes, all games (percentage points, full model, 2025 mix):

| Effect | Swing | Called strike / take | Whiff / swing | Foul / swing | In play / swing |
|---|---|---|---|---|---|
| TTO bf 9 vs 0 (given slot) | +2.6 | +0.2 | -0.8 | -1.0 | +1.8 |
| TTO bf 18 vs 0 (given slot) | +4.5 | +0.1 | -2.9 | -1.3 | +4.2 |
| TTO bf 27 vs 0 (given slot) | +5.8 | -0.2 | -6.2 | -1.1 | +7.3 |
| RISP | +0.4 | -1.5 | -0.8 | +0.4 | +0.4 |
| late and close | +0.4 | +1.1 | +0.3 | +0.1 | -0.4 |
| after whiff vs take, 1 strike | +0.9 | +0.6 | +9.3 | -1.9 | -7.4 |
| after foul vs take, 1 strike | -2.5 | -2.0 | -3.6 | +2.5 | +1.1 |
| after whiff vs take, 2 strikes | +0.6 | +0.7 | +9.9 | -2.1 | -7.8 |
| after foul vs take, 2 strikes | -0.5 | -2.3 | -3.6 | +1.5 | +2.1 |

The times-through-the-order curve is steeper than in college: whiff per swing falls 6 points by the fourth time
through. It is smooth by construction. Starters going deep in HS games are a stronger selection, which is the same
confound as college.

### 5.2 Traits (tune 2022-2024, validate 2025)

**Spray** comes from `hs_pa.bip_dir`, which `hs_parse` reads from play_text ("to LF / CF / RF", infield positions
mapped). It has three values, L / C / R; there is no LC / RC. Hand is printed for 95% of batters, so 13,481 of 15,180
prefilled players get a spray estimate.

| Part | Tau (logit per SD) | Split-half r → SB, train (median opportunities) | SB, 2025 | Opportunities for R 0.5 / 0.7 | 2024 → 2025 r (slope), same id | Same, team changed (n) |
|---|---|---|---|---|---|---|
| early | 0.29 | 0.22 → 0.37 (29) | 0.34 | 52 / 122 | 0.29 (0.75) | 0.30 (0.77), 464 of 593 |
| ts_swing | 0.25 | 0.11 → 0.20 (15) | 0.16 | 64 / 150 | 0.14 (0.69) | 0.14 (0.68) |
| ts_foul | 0.13 | 0.02 → 0.05 (8) | 0.08 | 254 / 592 | 0.08 (1.13) | 0.11 |
| contact | 0.39 | 0.22 → 0.36 (25) | 0.39 | 38 / 90 | 0.31 (0.78) | 0.33 (0.78) |
| power | 0.28 | 0.10 → 0.18 (10) | 0.08 | 159 / 371 | 0.12 (0.68) | 0.15 (0.82) |
| spray | 0.22 | 0.07 → 0.12 (10) | 0.18 | 87 / 203 | 0.10 (1.02) | 0.09 (0.94) |

**Sizes.**
- The talent spread is close to college: contact 0.39 (D1 0.38), early 0.29 (D1 0.36), power 0.28 (D1 0.39).
- **Reliability is low because the samples are tiny.**
  - Early and contact reach R 0.5 at about 40-50 opportunities: roughly 30-35 PAs, about two big tournaments.
  - Power needs ~160 balls in play, which almost no player-season has. The two-strike foul part is effectively
    unmeasurable (R 0.5 at ~250 two-strike contacts).
- The two-strike swing / foul true-score correlation is +0.14 (college −0.22). Both parts are noisy.

**Across seasons and teams.**
- 593 players have 12 or more PAs in both 2024 and 2025. 464 of them changed (modal) team: PG team names change with
  age group and event.
- Stability is the same for players who changed team as for all: early r 0.30, contact 0.33. So the id link works, and
  the traits travel with the player, not the team.
- Slopes of 0.7-0.8 on shrunk values mean the shrinkage is about right given a year of development.

**Prior** (slot × team strength + age group).
- Team strength is runs per game for the event team, z-scored within the season and shrunk by n / (n + 10).
- The prior adds an age-group offset (15U as the reference; 16U-18U, Open, Underclass, Varsity, Academies).
- It explains little: R² ≤ 0.05 for early and contact on train, about 0 on 2025, and too little true variance to say for
  the others.
- What it does show:
  - Leadoff to 9th, whiff logit −0.37 → −0.10: top-of-order hitters whiff less.
  - Power from slot 3 to 9: +0.45 → +0.18.
  - Team z: whiff −0.20 to −0.23 and power +0.30 to +0.35 per SD of team runs. These team slopes are bigger than
    college's, as expected with wider talent gaps between travel teams.
  - Older groups and Academies whiff more relative to 15U (+0.14 to +0.34). That is probably better pitching at those
    events.

**Presets** (players with 25 or more PAs in a training season, top 15%: 169 of 1,122 per group; shrunk group means in
hitter SDs):

| Preset | early | two_strike | contact | power | spray | 2025 groups (headline) | Placeholder |
|---|---|---|---|---|---|---|---|
| aggressive_early | **+0.91** | +0.03 | +0.01 | +0.01 | +0.06 | early +0.88 | early +1.5 |
| patient | **−1.15** | −0.33 | +0.47 | +0.31 | −0.01 | early −1.09 | early −1.5, two_strike −0.5 |
| power | −0.24 | −0.33 | +0.44 | **+1.04** | −0.03 | power +1.02 | power +1.5, contact −1.0 |
| contact | −0.37 | −0.36 | **+1.21** | +0.33 | −0.04 | contact +1.19 | contact +1.5, power −0.5 |
| free_swinger | **+0.64** | +0.10 | **−0.66** | −0.04 | +0.05 | +0.57 / −0.65 | early +1.5, contact −1.0, power +0.5 |
| two_strike_battler | +0.10 | **+0.57** | +0.00 | −0.13 | +0.07 | two_strike +0.56 | two_strike +1.5, contact +0.5 |

**How to read the presets.**
- These are the true means of groups we can pick out from 25-60 PAs. With reliability 0.2-0.4, the group picked as
  "top 15%" is truly only about 0.6-1.2 SD out. That is why every preset is smaller than college's.
- A coach-set preset describes a player the coach *knows* is that type, so the college sizes (or the placeholder ±1.5)
  are the better reference for what a real type is. The HS numbers say how far data alone can classify.
- Unlike college:
  - HS power hitters make **more** contact (+0.44), not less.
  - Patient hitters have some power (+0.31).
  - At this level, the better hitters are better at everything.

**Prefill:** `C:/dev/pitchiq-data/fits/prefill/hs_2025.json`.
- Keyed by `hs|2025|<PG player id>`; each record also carries `pg_player_id` and `age_group`.
- Each player's 2023-2025 PAs under the same id are pooled, on any team, with weight 0.5^(age / 2).
- 15,180 players: 489 with 25 or more PAs in 2025, and 13,481 with a printed hand.

### 5.3 HS open issues
- **Coverage.** Atlanta 15U-17U are 20-40% captured, so per-player samples will grow as the pending ~11,800 finals
  land. The reliabilities above are the ones most likely to rise.
- **The group gain.** The all-four group gain (+0.00203) sits right at the bar and could fall either side as data lands.
  Shipping "as a group" is not a rule in the plan; Drew decides.
- **RISP in play.** The RISP effect on balls in play exists only when games stopped early are included. Treat it as a
  format / defense artifact unless it survives with full data.
- **Team strength** is per event team. A season-level club rating (linking a club's teams across events) would be
  steadier.
- **Velocity and pitch type** are not used in these two fits. They belong to the count layer (Part 3.1 HS extra), which
  another agent owns.
