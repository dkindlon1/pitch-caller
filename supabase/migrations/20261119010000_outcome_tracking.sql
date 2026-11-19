-- Build 3: outcome tracking and the peak profile (docs/PLAN_outcome_tracking_2026-11-18.md 4). Stored after each game by
-- the report job (service role): each pitcher's baseline (his normal, rebuilt after each game) and each outing's
-- findings and drift notes. The pages can work them out again from the raw events with the same code (app/peak.js),
-- and scripts/outcome_check.js checks the stored ones against a separate recomputation. Coaches read them; a pitcher's
-- own outcome tracking comes from his own pitches (pc_my_report), never these rows (they carry the staff-only drift
-- notes). Nothing here reaches the engine. Additive. Applied to the LOCAL Supabase only.
create table public.peak_baselines (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  through_game text,
  data jsonb not null check (octet_length(data::text) < 500000),
  built_at timestamptz not null default now(),
  primary key (program_id, pitcher_id)
);
create table public.outcome_findings (
  program_id uuid not null references public.programs (id) on delete cascade,
  game_id text not null,
  pitcher_id text not null,
  data jsonb not null check (octet_length(data::text) < 500000),
  built_at timestamptz not null default now(),
  primary key (program_id, game_id, pitcher_id)
);
alter table public.peak_baselines enable row level security;
alter table public.outcome_findings enable row level security;
create policy peak_read on public.peak_baselines for select to authenticated using (program_id in (select private.pc_coach_teams()));
create policy findings_read on public.outcome_findings for select to authenticated using (program_id in (select private.pc_coach_teams()));
revoke all on public.peak_baselines, public.outcome_findings from anon;
revoke insert, update, delete, truncate, references, trigger on public.peak_baselines, public.outcome_findings from authenticated;
grant select on public.peak_baselines, public.outcome_findings to authenticated;
