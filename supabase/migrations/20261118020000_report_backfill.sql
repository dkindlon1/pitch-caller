-- Review fixes (Nov 19, Drew): the report emails start with this migration. Every game that's already final and every
-- season that already exists is marked as emailed, so the report job sends only for games finished (and seasons marked
-- over) after it runs. Without it, the first run in production would email every past outing to every pitcher with an
-- account and every past game to every coach (and anyone added later would get the whole backlog), because report_mail
-- starts empty. Past reports stay viewable; only the emails are skipped.
-- Marked per game and per season, not per person, so a coach or player added later isn't owed the old ones either.
-- Additive: one new table, filled from the existing rows; nothing existing changes.
create table if not exists public.report_backfill (
  program_id uuid not null references public.programs (id) on delete cascade,
  kind text not null check (kind in ('game', 'season')),
  ref text not null check (length(ref) between 1 and 200),
  marked_at timestamptz not null default now(),
  primary key (program_id, kind, ref)
);
alter table public.report_backfill enable row level security;   -- no policies: only the server's report job reads it
revoke all on public.report_backfill from anon, authenticated;
grant select, insert on public.report_backfill to service_role;

insert into public.report_backfill (program_id, kind, ref)
select g.program_id, 'game', g.id from public.games g where g.deleted_at is null and g.doc ->> 'status' = 'final'
on conflict do nothing;
insert into public.report_backfill (program_id, kind, ref)
select s.program_id, 'season', s.id::text from public.seasons s
on conflict do nothing;
