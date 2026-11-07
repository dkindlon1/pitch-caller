# v1.0 Phase 7: learner safety switch (app/learner_tune.js)

Seasons: tuning 700-759 (60 noise-chasing, 60 real learner), held-out 800-829 (30 noise-chasing), false-off 900-929 (30 real learner, right grades). 300 s.

Current setting (margin 0.015, z 1.645, window 300): tuning catches 46/60, false 2/60; held-out catches 26/30; fresh false 1/30 (learner.js's own flag agrees: {"tuneCatch":46,"tuneFalse":2,"heldCatch":26,"freshFalse":1}).

No setting has zero false switch-offs on the tuning set.

| margin | z | window | tuning caught /60 | tuning false /60 | held-out caught /30 | fresh false /30 |
|---|---|---|---|---|---|---|
| 0.008 | 1.282 | 300 | 56 | 15 | 28 | 11 |
| 0.008 | 1.282 | 450 | 56 | 15 | 29 | 10 |
| 0.008 | 1.282 | 600 | 56 | 15 | 29 | 9 |
| 0.008 | 1.645 | 300 | 49 | 12 | 26 | 6 |
| 0.008 | 1.645 | 450 | 53 | 12 | 25 | 6 |
| 0.008 | 1.645 | 600 | 54 | 11 | 29 | 5 |
| 0.01 | 1.282 | 300 | 55 | 8 | 28 | 8 |
| 0.01 | 1.282 | 450 | 55 | 7 | 29 | 8 |
| 0.01 | 1.282 | 600 | 56 | 7 | 29 | 8 |
| 0.01 | 1.645 | 300 | 48 | 6 | 26 | 5 |
| 0.01 | 1.645 | 450 | 52 | 5 | 25 | 5 |
| 0.01 | 1.645 | 600 | 52 | 5 | 29 | 5 |
| 0.012 | 1.282 | 300 | 55 | 4 | 28 | 4 |
| 0.012 | 1.282 | 450 | 55 | 3 | 29 | 3 |
| 0.012 | 1.282 | 600 | 55 | 3 | 29 | 3 |
| 0.012 | 1.645 | 300 | 47 | 2 | 26 | 4 |
| 0.012 | 1.645 | 450 | 51 | 2 | 25 | 3 |
| 0.012 | 1.645 | 600 | 49 | 2 | 28 | 3 |
| 0.015 | 1.282 | 300 | 54 | 3 | 28 | 1 |
| 0.015 | 1.282 | 450 | 54 | 3 | 28 | 1 |
| 0.015 | 1.282 | 600 | 55 | 3 | 29 | 1 |
| 0.015 | 1.645 | 300 | 46 | 2 | 26 | 1 |
| 0.015 | 1.645 | 450 | 47 | 2 | 25 | 1 |
| 0.015 | 1.645 | 600 | 49 | 2 | 28 | 1 |
