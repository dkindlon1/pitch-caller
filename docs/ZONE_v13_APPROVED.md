# Zone table v1.3: what Drew approved (ruling 2, Nov 21)

**File:** `data_tables/zone_v13.json`, **sha256 `4c9f98efb96a3e66a2f1367b6635caf451b2521efeb1169a707625643f253323`**. Built by `python -m hitter_data.zone_v13` (the generator writes this record too). Frozen: changing a number means a new file name, a new sha and a new record.

**What was approved:** the regenerated draft `docs/ZONE_TABLE_DRAFT_v13.md` (Single-A seed, fit on 2021, 2022, 2023, 2024, with 2025 held out for the check; 2026 never loaded), with exactly two changes:
1. **(a) Level trend.** Where the draft's transfer check finds the shape trends with level (the moving cells: a per-level slope whose 95% interval excludes 0 and is at least 0.10 logit per level step), the trend is carried **one level step below Single-A for college and two for HS / travel**. Moving cells: swing 26 of 40, chase 14 of 20, whiff 11 of 40, hard 11 of 32, gb 2 of 32, fb 8 of 32.
2. **(b) P3 (sinker grounders) from Triple-A:** x1.66 instead of Single-A's x1.28.

Also, as the draft and plan section 11 say: `class.chase_os` and `class.hanger_hard` are 0 (the flat +0.2 off-speed chase and the flat +0.5 hanger are gone); the quality-gated hanger (ruling 3) is `class.hanger_gate` = 0 until it is sized on graded rows.

## How the file carries it

- `cells`: the Single-A shape, solved at college D1 (used by MLB and any level without its own cells).
- `level_cells.college_d1`, `college_d2`, `college_d3`: the shape with the trend carried one step down, solved at each level.
- `level_cells.hs`: two steps down, solved at HS; travel reads HS's.
- Carried as engine cells: swing (which includes the chase cells: swings on off / way-off pitches), whiff, foul, hard. The chase table's own trend is listed below for the record; the engine's chase follows the swing cells' trend (same pitches, no double count).
- Not carried (format): ball type by band or height (gb, ld, fb, pu: B1-B5) and the called-strike shape (no draft table). Their level trends (gb, fb) are recorded, not applied.
- P3: `class.gb_kind.SI` = -0.0221 logit (new key, both engines), so the engine's P3 on the seed's mix is x1.658 (target x1.658; x1.674 without it). It applies at every level.

## Statement by statement

Columns: the draft's values (A = Single-A seed, AAA, MLB); **target** = the value the table is meant to carry at that level (A's, or A's with the trend carried 1 / 2 steps down where the statement's cells move); **engine** = what the engine gives with zone_v13 at that level (the draft's own comparison: neutral pitch, seed's mix). Source: where the number comes from.

| # | Statement (draft wording) | A | AAA | MLB | College target | HS target | Engine D1 | Engine D3 | Engine HS | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | On the first pitch, a fastball over the heart is swung at x as often as the average 0-0 pitch. | x1.93 | x1.83 | x1.75 | x1.96 | x1.98 | x1.96 | x1.96 | x1.98 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| S2 | In hitter's counts, a fastball over the heart is swung at x as often as the average pitch in those counts. | x1.72 | x1.64 | x1.58 | x1.70 | x1.68 | x1.68 | x1.68 | x1.66 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| S3 | With two strikes, a fastball over the heart is swung at x as often as the average two-strike pitch. | x1.60 | x1.57 | x1.55 | x1.58 | x1.56 | x1.62 | x1.62 | x1.60 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| S4 | On the first pitch, a fastball on the edge is swung at x as often as the average 0-0 pitch. | x1.31 | x1.23 | x1.07 | x1.35 | x1.38 | x1.34 | x1.34 | x1.38 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| S5 | With two strikes, an off-speed pitch on the edge is swung at x as often as the average two-strike pitch. | x1.32 | x1.35 | x1.35 | x1.28 | x1.23 | x1.27 | x1.27 | x1.22 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| C1 | With two strikes, an off-speed pitch just off the plate is chased x as often as the average two-strike pitch out of the zone. | x1.51 | x1.53 | x1.59 | x1.42 | x1.33 | x1.39 | x1.39 | x1.29 | Single-A seed (via the swing cells); its value moves with the count group's mean-preserving rescale |
| C2 | In hitter's counts, an off-speed pitch just off the plate is chased x as often as the average out-of-zone pitch in those counts. | x1.59 | x1.57 | x1.66 | x1.44 | x1.29 | x1.38 | x1.38 | x1.15 | Single-A seed (via the swing cells); its value moves with the count group's mean-preserving rescale |
| C3 | With two strikes, a fastball just off the plate is chased x as often as the average two-strike pitch out of the zone. | x1.33 | x1.32 | x1.14 | x1.34 | x1.35 | x1.36 | x1.36 | x1.36 | Single-A seed, **trend carried 1 / 2 steps down (change a)** via the swing cells |
| C4 | With two strikes, an off-speed pitch way off (waste) is chased x as often as the average two-strike pitch out of the zone. | x0.60 | x0.55 | x0.46 | x0.62 | x0.64 | x0.63 | x0.63 | x0.66 | Single-A seed, **trend carried 1 / 2 steps down (change a)** via the swing cells |
| C5 | On the first pitch, an off-speed pitch just off the plate is chased x as often as a fastball just off the plate. | x1.16 | x1.28 | x1.75 | x1.00 | x0.86 | x0.93 | x0.93 | x0.75 | Single-A seed, **trend carried 1 / 2 steps down (change a)** via the swing cells |
| W1 | With two strikes, a swing at an off-speed pitch just off the plate misses x as often as the average two-strike swing. | x1.74 | x1.87 | x2.15 | x1.65 | x1.55 | x1.67 | x1.67 | x1.58 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| W2 | On the first pitch, a swing at a fastball over the heart misses x as often as the average 0-0 swing. | x0.49 | x0.46 | x0.51 | x0.50 | x0.51 | x0.51 | x0.51 | x0.52 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| W3 | With two strikes, a swing at off-speed over the heart misses x as often as a swing at a fastball there. | x1.15 | x1.10 | x1.09 | x1.15 | x1.15 | x1.18 | x1.18 | x1.19 | Single-A seed (no moving cell) |
| W4 | At 0-1, a swing at a fastball on the edge misses x as often as the average 0-1 swing. | x0.72 | x0.73 | x0.78 | x0.74 | x0.77 | x0.75 | x0.75 | x0.77 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| W5 | With two strikes, a swing at an off-speed pitch way off misses x as often as the average two-strike swing. | x3.02 | x3.36 | x3.84 | x2.91 | x2.78 | x2.99 | x2.99 | x2.87 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| H1 | Hung off-speed over the heart with two strikes is hit hard (95+ mph) x as often as a fastball there. | x0.78 | x0.81 | x0.85 | x0.78 | x0.78 | x0.79 | x0.79 | x0.79 | Single-A seed (no moving cell) |
| H2 | In hitter's counts, a fastball over the heart put in play is hit hard x as often as the average ball in play in those counts. | x1.27 | x1.28 | x1.26 | x1.26 | x1.26 | x1.26 | x1.26 | x1.25 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| H3 | With two strikes, an off-speed pitch just off the plate put in play is hit hard x as often as the average two-strike ball in play. | x0.38 | x0.43 | x0.34 | x0.41 | x0.45 | x0.43 | x0.43 | x0.46 | Single-A seed, **trend carried 1 / 2 steps down (change a)** |
| H4 | At 0-1, a fastball on the edge put in play is hit hard x as often as the average 0-1 ball in play. | x0.94 | x0.92 | x0.88 | x0.93 | x0.91 | x0.92 | x0.92 | x0.91 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| H5 | On the first pitch, off-speed over the heart put in play is hit hard x as often as the average 0-0 ball in play. | x1.07 | x1.07 | x1.07 | x1.06 | x1.05 | x1.06 | x1.06 | x1.05 | Single-A seed (no moving cell); its value moves with the count group's mean-preserving rescale |
| B1 | A fastball in the top third of the zone or above, put in play, is a pop-up x as often as the average ball in play. | x1.71 | x1.70 | x1.81 | x1.71 | x1.71 | x1.26 | x1.26 | x1.25 | Single-A seed; **not carried** (ball type by band / height: format) |
| B2 | An off-speed pitch in the bottom third or below, put in play, is a ground ball x as often as the average ball in play. | x1.23 | x1.20 | x1.20 | x1.23 | x1.23 | x1.26 | x1.26 | x1.26 | Single-A seed; **not carried** (ball type by band / height: format) |
| B3 | A fastball up, put in play, is a fly ball x as often as the average ball in play. | x1.30 | x1.24 | x1.27 | x1.30 | x1.30 | x1.19 | x1.19 | x1.19 | Single-A seed; **not carried** (ball type by band / height: format) |
| B4 | A fastball over the heart, put in play, is a line drive x as often as the average ball in play. | x1.09 | x1.10 | x1.08 | x1.09 | x1.09 | x1.19 | x1.19 | x1.18 | Single-A seed; **not carried** (ball type by band / height: format) |
| B5 | An off-speed pitch just off the plate, put in play, is a ground ball x as often as the average ball in play. | x1.36 | x1.38 | x1.44 | x1.36 | x1.36 | x1.21 | x1.21 | x1.21 | Single-A seed; **not carried** (ball type by band / height: format) |
| P1 | With two strikes, a sweeper just off the plate is chased x as often as a slider there. | x0.96 | x0.98 | x0.98 | x0.96 | x0.95 | x0.95 | x0.95 | x0.94 | Single-A seed (via the swing cells) |
| P2 | A swing at a splitter just off the plate misses x as often as a swing at a changeup there. | x1.00 | x1.15 | x1.16 | x1.00 | x1.00 | x1.04 | x1.04 | x1.04 | Single-A seed (no moving cell) |
| P3 | A sinker put in play is a ground ball x as often as a four-seam fastball put in play. | x1.28 | x1.66 | x1.65 | x1.66 | x1.66 | x1.66 | x1.66 | x1.66 | **Triple-A (change b)**, all levels |
| P4 | A curveball over the heart put in play is hit hard x as often as a slider over the heart. | x0.99 | x0.98 | x0.98 | x0.99 | x0.99 | x1.00 | x1.00 | x1.00 | Single-A seed (no moving cell) |
| F1 | With two strikes, contact on a fastball on the edge is fouled off x as often as the average two-strike contact. | x1.05 | x1.07 | x1.09 | x1.05 | x1.05 | x1.05 | x1.05 | x1.05 | Single-A seed (no moving cell) |

Engine values differ from the targets where the format can't carry the statement exactly (one offset per count group across heights, the engine's own height and side terms, statements on a different reference such as chase against the out-of-zone average); see `hitter_data/zone_candidate.py` (CANT_CARRY) and the candidate report.

## The level trend applied (change a): moving cells, logit per level step toward MLB

College gets -1 x slope, HS / travel -2 x slope, then each count group is rescaled to stay mean-preserving.

- **swing** (carried): ahead edge FB -0.17; ahead heart FB -0.11; ahead noncomp FB -0.48; ahead noncomp OS -0.32; ahead off FB -0.28; behind noncomp FB -0.54; behind noncomp OS -0.26; behind off FB -0.26; behind off OS -0.13; even edge FB -0.14; even heart OS +0.12; even noncomp FB -0.51; even noncomp OS -0.30; even off FB -0.29; even off OS -0.12; first edge FB -0.17; first heart FB -0.16; first noncomp FB -0.38; first noncomp OS -0.10; first off FB -0.27; two edge FB -0.12; two heart OS +0.32; two noncomp FB -0.49; two noncomp OS -0.28; two off FB -0.26; two off OS -0.10
- **chase** (carried through the swing cells): ahead noncomp FB -0.36; ahead noncomp OS -0.21; ahead off FB -0.16; behind noncomp FB -0.40; behind noncomp OS -0.12; behind off FB -0.12; even noncomp FB -0.38; even noncomp OS -0.17; even off FB -0.15; first noncomp FB -0.30; first off FB -0.18; two noncomp FB -0.36; two noncomp OS -0.15; two off FB -0.14
- **whiff** (carried): ahead noncomp FB +0.22; ahead noncomp OS +0.54; ahead off OS +0.15; behind noncomp OS +0.51; behind off OS +0.21; even noncomp OS +0.54; even off OS +0.19; first noncomp OS +0.52; first off OS +0.23; two noncomp OS +0.24; two off OS +0.14
- **hard** (carried): ahead heart OS +0.12; ahead off FB -0.31; ahead off OS -0.22; behind off FB -0.32; behind off OS -0.35; even off FB -0.26; even off OS -0.20; first off FB -0.33; first off OS -0.29; two off FB -0.17; two off OS -0.11
- **gb** (recorded, not carried (ball type)): behind off FB +0.16; first off FB +0.15
- **fb** (recorded, not carried (ball type)): ahead off FB -0.19; behind off FB -0.16; behind off OS -0.15; even off FB -0.15; first off FB -0.26; two noncomp FB -0.22; two noncomp OS -0.38; two off FB -0.12

Rebuild: `python -m hitter_data.zone_v13` (refits the seed; stops if the refit does not reproduce the draft's statement values). Report JSON: `C:/dev/pitchiq-data/fits/zone_v13_report.json`.
