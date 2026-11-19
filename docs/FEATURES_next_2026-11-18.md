# PitchIQ: next features (Nov 18, 2026)

Direction doc from Drew's brainstorm on Nov 18. Each section has (or will get) its own plan before any code.
Items marked **(default)** are Claude's suggestion where Drew didn't decide.

Plans written Nov 18: PLAN_style_layer + CARDS_style_questionnaire, PLAN_reports_recap, PLAN_outcome_tracking,
PLAN_opponent_database, PLAN_gameplan_why, PLAN_watch_security; exploration: EXPLORE_learning_v3.

## 0. The rule above everything
The engine's logic, statistics and capabilities stay the main driver of every call. Coach style and pitcher style
**adjust** the engine inside a bound; they never replace it. Hard rules (for example no chase pitch at 3-0 / 3-1) are
never overridden by style.

## 1. Style layer: coach and pitcher → PLAN_style_layer_2026-11-18.md
## 2. Pitch outcome tracking + peak profile → PLAN_outcome_tracking_2026-11-18.md
## 3. Reports and analytics → PLAN_reports_recap_2026-11-18.md
## 4. Opponent database → PLAN_opponent_database_2026-11-18.md
## 5. Game plan preview + 6. "Why" button → PLAN_gameplan_why_2026-11-18.md
## 7. Watch: prototype code exists (unverified on hardware); security → PLAN_watch_security_2026-11-18.md
- Sender: laptop in Chrome for now; iPad Safari has no Web Bluetooth, pinned for later.
- Haptics: arrival only. Haptic-only calls parked.

## 8. Optional, low priority
- Voice charting, only if actually faster than tapping. Bluetooth radar for velo today.

## 9. Parked or dropped
- Catcher tapping results on the watch; catcher / coach training mode; program-wide style; "verified data" badge;
  hitter-side product (later, a different product).

## 10. Learning v3 (exploring, not committed) → EXPLORE_learning_v3_2026-11-18.md
Design now, build after a real season.

## 11. Hitter model revamp + large data gather (new, Nov 18; separate task, not planned yet)
Drew: the hitting model needs a revamp to be more realistic, and that needs a large data gathering / scraping effort.
A whole separate task with its own planning rounds.
- History to read first: HITTER_FOUNDATION_REPORT, the Nov 6–7 hitter-model work (separate chat), PLAN_E7_statcast_refit
  (shelved), v1.1 / v1.2 hitter tags (BUILD_v1.2_REPORT Part B).
- Known data: MLB Statcast pitch-level (public; already used); public college team stat pages (season lines; already
  used for the spread calibration). Pitch-level amateur data is mostly not public; what else exists needs research.
- Ground rules carried from earlier work: respect site terms and bot checks (Harvard's bot check was not worked
  around before); non-commercial datasets (e.g. OpenCommand) are research checks only, not shipped.
- Scraping runs from Drew's PC / Claude Code (this cloud workspace can't reach most sites).

## 12. Suggested build order (default)
1. Logging additions (engine mix, whose style applied). 2. Opponent database. 3. Style layer. 4. Reports + recap.
5. Outcome tracking. 6. Game plan + "why". 7. Watch security (fake-tested). The hitter model revamp may come before
or alongside these once planned, since style, the game plan and the sims all read the hitter model.

Update (Nov 18, evening): the hitter revamp runs in parallel. Build 1 = logging + reports/recap
(PROMPT_build_logging_reports_2026-11-18.md); engine math stays untouched until v1.3 merges.
