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
-- signed-in user, so that user keeps usage and execute on the ones the policies and pc_pull need (and no others).

-- This replaces the program-scoped tables of the first migration, which have never held anything: it refuses to run on
-- a database where they do, before changing anything (old memberships and invites would need a data migration).
do $$ begin
  if exists (select 1 from public.programs) or exists (select 1 from public.members) or exists (select 1 from public.invites) then
    raise exception 'pitchiq_teams: programs, members or invites already hold rows; migrate them first';
  end if;
end $$;

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
  -- an owner's account can't be deleted while it owns an organization: ownership is transferred first
  owner_id uuid not null references auth.users (id) on delete restrict,
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
  -- a parent's email typed by a player (not by a coach) waits for a coach to say it's right before it can be used,
  -- and the account that typed it can never use it
  needs_approval boolean not null default false,
  declared_by uuid,
  check ((role = 'player') = (pitcher_id is not null)),
  check (not under13 or (email is not null and role = 'player'))
);
create index invites_email on public.invites (email) where used_at is null and cancelled_at is null;

create table public.minors (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  flagged_by uuid,
  flagged_at timestamptz not null default now(),
  -- while no parent has agreed, the team's game pitches for him are kept under this random id instead of his
  held_id text not null default ('held_' || replace(gen_random_uuid()::text, '-', '')),
  primary key (program_id, pitcher_id)
);
create table public.guardian_consents (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  -- a parent deleting their account takes the consent with it, and the child's data goes back to held (trigger below)
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (length(method) between 1 and 120),
  consented_at timestamptz not null default now(),
  primary key (program_id, pitcher_id)
);
-- a child's records deleted at a parent's request: the server refuses them if an iPad sends them again, and every
-- coach's iPad deletes its own copies when it next syncs
create table public.purged (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  purged_at timestamptz not null default now(),
  -- the random id his pitches keep in the team's games: nothing on an iPad or in a backup can work it out
  stand_in text not null default ('removed_' || replace(gen_random_uuid()::text, '-', '')),
  primary key (program_id, pitcher_id)
);
-- each time a held under-13 player is let go (a parent agreed, or a coach took a wrong mark off): coaches' iPads send
-- what they kept of him once per release
create table public.minor_releases (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  released_at timestamptz not null default now()
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
alter table public.purged enable row level security;
alter table public.minor_releases enable row level security;
revoke all on public.organizations, public.player_links, public.invites, public.minors, public.guardian_consents, public.deletion_log,
  public.purged, public.minor_releases from public, anon, authenticated;

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

-- the caller's own toggles on a team (nothing unless he's a coach on an active team)
create function private.pc_my_perms(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.pc_preset_perms(m.role) || m.perms from public.members m
                   where m.program_id = p and m.user_id = auth.uid() and m.role <> 'player' and private.pc_team_active(p)), '{}'::jsonb)
$$;

-- every toggle switched on in perms is one the caller has himself (the owner may give anything)
create function private.pc_within(p uuid, perms jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pc_owner_can_manage(p) or not exists (
    select 1 from jsonb_each(coalesce(perms, '{}'::jsonb)) e
    where e.value = 'true'::jsonb and coalesce((private.pc_my_perms(p) ->> e.key)::boolean, false) is not true)
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
-- and what those may look like: numbers where there are numbers, an id-like team id, a jersey number of up to 4 letters
create function private.pc_placeholder_ok(p uuid, r jsonb, cur jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  -- a NULL anywhere in here means no: coalesce makes it fail closed
  select coalesce(not exists (select 1 from jsonb_object_keys(r) j where not j = any (private.pc_placeholder_keys()))
     and jsonb_typeof(r -> 'id') = 'string'
     and (not r ? 'createdAt' or jsonb_typeof(r -> 'createdAt') = 'number')
     and jsonb_typeof(r -> 'updatedAt') = 'number'
     and (not r ? 'deletedAt' or jsonb_typeof(r -> 'deletedAt') in ('number', 'null'))
     and (not r ? 'teamId' or (jsonb_typeof(r -> 'teamId') = 'string'
          and ((r ->> 'teamId') is not distinct from (cur ->> 'teamId')
               or ((r ->> 'teamId') ~ '^[a-z]{3,4}_[a-z0-9]{8,40}$' and exists (select 1 from public.teams t where t.program_id = p and t.id = r ->> 'teamId')))))
     and (not r ? 'number' or jsonb_typeof(r -> 'number') = 'null'
          or (jsonb_typeof(r -> 'number') in ('string', 'number') and (r ->> 'number') ~ '^[0-9A-Za-z]{0,4}$')), false)
$$;
-- the stand-in a deleted child's pitches keep in the team's game records
create function private.pc_anon_id(p uuid, pitcher text) returns text
language sql stable security definer set search_path = '' as $$
  select z.stand_in from public.purged z where z.program_id = p and z.pitcher_id = pitcher
$$;
-- a game's staff list with one pitcher's id swapped for another
create function private.pc_swap_staff(doc jsonb, pitcher text, with_id text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when coalesce(jsonb_typeof(doc -> 'staffIds'), '') <> 'array' or not coalesce((doc -> 'staffIds') ? pitcher, false) then doc else
    jsonb_set(doc, '{staffIds}', (select jsonb_agg(case when e = to_jsonb(pitcher) then to_jsonb(with_id) else e end) from jsonb_array_elements(doc -> 'staffIds') e)) end
$$;
-- a pack (the calls of one game) names each pitcher on the staff with his grades and check-in: one of them becomes
-- just an id (with_id: the same id, or a stand-in once his data is deleted)
create function private.pc_scrub_pack(doc jsonb, pitcher text, with_id text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when coalesce(jsonb_typeof(doc -> 'staff'), '') <> 'array' then doc else
    jsonb_set(doc, '{staff}', coalesce((select jsonb_agg(case when e ->> 'pitcherId' = pitcher then jsonb_build_object('pitcherId', with_id) else e end)
                                       from jsonb_array_elements(doc -> 'staff') e), '[]'::jsonb)) end
$$;
create function private.pc_pack_names(doc jsonb, pitcher text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(doc -> 'staff') = 'array' and exists (select 1 from jsonb_array_elements(doc -> 'staff') e where e ->> 'pitcherId' = pitcher), false)
$$;
create function private.pc_bump(doc jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select doc || jsonb_build_object('updatedAt', greatest(coalesce((doc ->> 'updatedAt')::bigint, 0) + 1, (extract(epoch from now()) * 1000)::bigint))
$$;

create function private.pc_can_read(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a missing pitcherId (NULL) means no, never maybe
  select coalesce(case
    when not private.pc_team_active(p) then false
    when private.pc_can(p, 'view_team') then true
    when private.pc_role(p) = 'player' then case
      when tbl = 'pitchers' then row_id = any (private.pc_my_pitchers(p))
      when tbl in ('checkins', 'sessions', 'readings') then row_pitcher = any (private.pc_my_pitchers(p))
      else false end   -- events, learned and packs carry hitters and game plans: players get their own data through
                       -- redacted functions (Plan 3), never these rows
    else false end, false)
$$;

create function private.pc_can_write(tbl text, p uuid, row_id text, row_pitcher text, is_insert boolean, touches_deleted boolean)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a missing pitcherId (NULL) means no, never maybe
  select coalesce(case
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
  end, false)
$$;

-- strip a pitcher record down to the placeholder (a minor flagged before consent)
create function private.pc_strip_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  select doc into cur from public.pitchers where program_id = p and id = pitcher;
  if cur is null then return; end if;
  -- already only the placeholder: leave it (and its stamp) alone, so a change an iPad made since still wins
  if not exists (select 1 from jsonb_object_keys(cur) j where not j = any (private.pc_placeholder_keys())) then return; end if;
  foreach k in array private.pc_placeholder_keys() loop
    if cur ? k and (k <> 'teamId' or ((cur ->> 'teamId') ~ '^[a-z]{3,4}_[a-z0-9]{8,40}$'
                                       and exists (select 1 from public.teams t where t.program_id = p and t.id = cur ->> 'teamId')))
       and (k <> 'number' or coalesce(cur ->> 'number', '') ~ '^[0-9A-Za-z]{0,4}$') then
      keep := keep || jsonb_build_object(k, cur -> k);
    end if;
  end loop;
  keep := keep || jsonb_build_object('updatedAt', greatest((cur ->> 'updatedAt')::bigint + 1, (extract(epoch from now()) * 1000)::bigint));
  update public.pitchers set doc = keep where program_id = p and id = pitcher;
end $$;

-- a player a coach has found to be under 13, before a parent has agreed: his pitcher record goes back to the
-- placeholder; his check-ins, bullpens, velo and learned model leave the server (coaches' iPads send theirs again once a
-- parent agrees: pc_pull lists him); the team's game pitches for him are held under a random id and come back on
-- consent; in game packs he becomes just his id. Only a coach (or the parent's consent flow) gets here, never a player.
create function private.pc_flag_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text; held text;
begin
  insert into public.minors (program_id, pitcher_id, flagged_by) values (p, pitcher, auth.uid()) on conflict do nothing;
  perform private.pc_hold_minor(p, pitcher);
end $$;

create function private.pc_hold_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text; held text;
begin
  select m.held_id into held from public.minors m where m.program_id = p and m.pitcher_id = pitcher;
  if held is null or not private.pc_minor_unconsented(p, pitcher) then return; end if;
  perform private.pc_strip_minor(p, pitcher);
  foreach t in array array['checkins', 'sessions', 'readings', 'learned'] loop
    execute format('delete from public.%I where program_id = $1 and pitcher_id = $2', t) using p, pitcher;
  end loop;
  delete from public.learned where program_id = p and id in ('p:' || pitcher, 'p2:' || pitcher);
  update public.events set doc = private.pc_bump(jsonb_set(doc, '{pitcherId}', to_jsonb(held))) where program_id = p and pitcher_id = pitcher;
  update public.packs set doc = private.pc_bump(private.pc_scrub_pack(doc, pitcher, pitcher))
  where program_id = p and private.pc_pack_names(doc, pitcher);
end $$;

-- a parent agreed (or a coach took the flag off): the held game pitches go back under his id
create function private.pc_release_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
declare held text;
begin
  select m.held_id into held from public.minors m where m.program_id = p and m.pitcher_id = pitcher;
  if held is null then return; end if;
  update public.events set doc = private.pc_bump(jsonb_set(doc, '{pitcherId}', to_jsonb(pitcher))) where program_id = p and pitcher_id = held;
  insert into public.minor_releases (program_id, pitcher_id) values (p, pitcher);
end $$;

-- a parent's account deleted (the consent goes with it): the child's data goes back to held
create function private.pc_consent_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.pc_hold_minor(old.program_id, old.pitcher_id);
  return null;
end $$;
create trigger pc_consent_gone after delete on public.guardian_consents for each row execute function private.pc_consent_gone();

-- every other open invite for a pitcher stops working once one is used for him (a forwarded or spare link can't
-- later claim him, or claim to be his parent)
create function private.pc_close_invites(p uuid, pitcher text, keep text) returns void
language sql security definer set search_path = '' as $$
  update public.invites set cancelled_at = now()
  where program_id = p and pitcher_id = pitcher and token is distinct from keep and used_at is null and cancelled_at is null
$$;

-- a player's (or parent's) copy of his pitcher record leaves out the coaches' notes
create function private.pc_redact(tbl text, role text, doc jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when tbl = 'pitchers' and role = 'player' and doc is not null then doc - 'notes' else doc end
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
-- the ones that change data, and the invite check, run only inside the public functions (as their owner)
revoke execute on function private.pc_strip_minor(uuid, text), private.pc_flag_minor(uuid, text),
  private.pc_close_invites(uuid, text, text), private.pc_hold_minor(uuid, text), private.pc_release_minor(uuid, text),
  private.pc_consent_gone() from authenticated;

-- ------------------------------------------------------------------ policies
-- the caller's teams, organizations, and the teams whose people he manages: each looked up once per query
create function private.pc_member_teams() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.program_id from public.members m where m.user_id = auth.uid()
$$;
create function private.pc_owned_orgs() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select o.id from public.organizations o where o.owner_id = auth.uid()
$$;
create function private.pc_member_orgs() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.org_id from public.programs t join public.members m on m.program_id = t.id where m.user_id = auth.uid()
$$;
create function private.pc_manage_teams() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.program_id from public.members m
  where m.user_id = auth.uid() and m.role <> 'player' and private.pc_team_active(m.program_id)
    and (coalesce(((private.pc_preset_perms(m.role) || m.perms) ->> 'manage_staff')::boolean, false)
         or coalesce(((private.pc_preset_perms(m.role) || m.perms) ->> 'manage_roster')::boolean, false))
  union
  select t.id from public.programs t join public.organizations o on o.id = t.org_id
  where o.owner_id = auth.uid() and t.status <> 'removed' and o.billing_status <> 'locked'
$$;
revoke all on function private.pc_member_teams(), private.pc_owned_orgs(), private.pc_member_orgs(), private.pc_manage_teams() from public, anon;
grant execute on function private.pc_member_teams(), private.pc_owned_orgs(), private.pc_member_orgs(), private.pc_manage_teams()
  to authenticated, service_role;
create policy pc_read on public.organizations for select to authenticated
  using (id in (select private.pc_owned_orgs()) or id in (select private.pc_member_orgs()));
create policy pc_read on public.programs for select to authenticated
  using (id in (select private.pc_member_teams()) or org_id in (select private.pc_owned_orgs()));
create policy pc_read on public.members for select to authenticated
  using (user_id = (select auth.uid()) or program_id in (select private.pc_manage_teams()));
-- the Stripe ids stay on the server: clients may read these columns only
grant select (id, name, level, owner_id, billing_status, created_at) on public.organizations to authenticated;

-- A select with no program_id filter scans every team's rows to check them (about 26 ms per 200k rows); the app and
-- pc_pull always filter by program_id, which uses the index.
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
      case when t = 'pitchers' then ''   -- a player reads his own record only through pc_pull, without the coaches' notes
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
    -- a parent who agreed but let the invite run out gets a new one: to their own email only
    if exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher)
       and not (coalesce(under13, false) and e is not null and exists (select 1 from public.guardian_consents g join auth.users u on u.id = g.guardian_user_id
                where g.program_id = p and g.pitcher_id = pitcher and lower(u.email) = e)) then
      raise exception 'that pitcher already has an account' using errcode = '23505';
    end if;
    if under13 and e is null then raise exception 'a player under 13 is invited through a parent''s email' using errcode = '22023'; end if;
    perform private.pc_close_invites(p, pitcher, null);   -- one open invite per pitcher: a new one replaces the last
  elsif private.pc_preset_perms(member_role) is not null then
    if not private.pc_can_manage(p, 'manage_staff') then raise exception 'you can''t invite coaches to this team' using errcode = '42501'; end if;
    if not private.pc_within(p, private.pc_preset_perms(member_role)) then
      raise exception 'you can''t invite someone with more permissions than you have' using errcode = '42501';
    end if;
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
  if inv.needs_approval then raise exception 'this invite is waiting for a coach to approve it' using errcode = '42501'; end if;
  if inv.declared_by is not null and inv.declared_by = auth.uid() then
    raise exception 'a parent has to accept this invite from their own account' using errcode = '42501';
  end if;
  return inv;
end $$;
revoke all on function private.pc_open_invite(text) from public, anon, authenticated;

-- moves a player's invite to a parent's email typed by the player (signed in, or on the website before he has an
-- account): never for a pitcher someone already speaks for, never to the player's own email, and only once a coach
-- has approved that email
create function private.pc_send_to_parent(inv public.invites, pe text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if pe is null or pe !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(pe) > 320 then return jsonb_build_object('status', 'parent_email_required'); end if;
  if pe = private.pc_my_email() or exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = pe) then
    return jsonb_build_object('status', 'parent_email_required');
  end if;
  if exists (select 1 from public.player_links l where l.program_id = inv.program_id and l.pitcher_id = inv.pitcher_id)
     or exists (select 1 from public.guardian_consents g where g.program_id = inv.program_id and g.pitcher_id = inv.pitcher_id) then
    raise exception 'that pitcher already has an account' using errcode = '23505';
  end if;
  -- nothing about the player changes yet: a coach approving the parent's email is what marks him under 13
  perform private.pc_close_invites(inv.program_id, inv.pitcher_id, inv.token);
  insert into public.invites (program_id, role, pitcher_id, email, under13, created_by, needs_approval, declared_by)
  values (inv.program_id, 'player', inv.pitcher_id, pe, true, inv.created_by, true, auth.uid());
  return jsonb_build_object('status', 'parent_invite_sent');   -- a coach approves it in the staff list; email in Plan 2
end $$;
revoke all on function private.pc_send_to_parent(public.invites, text) from public, anon, authenticated;

-- an invite is used up inside the same transaction that acts on it, so two people can't both use one link
create function private.pc_claim_invite(tok text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.invites set used_at = now() where token = tok and used_at is null and cancelled_at is null;
  if not found then raise exception 'this invite link has expired or was already used' using errcode = 'P0002'; end if;
end $$;
revoke all on function private.pc_claim_invite(text) from public, anon, authenticated;

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
  if exists (select 1 from public.guardian_consents g where g.program_id = inv.program_id and g.pitcher_id = inv.pitcher_id
             and g.guardian_user_id <> auth.uid()) then
    raise exception 'only the parent who gave consent can accept' using errcode = '42501';
  end if;
  insert into public.guardian_consents (program_id, pitcher_id, guardian_user_id, method)
  values (inv.program_id, inv.pitcher_id, auth.uid(), method)
  on conflict (program_id, pitcher_id) do nothing;
  if found then
    perform private.pc_release_minor(inv.program_id, inv.pitcher_id);   -- held -> agreed: a release, once
  else
    update public.guardian_consents set method = pc_record_guardian_consent.method, consented_at = now()
    where program_id = inv.program_id and pitcher_id = inv.pitcher_id;
  end if;
end $$;

-- accept an invite. A player who says he is under 13 on an invite with no parent email is never linked: he gives a
-- parent's email instead, and a new invite goes to that parent.
create function public.pc_accept_invite(tok text, declares_under13 boolean default false, parent_email text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; cur_role text; pe text := nullif(lower(btrim(coalesce(parent_email, ''))), ''); r jsonb;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  inv := private.pc_open_invite(tok);
  perform 1 from public.programs where id = inv.program_id for update;   -- one membership change at a time per team
  if inv.role = 'player' and coalesce(declares_under13, false) and not inv.under13 then
    r := private.pc_send_to_parent(inv, pe);
    if r ->> 'status' = 'parent_invite_sent' then perform private.pc_claim_invite(tok); end if;
    return r;
  end if;
  perform private.pc_claim_invite(tok);
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
    perform private.pc_close_invites(inv.program_id, inv.pitcher_id, tok);
  else
    if cur_role = 'player' then raise exception 'you''re on this team as a player' using errcode = '22023'; end if;
    insert into public.members (program_id, user_id, role) values (inv.program_id, auth.uid(), inv.role)
    on conflict (program_id, user_id) do update set role = excluded.role, perms = '{}'::jsonb;
    if not private.pc_owner_can_manage(inv.program_id) and not exists (select 1 from public.members m where m.program_id = inv.program_id and m.role = 'head') then
      raise exception 'a team keeps at least one head coach' using errcode = '22023';
    end if;
  end if;
  return jsonb_build_object('status', 'joined', 'team_id', inv.program_id);
end $$;

create function public.pc_decline_invite(tok text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  inv := private.pc_open_invite(tok);
  update public.invites set cancelled_at = now() where token = tok and used_at is null and cancelled_at is null;
end $$;

-- a coach who manages the roster says a parent's email a player typed is right; it can then be used
create function public.pc_approve_invite(tok text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites where token = tok and needs_approval and role = 'player' and used_at is null
    and cancelled_at is null and created_at > now() - interval '14 days' for update;
  if not found then raise exception 'no invite waiting for approval' using errcode = 'P0002'; end if;
  if not private.pc_can_manage(inv.program_id, 'manage_roster') then raise exception 'you can''t approve that invite' using errcode = '42501'; end if;
  perform 1 from public.programs where id = inv.program_id for update;
  if exists (select 1 from public.player_links l where l.program_id = inv.program_id and l.pitcher_id = inv.pitcher_id) then
    raise exception 'that pitcher already has an account' using errcode = '23505';
  end if;
  -- the coach's yes is what marks the player under 13: his record is held to the placeholder from here
  perform private.pc_flag_minor(inv.program_id, inv.pitcher_id);
  update public.invites set needs_approval = false, created_at = now() where token = tok;   -- 14 days from approval
end $$;

-- a coach takes a wrong under-13 mark off (only while no parent has agreed); held game pitches come back
create function public.pc_unmark_minor(p uuid, pitcher text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pc_can_manage(p, 'manage_roster') then raise exception 'you can''t change this roster' using errcode = '42501'; end if;
  if exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher) then
    raise exception 'a parent has agreed for this player; only they can change it' using errcode = '42501';
  end if;
  perform private.pc_release_minor(p, pitcher);
  delete from public.minors where program_id = p and pitcher_id = pitcher;
  update public.invites set cancelled_at = now() where program_id = p and pitcher_id = pitcher and under13 and used_at is null and cancelled_at is null;
end $$;

-- the website's server only (the server key): a player opening a link before he has an account says he's under 13
create function public.pc_invite_to_parent(tok text, parent_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; r jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into inv from public.invites where token = tok for update;
  if not found or inv.used_at is not null or inv.cancelled_at is not null or inv.created_at < now() - interval '14 days' then
    raise exception 'this invite link has expired or was already used' using errcode = 'P0002';
  end if;
  if inv.role <> 'player' then raise exception 'coach invites are for adults' using errcode = '22023'; end if;
  if inv.under13 then return jsonb_build_object('status', 'for_parent'); end if;   -- the parent opens it from their email
  -- an invite sent to one email is that person's: nobody else can redirect it without signing in as them
  if inv.email is not null then raise exception 'this invite was sent to an email: open it from that email' using errcode = '42501'; end if;
  perform 1 from public.programs where id = inv.program_id for update;
  r := private.pc_send_to_parent(inv, nullif(lower(btrim(coalesce(parent_email, ''))), ''));
  if r ->> 'status' = 'parent_invite_sent' then perform private.pc_claim_invite(tok); end if;
  return r;
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
declare k text; cur record;
begin
  if not private.pc_can_manage(p, 'manage_staff') then raise exception 'you can''t change this team''s staff' using errcode = '42501'; end if;
  if private.pc_preset_perms(member_role) is null then raise exception 'unknown preset' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(member_perms, '{}'::jsonb)) <> 'object' then raise exception 'toggles must be an object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(coalesce(member_perms, '{}'::jsonb)) loop
    if not k = any (private.pc_toggle_keys()) or jsonb_typeof(member_perms -> k) <> 'boolean' then
      raise exception 'unknown toggle %', k using errcode = '22023';
    end if;
  end loop;
  select m.role, m.perms into cur from public.members m where m.program_id = p and m.user_id = member and m.role <> 'player';
  if not found then raise exception 'not a coach on this team' using errcode = 'P0002'; end if;
  if not private.pc_owner_can_manage(p) then
    if member = auth.uid() then raise exception 'you can''t change your own permissions' using errcode = '42501'; end if;
    -- nobody gives, or takes away, more than he has himself
    if not private.pc_within(p, private.pc_preset_perms(cur.role) || cur.perms)
       or not private.pc_within(p, private.pc_preset_perms(member_role) || coalesce(member_perms, '{}'::jsonb)) then
      raise exception 'you can''t give or change permissions you don''t have' using errcode = '42501';
    end if;
  end if;
  perform 1 from public.programs where id = p for update;
  update public.members set role = member_role, perms = coalesce(member_perms, '{}'::jsonb) where program_id = p and user_id = member;
  if not private.pc_owner_can_manage(p) and not exists (select 1 from public.members m where m.program_id = p and m.role = 'head') then
    raise exception 'a team keeps at least one head coach' using errcode = '22023';
  end if;
end $$;

-- remove someone (or yourself). A coach needs manage_staff, a player manage_roster; the owner can do either.
create function public.pc_remove_member(p uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r text; pr jsonb; owner boolean := private.pc_owner_can_manage(p);
begin
  select m.role, m.perms into r, pr from public.members m where m.program_id = p and m.user_id = member;
  if r is null then raise exception 'not a member' using errcode = 'P0002'; end if;
  if member is distinct from auth.uid() and not owner then
    if not private.pc_can_manage(p, case when r = 'player' then 'manage_roster' else 'manage_staff' end)
       or (r <> 'player' and not private.pc_within(p, private.pc_preset_perms(r) || pr)) then
      raise exception 'you can''t remove that person' using errcode = '42501';
    end if;
  end if;
  perform 1 from public.programs where id = p for update;
  delete from public.members where program_id = p and user_id = member;   -- player links go with it
  if r = 'head' and not owner and not exists (select 1 from public.members m where m.program_id = p and m.role = 'head') then
    raise exception 'a team keeps at least one head coach: make someone else head first' using errcode = '22023';
  end if;
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
declare t text; anon text; held text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not exists (
      select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher and g.guardian_user_id = auth.uid()) then
    raise exception 'only the consenting parent can delete this player''s data' using errcode = '42501';
  end if;
  perform 1 from public.programs where id = p for update;
  insert into public.purged (program_id, pitcher_id) values (p, pitcher) on conflict do nothing;
  anon := private.pc_anon_id(p, pitcher);
  select m.held_id into held from public.minors m where m.program_id = p and m.pitcher_id = pitcher;
  delete from public.pitchers where program_id = p and id = pitcher;
  foreach t in array array['checkins', 'sessions', 'readings', 'learned'] loop
    execute format('delete from public.%I where program_id = $1 and pitcher_id = $2', t) using p, pitcher;
  end loop;
  delete from public.learned where program_id = p and id in ('p:' || pitcher, 'p2:' || pitcher);
  -- the team's games keep their pitches, under a stand-in that leads back to nobody; packs keep only the stand-in
  update public.events set doc = private.pc_bump(jsonb_set(doc, '{pitcherId}', to_jsonb(anon)))
  where program_id = p and (pitcher_id = pitcher or (held is not null and pitcher_id = held));
  update public.packs set doc = private.pc_bump(private.pc_scrub_pack(doc, pitcher, anon)) where program_id = p and private.pc_pack_names(doc, pitcher);
  update public.games set doc = private.pc_bump(private.pc_swap_staff(doc, pitcher, anon)) where program_id = p and doc -> 'staffIds' ? pitcher;
  -- sent again from an iPad, his records are refused (purged, above); each coach's iPad deletes its copies at its next sync
  delete from public.members m where m.program_id = p and m.role = 'player'
    and m.user_id in (select l.user_id from public.player_links l where l.program_id = p and l.pitcher_id = pitcher)
    and not exists (select 1 from public.player_links o where o.program_id = p and o.user_id = m.user_id and o.pitcher_id <> pitcher);
  delete from public.player_links where program_id = p and pitcher_id = pitcher;
  delete from public.invites where program_id = p and pitcher_id = pitcher;
  delete from public.minors where program_id = p and pitcher_id = pitcher;
  delete from public.guardian_consents where program_id = p and pitcher_id = pitcher;
  insert into public.deletion_log (program_id, pitcher_hash, requested_by)
  values (p, encode(sha256(convert_to(p::text || ':' || pitcher, 'UTF8')), 'hex'), auth.uid());
end $$;

-- staff and players, with pending invites, for coaches who manage them (or the owner)
create function public.pc_staff(p uuid) returns table (user_id uuid, email text, role text, perms jsonb, pitcher_ids text[],
                                                         pending boolean, token text, needs_approval boolean)
language plpgsql stable security definer set search_path = '' as $$
declare staff boolean := private.pc_can_manage(p, 'manage_staff'); roster boolean := private.pc_can_manage(p, 'manage_roster');
begin
  if not staff and not roster then raise exception 'you can''t see this team''s staff list' using errcode = '42501'; end if;
  return query
    select m.user_id, lower(u.email)::text, m.role, m.perms,
           coalesce((select array_agg(l.pitcher_id order by l.pitcher_id) from public.player_links l where l.program_id = p and l.user_id = m.user_id), '{}'::text[]),
           false, null::text, false
    from public.members m join auth.users u on u.id = m.user_id
    where m.program_id = p and ((m.role = 'player' and roster) or (m.role <> 'player' and staff))
    union all
    select null::uuid, i.email, i.role, '{}'::jsonb, case when i.pitcher_id is null then '{}'::text[] else array[i.pitcher_id] end, true, i.token,
           i.needs_approval
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
-- the pitchers whose data a parent had deleted, for a coach's iPad to delete too
create function private.pc_purged(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.pc_can(p, 'view_team') then
    coalesce((select jsonb_agg(x.pitcher_id order by x.pitcher_id) from public.purged x where x.program_id = p), '[]'::jsonb)
  else '[]'::jsonb end
$$;
-- for coaches' iPads: the under-13 players held now (keep the full local record, don't take the placeholder) and every
-- release (send what this iPad kept of him, once per release)
create function private.pc_minors(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.pc_can(p, 'view_team') then jsonb_build_object(
    'held', coalesce((select jsonb_agg(m.pitcher_id order by m.pitcher_id) from public.minors m
                      where m.program_id = p and private.pc_minor_unconsented(p, m.pitcher_id)), '[]'::jsonb),
    'released', coalesce((select jsonb_agg(jsonb_build_object('id', x.pitcher_id, 'key', x.id::text) order by x.id)
                          from public.minor_releases x where x.program_id = p), '[]'::jsonb))
  else jsonb_build_object('held', '[]'::jsonb, 'released', '[]'::jsonb) end
$$;
-- a player's own pitcher records, without the coaches' notes (players can't select the pitchers table directly)
create function private.pc_pull_mine(p uuid, after_xid bigint, after_id text, cap bigint, lim int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (select l.pitcher_id from private.pc_my_links() l where l.program_id = p),
  page as (
    select x.doc - 'notes' doc, x.sync_xid, x.id from public.pitchers x
    where x.program_id = p and x.id in (select pitcher_id from mine) and (x.sync_xid, x.id) > (after_xid, after_id) and x.sync_xid < cap
    order by x.sync_xid, x.id limit lim + 1),
  firsts as (select * from page order by sync_xid, id limit lim)
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(doc order by sync_xid, id) from firsts), '[]'::jsonb),
    'next', coalesce((select jsonb_build_object('xid', sync_xid, 'id', id) from firsts order by sync_xid desc, id desc limit 1),
                     jsonb_build_object('xid', after_xid, 'id', after_id)),
    'more', (select count(*) from page) > lim,
    'held', exists (select 1 from public.pitchers x where x.program_id = p and x.id in (select pitcher_id from mine) and x.sync_xid >= cap))
$$;
revoke all on function private.pc_purged(uuid), private.pc_minors(uuid), private.pc_pull_mine(uuid, bigint, text, bigint, int) from public, anon;
grant execute on function private.pc_purged(uuid), private.pc_minors(uuid), private.pc_pull_mine(uuid, bigint, text, bigint, int)
  to authenticated, service_role;

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
  num text := '^[0-9]{1,15}$'; pits text[]; fixed boolean; x text;
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
    touch_del := coalesce(nullif(r -> 'deletedAt', 'null'::jsonb), 'null'::jsonb)
                 is distinct from coalesce(nullif(cur -> 'deletedAt', 'null'::jsonb), 'null'::jsonb);
    -- who may write it is checked first, so a refusal never tells someone about a pitcher he can't see
    if not private.pc_can_write(tbl, p, rid, r ->> 'pitcherId', is_ins, touch_del)
       or (cur is not null and not private.pc_can_write(tbl, p, rid, cur ->> 'pitcherId', false, touch_del)) then
      rejected := rejected || (jsonb_build_object('id', rid, 'reason', 'not allowed')
        || case when cur is not null and private.pc_can_read(tbl, p, rid, cur ->> 'pitcherId') then jsonb_build_object('doc', private.pc_redact(tbl, role, cur)) else '{}'::jsonb end);
      continue;
    end if;
    -- which pitchers the row is about: the record itself, a learned model's id, and its pitcherId (both are checked)
    pits := array_remove(array[case when tbl = 'pitchers' then rid end,
                               case when tbl = 'learned' and rid ~ '^p2?:' then substring(rid from position(':' in rid) + 1) end,
                               r ->> 'pitcherId'], null);
    fixed := false;
    -- a child whose data a parent had deleted: his own records are refused for good (the iPad deletes them); the
    -- team's pitches, packs and games that name him go in under the stand-in
    if exists (select 1 from public.purged z where z.program_id = p and z.pitcher_id = any (pits)) then
      if tbl in ('pitchers', 'checkins', 'sessions', 'readings', 'learned') then
        rejected := rejected || jsonb_build_object('id', rid, 'reason', 'purged'); continue;
      end if;
      if tbl = 'events' then r := jsonb_set(r, '{pitcherId}', to_jsonb(private.pc_anon_id(p, r ->> 'pitcherId'))); fixed := true; end if;
    end if;
    if tbl = 'packs' then
      for x in select z.pitcher_id from public.purged z where z.program_id = p and private.pc_pack_names(r, z.pitcher_id) loop
        r := private.pc_scrub_pack(r, x, private.pc_anon_id(p, x)); fixed := true;
      end loop;
    elsif tbl = 'games' then
      for x in select z.pitcher_id from public.purged z where z.program_id = p
               and coalesce(jsonb_typeof(r -> 'staffIds') = 'array' and (r -> 'staffIds') ? z.pitcher_id, false) loop
        r := private.pc_swap_staff(r, x, private.pc_anon_id(p, x)); fixed := true;
      end loop;
    end if;
    -- nothing about a child under 13 goes in before a parent agrees: not his check-ins, bullpens, velo, pitches,
    -- learned model, nor a pack that names him (they stay on the iPad and go up once a parent has agreed)
    if tbl in ('checkins', 'sessions', 'readings', 'events', 'learned')
       and exists (select 1 from unnest(pits) q where private.pc_minor_unconsented(p, q)) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'not allowed: a parent has to give consent first'); continue;
    end if;
    if tbl = 'packs' and exists (select 1 from public.minors mi where mi.program_id = p and private.pc_pack_names(r, mi.pitcher_id)
                                 and private.pc_minor_unconsented(p, mi.pitcher_id)) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'not allowed: a parent has to give consent first'); continue;
    end if;
    if tbl = 'pitchers' and role = 'player' then
      merged := cur;
      foreach k in array private.pc_player_keys() loop
        if r ? k then merged := merged || jsonb_build_object(k, r -> k); end if;
      end loop;
      r := merged || jsonb_build_object('updatedAt', r -> 'updatedAt');
      if octet_length(r::text) >= 1000000 then
        rejected := rejected || jsonb_build_object('id', rid, 'reason', 'bad record: too big'); continue;
      end if;
    end if;
    if tbl = 'pitchers' and private.pc_minor_unconsented(p, rid) and not private.pc_placeholder_ok(p, r, cur) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'not allowed: a parent has to give consent first'); continue;
    end if;
    -- a copy that is only the placeholder (an iPad that only ever saw him held, then changed his number) changes the
    -- fields it has and leaves the rest of a fuller record alone: missing there means unchanged, not removed
    if tbl = 'pitchers' and cur is not null and role <> 'player' and not private.pc_minor_unconsented(p, rid)
       and not exists (select 1 from jsonb_object_keys(r) j where not j = any (private.pc_placeholder_keys()))
       and exists (select 1 from jsonb_object_keys(cur) j where not j = any (private.pc_placeholder_keys())) then
      r := cur || r; fixed := true;
    end if;
    -- a player let go after being held: the server has only the placeholder it stripped him to, stamped when it did.
    -- The first full record an iPad sends back replaces it whatever its own stamp (an iPad's copy is older than the
    -- strip), taking a stamp just after it; from then on it's newest-wins as usual, so a later edit on any iPad stands.
    if tbl = 'pitchers' and cur is not null and not private.pc_minor_unconsented(p, rid)
       and exists (select 1 from public.minor_releases x where x.program_id = p and x.pitcher_id = rid)
       and not exists (select 1 from jsonb_object_keys(cur) j where not j = any (private.pc_placeholder_keys()))
       and exists (select 1 from jsonb_object_keys(r) j where not j = any (private.pc_placeholder_keys()))
       and (r ->> 'updatedAt')::bigint <= (cur ->> 'updatedAt')::bigint then
      r := jsonb_set(r, '{updatedAt}', to_jsonb((cur ->> 'updatedAt')::bigint + 1)); fixed := true;
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
    if n = 1 and not clamped and not fixed and not (tbl = 'pitchers' and role = 'player') then applied := applied + 1;
    else
      if n = 1 then applied := applied + 1; end if;
      execute format('select doc from public.%I where program_id = $1 and id = $2', tbl) into cur using p, rid;
      server := server || jsonb_build_object('id', rid, 'doc', private.pc_redact(tbl, role, cur));   -- the iPad takes the server's copy
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
    if tbl = 'pitchers' then
      return private.pc_pull_mine(p, coalesce(after_xid, 0), coalesce(after_id, ''), cap, lim)
        || jsonb_build_object('access', access, 'reset', false, 'locked', false, 'purged', '[]'::jsonb, 'minors', jsonb_build_object('held', '[]'::jsonb, 'released', '[]'::jsonb));
    end if;
    flt := ' and pitcher_id = any ($6)';
  end if;
  execute format(
    'with page as (
       select doc, sync_xid, id from public.%1$I
       where program_id = $1 and (sync_xid, id) > ($2, $3) and sync_xid < $4%2$s
       order by sync_xid, id limit $5 + 1)
     select jsonb_build_object(
       ''rows'', coalesce((select jsonb_agg(%3$s order by sync_xid, id) from (select * from page order by sync_xid, id limit $5) x), ''[]''::jsonb),
       ''next'', coalesce((select jsonb_build_object(''xid'', sync_xid, ''id'', id) from (select * from page order by sync_xid, id limit $5) x order by sync_xid desc, id desc limit 1),
                         jsonb_build_object(''xid'', $2, ''id'', $3)),
       ''more'', (select count(*) from page) > $5)', tbl, flt, 'doc')
  into out using p, after_xid, after_id, cap, lim, mine;
  execute format('select exists (select 1 from public.%1$I where program_id = $1 and sync_xid >= $2%2$s)', tbl, flt) into held using p, cap, null, null, null, mine;
  return out || jsonb_build_object('access', access, 'held', held, 'reset', false, 'locked', false)
    || case when tbl = 'pitchers' then jsonb_build_object('purged', private.pc_purged(p), 'minors', private.pc_minors(p)) else '{}'::jsonb end;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.pc_create_org(text, text), public.pc_create_team(uuid, text, text, text, text),
  public.pc_transfer_owner(uuid, uuid), public.pc_invite(uuid, text, text, text, boolean), public.pc_invite_info(text),
  public.pc_my_invites(), public.pc_record_guardian_consent(text, text), public.pc_accept_invite(text, boolean, text),
  public.pc_decline_invite(text), public.pc_cancel_invite(text), public.pc_set_member(uuid, uuid, text, jsonb),
  public.pc_remove_member(uuid, uuid), public.pc_mark_minor(uuid, text), public.pc_delete_minor(uuid, text),
  public.pc_staff(uuid), public.pc_my_teams(), public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int),
  public.pc_approve_invite(text), public.pc_invite_to_parent(text, text), public.pc_unmark_minor(uuid, text)
  from public, anon;
grant execute on function public.pc_create_org(text, text), public.pc_create_team(uuid, text, text, text, text),
  public.pc_transfer_owner(uuid, uuid), public.pc_invite(uuid, text, text, text, boolean), public.pc_invite_info(text),
  public.pc_my_invites(), public.pc_record_guardian_consent(text, text), public.pc_accept_invite(text, boolean, text),
  public.pc_decline_invite(text), public.pc_cancel_invite(text), public.pc_set_member(uuid, uuid, text, jsonb),
  public.pc_remove_member(uuid, uuid), public.pc_mark_minor(uuid, text), public.pc_delete_minor(uuid, text),
  public.pc_staff(uuid), public.pc_my_teams(), public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int),
  public.pc_approve_invite(text), public.pc_unmark_minor(uuid, text)
  to authenticated;
revoke all on function public.pc_invite_to_parent(text, text) from authenticated;
grant execute on function public.pc_delete_minor(uuid, text), public.pc_invite_to_parent(text, text) to service_role;

-- Postgres 17's MAINTAIN (vacuum, lock, refresh) is no client's business
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke maintain on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
