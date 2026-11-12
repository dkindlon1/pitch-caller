-- Game plans (docs/PLAN_portal_2026-11-12.md, Drew's Nov 12 calls).
-- A game can be set up on the website ahead of time: the portal writes a games record with status 'planned' (opponent,
-- lineup, today's staff, catcher, level, home/away, innings, what's logged), and the game app on any device opens it.
--
-- Who sees the plan: anyone who calls games, plus coaches the organization's owner has given "See the game plan"
-- (view_plan). Only the owner switches view_plan on or off. The plan lives in games and packs, so those two tables are
-- now readable only by them (directly and through pc_pull, whose select runs under these policies). Every coach still
-- gets the schedule itself (date, opponent, home/away, status) from pc_game_list, with no lineup or staff in it.
--
-- A game in progress stays on the one device calling it: nothing about it is shown anywhere else (events go up when
-- the game ends, as before; the portal only shows that it's live).

-- 1. The toggle. Not part of any preset: call_games already includes seeing the plan, and the owner gives it to others.
create or replace function private.pc_toggle_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['call_games', 'edit_grades', 'review_uploads', 'manage_opponents', 'manage_roster', 'manage_staff', 'view_plan']
$$;

-- whether the caller may see this team's game plans
create function private.pc_sees_plan(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pc_can(p, 'call_games') or private.pc_can(p, 'view_plan')
$$;

-- the teams whose plans the caller may see (one lookup per query for the read policies, like pc_coach_teams)
create function private.pc_plan_teams() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.program_id from public.members m
  where m.user_id = auth.uid() and m.role <> 'player' and private.pc_team_active(m.program_id)
    and (coalesce(((private.pc_preset_perms(m.role) || m.perms) ->> 'call_games')::boolean, false)
         or coalesce((m.perms ->> 'view_plan')::boolean, false))
$$;
revoke all on function private.pc_sees_plan(uuid), private.pc_plan_teams() from public, anon;
grant execute on function private.pc_sees_plan(uuid), private.pc_plan_teams() to authenticated, service_role;

-- 2. Reads: games and packs only for those who see the plan.
drop policy if exists pc_read on public.games;
drop policy if exists pc_read on public.packs;
create policy pc_read on public.games for select to authenticated using (program_id in (select private.pc_plan_teams()));
create policy pc_read on public.packs for select to authenticated using (program_id in (select private.pc_plan_teams()));

-- the row rule pc_push uses (it returns the server's copy of a refused row only to someone who may read it)
create or replace function private.pc_can_read(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a missing pitcherId (NULL) means no, never maybe
  select coalesce(case
    when not private.pc_team_active(p) then false
    when tbl in ('games', 'packs') then private.pc_sees_plan(p)
    when private.pc_can(p, 'view_team') then true
    when private.pc_role(p) = 'player' then case
      when tbl = 'pitchers' then row_id = any (private.pc_my_pitchers(p))
      when tbl in ('checkins', 'sessions', 'readings') then row_pitcher = any (private.pc_my_pitchers(p))
      else false end   -- events, learned and packs carry hitters and game plans: players get their own data through
                       -- redacted functions (Plan 3), never these rows
    else false end, false)
$$;

-- 3. The schedule for every coach: no lineup, staff or catcher, only what a calendar shows.
create function public.pc_game_list(p uuid) returns table (id text, date text, status text, opponent_id text, home boolean, starts text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.doc ->> 'date', coalesce(g.doc ->> 'status', 'live'), g.doc ->> 'opponentId',
         case jsonb_typeof(g.doc -> 'setup' -> 'home') when 'boolean' then (g.doc -> 'setup' ->> 'home')::boolean end,
         g.doc ->> 'time'
  from public.games g
  where g.program_id = p and g.deleted_at is null and g.doc ->> 'dupOf' is null and private.pc_can(p, 'view_team')
  order by g.doc ->> 'date' desc nulls last, g.id
  limit 400
$$;
revoke all on function public.pc_game_list(uuid) from public, anon;
grant execute on function public.pc_game_list(uuid) to authenticated, service_role;

-- 4. Only the owner decides who sees the game plan. Anyone else who manages staff keeps a coach's view_plan as it is:
-- leaving it out keeps it, sending a different value is refused. It never counts against "nobody gives more than he
-- has", since nobody but the owner can give it at all.
create or replace function public.pc_set_member(p uuid, member uuid, member_role text, member_perms jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; cur record; owner boolean := private.pc_owner_can_manage(p); plan_old boolean; plan_new boolean; sent jsonb;
begin
  if not private.pc_can_manage(p, 'manage_staff') then raise exception 'you can''t change this team''s staff' using errcode = '42501'; end if;
  if private.pc_preset_perms(member_role) is null then raise exception 'unknown preset' using errcode = '22023'; end if;
  sent := coalesce(member_perms, '{}'::jsonb);
  if jsonb_typeof(sent) <> 'object' then raise exception 'toggles must be an object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(sent) loop
    if not k = any (private.pc_toggle_keys()) or jsonb_typeof(sent -> k) <> 'boolean' then
      raise exception 'unknown toggle %', k using errcode = '22023';
    end if;
  end loop;
  select m.role, m.perms into cur from public.members m where m.program_id = p and m.user_id = member and m.role <> 'player';
  if not found then raise exception 'not a coach on this team' using errcode = 'P0002'; end if;
  plan_old := coalesce((cur.perms ->> 'view_plan')::boolean, false);
  plan_new := case when sent ? 'view_plan' then (sent ->> 'view_plan')::boolean else plan_old end;
  if not owner then
    if member = auth.uid() then raise exception 'you can''t change your own permissions' using errcode = '42501'; end if;
    if plan_new <> plan_old then
      raise exception 'only the organization''s owner decides who sees the game plan' using errcode = '42501';
    end if;
    -- nobody gives, or takes away, more than he has himself
    if not private.pc_within(p, private.pc_preset_perms(cur.role) || (cur.perms - 'view_plan'))
       or not private.pc_within(p, private.pc_preset_perms(member_role) || (sent - 'view_plan')) then
      raise exception 'you can''t give or change permissions you don''t have' using errcode = '42501';
    end if;
  end if;
  perform 1 from public.programs where id = p for update;
  update public.members set role = member_role,
         perms = (sent - 'view_plan') || case when plan_new then '{"view_plan": true}'::jsonb else '{}'::jsonb end
   where program_id = p and user_id = member;
  if not owner and not exists (select 1 from public.members m where m.program_id = p and m.role = 'head') then
    raise exception 'a team keeps at least one head coach' using errcode = '22023';
  end if;
end $$;
revoke all on function public.pc_set_member(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.pc_set_member(uuid, uuid, text, jsonb) to authenticated;
