# PitchIQ V1.3 — Integration & Deployment audit (feat/hitter-v13-final @ c602f1c)

Worktree: `/home/claude/audit/wt-integration` (branch `audit/wt-integration`, nothing committed). The shared repo is a depth-1
shallow clone, so for history I made a separate partial clone at `/home/claude/audit/full-clone`; old builds are in
`/home/claude/audit/integ_old/`, logs in `/home/claude/audit/integ_logs/`, ad-hoc scripts in `/home/claude/audit/integ_scripts/`.

## 1. Verdict
**The subsystems work together. The release does not: grade C.** D2 is wired from the app through logging, the DB records and
the portal. Logging and drift change no call under the V1.3 engine. The web site builds and its unit tests pass once the one
stale data file is regenerated. But the deploy gate is red for structural reasons: CI stops at its first failing suite,
`site_e2e` has a 5-group pin, and the D2 release guard trips with no ruling to override it. The version stamp was never
bumped. A rollback after D2 goes live would leave D2 games with no call.

**Correction to the brief:** `web/lib/engine_data.json` is **not** stale. It is byte-identical to `app/engine_data.json` (cmp,
version `c756860d96`, has `TABLES.{versions,zone,mp,count}`). Only `web/lib/engine_data_d3.json` is stale (version `051dcfaf48`,
`TABLES` = versions/zone/count, **no `mp`**). That gap alone causes the `reading 'levels'` crash (MP lookup).

## 2. Findings

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| I-1 | BLOCKER | `web/lib/engine_data_d3.json` stale (no `TABLES.mp`); nothing in test-app.sh guards it | `python3 -c` key dump above; `node --test web/lib/engine_data_d3.test.ts` → `TypeError ... reading 'levels'`; CI run 46035485079: web unit 105/107, web-shell `npm run build` "Error occurred prerendering page "/"". After `node web/scripts/trim-engine-data.cjs` in my worktree: `npm run typecheck` exit 0, `npm test` **109/109**, `npm run build` **exit 0**, `/app/game/index.html` carries data `c756860d96` | Site home page and Playground crash; Vercel build fails | Lead's regen (verified sufficient for unit + build). Also add a check to `scripts/test-app.sh`: `node --test web/lib/engine_data_d3.test.ts` (or regenerate + `git diff --exit-code`) next to the existing engine.js/engine_data.json cmp loop | SAFE-NOW |
| I-2 | MAJOR (CI gate) | After I-1, `site_e2e` still fails: pinned to "five candidate calls"; V1.3 gives 4 groups at the story spot | `node web/tests/site_e2e.js` → `FAIL stop 4 puts five candidate calls around the watch`, then `TypeError ... reading 'x'` (site_e2e.js:81 `chips[4]`): the crash skips ~46 later checks. With the pin relaxed to ≥4: **56 ok / 1 FAIL**, the same pin under reduced motion (line 167 `still.chips === 5`). `integ_scripts/story_groups.ts`: V1.3 = Fastball outside 40.4 / Slider over 28.9 / Changeup over 20.7 / Slider outside 9.9 (4 groups); main = 5 groups. The story guard (top group "Fastball, outside") still holds | CI `web` job stays red after the data fix. The page renders fine (`Film.tsx:47` slices up to 5) | Test-only: expect `min(5, story.groups.length)` chips (both lines 80-81 and 167) | SAFE-NOW (test-only) |
| I-3 | BLOCKER (needs ruling) | `release_guard_d2.py` FAILS: D2 ships half-fitted, and the app text says the opposite | `python3 release_guard_d2.py` → exit 1, 17 findings: `D2_PLACEHOLDERS = [LEVEL, PROFILES, MOVE_RATIO, A_BAR, I_BAR_UMP, SIM.*, OUT_TABLE, RUNNER_FIT, RUN_GAME, HITTER_SPREAD, WE]`. D2's count layer, mp, RE and CV are its own (`count d2==d3: False`, `mp: False`, `RE: False`, `CV: False`, `LEVEL: True`). `grep` of DECISIONS_refit_v13.md: no ruling overrides the guard | Coach sees "College D2: Uses the D3 numbers until there's D2 data" (`index.src.html:1573`), which is now false for the hitter model. D2 fatigue (75), confidence cutoff (0.45), win tables, typed in-play and the report/learner league averages (`report_data.ts:311` "D2 (D3 numbers)", `learn.js:217`, `learner.js:751`) are D3's | Drew rules: (a) ship D2 with the listed tables still D3's: rewrite the two UI strings, narrow the guard to an allow-list, re-pin `tests_v13_d2` and `d2_e2e`; or (b) fit the remaining tables from the desktop data first | NEEDS-OWNER-RULING (+NEEDS-DATA for b) |
| I-4 | MAJOR | Production engine refuses `college_d2`: mixed-version and rollback hazard | `integ_levels.js` on main's engine: `THROWS unknown level "college_d2"`. In a browser, main's dist with a D2 setup: `{"thrown":"Error: unknown level \"college_d2\" | render: Error: ...","call":null}`. The V1.3 dist in the same spot gives a call. `roster.js:1594` `if (rec.level) st.level = rec.level` (no check). Main's `gameplan.ts:40` rejects D2 ("Pick the level.") | (a) An installed iPad still on the old app opens a D2 game plan and gets **no call** (the service worker holds updates during a live game and until reopened with signal). (b) **Instant Rollback** to the main deployment once any D2 org, team or plan exists breaks every D2 game on every device. The builds 1-4 rollback recipe does not cover this | Before release, either hotfix main (v1.4.x) so its engine aliases `college_d2→college_d3` (as `WE_LEVEL` already does), or write the rollback step: update `programs.level`, `organizations.level` and plan docs from `college_d2` to `college_d3` before rolling back. Optional: make the app fall back to `college_d3` with a toast for any level it doesn't know (no change to known-level calls) | SAFE-NOW (mitigation) / NEEDS-OWNER-RULING (which) |
| I-5 | MAJOR | Version stamp not bumped: V1.3 calls are logged as engine 1.2.3 | `index.src.html:174 APP_VERSION = "1.4.0"`, `engine.js:159 VERSION = "1.2.3"`. A seeded D2 game (`integ_scripts/d2_events.js`): 60 events, all `v.engine "1.2.3"`, `v.data "c756860d96"`. Built shell: `APP_VERSION = "1.4.0"`. No v1.3 doc plans a bump (grep) | The release step "check the version line on every iPad" can't tell V1.3 from production. Logs, replays and reports can tell the engines apart only by the data hash | Bump to `1.5.0` / engine `1.3.0`, rebuild dist, update the 2 version-line pins (`v121_shake_e2e.js:29`, `v123_fixes_e2e.js:78`). No call moves | SAFE-NOW |
| I-6 | MAJOR | CI has given **zero** integration evidence for V1.3 | `scripts/test-app.sh` is `set -euo pipefail`. `gh run view 46035485079`: engine-and-app ran 2m47s and stopped after `tests.py: exit=1 passed=38 failed=7`, so none of the ~66 later suites ran (dist freshness, parity, app e2e, d2_e2e, logging/drift). web-shell never got past build, so portal, gameplan and offline-game e2e have not run on Supabase. The build log's "52/67" comes from local keep-going copies | "Documented passing" is unverified by CI. A real regression in any later suite would be invisible until the history suites are cleared | Clear the history suites by re-pinning per ruling (see I-7), or temporarily run test-app in keep-going mode that lists every failure and still exits 1 | SAFE-NOW (keep-going) |
| I-7 | MAJOR (answer to Q3) | `logging_exact_test` and `drift_exact_test` are stale **by construction**, not hiding breakage. They need re-pointing, not deleting | Rebuilt the base commits' app sources with the V1.3 `engine.js` + `engine_data.json` (`integ_old/8ee2fdc`, `integ_old/3e4660b`), ran with `OLD_DIST=`: **logging 3/3 configs pass** (cfg0 7/7 ok, 266 = 266 events; cfg1+2 17/17, 511 pitches field for field, mix sums to 1, top-5 = first 5 of the mix). **Drift 14/14** (964 pitches, notes fired up to 2). Against the original 8ee2fdc dist: `first difference at event 0: contact, end, kind, out, paEnd, pitchName, pred, prob, quad, res, sit, v08`, i.e. engine numbers | As run in the suite they can never pass for any new engine, so they protect nothing | Re-point each test's base to "base app sources + current engine files" (build it in the test from `git archive BASE app` + copy engine.js/engine_data.json). That keeps the "logging/drift changes no call" property for every future engine. Test-only | SAFE-NOW |
| I-8 | MINOR | `d2_e2e` / `tests_v13_d2` failures are only the D2 == D3 pins; the wiring works | d2_e2e: 11 ok / 1 FAIL (`PLACEHOLDER_D2: the D2 call is exactly the D3 call`). 9 innings, 120 pitches, saved at college_d2, no page errors. tests_v13_d2 9/13: Python = JS at D2 (max diff 3.67e-14), both engines take D2. All 4 failures are D2 == D3 checks. My extra check: 60 events, all `sit.level college_d2`, 55 engine calls each with a full mix summing to 1, game record `college_d2`/final | None for the coach | Re-pin when I-3 is ruled (assert D2's own tables where fitted) | SAFE-NOW after I-3 |
| I-9 | MINOR | `logging_exact_test` crashes in its own diff printer | `TypeError: Cannot read properties of undefined (reading 'slice')` at `logging_exact_test.js:89` (`JSON.stringify(undefined).slice`) | A real logging difference prints as a crash, not a field list | `String(JSON.stringify(x))` | SAFE-NOW |
| I-10 | MINOR | `export_data.py --check` exits 1 on a false difference | `python3 app/export_data.py --check` → `3 differences ... (0.45, 0.55, 0.0) vs [0.45, 0.55, 0.0]`, exit 1. The data is current (web copy identical, JS parity passes) | Any release step using `--check` raises a false alarm | Compare after a JSON round trip | SAFE-NOW |
| I-11 | MINOR | Marketing captures still say "engine v1.2.3" | `web/content/at-bat.ts:1`, `candidates.ts:5`, `mix.ts:5`. Replayed on V1.3: all 4 captured at-bat calls are still in the mix (12.4 / 9.8 / 12.5 / 43.4%), so the strip works | Public copy states the wrong engine; captured "why" lines come from v1.2.3 | Re-run `scripts/capture-at-bat.cjs` etc. after I-5 | SAFE-NOW |

## 3. Consumer inventory: what changed on the branch and what I checked
`git diff --stat 8bcf909 c602f1c` (merge-base = main tip; main has 0 commits not in the branch). Outside the engine, the only
changes are the D2 level entries and the MLB league averages, in these files: `index.src.html`, `roster.js`, `learn.js`,
`learner.js`, `report_data.ts`, `gameplan.ts`, `billing/actions.ts`, `new/page.tsx`, `page.tsx`, `t/[team]/page.tsx`,
`outing.tsx`, `export_data.py`.
- **Level lists:** grep for `college_d1`/`college_d3:` without `college_d2` across app/web/scripts/supabase: every per-level map
  has D2 (MOVE_RATIO/PROFILES get D2 at `engine.js:115`). JS engine at each level a consumer can send gives valid mixes summing
  to 1 for hs, travel, d3, d2, d1 and mlb. `null`/`undefined`/`"college"` throw, the same as on main (pre-existing).
- **Engine API / data shape:** V1.3 reads no new Situation fields (comm of `s.*` names old vs new: none added). Exports are
  additive (`v13tables`, `pv`). No new pitch kinds.
- **Supabase:** no migration changes on the branch. Team/org level is free `text` (only `waitlist.level` has a CHECK). D2 needs no
  migration. `promote.yml` would be a no-op.
- **Watch:** `watch/` and `app/watch.js` untouched. watch_test 108 ok, watch_sec_test 22 ok, watch_e2e 47 ok.
- **Portal/report:** `report_jobs`, `report_pdf` and `upload_data → engine_server.proposeOpts(level)` handle D2 (PROFILES.college_d2
  exists). Report comparisons for D2 use D3 averages (I-3).
- **app/dist:** `cd app && python3 build.py` → `git diff --stat app/dist` empty, so dist is current. `app/{engine.js,
  engine_data.json,peak.js}` = `web/lib/*` (cmp).

## 4. Tests run (my worktree, `nice -n 10`)
| test | result |
|---|---|
| db_test / import / import_opp / peak / rails / schema / pitch_rules / kinds / lean / hitter_tags | 18 / 14 / 7 / 23 / 31 / 24 / 41 / 23 / 8 / 3 ok, 0 FAIL |
| learn_test | 27 ok, 0 FAIL (an earlier run timed out at 400 s under box load and was rerun) |
| watch_test / watch_sec_test / watch_e2e / smoke | 108 / 22 / 47 ok; smoke "passed", no errors |
| game_mix_e2e | 44 ok, 0 FAIL (532 s) |
| d2_e2e | 11 ok, 1 FAIL (placeholder pin only) |
| tests_v13_d2.py | 9/13 (4 placeholder pins) |
| release_guard_d2.py | exit 1, 17 findings |
| logging_exact_test vs original 8ee2fdc | FAIL at event 0 (engine numbers), then crash (I-9) |
| logging_exact_test vs 8ee2fdc rebuilt on V1.3 engine | 3/3 configs pass (7 + 17 checks) |
| drift_exact_test 4 games vs 3e4660b rebuilt on V1.3 engine | 14/14 |
| D2 logged-events check (`integ_scripts/d2_events.js`) | 60/60 events at college_d2; mixes sum to 1; engine stamp "1.2.3" |
| old (main) app with a D2 setup (`integ_scripts/old_app_d2.js`) | no call; `unknown level "college_d2"` |
| web (after d3 regen): `npm ci`, typecheck, `npm test`, `npm run build` | ok / exit 0 / 109/109 / exit 0 |
| web/tests/site_e2e.js | 10 ok then crash on the 5-chip pin; with the pin relaxed 56 ok / 1 FAIL (same pin) |

Uncommitted edits in my worktree (audit only): `OLD_DIST`/`CFG_ONLY` env hooks in the two exact tests, the relaxed site_e2e
pin, regenerated `web/lib/engine_data_d3.json`.

## 5. Deploy path for V1.3 (what Drew would run) and what breaks today
1. Preconditions: I-1 regen. I-2 test fix. Ruling on I-3. I-5 bump. History suites re-pinned (I-7 for logging/drift).
   **All 4 CI jobs green on the branch.**
2. `git checkout main && git merge --ff-only feat/hitter-v13-final` (fast-forward is possible: merge-base 8bcf909 = main tip,
   135 commits).
3. Vercel: turn off "Auto-assign Custom Production Domains" (as in RELEASE_builds_1-4 step 5), then push main. The production
   build runs `prebuild` (`web/scripts/game-shell.mjs`), which bakes `app/dist` into `/app/game/` with a content-hash service
   worker. Wait for CI on main.
4. Supabase: nothing to promote (no new migrations). Optionally run `promote.yml`'s dry run to confirm prod is at
   `20261119020000_watch_security`.
5. Promote the Vercel deployment. iPads pick up the new app when opened with signal and not mid-game. Check the version line
   (only meaningful after I-5).
6. Tag `v1.3`. Rollback = Vercel Instant Rollback to the main build, **plus the D2 data step in I-4**.

**If main were pushed at this tip:** the Vercel build fails at prerender "/" (TypeError 'levels'), so the deployment errors and
production keeps serving main: a safe failure, nothing changes for users. **After only the d3 regen:** it deploys. What's left
is D2 half on D3's numbers with misleading copy (I-3), an unverifiable version line (I-5), and the mixed-version / rollback
D2 hazard (I-4).

## 6. Not verified, and why
- web-shell e2e (shell, offline game, portal, gameplan incl. the new D2 picker check, billing, uploads, retention) needs
  `supabase start` (Docker images). Too heavy for this shared box. test-sql not run: the DB is unchanged vs main, which passes.
- Vercel project settings (root dir, auto-assign state, env), the prod DB migration state, and real iPad service-worker
  update timing: no access, and the rules forbid touching production.
- `v12_oldapp_test` / `tests_v11`/`v12*` exact rows need git history. The shared repo is depth-1 shallow, so these can't
  run in `/home/claude/pitch-caller` at all. I covered the logging/drift pair from the separate clone.
- Python engine suites, sims, and the calling quality of D2's own tables: other auditors' scope.
