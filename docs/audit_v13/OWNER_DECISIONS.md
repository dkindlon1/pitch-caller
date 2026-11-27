# Owner's (Drew's) engine decisions — what the engine SHOULD do (condensed, engine-relevant only)
Drew is a college pitcher. He judges the engine first by whether its logic matches how a real pitching coach thinks, with
real data weighted above simulation results (sims still matter). He grades the read-through rows himself.

## Calling philosophy
- Calls are probability-based mixes, not deterministic; must not be predictable. Randomness scales with stakes (tightest at
  3-0, 2-2, 3-2; lean harder on best calls in big counts).
- Mixed strategy; think in whole at-bats; no hard-coded count rules except the hard ones below; expand, don't waste; avoid hitter
  strengths over hunting holes; repeat a pitch after a whiff; perceived velocity in sequencing; no third-time-through cliff.
- HARD RULES: never call a chase pitch at 3-0 or 3-1. Never re-call a pitch just shaken off; a second shake of the same pitch in
  an at-bat = out until next batter. 3-1 is not automatically the fastball: best pitch being controlled today, moderate mix
  (top call ~55–70%). Hitter's-count floor counts the fastball as a pitch (≥50% top pitch type at 2-0, 2-1, 3-1).
- First-pitch strike is super important; race to two strikes / pound the zone early. Attack the zone at 2-2.
- "Get it over" off-speed only when that pitch is landing today (accepts it losing ~40%+ of calls when not landing). A pitch not
  landing today can still be used in an up count, as setup, or for a strike to regain confidence.
- Pitch confidence matters more than reading the hitter, especially at lower levels. Better stuff never makes a pitch a worse call.
- Middle (anywhere in zone) fine early and at 1-2; edges fine with two strikes as long as chase and repeat stay available.
- Plus changeup → go away; plus slider to opposite-side hitter → back-foot slider. Same-side sinkers inside.
  High fastball with two strikes = strikeout pitch, can set up, don't over-lean.
- Hitter reads must actually move calls (20+ points): late on fastball → up/in; out front on soft → soft and down; crowding →
  fastball in; fouled straight back → not that pitch there again; hit hard one side → other side; worked earlier → go back;
  landing better than normal → lean on it. Nothing fires on a weak read or plain foul.
- One hard-hit AB isn't enough to avoid a pitch; mashed twice in a game = large soft penalty (not hard exclusion).
  A ball hit hard twice at a spot moves odds there a small amount.
- Fastball middle at 2-0 even vs power hitter is a valid call. Hard foul = normal foul.
- Setups at-bat based; never give up value now to set up later; only when a setup applies; if two calls tie, take the one that
  sets up a payoff. Keep "up then down". Front-door/back-door OK at HS/D3 but don't over-rely; strikes are big.
- Variety: six pitches (FB, CB, SL, CH, cutter, sinker) with profiles; heavy usage OK when quality backs it.
- Shake-off costs little confidence (mostly an at-bat thing). Confidence cutoff has a 0.10 band (no cliff).
- Bases loaded 3-2, 2 out, tie 9th, avg slider: slider middle ~47% / FB ~53% is OK.
- Walk/K link should follow real data (weak). Doesn't care about simulated walk rate per se; runs budget for variety changes was
  0.25 runs/game (ask above that).
- Engine must call a proper game WITHOUT hitter scouting (most HS/D3 coaches have none). Unknown hitter = lineup-slot average
  adjusted by team strength.

## V1.3 hitter model plan (Nov 18–22)
- Core swing/whiff/contact by count first, then capped in-game adjustment (10-point robustness cap), then a few traits per
  hitter with six type presets. Separate model per level (HS/travel, D1, D2, D3), thin cells borrow from neighbors.
- Proof bar: beat raw v1.2 by > 2 SE on a held-out season at each level (+ ≥0.002 nats/pitch, added Nov 27); his rules as hard
  checks + graded rows; sims reported (ask if > 0.25 runs/game).
- Zone effects follow the data by location; "hanger" penalty only when that off-speed pitch isn't landing today.
- Test times through order (smooth, no cliff), RISP, late & close, in-at-bat effects.

## Product context
Coach reads the call on an iPad (or laptop) and signs it; optional watch delivery after coach Accept. Offline play: game plan
downloaded on Wi-Fi, sync after. Learning per pitcher across outings, bounded; never fully takes over the engine. Nothing touches
production without Drew's explicit go.
