-- PitchIQ coach portal (Plan 3a, docs/plans/2026-11-05-pitchiq-coach-portal.md).

-- Each pitcher's game pitches per day over the last 30 days (the team's days), for availability and eligible-on.
-- Security invoker: it reads through row level security as the caller, so only the team's coaches get rows (players
-- can't read events). Games charted twice count once; deleted games and pitches don't count.
create function public.pc_team_workload(team uuid) returns table (pitcher_id text, day text, game_id text, pitches int)
language sql stable security invoker set search_path = '' as $$
  select e.pitcher_id, g.doc ->> 'date', e.game_id, count(*)::int
  from public.events e
  join public.games g on g.program_id = e.program_id and g.id = e.game_id
  where e.program_id = team and e.pitcher_id is not null
    and (e.type is null or e.type = 'pitch') and coalesce((e.doc ->> 'legacy')::boolean, false) = false
    and e.deleted_at is null and g.deleted_at is null and g.doc ->> 'dupOf' is null
    -- (a time zone the database doesn't know counts as UTC, rather than failing)
    and g.doc ->> 'date' >= to_char((now() at time zone coalesce((select z.name from public.programs t join pg_catalog.pg_timezone_names z on z.name = t.timezone
                                                                  where t.id = team), 'UTC')) - interval '30 days', 'YYYY-MM-DD')
  group by e.pitcher_id, g.doc ->> 'date', e.game_id
$$;

-- A team's name and time zone (its dates and rest days), changed by a coach who manages the roster, or the owner.
create function public.pc_set_team(p uuid, team_name text, team_timezone text) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := nullif(btrim(coalesce(team_name, '')), ''); tz text := nullif(btrim(coalesce(team_timezone, '')), '');
begin
  if not private.pc_can_manage(p, 'manage_roster') then raise exception 'you can''t change this team''s settings' using errcode = '42501'; end if;
  if n is null or length(n) > 120 then raise exception 'a team needs a name of up to 120 characters' using errcode = '22023'; end if;
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  update public.programs set name = n, timezone = tz where id = p;
end $$;

revoke all on function public.pc_team_workload(uuid), public.pc_set_team(uuid, text, text) from public, anon;
grant execute on function public.pc_team_workload(uuid), public.pc_set_team(uuid, text, text) to authenticated;

-- the foreign keys the production performance advisor found without an index (Nov 5)
create index guardian_consents_guardian on public.guardian_consents (guardian_user_id);
create index invites_program on public.invites (program_id);
create index members_user on public.members (user_id);
create index minor_releases_program on public.minor_releases (program_id, id);
create index organizations_owner on public.organizations (owner_id);
