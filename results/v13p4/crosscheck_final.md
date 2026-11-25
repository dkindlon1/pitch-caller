### Cross-check (snapshot's games: like-for-like)

College games counted: 90,882 (canonical, seasons <= 2025); HS games 2022-25: 17,730.

| Check | Repo | Claude | Gap | Tolerance | Within |
|---|---|---|---|---|---|
| college count replay consistent, all seasons incl. 2026 counted only (% of strings) | 98.83 | 98.50 | +0.325 | 1 | yes |
| college count replay consistent, seasons <= 2025 (% of strings) | 99.84 | 98.50 | +1.341 | 1 | **no** |
| full-game share 2025 D1 | 0.661 | 0.657 | +0.004 | 0.03 | yes |
| full-game share 2025 D2 | 0.305 | 0.295 | +0.010 | 0.03 | yes |
| full-game share 2025 D3 | 0.105 | 0.101 | +0.004 | 0.03 | yes |
| full games 2025 D1 | 6,209 | 6,226 | -17.000 | 311 | yes |
| full games 2025 D2 | 1,906 | 1,880 | +26.000 | 94 | yes |
| full games 2025 D3 | 691 | 689 | +2.000 | 34.5 | yes |
| PA rate 2025 D1 K % | 19.19 | 19.30 | -0.106 | 0.5 | yes |
| PA rate 2025 D1 BB % | 11.33 | 11.40 | -0.074 | 0.5 | yes |
| PA rate 2025 D1 HBP % | 3.48 | 3.50 | -0.023 | 0.5 | yes |
| PA rate 2025 D2 K % | 17.08 | 17.30 | -0.220 | 0.5 | yes |
| PA rate 2025 D2 BB % | 11.18 | 11.20 | -0.019 | 0.5 | yes |
| PA rate 2025 D2 HBP % | 3.66 | 3.70 | -0.037 | 0.5 | yes |
| PA rate 2025 D3 K % | 16.55 | 16.40 | +0.149 | 0.5 | yes |
| PA rate 2025 D3 BB % | 10.90 | 11.10 | -0.201 | 0.5 | yes |
| PA rate 2025 D3 HBP % | 3.92 | 4.10 | -0.177 | 0.5 | yes |
| whiff per swing, full games <= 2025, D1 % | 22.41 | 22.40 | +0.012 | 0.5 | yes |
| whiff per swing, full games <= 2025, D2 % | 21.39 | 21.60 | -0.207 | 0.5 | yes |
| whiff per swing, full games <= 2025, D3 % | 20.43 | 20.10 | +0.326 | 0.5 | yes |
| HS 2022-25 PA rate K % | 20.34 | 20.33 | +0.013 | 0.3 | yes |
| HS 2022-25 PA rate BB % | 14.61 | 14.54 | +0.065 | 0.3 | yes |
| HS 2022-25 PA rate HBP % | 3.54 | 3.55 | -0.009 | 0.3 | yes |
| HS 2022-25 swing % (hit-by-pitch pitches in the denominator) | 40.29 | 40.70 | -0.413 | 0.3 | **no** |
| HS 2022-25 swing % (hit-by-pitch pitches left out, as Claude's) | 40.67 | 40.70 | -0.028 | 0.3 | yes |
| HS 2022-25 whiff per swing % | 24.58 | 24.60 | -0.024 | 0.3 | yes |
| HS count replay vs scorecard count % | 99.93 | 99.60 | +0.328 | 0.3 | **no** |

### Cross-check (live archive, all games)

College games counted: 215,463 (canonical, seasons <= 2025); HS games 2022-25: 17,730.

| Check | Repo | Claude | Gap | Tolerance | Within |
|---|---|---|---|---|---|
| college count replay consistent, all seasons incl. 2026 counted only (% of strings) | 99.30 | 98.50 | +0.800 | 1 | yes |
| college count replay consistent, seasons <= 2025 (% of strings) | 99.88 | 98.50 | +1.384 | 1 | **no** |
| full-game share 2025 D1 | 0.661 | 0.657 | +0.004 | 0.03 | yes |
| full-game share 2025 D2 | 0.306 | 0.295 | +0.011 | 0.03 | yes |
| full-game share 2025 D3 | 0.101 | 0.101 | +0.000 | 0.03 | yes |
| full games 2025 D1 | 6,209 | 6,226 | -17.000 | 311 | yes |
| full games 2025 D2 | 2,038 | 1,880 | +158.000 | 94 | **no** |
| full games 2025 D3 | 713 | 689 | +24.000 | 34.5 | yes |
| PA rate 2025 D1 K % | 19.19 | 19.30 | -0.106 | 0.5 | yes |
| PA rate 2025 D1 BB % | 11.33 | 11.40 | -0.074 | 0.5 | yes |
| PA rate 2025 D1 HBP % | 3.48 | 3.50 | -0.023 | 0.5 | yes |
| PA rate 2025 D2 K % | 17.05 | 17.30 | -0.250 | 0.5 | yes |
| PA rate 2025 D2 BB % | 11.20 | 11.20 | +0.000 | 0.5 | yes |
| PA rate 2025 D2 HBP % | 3.66 | 3.70 | -0.043 | 0.5 | yes |
| PA rate 2025 D3 K % | 16.48 | 16.40 | +0.075 | 0.5 | yes |
| PA rate 2025 D3 BB % | 10.89 | 11.10 | -0.214 | 0.5 | yes |
| PA rate 2025 D3 HBP % | 3.90 | 4.10 | -0.195 | 0.5 | yes |
| whiff per swing, full games <= 2025, D1 % | 22.75 | 22.40 | +0.350 | 0.5 | yes |
| whiff per swing, full games <= 2025, D2 % | 21.91 | 21.60 | +0.311 | 0.5 | yes |
| whiff per swing, full games <= 2025, D3 % | 20.16 | 20.10 | +0.057 | 0.5 | yes |
| HS 2022-25 PA rate K % | 20.34 | 20.33 | +0.013 | 0.3 | yes |
| HS 2022-25 PA rate BB % | 14.61 | 14.54 | +0.065 | 0.3 | yes |
| HS 2022-25 PA rate HBP % | 3.54 | 3.55 | -0.009 | 0.3 | yes |
| HS 2022-25 swing % (hit-by-pitch pitches in the denominator) | 40.29 | 40.70 | -0.413 | 0.3 | **no** |
| HS 2022-25 swing % (hit-by-pitch pitches left out, as Claude's) | 40.67 | 40.70 | -0.028 | 0.3 | yes |
| HS 2022-25 whiff per swing % | 24.58 | 24.60 | -0.024 | 0.3 | yes |
| HS count replay vs scorecard count % | 99.93 | 99.60 | +0.328 | 0.3 | **no** |

