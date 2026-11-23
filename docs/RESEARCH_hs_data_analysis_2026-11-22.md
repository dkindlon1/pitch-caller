# HS / travel data analysis — Perfect Game DiamondKast, 2022–25

Date: 2026-11-22. Source: DiamondKast_2022-2026.zip (WWBA 15U–18U, WWBA Underclass, HS Showdown).
Whole archive: 21,707 games and 4.6M pitches. Fit seasons 2022–25: 17,730 games, 3.76M pitches, 1.00M PA.
**2026 is held out. It was counted only, never analysed.**

All numbers below come from code that was run (prep.py, analyze.py, export.py) with the output captured.
Dashboard: https://claude.ai/artifact/TEUeZmcjgb1fTMU9crsheY

## Checks on the data
- The replayed count matches the scorecard's count on 99.6% of pitches.
- 1.2% of PAs have no terminal pitch. They are left out of per-PA rates.
- Batter handedness is known on 95.2% of PAs. Velocity is recorded on 94.2% of pitches.
- Readings under 40 or over 105 mph were dropped.

## Findings (for v1.3)

1. **The engine's PA targets hold up.**

   | Rate | Data | Engine HS target |
   |---|---|---|
   | K | 20.3% | 21.0% |
   | BB | 14.5% | 14.1% |
   | HBP | 3.55% | 4.1% |

   HBP is the biggest gap, about 0.5 points high in the engine. **(default: flag for review, no change)**

   Other rates: BABIP .364, H/PA .228, HR/PA 0.66%.

2. **HS hitters swing less than Single-A hitters (HS vs Single-A).**

   | Count | HS swing | Single-A swing |
   |---|---|---|
   | 0-0 | 32.1% | 32.8% |
   | Hitter's counts | 37.8% | 43.5% |
   | 1-1 | 43.6% | 49.9% |
   | 0-1 | 41.2% | 46.3% |
   | Two strikes | 52.3% | 58.3% |

   They whiff less on 0-0 (23.0% vs 29.8%) and before two strikes. With two strikes the whiff rate is about the same (27.4% vs 27.9%).

   Overall: swing 40.7%, whiff per swing 24.6%, foul per contact 46.0%, called strike per take 29.4%.

   **The Single-A zone table needs an HS swing-rate shift in the count layer. It should not be used unchanged.**

3. **Fastball velocity has a strong, smooth effect.**

   | Fastball speed (mph) | Whiff per swing | XBH per ball in play | Hits per ball in play |
   |---|---|---|---|
   | Under 75 | 18.1% | 12.3% | .394 |
   | 90+ | 33.1% | 8.6% | .337 |

   This supports the HS pitch-type × velocity table.

   Speed relative to the pitcher's own season average matters on its own: whiff 19.8% at 3+ mph below his norm vs 25.8% at 3+ mph above. This argues for a relative-velocity term (today vs his norm). **(default: candidate term; must clear >2 SE)**

4. **Off-speed pitches draw far more whiffs.**

   | Pitch | Whiff per swing | Swing rate |
   |---|---|---|
   | Slider | 37.7% | 36.8% |
   | Change-up | 34.0% | 40.8% |
   | Curveball | 33.2% | 33.4% (lowest) |
   | Fastball | 21.9% | 42.5% |

   Fastball share by count:

   | Count | Fastball share |
   |---|---|
   | 3-0 | 92.3% |
   | 2-0 | 87.1% |
   | 0-0 | 75.6% |
   | 0-2 | 61.0% |
   | 1-2 | 57.6% |

5. **Times through the order: a large, smooth effect with no third-time cliff.**

   | Time through | K% | H/PA | BB% |
   |---|---|---|---|
   | 1st | 21.4 | 22.0 | 15.3 |
   | 2nd | 18.3 | 24.2 | 13.1 |
   | 3rd+ | 15.1 | 26.8 | 11.5 |

   This is a candidate situation term. **(default)**

6. **K% rises with fastball speed across age groups.**

   | Group | Median FB (mph) | K% |
   |---|---|---|
   | 15U | 76 | 18.3 |
   | Underclass | 83 | 24.0 |

   This fits one HS / travel level with a velocity term rather than separate age levels.

7. **Samples per hitter are small.** The median is about 13 PA per batter-season. Hitter traits will lean heavily on the prior, so borrowing between levels and shrinkage matter most here.

## Caveats
- The players are showcase and elite travel players, not typical varsity.
- Some events use wood bats. They are treated the same as other bats, per Drew.
- Line drives are labelled by the scorer.
- Every fastball is labelled "Fastball", with no sinker or cutter split.
- There is no pitch location, so zone effects still come from the Single-A table.
- The Single-A reference excludes bunts; the HS numbers include them.
