# v1.0 build report

Plan: `docs/PLAN_v1.0_2026-11-09.md` (Drew's Nov 9 decisions D1–D11). Evidence: `docs/REVIEW_v0.9_2026-11-08.md`.
Every step appends its proof commands and the captured output here.

## Branch reset (Nov 10)

`v1.0-work` was rebuilt from `dc7cd2f` (end of Step 0). Step 0 had not found the Nov 9 plan in the repo and restored
the scrapped Nov 6 plan (`docs/PLAN_v1.0.md`) instead (`docs/STEP0_v1.0_REPORT.md` item 7), so the 16 commits after
Step 0 (Phases 1–4: RP1–RP3, CR1/CR2, guard split, usage-weighted operator, at-bat plan, pitcher-side fits) followed
the wrong plan. They are parked unchanged on branch `v1.0-nov6-line` (`48fae8b`). The Nov 6 plan file is removed here;
it remains in that branch's history.

## Step 0 — Freeze the start line

Done before the reset and kept: see `docs/STEP0_v1.0_REPORT.md` (commits `5d1ce86`, `0fc7d6f`, `dc7cd2f`).
Re-verified in a fresh checkout below before Step 1.
