-- Pitch Caller v0.8 inputs (docs/SPEC_v0.8.md 8.3). Every record is a JSON document (doc), so sync needs no change:
-- these generated columns only make the new fields queryable. Additive and idempotent.
alter table public.games    add column if not exists home boolean generated always as ((doc -> 'setup' ->> 'home')::boolean) stored;
alter table public.games    add column if not exists sched_innings int generated always as ((doc -> 'setup' ->> 'innings')::int) stored;
alter table public.games    add column if not exists extras_runner boolean generated always as ((doc -> 'setup' ->> 'extrasRunner')::boolean) stored;
alter table public.games    add column if not exists ump_seed text generated always as (doc -> 'setup' ->> 'umpSeed') stored;
alter table public.pitchers add column if not exists pitch_cap int generated always as ((doc ->> 'pitchCap')::int) stored;
alter table public.pitchers add column if not exists time_to_plate numeric generated always as ((doc ->> 'ttp')::numeric) stored;
alter table public.hitters  add column if not exists grade_contact int generated always as ((doc -> 'grades' ->> 'c')::int) stored;
alter table public.hitters  add column if not exists grade_power int generated always as ((doc -> 'grades' ->> 'w')::int) stored;
alter table public.hitters  add column if not exists grade_eye int generated always as ((doc -> 'grades' ->> 'd')::int) stored;
alter table public.hitters  add column if not exists crowds_plate boolean generated always as ((doc ->> 'crowd')::boolean) stored;
alter table public.events   add column if not exists radar numeric generated always as ((doc -> 'v08' ->> 'radar')::numeric) stored;
alter table public.events   add column if not exists engine_v08 boolean generated always as ((doc -> 'v08') is not null) stored;
