-- PitchIQ teams (Plan 1, docs/plans/2026-11-05-pitchiq-foundation.md, amended by A11 in the spec).
--
-- A program is a team: the unit an organization pays for, with its own staff, players and data. Every synced row is
-- already keyed by program_id, so the sync and its cursor logic stay as they were; what changes is who may do what:
--   organizations  own teams and pay for them. The owner manages staff and players on every team of the organization
--                  but sees a team's data only as a member of it.
--   members        per team: a coach preset (head, pitching, caller, viewer) with optional toggle overrides, or player.
--   player_links   which pitcher records a player account speaks for (a parent can link two siblings on one team).
--   invites        link tokens, optionally tied to one confirmed email.
--   minors         players under 13: their account is a parent's, and nothing about them but a placeholder is stored
--                  until that parent consents.
-- A team works only while it is active and its organization is paid up (private.pc_team_active). Billing (Plan 2) sets
-- those through the service role; nothing a client calls can.
-- Helpers live in the private schema, which the Supabase API doesn't expose; row level security calls them as the
-- signed-in user, so that user keeps usage and execute on them.

create schema if not exists private;
-- the first migration's stamp helpers resolved names through public; pin them like everything else
alter function public.pc_stamp() set search_path = '';
alter function public.pc_restamp() set search_path = '';
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ------------------------------------------------------------------ drop the program-scoped rules (0 rows on Nov 5)
do $$
declare t text;
begin
  foreach t in array array['programs', 'members', 'teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games',
                           'events', 'packs', 'readings', 'learned'] loop
    execute format('drop policy if exists pc_read on public.%I', t);
  end loop;
end $$;
drop function if exists public.pc_push(uuid, text, jsonb);
drop function if exists public.pc_pull(uuid, text, bigint, text, int);
drop function if exists public.pc_create_program(text, text);
drop function if exists public.pc_invite(uuid, text, text, text);
drop function if exists public.pc_my_invites();
drop function if exists public.pc_accept_invite(uuid);
drop function if exists public.pc_decline_invite(uuid);
drop function if exists public.pc_staff(uuid);
drop function if exists public.pc_set_role(uuid, uuid, text, text);
drop function if exists public.pc_remove_member(uuid, uuid);
drop function if exists public.pc_cancel_invite(uuid, text);
drop function if exists public.pc_my_programs();
drop function if exists public.pc_can_read(text, uuid, text, text);
drop function if exists public.pc_can_write(text, uuid, text, text);
drop function if exists public.pc_role(uuid);
drop function if exists public.pc_my_pitcher(uuid);
drop function if exists public.pc_my_email();
drop table public.invites;

-- ------------------------------------------------------------------ organizations and teams
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  level text,
  owner_id uuid not null references auth.users (id),
  billing_status text not null default 'pending' check (billing_status in ('pending', 'active', 'locked')),
  billing_changed_at timestamptz,          -- time of the last Stripe event applied (Plan 2 ignores older ones)
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

alter table public.programs
  add column org_id uuid not null references public.organizations (id),
  add column status text not null default 'pending' check (status in ('pending', 'active', 'ending', 'removed')),
  add column ends_at timestamptz,
  add column timezone text not null default 'America/New_York' check (length(timezone) between 1 and 64);
create index programs_org on public.programs (org_id);

-- members: a coach preset or player. Player links move to their own table.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.members'::regclass and contype = 'c' loop
    execute format('alter table public.members drop constraint %I', c);
  end loop;
end $$;
alter table public.members drop column pitcher_id;
alter table public.members
  add column perms jsonb not null default '{}'::jsonb,
  add constraint members_role check (role in ('head', 'pitching', 'caller', 'viewer', 'player')),
  add constraint members_perms check (jsonb_typeof(perms) = 'object' and (role <> 'player' or perms = '{}'::jsonb));

create table public.player_links (
  program_id uuid not null,
  user_id uuid not null,
  pitcher_id text not null check (length(pitcher_id) between 1 and 200),
  linked_at timestamptz not null default now(),
  primary key (program_id, pitcher_id),                -- one account speaks for a pitcher record
  foreign key (program_id, user_id) references public.members (program_id, user_id) on delete cascade
);
create index player_links_user on public.player_links (program_id, user_id);

create table public.invites (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  program_id uuid not null references public.programs (id) on delete cascade,
  role text not null check (role in ('head', 'pitching', 'caller', 'viewer', 'player')),
  pitcher_id text,
  email text check (email = lower(email) and length(email) between 3 and 320),
  under13 boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  cancelled_at timestamptz,
  check ((role = 'player') = (pitcher_id is not null)),
  check (not under13 or (email is not null and role = 'player'))
);
create index invites_email on public.invites (email) where used_at is null and cancelled_at is null;

create table public.minors (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  flagged_by uuid,
  flagged_at timestamptz not null default now(),
  primary key (program_id, pitcher_id)
);
create table public.guardian_consents (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  guardian_user_id uuid not null references auth.users (id),
  method text not null check (length(method) between 1 and 120),
  consented_at timestamptz not null default now(),
  primary key (program_id, pitcher_id)
);
create table public.deletion_log (
  id bigint generated always as identity primary key,
  program_id uuid not null,
  pitcher_hash text not null,
  requested_by uuid,
  deleted_at timestamptz not null default now()
);
alter table public.player_links enable row level security;
alter table public.invites enable row level security;
alter table public.minors enable row level security;
alter table public.guardian_consents enable row level security;
alter table public.deletion_log enable row level security;
revoke all on public.organizations, public.player_links, public.invites, public.minors, public.guardian_consents, public.deletion_log
  from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (private: not callable over the API)
create function private.pc_my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create function private.pc_role(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m where m.program_id = p and m.user_id = auth.uid()
$$;

create function private.pc_my_pitchers(p uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(l.pitcher_id order by l.pitcher_id), '{}'::text[]) from public.player_links l
  where l.program_id = p and l.user_id = auth.uid()
$$;

create function private.pc_preset_perms(preset text) returns jsonb
language sql immutable set search_path = '' as $$
  select case preset
    when 'head' then '{"call_games":true,"edit_grades":true,"review_uploads":true,"manage_opponents":true,"manage_roster":true,"manage_staff":true}'::jsonb
    when 'pitching' then '{"call_games":true,"edit_grades":true,"review_uploads":true,"manage_opponents":true}'::jsonb
    when 'caller' then '{"call_games":true,"manage_opponents":true}'::jsonb
    when 'viewer' then '{}'::jsonb
  end
$$;

create function private.pc_toggle_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['call_games', 'edit_grades', 'review_uploads', 'manage_opponents', 'manage_roster', 'manage_staff']
$$;

create function private.pc_team_active(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.programs t join public.organizations o on o.id = t.org_id
    where t.id = p and t.status in ('active', 'ending') and (t.ends_at is null or t.ends_at > now()) and o.billing_status = 'active')
$$;

-- a coach's toggle on an active team. view_team is every coach's. The owner gets nothing here without membership.
create function private.pc_can(p uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.pc_team_active(p) and m.role <> 'player'
       and (perm = 'view_team' or coalesce(((private.pc_preset_perms(m.role) || m.perms) ->> perm)::boolean, false))
    from public.members m where m.program_id = p and m.user_id = auth.uid()), false)
$$;

create function private.pc_is_owner(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations o where o.id = org and o.owner_id = auth.uid())
$$;

-- the owner manages membership on any team of the organization (not its data), unless billing is locked
create function private.pc_owner_can_manage(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.programs t join public.organizations o on o.id = t.org_id
    where t.id = p and o.owner_id = auth.uid() and t.status <> 'removed' and o.billing_status <> 'locked')
$$;

create function private.pc_can_manage(p uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pc_can(p, perm) or private.pc_owner_can_manage(p)
$$;

create function private.pc_minor_unconsented(p uuid, pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.minors m where m.program_id = p and m.pitcher_id = pitcher)
     and not exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher)
$$;

-- what a player may change on his own pitcher record; everything else on it is the coaches'
create function private.pc_player_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['name', 'number', 'hand', 'slot', 'height_ft', 'gradYear', 'pitches']
$$;
-- all an unconsented minor's pitcher record may hold
create function private.pc_placeholder_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['id', 'createdAt', 'updatedAt', 'deletedAt', 'teamId', 'number']
$$;

create function private.pc_can_read(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not private.pc_team_active(p) then false
    when private.pc_can(p, 'view_team') then true
    when private.pc_role(p) = 'player' then case
      when tbl = 'pitchers' then row_id = any (private.pc_my_pitchers(p))
      when tbl in ('checkins', 'sessions', 'readings') then row_pitcher = any (private.pc_my_pitchers(p))
      else false end   -- events, learned and packs carry hitters and game plans: players get their own data through
                       -- redacted functions (Plan 3), never these rows
    else false end
$$;

create function private.pc_can_write(tbl text, p uuid, row_id text, row_pitcher text, is_insert boolean, touches_deleted boolean)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not private.pc_team_active(p) then false
    when private.pc_role(p) = 'player' then case
      when tbl in ('checkins', 'sessions', 'readings') then row_pitcher = any (private.pc_my_pitchers(p))
      when tbl = 'pitchers' then not is_insert and not touches_deleted and row_id = any (private.pc_my_pitchers(p))
      else false end
    when tbl = 'pitchers' then case when is_insert or touches_deleted then private.pc_can(p, 'manage_roster')
                                    else private.pc_can(p, 'edit_grades') or private.pc_can(p, 'manage_roster') end
    when tbl = 'catchers' then private.pc_can(p, 'manage_roster')
    when tbl in ('teams', 'hitters') then private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster')
    else private.pc_can(p, 'call_games')   -- games, events, packs, learned, checkins, sessions, readings
  end
$$;

-- strip a pitcher record down to the placeholder (a minor flagged before consent)
create function private.pc_strip_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  select doc into cur from public.pitchers where program_id = p and id = pitcher;
  if cur is null then return; end if;
  foreach k in array private.pc_placeholder_keys() loop
    if cur ? k then keep := keep || jsonb_build_object(k, cur -> k); end if;
  end loop;
  keep := keep || jsonb_build_object('updatedAt', greatest((cur ->> 'updatedAt')::bigint + 1, (extract(epoch from now()) * 1000)::bigint));
  update public.pitchers set doc = keep where program_id = p and id = pitcher;
end $$;

create function private.pc_flag_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.minors (program_id, pitcher_id, flagged_by) values (p, pitcher, auth.uid()) on conflict do nothing;
  if private.pc_minor_unconsented(p, pitcher) then perform private.pc_strip_minor(p, pitcher); end if;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ------------------------------------------------------------------ policies
create function private.pc_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programs t join public.members m on m.program_id = t.id where t.org_id = org and m.user_id = auth.uid())
$$;
revoke all on function private.pc_org_member(uuid) from public, anon;
grant execute on function private.pc_org_member(uuid) to authenticated, service_role;
create policy pc_read on public.organizations for select to authenticated using (owner_id = auth.uid() or private.pc_org_member(id));
create policy pc_read on public.programs for select to authenticated using (private.pc_role(id) is not null or private.pc_is_owner(org_id));
create policy pc_read on public.members for select to authenticated using (
  user_id = auth.uid() or private.pc_can_manage(program_id, 'manage_staff') or private.pc_can_manage(program_id, 'manage_roster'));
grant select on public.organizations to authenticated;

-- The read policies look up the caller's teams and linked pitchers once per query (a sub-select the planner runs once)
-- instead of once per row; the rules are the same as private.pc_can_read, which pc_push still uses row by row.
create function private.pc_coach_teams() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.program_id from public.members m where m.user_id = auth.uid() and m.role <> 'player' and private.pc_team_active(m.program_id)
$$;
create function private.pc_my_links() returns table (program_id uuid, pitcher_id text)
language sql stable security definer set search_path = '' as $$
  select l.program_id, l.pitcher_id from public.player_links l
  join public.members m on m.program_id = l.program_id and m.user_id = l.user_id and m.role = 'player'
  where l.user_id = auth.uid() and private.pc_team_active(l.program_id)
$$;
revoke all on function private.pc_coach_teams(), private.pc_my_links() from public, anon;
grant execute on function private.pc_coach_teams(), private.pc_my_links() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned'] loop
    execute format('create policy pc_read on public.%I for select to authenticated using (program_id in (select private.pc_coach_teams())%s)', t,
      case when t = 'pitchers' then ' or (program_id, id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)'
           when t in ('checkins', 'sessions', 'readings') then ' or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)'
           else '' end);
  end loop;
end $$;

-- ------------------------------------------------------------------ organizations and teams
create function public.pc_create_org(name text, level text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.organizations (name, level, owner_id) values (name, level, auth.uid()) returning id into oid;
  return oid;
end $$;

-- a new team starts pending: billing (Plan 2) turns it on. join_as puts the owner on its staff in one step.
create function public.pc_create_team(org uuid, name text, level text default null, timezone text default 'America/New_York',
                                      join_as text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if not private.pc_is_owner(org) then raise exception 'only the organization''s owner can add a team' using errcode = '42501'; end if;
  if join_as is not null and private.pc_preset_perms(join_as) is null then raise exception 'unknown preset' using errcode = '22023'; end if;
  insert into public.programs (name, level, org_id, timezone, created_by) values (name, level, org, coalesce(timezone, 'America/New_York'), auth.uid())
  returning id into tid;
  if join_as is not null then insert into public.members (program_id, user_id, role) values (tid, auth.uid(), join_as); end if;
  return tid;
end $$;

-- the owner hands the organization to a coach on one of its teams
create function public.pc_transfer_owner(org uuid, new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pc_is_owner(org) then raise exception 'only the owner can transfer the organization' using errcode = '42501'; end if;
  if not exists (select 1 from public.members m join public.programs t on t.id = m.program_id
                 where t.org_id = org and m.user_id = new_owner and m.role <> 'player') then
    raise exception 'the new owner must be a coach on one of this organization''s teams' using errcode = '22023';
  end if;
  update public.organizations set owner_id = new_owner where id = org;
end $$;

-- ------------------------------------------------------------------ invites and members
create function public.pc_invite(p uuid, member_role text, pitcher text default null, invite_email text default null,
                                 under13 boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text; e text := nullif(lower(btrim(coalesce(invite_email, ''))), '');
begin
  if member_role = 'player' then
    if not private.pc_can_manage(p, 'manage_roster') then raise exception 'you can''t invite players to this team' using errcode = '42501'; end if;
    if pitcher is null or not exists (select 1 from public.pitchers x where x.program_id = p and x.id = pitcher and x.deleted_at is null) then
      raise exception 'pick a pitcher on this team''s roster' using errcode = '22023';
    end if;
    if exists (select 1 from public.player_links l where l.program_id = p and l.pitcher_id = pitcher) then
      raise exception 'that pitcher already has an account' using errcode = '23505';
    end if;
    if under13 and e is null then raise exception 'a player under 13 is invited through a parent''s email' using errcode = '22023'; end if;
  elsif private.pc_preset_perms(member_role) is not null then
    if not private.pc_can_manage(p, 'manage_staff') then raise exception 'you can''t invite coaches to this team' using errcode = '42501'; end if;
    if under13 then raise exception 'only players can be under 13' using errcode = '22023'; end if;
    pitcher := null;
  else
    raise exception 'unknown role' using errcode = '22023';
  end if;
  insert into public.invites (program_id, role, pitcher_id, email, under13, created_by)
  values (p, member_role, pitcher, e, coalesce(under13, false), auth.uid()) returning token into tok;
  if under13 then perform private.pc_flag_minor(p, pitcher); end if;
  return tok;
end $$;

create function private.pc_open_invite(tok text) returns public.invites
language plpgsql stable security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites where token = tok;
  if not found or inv.used_at is not null or inv.cancelled_at is not null or inv.created_at < now() - interval '14 days' then
    raise exception 'this invite link has expired or was already used' using errcode = 'P0002';
  end if;
  if inv.email is not null and inv.email is distinct from private.pc_my_email() then
    raise exception 'this invite is for a different email; sign in with the email it was sent to' using errcode = '42501';
  end if;
  return inv;
end $$;
revoke all on function private.pc_open_invite(text) from public, anon;
grant execute on function private.pc_open_invite(text) to authenticated;

-- what the join page shows before accepting
create function public.pc_invite_info(tok text) returns table (team_name text, role text, under13 boolean, needs_consent boolean)
language plpgsql stable security definer set search_path = '' as $$
declare inv public.invites;
begin
  inv := private.pc_open_invite(tok);
  return query select t.name, inv.role, inv.under13,
    (inv.pitcher_id is not null and private.pc_minor_unconsented(inv.program_id, inv.pitcher_id))
  from public.programs t where t.id = inv.program_id;
end $$;

-- open invites sent to the signed-in user's confirmed email
create function public.pc_my_invites() returns table (token text, team_id uuid, team_name text, role text, under13 boolean)
language sql stable security definer set search_path = '' as $$
  select i.token, i.program_id, t.name, i.role, i.under13 from public.invites i join public.programs t on t.id = i.program_id
  where i.email = private.pc_my_email() and i.used_at is null and i.cancelled_at is null and i.created_at > now() - interval '14 days'
  order by t.name
$$;

-- the parent (the account the under-13 invite was sent to) gives consent before the child's record holds anything
create function public.pc_record_guardian_consent(tok text, method text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  inv := private.pc_open_invite(tok);
  if inv.email is null or inv.email is distinct from private.pc_my_email() then
    raise exception 'only the parent the invite was sent to can give consent' using errcode = '42501';
  end if;
  if inv.pitcher_id is null or not exists (select 1 from public.minors m where m.program_id = inv.program_id and m.pitcher_id = inv.pitcher_id) then
    raise exception 'this invite doesn''t need a parent''s consent' using errcode = '22023';
  end if;
  insert into public.guardian_consents (program_id, pitcher_id, guardian_user_id, method)
  values (inv.program_id, inv.pitcher_id, auth.uid(), method)
  on conflict (program_id, pitcher_id) do update set guardian_user_id = excluded.guardian_user_id, method = excluded.method, consented_at = now();
end $$;

-- accept an invite. A player who says he is under 13 on an invite with no parent email is never linked: he gives a
-- parent's email instead, and a new invite goes to that parent.
create function public.pc_accept_invite(tok text, declares_under13 boolean default false, parent_email text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; cur_role text; pe text := nullif(lower(btrim(coalesce(parent_email, ''))), ''); newtok text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  inv := private.pc_open_invite(tok);
  perform 1 from public.programs where id = inv.program_id for update;   -- one membership change at a time per team
  if inv.role = 'player' and coalesce(declares_under13, false) and not inv.under13 then
    if pe is null or pe !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return jsonb_build_object('status', 'parent_email_required'); end if;
    perform private.pc_flag_minor(inv.program_id, inv.pitcher_id);
    insert into public.invites (program_id, role, pitcher_id, email, under13, created_by)
    values (inv.program_id, 'player', inv.pitcher_id, pe, true, inv.created_by) returning token into newtok;
    update public.invites set used_at = now() where token = tok;
    return jsonb_build_object('status', 'parent_invite_sent');   -- the new token is the parent's, sent by email (Plan 2)
  end if;
  if inv.pitcher_id is not null and private.pc_minor_unconsented(inv.program_id, inv.pitcher_id) then
    raise exception 'a parent has to give consent first' using errcode = '42501';
  end if;
  if inv.pitcher_id is not null and exists (select 1 from public.guardian_consents g where g.program_id = inv.program_id
      and g.pitcher_id = inv.pitcher_id and g.guardian_user_id is distinct from auth.uid()) then
    raise exception 'only the parent who gave consent can accept' using errcode = '42501';
  end if;
  cur_role := private.pc_role(inv.program_id);
  if inv.role = 'player' then
    if cur_role is not null and cur_role <> 'player' then raise exception 'you''re already on this team''s staff' using errcode = '22023'; end if;
    if exists (select 1 from public.player_links l where l.program_id = inv.program_id and l.pitcher_id = inv.pitcher_id) then
      raise exception 'that pitcher already has an account' using errcode = '23505';
    end if;
    insert into public.members (program_id, user_id, role) values (inv.program_id, auth.uid(), 'player') on conflict do nothing;
    insert into public.player_links (program_id, user_id, pitcher_id) values (inv.program_id, auth.uid(), inv.pitcher_id);
  else
    if cur_role = 'player' then raise exception 'you''re on this team as a player' using errcode = '22023'; end if;
    insert into public.members (program_id, user_id, role) values (inv.program_id, auth.uid(), inv.role)
    on conflict (program_id, user_id) do update set role = excluded.role, perms = '{}'::jsonb;
  end if;
  update public.invites set used_at = now() where token = tok;
  return jsonb_build_object('status', 'joined', 'team_id', inv.program_id);
end $$;

create function public.pc_decline_invite(tok text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  inv := private.pc_open_invite(tok);
  update public.invites set cancelled_at = now() where token = tok;
end $$;

create function public.pc_cancel_invite(tok text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites where token = tok;
  if not found then raise exception 'no such invite' using errcode = 'P0002'; end if;
  if not private.pc_can_manage(inv.program_id, case when inv.role = 'player' then 'manage_roster' else 'manage_staff' end) then
    raise exception 'you can''t cancel that invite' using errcode = '42501';
  end if;
  update public.invites set cancelled_at = now() where token = tok and used_at is null;
end $$;

-- change a coach's preset and toggles (never a player's, never into a player)
create function public.pc_set_member(p uuid, member uuid, member_role text, member_perms jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not private.pc_can_manage(p, 'manage_staff') then raise exception 'you can''t change this team''s staff' using errcode = '42501'; end if;
  if private.pc_preset_perms(member_role) is null then raise exception 'unknown preset' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(member_perms, '{}'::jsonb)) <> 'object' then raise exception 'toggles must be an object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(coalesce(member_perms, '{}'::jsonb)) loop
    if not k = any (private.pc_toggle_keys()) or jsonb_typeof(member_perms -> k) <> 'boolean' then
      raise exception 'unknown toggle %', k using errcode = '22023';
    end if;
  end loop;
  update public.members set role = member_role, perms = coalesce(member_perms, '{}'::jsonb)
  where program_id = p and user_id = member and role <> 'player';
  if not found then raise exception 'not a coach on this team' using errcode = 'P0002'; end if;
end $$;

-- remove someone (or yourself). A coach needs manage_staff, a player manage_roster; the owner can do either.
create function public.pc_remove_member(p uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  select m.role into r from public.members m where m.program_id = p and m.user_id = member;
  if r is null then raise exception 'not a member' using errcode = 'P0002'; end if;
  if member is distinct from auth.uid()
     and not private.pc_can_manage(p, case when r = 'player' then 'manage_roster' else 'manage_staff' end) then
    raise exception 'you can''t remove that person' using errcode = '42501';
  end if;
  delete from public.members where program_id = p and user_id = member;   -- player links go with it
end $$;

create function public.pc_mark_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pc_can_manage(p, 'manage_roster') then raise exception 'you can''t change this roster' using errcode = '42501'; end if;
  perform private.pc_flag_minor(p, pitcher);
end $$;

-- a parent (the one who consented) has the child's data hard-deleted. Logged without any name.
create function public.pc_delete_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not exists (
      select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher and g.guardian_user_id = auth.uid()) then
    raise exception 'only the consenting parent can delete this player''s data' using errcode = '42501';
  end if;
  delete from public.pitchers where program_id = p and id = pitcher;
  foreach t in array array['checkins', 'sessions', 'readings', 'events', 'learned'] loop
    execute format('delete from public.%I where program_id = $1 and pitcher_id = $2', t) using p, pitcher;
  end loop;
  delete from public.learned where program_id = p and id in ('p:' || pitcher, 'p2:' || pitcher);
  delete from public.members m where m.program_id = p and m.role = 'player'
    and m.user_id in (select l.user_id from public.player_links l where l.program_id = p and l.pitcher_id = pitcher)
    and not exists (select 1 from public.player_links o where o.program_id = p and o.user_id = m.user_id and o.pitcher_id <> pitcher);
  delete from public.player_links where program_id = p and pitcher_id = pitcher;
  delete from public.invites where program_id = p and pitcher_id = pitcher;
  delete from public.guardian_consents where program_id = p and pitcher_id = pitcher;
  delete from public.minors where program_id = p and pitcher_id = pitcher;
  insert into public.deletion_log (program_id, pitcher_hash, requested_by)
  values (p, encode(sha256(convert_to(p::text || ':' || pitcher, 'UTF8')), 'hex'), auth.uid());
end $$;

-- staff and players, with pending invites, for coaches who manage them (or the owner)
create function public.pc_staff(p uuid) returns table (user_id uuid, email text, role text, perms jsonb, pitcher_ids text[],
                                                         pending boolean, token text)
language plpgsql stable security definer set search_path = '' as $$
declare staff boolean := private.pc_can_manage(p, 'manage_staff'); roster boolean := private.pc_can_manage(p, 'manage_roster');
begin
  if not staff and not roster then raise exception 'you can''t see this team''s staff list' using errcode = '42501'; end if;
  return query
    select m.user_id, lower(u.email)::text, m.role, m.perms,
           coalesce((select array_agg(l.pitcher_id order by l.pitcher_id) from public.player_links l where l.program_id = p and l.user_id = m.user_id), '{}'::text[]),
           false, null::text
    from public.members m join auth.users u on u.id = m.user_id
    where m.program_id = p and ((m.role = 'player' and roster) or (m.role <> 'player' and staff))
    union all
    select null::uuid, i.email, i.role, '{}'::jsonb, case when i.pitcher_id is null then '{}'::text[] else array[i.pitcher_id] end, true, i.token
    from public.invites i
    where i.program_id = p and i.used_at is null and i.cancelled_at is null and i.created_at > now() - interval '14 days'
      and ((i.role = 'player' and roster) or (i.role <> 'player' and staff))
    order by 6, 2;
end $$;

-- every team the signed-in user is on, and every team of an organization he owns
create function public.pc_my_teams() returns table (team_id uuid, team_name text, level text, timezone text, org_id uuid,
  org_name text, role text, perms jsonb, pitcher_ids text[], is_owner boolean, active boolean, status text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.level, t.timezone, o.id, o.name, m.role,
         case when m.role is null or m.role = 'player' then '{}'::jsonb else private.pc_preset_perms(m.role) || m.perms end,
         coalesce((select array_agg(l.pitcher_id order by l.pitcher_id) from public.player_links l where l.program_id = t.id and l.user_id = auth.uid()), '{}'::text[]),
         o.owner_id = auth.uid(), private.pc_team_active(t.id), t.status
  from public.programs t join public.organizations o on o.id = t.org_id
  left join public.members m on m.program_id = t.id and m.user_id = auth.uid()
  where (m.user_id is not null or o.owner_id = auth.uid()) and t.status <> 'removed'
  order by o.name, t.name
$$;

-- ------------------------------------------------------------------ sync
-- push: as before (shape, who may write the incoming record and the one it replaces, newest wins, no whole-batch
-- failures), plus: a team that isn't active refuses every row as team_locked (the iPad keeps them and retries); a
-- clock ahead of the server's by more than two minutes is pulled back to now, and the server's copy goes back so the
-- iPad takes it; a player's change to his pitcher record keeps only the fields that are his; a minor's record holds
-- only the placeholder until a parent consents.
create function public.pc_push(p uuid, tbl text, rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; rid text; cur jsonb; n int; applied int := 0; rejected jsonb := '[]'::jsonb; server jsonb := '[]'::jsonb;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint; clamped boolean; is_ins boolean; touch_del boolean;
  role text := private.pc_role(p); active boolean := private.pc_team_active(p); k text; merged jsonb;
  num text := '^[0-9]{1,15}$';
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then
    raise exception 'rows must be an array of at most 500 records' using errcode = '22023';
  end if;
  if role is null then raise exception 'not a member of this team' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    rid := case when jsonb_typeof(r) = 'object' and jsonb_typeof(r -> 'id') = 'string' then r ->> 'id' end;
    if rid is null or length(rid) not between 1 and 200 then
      rejected := rejected || jsonb_build_object('id', left(coalesce(rid, ''), 200), 'reason', 'bad record: id'); continue;
    end if;
    if not active then rejected := rejected || jsonb_build_object('id', rid, 'reason', 'team_locked'); continue; end if;
    if jsonb_typeof(r -> 'updatedAt') <> 'number' or (r ->> 'updatedAt') !~ num
       or (r ? 'deletedAt' and jsonb_typeof(r -> 'deletedAt') <> 'null' and (jsonb_typeof(r -> 'deletedAt') <> 'number' or (r ->> 'deletedAt') !~ num))
       or (r ? 'pitcherId' and jsonb_typeof(r -> 'pitcherId') not in ('string', 'null'))
       or (r ? 'gameId' and jsonb_typeof(r -> 'gameId') not in ('string', 'null')) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'bad record: fields'); continue;
    end if;
    if octet_length(r::text) >= 1000000 then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'bad record: too big'); continue;
    end if;
    clamped := (r ->> 'updatedAt')::bigint > now_ms + 120000;
    if clamped then r := jsonb_set(r, '{updatedAt}', to_jsonb(now_ms)); end if;
    execute format('select doc from public.%I where program_id = $1 and id = $2', tbl) into cur using p, rid;
    is_ins := cur is null;
    touch_del := case when cur is null then coalesce(jsonb_typeof(r -> 'deletedAt'), 'null') <> 'null'
                      else (r -> 'deletedAt') is distinct from (cur -> 'deletedAt') end;
    -- who may write it is checked before anything about the server's copy is compared
    if not private.pc_can_write(tbl, p, rid, r ->> 'pitcherId', is_ins, touch_del)
       or (cur is not null and not private.pc_can_write(tbl, p, rid, cur ->> 'pitcherId', false, touch_del)) then
      rejected := rejected || (jsonb_build_object('id', rid, 'reason', 'not allowed')
        || case when cur is not null and private.pc_can_read(tbl, p, rid, cur ->> 'pitcherId') then jsonb_build_object('doc', cur) else '{}'::jsonb end);
      continue;
    end if;
    if tbl = 'pitchers' and role = 'player' then
      merged := cur;
      foreach k in array private.pc_player_keys() loop
        if r ? k then merged := merged || jsonb_build_object(k, r -> k); end if;
      end loop;
      r := merged || jsonb_build_object('updatedAt', r -> 'updatedAt');
    end if;
    if tbl = 'pitchers' and private.pc_minor_unconsented(p, rid)
       and exists (select 1 from jsonb_object_keys(r) j where not j = any (private.pc_placeholder_keys())) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'not allowed: a parent has to give consent first'); continue;
    end if;
    n := 0;
    if cur is null or (r ->> 'updatedAt')::bigint > (cur ->> 'updatedAt')::bigint then
      execute format(
        'insert into public.%1$I as t (program_id, id, doc) values ($1, $2, $3)
         on conflict (program_id, id) do update set doc = excluded.doc
         where (excluded.doc ->> ''updatedAt'')::bigint > (t.doc ->> ''updatedAt'')::bigint', tbl)
      using p, rid, r;
      get diagnostics n = row_count;
    end if;
    if n = 1 and not clamped and not (tbl = 'pitchers' and role = 'player') then applied := applied + 1;
    else
      if n = 1 then applied := applied + 1; end if;
      execute format('select doc from public.%I where program_id = $1 and id = $2', tbl) into cur using p, rid;
      server := server || jsonb_build_object('id', rid, 'doc', cur);   -- the iPad takes the server's copy
    end if;
  end loop;
  return jsonb_build_object('applied', applied, 'skipped', jsonb_array_length(server), 'rejected', rejected, 'server', server);
end $$;

-- pull: as before, scoped to what the caller may read. access changes whenever the caller's role, toggles or linked
-- pitchers change, so the iPad starts its cursors over. A team that isn't active returns nothing, with locked set.
create function public.pc_pull(p uuid, tbl text, after_xid bigint default 0, after_id text default '', lim int default 500) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare cap bigint; nxt bigint; out jsonb; role text := private.pc_role(p); mine text[] := private.pc_my_pitchers(p); flt text := '';
  access text; held boolean; perms jsonb;
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if role is null then raise exception 'not a member of this team' using errcode = '42501'; end if;
  select coalesce(private.pc_preset_perms(m.role) || m.perms, '{}'::jsonb) into perms from public.members m where m.program_id = p and m.user_id = auth.uid();
  access := role || ':' || coalesce(perms::text, '') || ':' || array_to_string(mine, ',');
  if not private.pc_team_active(p) then
    return jsonb_build_object('rows', '[]'::jsonb, 'next', jsonb_build_object('xid', after_xid, 'id', after_id), 'more', false,
                              'access', access, 'held', false, 'reset', false, 'locked', true);
  end if;
  lim := least(greatest(coalesce(lim, 500), 1), 1000);
  cap := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  nxt := pg_snapshot_xmax(pg_current_snapshot())::text::bigint;
  if coalesce(after_xid, 0) > nxt then
    return jsonb_build_object('rows', '[]'::jsonb, 'next', jsonb_build_object('xid', 0, 'id', ''), 'more', true, 'access', access, 'held', false, 'reset', true, 'locked', false);
  end if;
  if role = 'player' then
    if tbl not in ('pitchers', 'checkins', 'sessions', 'readings') then
      return jsonb_build_object('rows', '[]'::jsonb, 'next', jsonb_build_object('xid', after_xid, 'id', after_id), 'more', false, 'access', access, 'held', false, 'reset', false, 'locked', false);
    end if;
    flt := case when tbl = 'pitchers' then ' and id = any ($6)' else ' and pitcher_id = any ($6)' end;
  end if;
  execute format(
    'with page as (
       select doc, sync_xid, id from public.%1$I
       where program_id = $1 and (sync_xid, id) > ($2, $3) and sync_xid < $4%2$s
       order by sync_xid, id limit $5 + 1)
     select jsonb_build_object(
       ''rows'', coalesce((select jsonb_agg(doc order by sync_xid, id) from (select * from page order by sync_xid, id limit $5) x), ''[]''::jsonb),
       ''next'', coalesce((select jsonb_build_object(''xid'', sync_xid, ''id'', id) from (select * from page order by sync_xid, id limit $5) x order by sync_xid desc, id desc limit 1),
                         jsonb_build_object(''xid'', $2, ''id'', $3)),
       ''more'', (select count(*) from page) > $5)', tbl, flt)
  into out using p, after_xid, after_id, cap, lim, mine;
  execute format('select exists (select 1 from public.%1$I where program_id = $1 and sync_xid >= $2%2$s)', tbl, flt) into held using p, cap, null, null, null, mine;
  return out || jsonb_build_object('access', access, 'held', held, 'reset', false, 'locked', false);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.pc_create_org(text, text), public.pc_create_team(uuid, text, text, text, text),
  public.pc_transfer_owner(uuid, uuid), public.pc_invite(uuid, text, text, text, boolean), public.pc_invite_info(text),
  public.pc_my_invites(), public.pc_record_guardian_consent(text, text), public.pc_accept_invite(text, boolean, text),
  public.pc_decline_invite(text), public.pc_cancel_invite(text), public.pc_set_member(uuid, uuid, text, jsonb),
  public.pc_remove_member(uuid, uuid), public.pc_mark_minor(uuid, text), public.pc_delete_minor(uuid, text),
  public.pc_staff(uuid), public.pc_my_teams(), public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int)
  from public, anon;
grant execute on function public.pc_create_org(text, text), public.pc_create_team(uuid, text, text, text, text),
  public.pc_transfer_owner(uuid, uuid), public.pc_invite(uuid, text, text, text, boolean), public.pc_invite_info(text),
  public.pc_my_invites(), public.pc_record_guardian_consent(text, text), public.pc_accept_invite(text, boolean, text),
  public.pc_decline_invite(text), public.pc_cancel_invite(text), public.pc_set_member(uuid, uuid, text, jsonb),
  public.pc_remove_member(uuid, uuid), public.pc_mark_minor(uuid, text), public.pc_delete_minor(uuid, text),
  public.pc_staff(uuid), public.pc_my_teams(), public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int)
  to authenticated;
grant execute on function public.pc_delete_minor(uuid, text) to service_role;
