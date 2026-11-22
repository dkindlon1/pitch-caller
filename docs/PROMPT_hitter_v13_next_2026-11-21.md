# Hitter v1.3: Drew's decisions on the prework + next steps (Nov 21, 2026)

Tell Claude Code: "Read docs/PROMPT_hitter_v13_next_2026-11-21.md and carry it out."

Follows `docs/BUILD_v13_prework_REPORT.md`. Same rules as the prework prompt:
- local only; never `main`; nothing ships;
- commit as Claude; push feature branches only;
- nothing called done unless it was run and the output read;
- 2026 stays held out;
- the college archive stays read-only.

## Drew's decisions (Nov 21)
1. **Hanger principle.** Zone effects follow the data by location: off-speed over the heart is treated like the data
   says (Single-A 0.88× hard, 0.98× whiff vs a fastball there).
   - Any extra "hanger" penalty applies only when that off-speed pitch is below his normal today (not landing, or
     stuff / strike rate down). It never applies to every off-speed pitch in the heart.
   - When the zone table is wired, v1.2's flat +0.5 hanger term goes. Its quality-gated replacement is sized by graded
     rows **(default)**.
2. **Zone numbers wait.** Drew approves the zone table's numbers only after the pulls finish (multiple seasons of
   Single-A and MLB, plus Triple-A) and the table is regenerated. The principles above are decided now.
3. **Refit regrading.** Drew rules now on the three broken limits (R1, Q4, S5) and the 25 HS / travel changed calls.
   - Every other moved row is graded **once, after the college core lands**, not twice.
   - `feat/hitter-v13-refit` stays unmerged until then.
   - The old exact-comparison tests get new references after that full regrade.
4. **Coverage rule: undecided.** More D2 / D3 2025 data is being collected now. Re-check with numbers when it lands
   (task D).

## Tasks

### A. Decision sheet: `docs/DECISIONS_refit_v13.md` (for Drew; plain coach language, short)
1. **For each broken limit** (tests.py R1 mixing; tests_v11 Q4 riding four-seam up with two strikes; tests_v12 S5
   sinker gate):
   - what the limit checks, who set it and when (cite the doc and decision);
   - what the refit changed that moved it (which inventory numbers), and before → after;
   - whether the data behind the refit supports the move. Example for Q4: the zone seed's B1 says high fastballs pop up
     1.63× as often, which favors the high fastball;
   - 2–3 options (keep the limit and constrain the engine, change the limit, accept the new behavior), with one
     recommendation.
2. **The 25 HS / travel changed calls:** each as situation → call before → call after, with why it moved and a
   **proposed** grade.
3. **One recommendation each on the open items:**
   - HARD_SD's definition. Default: the talent SD with luck removed, matching Drew's rule that a grade point = one SD
     of real players.
   - The 0.002-nat minimum effect.
   - Re-freezing the landing model from Single-A.
   - R12 (v1.2's targets were set from 2026 stats).
   - The MLB run-value base scaling every level by ~3.8%. Default: once college run values exist, college levels stop
     taking any scale from MLB.

### B. The 2-for-10 rule
It fails on current `main` (144/150). Its last recorded pass (150/150, Nov 7) was on the hitter-foundation branch, which
was later scrapped, so it may never have passed on `main`'s line.
- Find whether and when it last passed on `main`'s history (bisect over tags v1.0 → v1.2.3 and builds 1–4).
- Report the commit and cause if it regressed, or that it never passed on this line.
- Don't fix it without Drew.

### C. Quality-gated hanger (design only)
Add a short section to the decision sheet: how the hanger penalty would key off "this pitch is below his normal today"
using signals the engine already has (not-landing, strike rate vs his usual, stuff drift). Include a proposed size and
the graded rows that would set it. No engine change yet.

### D. Coverage, once more data lands
As ChatGPT adds games, run `python -m hitter_data.update`. Then report per level × season:
- full-string games (count and share);
- a **representativeness check:** full-string games vs all games on K%, BB%, HBP%, runs per game and home runs per
  game, with SEs.

Drew decides the coverage rule from this.

### E. Pulls
Keep the MLB / MiLB pulls running to completion.
- When they finish, rerun `python -m hitter_data.zone_seed --write-doc`, with multiple seasons, recency weights, a
  held-out latest season per level, and Triple-A in the transfer check.
- Rerun the shared refit on the full data on `feat/hitter-v13-refit` (a new numbers commit) and refresh the
  changed-call list.
- Tell Drew the zone table is ready for approval. Don't approve or wire it.

## Report
Append a short "Nov 21 follow-up" section to `docs/BUILD_v13_prework_REPORT.md`: what was run and the results, and the
path to the decision sheet. Finish with a three-line summary.
