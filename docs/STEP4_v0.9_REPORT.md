# v0.9 Step 4 report: intent labels (item 4), display only

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session.

## What was built

- **`engine.py` / `app/engine.js`:** `intent_label` / `intentLabel` gives each call one job: Get it over, Expand, Finish, Setup, Get ahead or Early off-zone. The rule is the plan's, first match wins. Setup means the call costs more now than the cheapest myopic call b* (by more than 0.0005 × run scale) but beats it on full cost. Setup and Early off-zone calls also name the mechanism: whichever of timing, eye level, repeat or tunneling most weakens the call against b* when it is switched off. Side to side did not ship in Step 3, so it isn't on that list. Each label comes with a coach-language line.
- **It is a function, not a flag.** The call path never calls it; it runs after the call is drawn, like the why line. With nothing feeding back, there is no setting under which it can change a call, so the plan's `intent_labels` flag isn't needed.
- **App:** the label is computed after the call is shown, off the critical path like the why line, and stored on each pitch's event as `v08.intent` and `v08.mechanism`. `dist/pitch-caller.html` is rebuilt. Showing it on screen is left to the UI redesign branch.
- **Simulator:** v0.8 games log an `intent` column for the read-through.
- **Supabase:** `supabase/migrations/20261105000000_v09_intent.sql` adds generated columns `intent`, `intent_mechanism` and `why_line` on `events`. **It is not applied to any project.**

## Gate: pass

| Check | Result |
|---|---|
| Constructed cost vectors, every rule including ties (`tests_v09_step4.py`) | 13/13 |
| Invariants on 3,000 random situations: no Setup with three balls, Expand and Finish only with two strikes, no Early off-zone with two strikes or three balls, deterministic | 0 violations |
| Python vs JS: pick, label, mechanism and line on 150 golden cases (`golden/labels_parity.js`) | 150/150 identical |
| No call changes: v0.8 golden in Python and JS, v0.7c golden in Python and JS | all exact |
| Simulated game (seed 11, D3) with the label column | every earlier column identical |
| `tests.py`; v0.8 suites; Python/JS parity on 150 fresh cases | 19/19; matches the recorded results (step 6 at 6/7 is the known one); pass |
| App: game-day, v0.8 and replay browser suites; new `v09_labels_e2e.js` | all pass; the 200 ms check came in at 145 ms; the event stores the label |

## What the labels show

Across the 3,000 random situations: Get ahead 50%, Finish 31%, Get it over 15%, Expand 4%, and **Setup 2 calls (0.07%)**. As Step 1 found, v0.8's fitted weights leave almost no look value, so the engine almost never makes a pure setup call. That will be re-measured once the guardrail comes off in Step 4b. The plan set no target mix.

## Not done

On-screen display (UI redesign branch). Applying the migration to Supabase (waits for your go-ahead).
