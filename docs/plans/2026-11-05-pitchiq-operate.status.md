# Plan 0 status

| Item | Status | Evidence (Nov 5) |
| --- | --- | --- |
| Task 1 name/domain | Deferred by Drew ("change the name later") | — |
| Task 2 GitHub repo | Exists, private: dkindlon1/pitch-caller | list_repos: visibility private |
| Task 2 CI | **Passing** on `pitchiq-platform` (commit 7622fc2): SQL job 116 checks on Postgres 17, engine/app job 182 checks + reproducible build + smoke, web job skipped (no web/ yet). Takes ~17 min | Actions run 42077766552, job logs |
| Task 2 ci_fails_on_empty | Done at the runner level (`scripts/run-check.sh`): fails on 0 checks or any FAIL line | Ran locally: empty command exit 1, FAIL line exit 1 |
| Task 3 prod project | Created by Drew: `pitchiq-prod`, ref `csjgwpgqxaywgspxakfs`, us-east-1, Postgres 17, free tier | list_projects: ACTIVE_HEALTHY; public tables: 0; security advisors: 0 lints |
| Task 3 promote workflow | Written (`.github/workflows/promote.yml`). Not run yet: needs the file on `main`, a `production` environment with Drew as required reviewer, and the `SUPABASE_PROD_DB_URL` secret | Commands tested on local Postgres 17: dry run listed 1 migration, push applied it, second dry run up to date; RLS check passes, and fails on a table without RLS |
| Task 3 migrations on prod | **Applied** by the first promote run (Drew started it). Prod: 14 public tables, 0 without RLS, migration 20261103000000 recorded, 19 pc_ functions. The run was marked failed only because its up-to-date check expected JSON; fixed in ddddc47 | Actions run 42083213921; SQL on prod; advisors: 16 WARN (security-definer helpers callable by signed-in users, fix planned in Plan 1), 1 INFO (invites has RLS and no policies, intended) |
| Task 3 "Confirm email" on | Not verified (not visible through the tools); Drew to check in Auth settings | — |
| Free-tier slot | LAUGHAPP paused (restorable from the dashboard) to free a slot | get_project: INACTIVE |
| Task 6 landing page | **Built and passing in CI** (637596c): Next.js 16 in web/, on the Pitch Caller design system; waitlist migration 20261105180000; waitlist_test 22, landing_e2e 20, 8 unit tests. Lighthouse mobile locally: perf 93-97, LCP median 2.3 s (one run 2.9 s), CLS 0, a11y/BP/SEO 100. Not deployed: needs a Vercel account, the three server settings, and a promote run for the waitlist migration | Actions run 42088221865 |
| Tasks 4–5 (Sentry, Resend) | Not started: need Drew's accounts | — |
