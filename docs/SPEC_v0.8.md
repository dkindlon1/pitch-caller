# Pitch Caller v0.8: Math Spec (build version)

Status (2026-11-04): build-ready after five independent reviews against the code (the second through fourth fixed 4
blockers, 13 majors and 23 minors; the final go/no-go found five one-line items, all applied). Nothing in it is
implemented or tested yet. Every term has a definition, a starting value, a switch, an input source and an acceptance
test. Where a number is a guess it says so.

## 0. Ground rules

- **Zone bands.** "Off zone" always means the off and noncomp landing bands; "in zone" means heart and edge.
- **Units.** Cost C is runs charged to the pitcher (lower is better), or a run-equivalent when the win objective is on
  (section 7.2). Logit shifts are added to the engine's existing log-odds for: swing S, called strike C_s, whiff on a
  swing W, foul F, hard contact on contact H.
- **Symbols renamed** to avoid collisions: θ = the logged timing read (today's `timing`), τ_tun = tunnel score,
  v̂ = look speed, ŷ = look height, σ = hitter's sit mix, π = engine's call mix.
- **Determinism.** Every iteration starts from a fixed point (uniform mixes) and runs a fixed or tolerance-stopped loop,
  so Python and JavaScript stay identical (parity test).
- **Switches, not "β = 0".** Several changes replace v0.7c code rather than add a weight. Each lives behind a named
  compatibility flag (section 1). With every flag in its v0.7c position, the engine must reproduce v0.7c exactly.

## 1. Compatibility flags

| Flag | v0.7c position | v0.8 position | What it switches |
| --- | --- | --- | --- |
| `pairing_v07` | on | off | Old pairing term T vs the new pair terms (section 4) |
| `bf_term_v07` | on | off | 0.012 per batter faced vs familiarity (section 5) |
| `ev_full` | on (±3 mph) | off (±1.5 mph, timing only) | Perceived-speed adjustment |
| `expect_v07` | on | off | Old pitch-type expectation E (λ = 0.6 blend) vs the sit game (section 2) |
| `look_state` | off | on | Hitter look in the value solve (section 6) |
| `timing_B` | off | on | Timing surprise term (section 3) |
| `objective_win` | off | on | Win-probability blend late and close (section 7.2) |
| `inplay_typed` | off | on | Batted-ball types and their tables (section 7.3) |
| `running_game` | off | on | Steal cost (section 7.4) |
| `umpire_learn` | off | on | Count zone and today's umpire (section 7.5) |
| `fatigue_v08` | off | on | Fatigue on speed and stuff (section 8.1) |
| `hitter_grades` | off | on | Scouting grades (section 8.2) |
| `hs_pitch_cost` | off | on (HS, travel) | Pitch-cap cost (section 7.6) |
| `temp_unc` | off | on | Uncertainty floor on temperature (section 6.6) |

**Look tracking.** The look (v̂, ŷ, 2.6) is updated after every pitch whenever `pairing_v07` is off, or `timing_B`
or `look_state` is on, because the timing and eye-level terms use it. `look_state` only decides whether the look is also a state in the value
solve (off: future counts are valued at the plate appearance's starting look h₀, so the cost equals the myopic cost
c_my of 6.4).

**Golden test (gates every step):** with all flags at v0.7c, `call_mixed` distributions on 500 fixed random situations
(seeded) equal the committed v0.7c outputs to 1e-12, in Python and JavaScript; tests.py 19/19.

## 2. The hitter's expectation: one model

The hitter has one expectation per pitch, built from two parts: a **sit** (what he's guessing from our tendencies;
strategic) and a **look** (what his eyes and timing are tuned to from recent pitches; perceptual). The sit enters as
recognition terms; the look enters through timing and eye level (section 3, 4). Section 3.4 caps their combined effect.

### 2.1 Sit options

A pure sit is k = (i, j): pitch i from the arsenal (K_t = number of pitches, as today) and height j ∈ {up, down}, so
K = 2·K_t options (6 for a three-pitch arsenal; 4 more height options once side is enabled, not in v0.8).

Height membership of a target q:

| Target | up | down |
| --- | --- | --- |
| up-in, up-away, fastball chase (3.8 ft) | 1 | 0 |
| down-in, down-away, off-speed chase (1.2 ft) | 0 | 1 |
| middle | 0.5 | 0.5 |

### 2.2 Effect of a pure sit on a call a = (p, q)

```latex
m_t = \mathbb{1}[p = i] - \tfrac{1}{K_t}, \qquad m_h = \text{member}(q, j) - \tfrac{1}{2}
```

```latex
\Delta\text{logit}\,W = -h_L\,(1.5\,m_t + 0.75\,m_h), \quad \Delta\text{logit}\,H = +h_L\,(1.0\,m_t + 0.5\,m_h), \quad \Delta\text{logit}\,S = +h_L\,(0.3\,m_t + 0.15\,m_h)
```

h_L is the level's hitter-read weight (HS 0.5, D3 0.8, D1/college/MLB 1.0). The type weights 1.5 and 1.0 are v0.7c's,
so the type effect keeps today's size: under a mix σ, E[m_t] = σ_t(p) − 1/K_t, which is today's (E − neutral) when σ_t
equals today's E. Location weights are half the type weights and the swing weights are new (guesses; section 10 lists
how they are checked). With the sit on, the cost of call a under pure sit k is C(a | k).

### 2.3 The sit game at one count

Matrix M[a][k] = C(a | k) for allowed calls a (coach rules and candidates as today) and the K sit options, computed
once per count per value-solve sweep. Under a pure sit k the hitter is timed for that sit's pitch, so inside M the
timing speed is ṽ_k = (1 − α)·v̂ + α·v_{i(k)} (2.6); M therefore depends on neither π nor σ, and averaging over σ
gives back the blended ṽ. Then:

- Engine: π = Φ(Mσ), where Φ is today's two-stage operator (pitch-type softmax over each pitch's best cost with the
  never-pick window, then location softmax with LOC_WINDOW), at temperature T(b,k) from section 6.6.
- Hitter's belief of our mix includes what a dugout saw today (today's usage blend, k = 4):
  π̃(a) = (4·π(a) + usage_a) / (4 + n_usage), where usage_a counts calls a = (pitch, target) thrown in this count
  today by this pitcher. This is a new Situation field, `usage_by_call`; v0.7c's `usage_this_count` (keyed by pitch
  name) stays as it is so the golden test holds.
- The hitter uses the same temperature T(b,k) as the engine (section 6.6).
- Hitter:

```latex
\sigma(k) = \frac{\exp\big(\bar C(\tilde\pi,k)/T + b_h(k)\big)}{\sum_{j}\exp\big(\bar C(\tilde\pi,j)/T + b_h(j)\big)}, \qquad \bar C(\tilde\pi,k) = \sum_a \tilde\pi(a)\,M[a][k]
```

- b_h(k) is the hitter's persistent lean (2.5). It is the only other input to σ; there are no separate multipliers.
- Solve from uniform π, σ: π_{t+1} = (1 − w_t)π_t + w_t Φ(Mσ_t), σ_{t+1} = (1 − w_t)σ_t + w_t σ*(π̃_{t+1}),
  with w_t = 0.5 for t < 20, then w_t = 1/(t − 18) (averaging) up to t = 60.
- Residual = max( ‖π − Φ(Mσ)‖∞, ‖σ − σ*(π̃)‖∞ ), the distance from a fixed point (not the step size). Stop when the
  residual < 1e-3 or at t = 60; log the final residual and use the last iterate.
- Exploitability at the count (runs a hitter gains by sitting on the single best option):

```latex
X = \max_k \sum_a \pi(a)\,M[a][k] - \sum_a\sum_k \pi(a)\,\sigma(k)\,M[a][k]
```

Acceptance: residual < 1e-3 in ≥ 99% of 3,000 random situations; deterministic (same inputs, same output).

### 2.4 The sit inside the value solve (linearized)

Inside the planning solve (section 6) the engine uses the count's σ from 2.3 and applies the **expected** sit shift,
E_σ[m_t] and E_σ[m_h], once per call, instead of evaluating all K pure sits. At the root (the pitch being called now)
it uses the exact Σ_k σ(k) C(a | k). Acceptance: mean |exact − linearized| ≤ 0.003 runs over 3,000 random situations
(report the max).

### 2.5 The hitter's persistent lean b_h

```latex
b_h(k) = \eta\, s_{h,c(i)} + e_h(k)
```

- s_{h,c} is the existing damage read for class c (FB or OS), already shrunk by n/(n + 10). η = 0 by default
  (flag-able to 0.25): the "hitters look for what they hit" idea is anecdotal and overlaps the damage term.
- e_h(k) is in-at-bat evidence. The only logged read that signals a sit is a whiff marked "fooled": it adds
  log 1.3 to every sit option whose pitch is not in the fooled pitch's class. e_h resets each plate appearance.

### 2.6 The look

The look is (v̂, ŷ): the speed (mph) and height (ft) the hitter is tuned to. Side is not modeled in v0.8 except the
coach's crowding flag (2.8).

- Start of each plate appearance: v̂₀ = Σ_i σ_t^{0-0}(i)·v_i (each pitch's own speed, weighted by the 0-0 sit mix),
  using the previous value-solve sweep's σ at 0-0; on the first sweep, σ is the v0.7c count prior (fastball share 0.5
  at 0-0, split evenly among pitches of each class). ŷ₀ = 2.5 ft.
- After each pitch (p, q): v̂ ← λ v̂ + (1 − λ) v_p(q), ŷ ← λ ŷ + (1 − λ) y_q, with λ = 0.6. v_p(q) is perceived
  speed: mph + 0.5·EV_ADJ[q] (±1.5 mph). y_q is the target height: up 3.2, middle 2.5, down 1.8, fastball chase 3.8,
  off-speed chase 1.2 ft. If an actual location is logged, its height replaces y_q.
- Speed he's timed for, blending the look with the count's sit:

```latex
\tilde v = (1-\alpha)\,\hat v + \alpha \sum_i \sigma_t(i \mid b,k)\, v_i, \qquad \alpha = 0.4
```

σ_t is the sit mix summed over heights.

### 2.7 Look bins for the value solve

Speed is measured relative to his main fastball, ρ_v = v̂ / v_FB (v_FB = speed of his fastest FB-kind pitch). Bin
centers: ρ_v ∈ {1.00, 0.94, 0.88}; height centers ŷ ∈ {3.0, 2.0}. Six bins. A look between centers is read by
**bilinear interpolation over the four surrounding bins** (linear in ρ_v between the two nearest speed centers, linear
in ŷ between 2.0 and 3.0; values outside the outer centers are clamped).

### 2.8 Crowding (coach input)

If the coach marks a hitter as crowding the plate: Δlogit H = −0.3 for inside targets (up-in, down-in). Otherwise
there is no side effect in v0.8.

## 3. Timing

### 3.1 Timing surprise

```latex
r = \frac{\tilde v - v_p}{\tilde v}
```

v_p is the perceived speed v_p(q) from 2.6 (after fatigue, 8.1). Positive r means slower than he's timed for. Because
the count blend pulls ṽ below his fastball speed, a fastball earns a small "faster than expected" B whenever ṽ sits
more than 3% below it (for example, when he's leaning off-speed); that is intended. With a dead zone of 3%:

```latex
s(r) = \operatorname{clip}\!\left(\frac{|r| - 0.03}{0.05},\,0,\,1\right)
```

| Case | B(r) |
| --- | --- |
| r ≥ 0, changeup | s(r) for r ≤ 0.12; s(r)·exp(−(r − 0.12)/0.08) above |
| r ≥ 0, slider, curveball, fastball | s(r) (no decay: big gaps don't make a breaking ball easier) |
| r < 0 (faster than expected) | 0.6·s(r) |

B is continuous everywhere (at r = 0.12 the changeup curve is 1 from both sides, since s = 1 from r = 0.08).
Example: when he's timed near his fastball (ṽ ≈ v_FB), moving the same fastball between locations moves v_p by at
most ±1.5 mph around his speed, so |r| ≤ about 1.8%, inside the 3% dead zone: B = 0. When he's timed for off-speed (ṽ well below v_FB) a fastball is a real
surprise and B can be large; that is intended.

### 3.2 Where it enters

```latex
\Delta\text{logit}\,W = +\rho_L\,\beta_T\,B, \qquad \Delta\text{logit}\,H = -\rho_L\,\gamma_T\,B, \qquad \beta_T = 0.5,\ \gamma_T = 0.3
```

ρ_L: HS and travel 0.6, college and MLB 1.0 (assumption; section 10).

### 3.3 Logged timing reads (θ, unchanged)

The app's existing reads stay exactly as they are: θ_c per class c, updated θ_c ← θ_c + 0.35(signal − θ_c) with
signals: whiff front −0.8, whiff late +0.8, foul pulled −0.6, foul opposite way +0.6 (only when the target wasn't away
or chase), whiff fooled 0 (fooled also feeds the sit evidence in 2.5); halved at each new plate appearance. Engine terms unchanged:
Δlogit W = +0.6 h_L θ_eff, Δlogit H = −0.5 h_L θ_eff, θ_eff = θ for fastballs and −θ for off-speed.

### 3.4 Cap on combined expectation effects

On whiff, the sum of the sit shift (2.2), the timing term (3.2) and the θ term (3.3) is clipped to ±1.6·h_L logits
when `expect_v07` is off (it is not applied in v0.7c mode, where a four-pitch arsenal can reach 1.5·0.75 + 0.6 =
1.725). The cap is applied inside each pure-sit cost C(a | k) at the root and to the expected
shift in the linearized solve (2.4), so the linearization test includes it. The same cap at ±1.2·h_L applies on hard
contact. Rationale: these are separate mechanisms (type recognition, sequence timing, measured timing) but they are
collinear in data; the cap bounds the double-count risk.

## 4. Pair terms (replace the v0.7c pairing term)

With `pairing_v07` off, the pairing term T and its 0.4 weight are removed. Its pieces map as follows:

| v0.7c pairing piece | v0.8 replacement | Where computed |
| --- | --- | --- |
| Fastball-then-off-speed, up/down pattern | Eye level E_y (4.1) | Root and value solve (uses ŷ) |
| Perceived-speed gap | Timing B (3.1), against the look | Root and value solve (uses v̂) |
| Tunnel bonus | τ_tun (4.2) | Root only |
| Repeat after a whiff | Repeat term (4.3) | Root only |
| Same pitch, same spot, no whiff | Repeat term (4.3), unchanged −0.32 | Root only |

Root only means it needs the exact previous pitch, which the value-solve state doesn't carry; in future counts these
terms are 0. **Big spot** (inning ≥ 7, margin ≤ 2, runner in scoring position): every pair term is multiplied by 0.5,
as today's pairing weight was.

### 4.1 Eye level

```latex
g(d; d^*) = \tfrac{d}{d^*}\,e^{\,1-d/d^*}\ (d>0),\quad 0\ (d\le 0); \qquad E_y = g\big(s_p\,(y_q - \hat y);\ 1.5\big),\quad s_p = +1\ \text{FB},\ -1\ \text{OS}
```

Δlogit W = +0.25·E_y; Δlogit S on off-zone bands (off, noncomp) = +0.25·E_y.

### 4.2 Tunneling

From the existing flight model (`path_at`, decision point 0.175 s before the plate) for the previous pitch and this
one, when they are different pitches: d_tun (gap at the decision point), d_plate (gap at the plate), d_rel (release
gap), in inches.

```latex
\tau_{tun} = \operatorname{clip}\!\left(e^{-d_{tun}/6}\; g(d_{plate};\,18) - \frac{d_{rel}}{8},\ -1,\ 1\right)
```

Δlogit W = +κ_p·0.15·τ_tun and Δlogit S on off-zone bands = +κ_p·0.15·τ_tun, with κ_p = 1.5 for sliders and
curveballs, 1.0 otherwise. Maximum effect: 0.225 logits on breaking balls, 0.15 otherwise.

### 4.3 Repeat terms

Same pitch after a whiff: +0.16 (same spot) or +0.12 (different spot) on whiff logit (v0.7c's 0.4 and 0.3 times its
0.4 weight). Same pitch, same spot, previous pitch not a whiff: −0.32 on whiff logit, any pitch type (v0.7c's −0.8 × 0.4,
kept unchanged: familiarity counts only earlier at-bats and B is 0 for a same-speed repeat, so nothing else covers it).

## 5. Familiarity

- Key: (pitcher, hitter, class c ∈ {FB, OS}). n_{h,c} counts pitches of class c that hitter h saw **from this
  pitcher in earlier plate appearances today** (the current at-bat is handled by the look and repeat terms). A
  pitching change starts at 0. This replaces the app's per-lineup-slot `seen` count keyed by pitch name. When a hitter has no database id (the app
  allows `hitterId` = null), key by (game, lineup slot, typed name).
- Term (replaces the batters-faced term when `bf_term_v07` is off):

```latex
\Delta\text{logit}\,H = \min\!\big(0.5,\ \phi_c\, n_{h,c}\big), \qquad \phi_{FB} = 0.058,\ \phi_{OS} = 0.116
```

- Sizing: v0.7c adds 0.012 per batter faced, about 0.108 per trip through the order; averaged over the first three
  trips (27 batters) that's 0.012 × 13 = 0.156. With P̄ = 3.8 pitches per plate appearance and a 55/45 fastball/off-speed mix, the average shift
  on a pitch after t earlier trips is t·P̄·φ_FB·(0.55² + 2·0.45²) = t·2.69·φ_FB. Averaged over t = 0, 1, 2 this is
  2.69·φ_FB, set equal to 0.156 → φ_FB = 0.058, φ_OS = 2·φ_FB = 0.116 (the 2-to-1 off-speed ratio from the research).
  The fresh review measured v0.7c's term at about 5 to 6 wOBA points per trip; this keeps the same average, so the
  claim is "same average decline as v0.7c, redistributed by what each hitter saw," not "matches the 13-point study."
- No whiff term (v0.7c had none). Statcast fit (section 10) can replace both values.
- Acceptance: over simulated D3 starts, average hard-contact share with familiarity on is within ±0.5 points of v0.7c.

## 6. Planning ahead

### 6.1 State and value

State x = (b, k, o, B, look bin). Value V is absolute (runs, or run-equivalents with the win objective), not relative
to RE as today's cv is. For each count and look bin:

```latex
V(b,k,h) = \sum_a \pi(a \mid b,k,h)\, \sum_e P(e \mid a, b, k, h)\,\big[R(e) + V(\text{next}_e)\big]
```

- next_e for a non-terminal outcome is (b′, k′, U(h, a)) read by bilinear interpolation (2.7); a two-strike foul
  returns to the same count with the updated look.
- next_e for an outcome that ends the plate appearance uses V_end (7.2), which is r + RE(o′, B′) with the win
  objective off.
- π(a | b, k, h) = Φ(costs) with the sit applied as the expected shift under the count's σ (2.4).
- Other base-out states. A wild pitch or passed ball (v0.7c's `after_ball` with advanced runners) and the steal cost
  (7.4) need values at a base-out state other than the frozen one. They shift the table by the end-value difference,
  which is v0.7c's relative count-value rule generalized to the win objective:

```latex
V(b,k,o',B',h) = V(b,k,o,B,h) + V_{end}(o',B',r) - V_{end}(o,B,0)
```

  r is runs that scored on the play. If the play makes the third out (o′ = 3), the value is V_end(3, ·, r) outright,
  with no count term. With ω = 0 this is exactly v0.7c's rule (count value relative to RE, plus runs).
- Solve by sweeps over counts, deepest first, until the largest change is < 0.001 runs, at most 10 sweeps (as today).
  The count's σ (2.3) is re-solved at the start of each sweep from that sweep's values. The chain is transient
  (P(foul) < 1), so the two-strike self-loop converges.

### 6.2 Frozen inputs

When the plate appearance starts, the solve freezes: familiarity counts, umpire shift, θ reads, confidence, landing
today, pitch count, fatigue, damage reads, b_h, base-out state and the win-objective constants. The root (the pitch
being called now) always uses live values. The table is re-solved mid at-bat only when: the pitcher changes, any
pitch's confidence moves by > 0.10, any pitch's wild-today value moves by > 0.10, or the umpire shift moves by
> 0.20 logits.

### 6.3 Root call

At the root the engine uses the exact current look and last pitch, all pair terms, and future values from the table.
It **re-solves the current count's sit game (2.3) with live b_h** (so a "fooled" read in this at-bat reaches the
call), building M at the exact current look, and prices calls with the exact Σ_k σ(k) C(a|k). Then calls are drawn as
today.

### 6.4 Myopic cost, look value and the setup guardrail

- Myopic cost c_my(a) = the full v0.8 root cost, but every future value is read at the plate appearance's starting
  look bin h₀ instead of at U(h, a). Look value = C(a) − c_my(a).
- Guardrail: a call is allowed only if c_my(a) − min c_my ≤ δ, δ = 0.010 × run scale. Order of filters: coach rules
  (no chase at 3-0/3-1, no re-call of a shake-off, candidates above the trust line) → δ guardrail → today's never-pick
  windows (0.030 pitch, 0.010 location, both × run scale × stakes) applied to full costs.
- Three-ball counts: ranking uses c_my (look value excluded). No setup calls there by construction.
- No call to a way-off target is possible (targets are aimed at the zone or just off it; noncomp is a landing band).

### 6.5 Compute plan and budget

Per plate appearance (in the background worker), per sweep and count: the sit matrix M is built once at the plate
appearance's starting look h₀ (6 sits × 18 calls = 108 evaluations; it is not rebuilt per look bin), plus |looks|·|calls| for the
value solve (6 × 18 = 108). Today's at_bat_values does 4 × 18 = 72 per count per sweep (verified: one D3 call_mixed
makes 4,464 outcome evaluations, 0.15 s in Python). So v0.8 does 3× the evaluations, and each evaluation is heavier
(four batted-ball types, typed runner tables, four-bin interpolation): plan on about 2.5× per evaluation, roughly 7.5×
today's time per plate-appearance solve. Per pitch the root adds 108 evaluations plus its sit re-solve. The why line
(section 9) needs about 11 terms × 2 calls × 6 sits ≈ 130 evaluations; it runs after the call is shown, off the
critical path.

| Budget (gate before step 6 ships) | Limit |
| --- | --- |
| Plate-appearance solve, desktop Chrome with 4× CPU throttle (iPad stand-in; no iPad available) | ≤ 1.0 s |
| Root call, same setting | ≤ 50 ms |
| Python call_mixed, desktop | ≤ 2.0 s |

Fallbacks if over budget, in order: sweeps cap 10 → 6; look bins 6 → 3 (speed only); QRE cap 60 → 30; one σ solved at
0-0 and shifted by the count prior for other counts. tests.py keeps running in v0.7c mode; v0.8 tests use sweeps cap 6.

### 6.6 Temperature

T_final(b, k) = max(T_v07(b, k), T_unc(level, b, k)), where T_v07 is today's temperature (base × run scale × stakes
factor, halved in a big spot) and T_unc = 0.5·sd_par of the gap between the top two calls, from `perturb.py`: 30 draws
of logit noise SD 0.25 on S0, C0, W0, F0, the hard-contact baselines and KIND_W, and ±50% on every new β, for three
reference arsenals (two-, three- and four-pitch; the nearest is used) at bases empty, no outs. The windows are
unchanged. Report how often T_unc binds. Acceptance: exploitability X is not worse than v0.7c by more than 0.002 runs
in any count.

### 6.7 Anti-pattern metric (test only)

ρ = count-conditional correlation of 1[fastball] on consecutive pitches, averaged over counts weighted by frequency.
Pros show ρ < 0 (over-alternating), which is itself a pattern; target |ρ| ≤ 0.05.

## 7. Situation

### 7.0 Corrected, calibrated chain (built in step 3)

- **Rates.** College levels from `college_rates.py`, high school and travel from `hs_rates.py`, MLB from the
  `mlb_check` rates. The caught-stealing fix goes in a new function, `rates_v08()`, in `college_rates.py`: today SB is
  summed over all teams but stolen-base attempts only over the teams that report them, which makes D3's CS negative
  (−0.0094) and a negative transition probability. `rates_v08()` takes SB and CS from the reporting teams only. The
  old `rates()` and the script's existing output path are unchanged; never rewrite `college_run_values.json` or
  `run_tables.py` (the engine's walk/strikeout linear weights and RE tables come from them, and the golden test
  depends on them). Corrected rates and the calibration factor go to a new file, `we_rates.json`.
- **Calibration.** Multiply the chain's walk, hit-by-pitch and hit rates by one common factor per level until its
  RE(0 outs, empty) equals RE_BY_LEVEL's within 0.5% (D1's table was scaled ×1.072; the raw chain gives 0.653 vs 0.700).
  Within each factor iteration, rerun `calibrate_out_rates` and then `solve_re`; T_L, `_sf_rate` and `_gdp_rate` are
  read from the final calibrated chain.
- **Shared constants.** Ā (7.5), Ī (7.5) and I₀ (8.2), once computed from simulation, are stored in a new
  `sim_constants.json` that both the Python and JavaScript engines read, so parity tests use identical numbers.
- **Gate.** For D1 and D3 the calibrated chain's RE must match RE_BY_LEVEL in every base-out state within max(5%,
  0.035 runs) (the fourth review measured D3 5.4% = 0.033 runs and D1 4.1%: both pass). HS's RE table is a uniform
  ×1.111 rescale of the chain's shape and MLB's is an external table, so a hit-rate factor can't match their shape
  everywhere (the fourth review found 5.4% gaps, up to 0.19 runs at HS bases loaded, 0 outs). For HS, travel and MLB
  the gate is report-only: list every state over max(5%, 0.035 runs). These tables matter only through the win blend
  late in close games.

### 7.1 Win and leverage tables (new: `we_tables.py`)

Built offline per level from `college_rates.py`'s existing per-level base-out chain (which already includes walks,
hits, errors, wild pitches, steals, double plays and sac flies):

1. Run distribution: P(r runs in the rest of the half-inning | o, B), r = 0…10+, by forward iteration on the chain to
   absorption at 3 outs.
2. Win expectancy for the pitching team, WE(inning, half, o, B, margin), by backward recursion over half-innings with
   both teams at the level average. Game ends after scheduled innings N if not tied (bottom half skipped when the home
   team leads; a walk-off counts as a win at the moment the home team leads). Extra innings use the same distribution
   (optional flag: runner on 2nd to start extras) up to N + 6, then 0.5. Margin clamped to ±15.
3. Leverage index: LI(state) = E|ΔWE over the plate appearance from this state| divided by the frequency-weighted mean
   of that quantity over all plate appearances (frequencies from forward propagation through an average game).
4. Stored as `we_tables.json` per level and N ∈ {7, 9}.

The chain used here is the **corrected, calibrated chain** built in step 3 (section 7.0). The WE chain is the source of
the runner-on-third and double-play totals; 7.3's typed table is calibrated to match it, not the other way round.

New game inputs: we're home or away; scheduled innings (default HS/travel 7, college 9, editable for doubleheaders);
extra-innings runner flag. The half follows from home/away.

### 7.2 Objective blend (one definition)

Fixed when the plate appearance starts:

- ω = clip(LI − 1, 0, 1)
- WE₀ = WE(current state)
- m₀ = WE(current state, margin) − WE(current state, margin − 1), floored at 0.005 (one run's worth of WE now)

End-of-plate-appearance value, used everywhere a plate appearance ends (root, value solve, walk, hit by pitch,
strikeout, ball in play):

```latex
V_{end}(o', B', r) = (1-\omega)\,\big[r + RE(o', B')\big] + \omega\,\frac{WE_0 - WE(o', B',\ \text{margin}_0 - r)}{m_0}
```

WE(o′, B′, ·) is in the current half-inning; o′ = 3 means the start of the next half-inning. At ω = 0 this is exactly
v0.7c's end value.

### 7.3 Batted-ball types

Each contact quality c ∈ {weak, solid, hard} gets a type t ∈ {GB, LD, FB, PU}.

```latex
\text{logit}\,P(GB \mid p, q, c) = \text{logit}\,GB_p + \beta_y\,(y_q - 2.5) + \gamma_c, \qquad \beta_y = -0.8\ \text{per ft},\ \gamma = (+0.3, 0, -0.3)
```

GB_p: four-seam 0.379; fastball shape "sink" 0.495; shape "cut" 0.430; slider 0.439; curveball 0.487; changeup 0.478.
Non-ground balls split by contact: weak LD 0.10 / FB 0.40 / PU 0.50; solid 0.45 / 0.45 / 0.10; hard 0.45 / 0.55 / 0.

Outcome given (c, t) over {out, 1B, 2B, 3B, HR, error}, starting shapes (relative weights):

| Type | out | 1B | 2B | 3B | HR | E |
| --- | --- | --- | --- | --- | --- | --- |
| GB | 0.75 | 0.225 | 0.02 | 0.002 | 0 | 0.03 |
| LD | 0.32 | 0.48 | 0.16 | 0.02 | 0.02 | 0.005 |
| FB | 0.78 | 0.04 | 0.06 | 0.01 | 0.11 | 0.005 |
| PU | 0.98 | 0.015 | 0.003 | 0 | 0 | 0.005 |

Calibration (new `inplay_fit.py`): for each level and c, iterative proportional fitting (rows normalized, then each
outcome column scaled so the type-weighted marginal at the reference mix, three-pitch average arsenal at 2.5 ft,
equals today's IN_PLAY_BY_LEVEL[level][c]; 50 iterations or max error 1e-6). Order: do **not** rerun `fit_all.py`
(it would change OUTCOME_FIT and the untyped table, breaking the golden test). `inplay_fit.py` reads the current
`outcome_params.py` and writes the typed tables to a new file, `inplay_typed_params.py`, loaded only when
`inplay_typed` is on. The simulator gets the same switch: `simulate.py`'s ball-in-play routine (today
`run_ball_in_play_v6b`, with its own runner rules) uses the typed tables and 7.3's runner rules when the flag is on.
Acceptance: with the flag on, the engine and simulator reproduce each level's strikeout, walk, hit-by-pitch and hit
rates within the current fit's tolerances; with it off, the golden test is exact.

Runner advances on outs, fewer than 2 outs:

| Situation | GB out | FB out | LD or PU out |
| --- | --- | --- | --- |
| Runner on 3rd scores | p_GB = min(0.95, 0.35·s_G) (0.10 if the coach sets infield in) | p_FB = min(0.85, 0.60·s_F) | 0.01 |
| Runner on 2nd (3rd open) to 3rd | 0.50 | 0.25 | 0 |
| Double play (runner on 1st), given a GB out | weak 0.30, solid 0.20, hard 0.10, × s_dp | 0 | 0 |

Calibration targets come from the corrected, calibrated chain (7.0), built earlier in the same step:

- **Runner scoring from third on an out.** In the chain (`pa_transitions`), on a ball-in-play out with a runner on
  third and fewer than 2 outs the runner scores with probability sf + 0.25·(1 − g_s − sf) + g_s·1[0 outs], where
  g_s = `_gdp_rate` only when first base is also occupied (else 0), and the bunt rate does not apply (it is gated off
  with a runner on third). The target T_L is that rate averaged over the chain's visits to runner-on-third, fewer-than-2-out
  states (the third review measured about 0.554 for D3 and 0.573 for D1 before the CS fix). The typed model's
  matching rate is computed the same way, visit-weighted over the same states:
  share_GB(out)·[d·1[0 outs] + (1 − d)·p_GB] + share_FB(out)·p_FB + share_LD+PU(out)·0.01, where d is the typed
  double-play rate given a ground-ball out (only with first base occupied; else 0). Calibrate with **separate** multipliers: p_FB = min(0.85, 0.60·s_F) and
  p_GB = min(0.95, 0.35·s_G), p_LD = p_PU = 0.01; set s_F = s_G first, and if p_FB hits its 0.85 cap, hold it there and
  raise s_G alone until the typed rate equals T_L at the reference mix (fly-ball outs at 0.95 would be poor baseball
  sense).
- The runner on third also scores on a double play with 0 outs, as the chain already does (v0.7c's engine does not;
  the typed table adds it). A separate sac-fly-only target is not used: at the reference mix fly-ball outs
  are only about 27% of ball-in-play outs, so the chain's sac-fly share (0.40 for D3) cannot be reached by fly balls
  alone.
- If T_L exceeds the capped maximum, first audit `calibrate_out_rates`' opportunity count s_opp (the review suspects it
  undercounts runner-on-third states, which inflates `_sf_rate`); if it still exceeds after the audit, use the cap and
  report the shortfall.
- **Double plays.** One multiplier s_dp on the weak/solid/hard rates so the typed model's double-play rate per
  opportunity equals `_gdp_rate` (feasible: s_dp ≈ 0.7 for D3).

### 7.4 Running game

- Input per runner on 1st (2nd open) or 2nd (3rd open): steal threat none / some / high → a = 0 / 0.04 / 0.10 per pitch
  (halved for a runner on 2nd). Optional pitcher time to plate t (s).
- Success by pitch height y (target height, ft):

```latex
p_s = \operatorname{clip}\!\big(0.64 + 0.20\,\operatorname{clip}((4-y)/3,0,1) + \delta_L + \delta_t,\ 0.30,\ 0.95\big)
```

δ_L = level steal success minus MLB's 0.72: D1 +0.08, HS +0.10. D3 uses its corrected value from `we_rates.json`
(built in step 3; about 0.840, so +0.12). δ_t = clip(0.10·(t − 1.4)/0.2,
−0.15, 0.15) when t is entered, else 0. The research found no effect of pitch speed, so speed isn't used.
- Cost added to each call: a·[p_s·V(b, k, o, B_steal) + (1 − p_s)·V(b, k, o + 1, B_caught) − V(b, k, o, B)], using
  the table's values at the current count (V_end-based at three outs).
- Wild pitches and passed balls: today's term (way-off landing × rate × catcher block) unchanged.

### 7.5 Umpire and count zone

Called-strike logit on edge and off bands (where today's cs shift applies):

```latex
\text{logit}\,C_s = \text{logit}\,C^0_z + c_L + \kappa(b,k) + u
```

- κ(b, k) = log(A(b, k)/Ā) with A(b, k) = 3.03 + 0.22·b − 0.30·k sq ft (matches 3.7 at 3-0 and 2.4 at 0-2; the
  in-between counts are a linear interpolation until the Statcast fit replaces them). Ā is the **geometric** mean of A,
  weighted by how often each count has a taken pitch in the edge or off bands in simulation, so the weighted average κ
  is exactly 0 and c_L's calibration is unchanged.
- u (today's umpire) is a one-step Newton estimate from every taken pitch i today. At call time the engine stores, at
  u = u₀: p_i = P(called strike | take) = cstrike / (cstrike + ball + wp_ball + hbp), and d_i = ∂p_i/∂u, which counts
  only the edge and off bands (the only bands u moves):

```latex
d_i = \frac{\sum_{z \in \{edge,\,off\}} L_z\,(1-S_z)\,C_z(1-C_z)}{\sum_{z} L_z\,(1-S_z)}
```

```latex
u = u_0 + \frac{\sum_i (s_i - p_i)\,d_i/\big(p_i(1-p_i)\big)}{a_0\,\bar I + \sum_i d_i^2/\big(p_i(1-p_i)\big)}, \qquad a_0 = 20,\quad u \in [-1.5,\,1.5]
```

  s_i = 1 for a called strike. Ī is the average per-take information d²/(p(1−p)) at the level (computed once from
  simulation), so a₀ = 20 is worth 20 typical takes. u₀ is the coach's optional seed: wide +0.4, normal 0, tight −0.4.
  Needs no logged location.

### 7.6 High school pitch cap

Input: the pitcher's cap (default 105). N(b, k) = expected pitches to finish the plate appearance, solved in the same
sweeps (N = 1 + Σ_e P(e)·N(next_e), 0 at the end of the plate appearance). For HS and travel only:

```latex
C \mathrel{+}= 0.002 \cdot \text{run scale} \cdot \operatorname{clip}\!\left(\frac{pc - (\text{cap} - 20)}{20},0,1\right) \cdot \Big(1 + \sum_e P(e)\,N(\text{next}_e)\Big)
```

### 7.7 Intentional walk suggestion

Suggested (never auto-called) when V_end(walk state) < V(0-0, h₀) − ε, ε = 0.010 × run scale.

## 8. Pitcher and hitter inputs

### 8.1 Fatigue

Past the level's fatigue point f_L (HS/travel 60, D3 75, college/D1 80, MLB 90; check-ins can lower it, as today):

```latex
v_p \mathrel{-}= \min\!\big(4,\ 0.5\cdot\tfrac{\max(0,\,pc - f_L)}{10}\big)\ \text{mph}, \qquad \text{grade}_{eff} = \text{grade} - \min\!\big(1,\ 0.25\cdot\tfrac{\max(0,\,pc - f_L)}{20}\big)
```

If the coach logs radar readings for a pitch (≥ 3 today), its speed is (5·v_base + Σ last ≤ 8 readings)/(5 + n) and the
speed formula above is turned off for that pitch. Today's command shift toward the heart stays. Evidence is weak; the
values are guesses.

### 8.2 Hitter scouting grades

Three grades, 1 to 5, default 3 (3 everywhere = v0.7c): contact c, power w, discipline d.

```latex
\Delta\text{logit}\,W = -g_c(c-3), \qquad \Delta\text{logit}\,H = +g_w(w-3), \qquad \Delta\text{logit}\,S_{\text{off zone}} = -g_d(d-3)
```

g values are fit by a new `fit_hitter_spread.py` (same method as `fit_spread.py`, its own writer; output
`hitter_spread_params.py`, never `spread_params.py`): one contact point lowers simulated
strikeout rate by the level's sd_k, one discipline point raises walk rate by sd_walk (both from `spread_params.py`,
i.e. assuming hitters spread like pitchers until hitter data exists), one power point raises hard-contact share by 0.03
(assumption). Starting value 0.25 each. `spread_params.py` has no MLB entry, so MLB uses D1's fitted values.

Learning across games (worker, after End game), one grade at a time, by the same one-step Newton estimate as the
umpire. For each pitch the engine stores, computed with that grade at 3, the predicted probability p_i of the
observed event and its derivative d_i = ∂p_i/∂grade (the derivative carries the sign, so more whiffs than expected
lower the contact grade):

```latex
\hat g_{obs} = 3 + \frac{\sum_i (y_i - p_i)\,d_i/\big(p_i(1-p_i)\big)}{\sum_i d_i^2/\big(p_i(1-p_i)\big)}, \qquad \hat g = \frac{I_0\,g_{coach} + I\,\hat g_{obs}}{I_0 + I}, \quad I = \sum_i \frac{d_i^2}{p_i(1-p_i)}
```

| Grade | Event y_i (pitches used) | p_i | d_i |
| --- | --- | --- | --- |
| Contact | Whiff (swings) | P(whiff given swing) | −g_c·Σ_z w_z W_z(1−W_z), w_z = landing-and-swing weight of band z |
| Power | Hard contact (balls in play only; fouls excluded) | P(hard given contact) | +g_w·Σ_z w_z H_z(1−H_z) |
| Discipline | Swing (all pitches) | P(swing) | −g_d·Σ_{z off-zone} L_z S_z(1−S_z) |

Discipline uses every pitch and the engine's own band split, so it needs no logged location. I₀ is the information of
50 average plate appearances at the level (computed once from simulation). Learner v2 rails apply: a cap
of 0.5 grade points per game, a flag instead of a change when the estimate differs from the coach by more than 1 point,
and no effect on calls until 30 pitches are logged for the hitter.

No double count with the existing cross-game damage seed (`PCLearner.seedDamage`): when grades are on, the seed is
centered (the hitter's mean damage across classes and spots is subtracted), so damage carries only class and spot
differences and the grades carry his overall level.

### 8.3 New app inputs and logs

| Input | Where | Required? |
| --- | --- | --- |
| Home or away; scheduled innings; extras runner flag | Game setup | Yes, for 7.1-7.2 |
| Steal threat per runner; pitcher time to plate | Game screen | Optional (default none) |
| Pitch cap | Pitcher setup | HS/travel; default 105 |
| Infield in | Game screen | Optional (default off) |
| Crowding flag | Hitter | Optional |
| Hitter grades c, w, d | Hitter roster | Optional (default 3) |
| Umpire seed | Game setup | Optional |
| Radar reading | Per pitch | Optional |

Each needs a field in the IndexedDB records and a column in a new Supabase migration (same sync design).

Per-pitch log additions (in the existing situation snapshot `snapSituation` and prediction `pred`): v̂, ŷ, σ (the sit
mix), the umpire pair (p_i, d_i), the three grade pairs (p_i, d_i), and the flags in force. These let every v0.8
expectation be recomputed exactly from the log (replay test). Familiarity
is re-keyed to (pitcher, hitter, class).

## 9. "Why" line

For the drawn call a, b = the lowest-cost allowed call other than a. For each term k (sit, timing, eye level,
tunneling, repeat, familiarity, look value, situation/win blend, umpire, running game, grades):

```latex
\Delta_k = \big[C(a) - C(b)\big] - \big[C_{-k}(a) - C_{-k}(b)\big]
```

C_{−k} switches term k off; for look value it's c_my. Show the template of the most negative Δ_k:

| Term | Line |
| --- | --- |
| Timing | He's timed for {ṽ} mph; this plays {Δ} mph slower |
| Look value | Sets up the {next best pitch} {spot} |
| Eye level | Changes his eye level after the {last pitch} |
| Familiarity | He's seen the {b's pitch} {n} times today |
| Sit | He's been sitting {top sit option} |
| Situation | Tying run on third: need a strikeout or a ground ball |
| Umpire | Today's umpire is calling {more/fewer} strikes than usual |

Δ values are for ranking only (costs aren't additive across terms). Cost: one extra root evaluation per term.

## 10. Fitting and validation

**Statcast fit** (new `seq_fit.py`; data: Baseball Savant pitch-level CSVs as `statcast_check.py` already downloads):

- Train on 2024, test on 2025 (season split, so pitcher and batter effects don't leak). Confidence intervals by a
  bootstrap clustered on game (1,000 resamples).
- Mixed logistic models with pitcher and batter random intercepts; fixed controls: count, base-out state, score margin
  bucket, times through the order, pitch-count bucket, previous pitch's result, pitcher × pitch-type season usage, and
  pitch quality (velocity, spin, horizontal and vertical movement, extension, plate x and z as splines).
- Terms tested: B(r) with λ on the grid {0.4, 0.5, 0.6, 0.7, 0.8} and α via a count-prior proxy for σ; E_y with d* on
  {1.0, 1.5, 2.0}; τ_tun from Statcast trajectories (positions at 0.175 s before the plate from vx0…az), not the
  engine's flight model; familiarity n by class; GB_p and β_y on balls in play; κ by count on called pitches.
- A term ships only if held-out log loss improves by more than 2 bootstrap SDs and its β interval excludes 0; shape
  parameters (λ, d*, the changeup band, 18 in) ship at their best grid value only if their term ships. Report the
  correlation matrix of the fitted parameters. If |corr(α, β_T)| > 0.8, α is fixed at 0.4 and only β_T is fit; the
  sit weights are never fit on Statcast (σ is not observed there) and stay at their v0.7c values.
- Familiarity: fit on starts reaching ≥ 18 batters and on all starts; report both (survivor bias check).
- Transfer: MLB logit effects are applied unchanged at college and scaled by ρ_L = 0.6 for HS/travel. This is an
  assumption no available data can test; the scaling is the weakest number in the spec.

**Untestable parameters** (kept at the stated guesses, each with a ±50% sensitivity run in the matrix): location sit
weights (0.75, 0.5), swing sit weights (0.3, 0.15), crowding 0.3, steal threat rates, fatigue rates, power-grade 0.03.

## 11. Build steps and acceptance

| Step | Builds | Passes when |
| --- | --- | --- |
| 0 | Compatibility flags; golden file of v0.7c outputs (Python and JS) | Golden test exact; tests.py 19/19; parity |
| 1 | Pure-sit cost evaluator C(a | k) (2.2; diagnostic only, it changes no call); metrics: X per count (2.3) on v0.7c's mix π, ρ, location shares; `perturb.py`; baseline report | Baseline report committed; golden exact |
| 2 | `seq_fit.py` and fits (independent of the engine) | Fit report with ship / no-ship per term |
| 3 | Corrected, calibrated chain (7.0: `rates_v08()`, `we_rates.json`); typed batted balls (7.3), `inplay_fit.py` → `inplay_typed_params.py`, simulator switch (no `fit_all.py` rerun) | 7.0 gate; level rates within current tolerances with flag on; golden test exact with flag off |
| 4 | Familiarity (5) with re-keying in the app **and** the simulator (which today counts `seen` per pitch name: it must pass per-class, earlier-at-bat counts), fatigue (8.1), umpire (7.5), app inputs (8.3) | Section acceptance tests; golden exact with flags off |
| 5 | Sit game (2.1-2.5) at root and per count | Residual and linearization tests; X report |
| 6 | Look, timing, eye level, pair terms, crowding, planning (2.6-2.8, 3, 4, 6 except 6.6); HS pitch cost (7.6, needs the solve's N) | Budget (6.5); scenario tests below |
| 7 | `we_tables.py` on the step-3 chain, objective blend (7.1-7.2), running game (7.4), walk suggestion (7.7) | WE table checks below |
| 8 | Hitter grades (8.2), why line (9), temperature floor (6.6) | Section tests; X not worse than v0.7c by > 0.002 runs |

After every step: tests.py (v0.7c mode) 19/19, the golden test with the step's flag off, Python/JS parity on 150 fresh
cases, the perturbation report, and 8 simulated D3 games (sanity only; the simulator uses the engine's own model).
Any v0.7c behavior check that changes with a flag on is reported and updated only with Drew's sign-off.

**Scenario tests (step 6):**

1. Setup: D3 average arsenal plus a grade-4 slider, count 0-1. With look value on, the share of fastball-up calls is
   higher than with it off, and the following 0-2 slider-down call's cost is lower after a fastball up than after a
   slider.
2. Guardrail: across 3,000 random situations, no drawn call has c_my − min c_my > δ; in three-ball counts look value
   never changes the ranking.
3. Big spot halves every pair term.
4. Repeat after a whiff raises the same pitch's share versus no whiff.
5. A changeup 9% slower than ṽ gets B = 1; with ṽ = v_FB, the same fastball moved between targets gets B = 0.

**WE table checks (step 7):** the chain's mean runs per half-inning equals RE_BY_LEVEL at (0 outs, empty) within 2%;
WE for the home team at the start of a tied game is 0.50 ± 0.005 (both teams are level-average, so batting last gives
no edge in this model); both teams' WE sum to 1 in every state; the 7.0 gate holds (D1, D3) and the HS/travel/MLB report is
attached; LI averages 1.0
over game states by construction; m₀ > 0 in every state.
