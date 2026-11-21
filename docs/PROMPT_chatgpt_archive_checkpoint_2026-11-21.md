# Prompt: ChatGPT archive checkpoint (coverage, rosters, checks, priorities), Nov 21, 2026

For Drew to paste into the ChatGPT session running the college play-by-play collection. Asks for the numbers the hitter
plan needs (PLAN_hitter_model_revamp section 6) before more collecting. Untested.

---

Pause new collection briefly and run a checkpoint on the main archive. Do not edit or delete any raw play rows; work on
copies or with queries. Report numbers exactly as computed; if something can't be computed, say so instead of
estimating.

1. Pitch-string coverage
   - A play line has a "full pitch string" if it contains a count and pitch letters in parentheses, like "(3-2 BBFBKB)"
     or "(0-1 K)". It's "count only" if it has a count with no letters, like "(2-2)". Otherwise it has none.
   - A game is "full" if at least 90% of its plate-appearance-ending lines have full pitch strings, "partial" if some
     do, and "none" if none do.
   - Output coverage.csv with one row per level × season: level, season, distinct_games, full_games, partial_games,
     none_games, full_share, plate_appearances_in_full_games, pitches_in_full_games (sum of letters).

2. Duplicates
   - Each game can appear on both schools' sites. Confirm how distinct games are identified, and report per level ×
     season: raw box-score jobs, distinct games, and duplicates merged.
   - If two copies of the same game disagree (different line counts or text), list up to 20 examples with both
     source_urls.

3. Letter check
   - For plate appearances whose text says "struck out looking", tabulate the last pitch letter. Do the same for
     "struck out swinging". Expected: looking ends in K, swinging ends in S. Report the counts.
   - Count consistency: replay each full pitch string and check that it reaches the final count shown (balls from B,
     strikes from K / S / F with fouls not adding a third strike). Report the share consistent, per level, plus 10
     examples that fail.
   - List every letter that appears in any pitch string, with how often.

4. Rosters
   - Merge the D2 and D3 roster rows (51,271 so far) into the main archive, keeping source_url.
   - Report the share of batters and pitchers in the play rows that match a roster entry with bats/throws filled, per
     level × season.

5. Spot-check
   - Pick 20 random full games across levels and seasons. For each, re-open the source_url and compare the first 10
     play lines to the archive. Report matched / mismatched per game, and quote any mismatch (archive vs page).

6. Priorities for the rest of the run
   - Reorder the pending queue: first, finish D2 and D3 for the 2026 and 2025 seasons; then D1 2026 and 2025; then
     every older season, newest first, all levels.
   - Report pending jobs per level × season after reordering.
   - Keep collecting rosters for every team-season you collect games for.

Deliverables: coverage.csv, duplicates summary, letter-check tables, roster match table, spot-check results, and the new
pending-queue table. Then resume collection in the new order.

---

## Notes for Drew
- Send back the coverage.csv and the check results. They decide which levels can be fit (the plan needs at least half
  the games "full" in 2025 and 2026 per level).
- If the archive is on your PC, Claude can run these checks directly instead.
