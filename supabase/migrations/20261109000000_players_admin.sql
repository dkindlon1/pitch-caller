-- PitchIQ player portal and super admin (Plan 3b). Spec: "Account and permission model" (players, super admin, grade
-- edits), Screens (Player portal, Super admin), D9, D13.
--
--   * grade_history: every change to a pitch's stuff or command, whoever made it (a trigger on pitchers, so the iPad's
--     sync, the website and a coach's revert all land here). Coaches see a player's changes and revert them.
--   * a player's own outings, the team's pitch-count rule and what the engine learned about him, through functions
--     that return only his rows and nothing about hitters, opponents or the game plan.
--   * super admin: platform_admins and admin_audit. Every admin function checks the caller, writes an audit row and
--     returns organizations, teams, counts and billing state. None reads a pitch, a game or a player's record.

-- ------------------------------------------------------------------ grade history
create table public.grade_history (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  pitch_id text not null,
  pitch_name text,
  field text not null check (field in ('grade', 'command')),
  old_value numeric,
  new_value numeric,
  changed_by uuid references auth.users (id) on delete set null,
  by_role text,                                  -- player, a coach preset, owner, or null (the system)
  changed_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references auth.users (id) on delete set null
);
create index grade_history_pitcher on public.grade_history (program_id, pitcher_id, changed_at desc);
create index grade_history_changed_by on public.grade_history (changed_by);
create index grade_history_reverted_by on public.grade_history (reverted_by);
alter table public.grade_history enable row level security;
revoke all on public.grade_history from anon, authenticated;
grant select on public.grade_history to authenticated;
-- coaches on an active team see the team's; a player (or parent) sees his own pitcher's
create policy pc_read on public.grade_history for select to authenticated
  using (program_id in (select private.pc_coach_teams())
         or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l));

create function private.pc_num(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::numeric end
$$;

create function private.pc_log_grades() returns trigger
language plpgsql security definer set search_path = '' as $$
declare np jsonb; op jsonb; f text; who uuid := auth.uid(); r text;
begin
  -- only people's changes: a deletion, a minor's record stripped or a purge isn't a grade edit
  if who is null or jsonb_typeof(new.doc -> 'pitches') <> 'array' or jsonb_typeof(old.doc -> 'pitches') <> 'array'
     or new.doc -> 'pitches' = old.doc -> 'pitches' then
    return null;
  end if;
  r := case when exists (select 1 from public.members m where m.program_id = new.program_id and m.user_id = who)
            then (select m.role from public.members m where m.program_id = new.program_id and m.user_id = who)
            when exists (select 1 from public.programs t join public.organizations o on o.id = t.org_id where t.id = new.program_id and o.owner_id = who)
            then 'owner' end;
  for np in select * from jsonb_array_elements(new.doc -> 'pitches') loop
    if jsonb_typeof(np -> 'id') <> 'string' then continue; end if;
    select x into op from jsonb_array_elements(old.doc -> 'pitches') x where x ->> 'id' = np ->> 'id' limit 1;
    if op is null then continue; end if;      -- a new pitch: its starting grades aren't an edit
    foreach f in array array['grade', 'command'] loop
      if private.pc_num(op -> f) is distinct from private.pc_num(np -> f) then
        insert into public.grade_history (program_id, pitcher_id, pitch_id, pitch_name, field, old_value, new_value, changed_by, by_role)
        values (new.program_id, new.id, np ->> 'id', left(coalesce(np ->> 'name', op ->> 'name'), 80), f, private.pc_num(op -> f), private.pc_num(np -> f), who, r);
      end if;
    end loop;
  end loop;
  return null;
end $$;
create trigger pc_grade_history after update of doc on public.pitchers for each row execute function private.pc_log_grades();

-- A child's grade history goes with the rest of his data: when a parent deletes him, and while he's held (marked
-- under 13 with no parent's consent yet), as his check-ins and bullpens do.
create function private.pc_drop_grade_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'purged' or not exists (select 1 from public.guardian_consents g where g.program_id = new.program_id and g.pitcher_id = new.pitcher_id) then
    delete from public.grade_history h where h.program_id = new.program_id and h.pitcher_id = new.pitcher_id;
  end if;
  return null;
end $$;
create trigger pc_grade_history_gone after insert on public.purged for each row execute function private.pc_drop_grade_history();
create trigger pc_grade_history_held after insert on public.minors for each row execute function private.pc_drop_grade_history();
revoke all on function private.pc_drop_grade_history() from public, anon, authenticated;

-- A coach who may edit grades puts one change back: only if the value is still what that change made it.
create function public.pc_revert_grade(hist bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.grade_history%rowtype; cur jsonb; arr jsonb := '[]'::jsonb; x jsonb; hit boolean := false;
begin
  select * into h from public.grade_history where id = hist for update;
  if h.id is null or not private.pc_team_active(h.program_id)
     or not (private.pc_can(h.program_id, 'edit_grades') or private.pc_can(h.program_id, 'manage_roster')) then
    raise exception 'you can''t change grades on this team' using errcode = '42501';
  end if;
  if h.reverted_at is not null then raise exception 'that change was already put back' using errcode = '22023'; end if;
  select doc into cur from public.pitchers where program_id = h.program_id and id = h.pitcher_id and deleted_at is null for update;
  if cur is null then raise exception 'that pitcher isn''t on the roster any more' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(coalesce(cur -> 'pitches', '[]'::jsonb)) loop
    if x ->> 'id' = h.pitch_id then
      if private.pc_num(x -> h.field) is distinct from h.new_value then
        raise exception 'it''s been changed again since' using errcode = '22023';
      end if;
      x := x || jsonb_build_object(h.field, case when h.old_value is null then 'null'::jsonb else to_jsonb(h.old_value) end);
      hit := true;
    end if;
    arr := arr || jsonb_build_array(x);
  end loop;
  if not hit then raise exception 'that pitch isn''t in his arsenal any more' using errcode = '22023'; end if;
  update public.pitchers set doc = private.pc_bump(cur || jsonb_build_object('pitches', arr)) where program_id = h.program_id and id = h.pitcher_id;
  update public.grade_history set reverted_at = now(), reverted_by = auth.uid() where id = hist;
end $$;

-- ------------------------------------------------------------------ a player's own view
-- His outings (his game pitches per game, the last 365 days; no opponent, no hitters, no calls) and the team's
-- pitch-count rule, for his eligible-on date. A parent with two children on the team gets both.
create function public.pc_my_outings(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (select l.pitcher_id from private.pc_my_links() l where l.program_id = p),
  ev as (
    select e.pitcher_id, e.game_id, g.doc ->> 'date' as day, e.doc ->> 'res' as res,
           coalesce(nullif(e.doc ->> 'kind', ''), '?') as kind, coalesce(nullif(e.doc ->> 'pitchName', ''), '?') as pitch
    from public.events e join public.games g on g.program_id = e.program_id and g.id = e.game_id
    where e.program_id = p and e.pitcher_id in (select pitcher_id from mine)
      and (e.type is null or e.type = 'pitch') and coalesce((e.doc ->> 'legacy')::boolean, false) = false
      and e.deleted_at is null and g.deleted_at is null and g.doc ->> 'dupOf' is null
      and g.doc ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' and g.doc ->> 'date' >= to_char(now() - interval '365 days', 'YYYY-MM-DD')),
  per_pitch as (
    select pitcher_id, game_id, day, pitch, count(*) n, count(*) filter (where res in ('cstrike', 'whiff', 'foul', 'play')) strikes
    from ev group by pitcher_id, game_id, day, pitch),
  per_game as (
    select pitcher_id, game_id, day, sum(n)::int pitches, sum(strikes)::int strikes,
           jsonb_object_agg(pitch, jsonb_build_object('n', n, 'strikes', strikes)) by_pitch
    from per_pitch group by pitcher_id, game_id, day)
  select jsonb_build_object(
    'rule', (select t.doc -> 'pitchRule' from public.teams t where t.program_id = p and (t.doc ->> 'isOurs')::boolean and t.deleted_at is null
             order by t.updated_at desc limit 1),
    'outings', coalesce((select jsonb_agg(jsonb_build_object('pitcher_id', pitcher_id, 'game_id', game_id, 'date', day, 'pitches', pitches,
                                                             'strikes', strikes, 'by_pitch', by_pitch) order by day desc, game_id)
                         from per_game), '[]'::jsonb))
  where exists (select 1 from mine)
$$;

-- What the engine learned about one of his pitchers: each pitch's fitted values and how many pitches it rests on.
-- The model's evidence (which games and hitters) stays out.
create function public.pc_my_learned(p uuid, pitcher text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('at', l.doc -> 'at', 'learner', l.doc -> 'learner',
    'pitches', coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'object' then v - 'evidence' - 'events' - 'hitters' else v end)
                         from jsonb_each(case when jsonb_typeof(l.doc -> 'pitches') = 'object' then l.doc -> 'pitches' else '{}'::jsonb end) j(k, v)), '{}'::jsonb))
  from public.learned l
  where l.program_id = p and l.id = 'p:' || pitcher and l.deleted_at is null
    and l.doc ->> 'pitcherId' = pitcher
    and (p, pitcher) in (select x.program_id, x.pitcher_id from private.pc_my_links() x)
$$;

revoke all on function public.pc_revert_grade(bigint), public.pc_my_outings(uuid), public.pc_my_learned(uuid, text) from public, anon;
grant execute on function public.pc_revert_grade(bigint), public.pc_my_outings(uuid), public.pc_my_learned(uuid, text) to authenticated;
revoke all on function private.pc_num(jsonb), private.pc_log_grades() from public, anon, authenticated;

-- ------------------------------------------------------------------ super admin
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);
create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  org_id uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index admin_audit_at on public.admin_audit (at desc);
create index admin_audit_admin on public.admin_audit (admin_id);
alter table public.platform_admins enable row level security;
alter table public.admin_audit enable row level security;
-- no policies: only the functions below (and the database owner) touch them
revoke all on public.platform_admins, public.admin_audit from anon, authenticated;

create function private.pc_admin(act text, org uuid, detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.admin_audit (admin_id, action, org_id, detail) values (auth.uid(), act, org, coalesce(detail, '{}'::jsonb));
end $$;
revoke all on function private.pc_admin(text, uuid, jsonb) from public, anon, authenticated;

create function public.pc_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- organizations, newest first, with their owner, billing state and counts; and sign-ups over the last 7 and 30 days
create function public.pc_admin_orgs(search text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(search, '')), ''); r jsonb;
begin
  perform private.pc_admin('list_orgs', null, case when q is null then '{}'::jsonb else jsonb_build_object('search', left(q, 100)) end);
  select jsonb_build_object(
    'signups', jsonb_build_object(
      'users_7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
      'users_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
      'orgs_7d', (select count(*) from public.organizations o where o.created_at > now() - interval '7 days'),
      'orgs_30d', (select count(*) from public.organizations o where o.created_at > now() - interval '30 days')),
    'orgs', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
      select jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'owner_email', u.email, 'status', o.billing_status,
        'sub_status', o.subscription_status, 'quantity', o.subscription_quantity, 'period_ends_at', o.period_ends_at, 'created_at', o.created_at,
        'teams', (select count(*) from public.programs t where t.org_id = o.id and t.status in ('active', 'ending')),
        'coaches', (select count(*) from public.members m join public.programs t on t.id = m.program_id where t.org_id = o.id and m.role <> 'player'),
        'players', (select count(*) from public.members m join public.programs t on t.id = m.program_id where t.org_id = o.id and m.role = 'player')) x
      from public.organizations o left join auth.users u on u.id = o.owner_id
      where q is null or o.name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' or u.email ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      order by o.created_at desc limit 200) s), '[]'::jsonb))
  into r;
  return r;
end $$;

-- one organization: its teams and their head counts, its coaches' emails and roles (for support), and its last
-- billing events. No pitcher, game or player record.
create function public.pc_admin_org(org uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.pc_admin('view_org', org, '{}'::jsonb);
  select jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'owner_email', u.email, 'status', o.billing_status,
    'sub_status', o.subscription_status, 'quantity', o.subscription_quantity, 'period_ends_at', o.period_ends_at, 'created_at', o.created_at,
    'billing_changed_at', o.billing_changed_at, 'has_customer', o.stripe_customer_id is not null,
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'ends_at', t.ends_at, 'created_at', t.created_at,
        'coaches', (select count(*) from public.members m where m.program_id = t.id and m.role <> 'player'),
        'players', (select count(*) from public.members m where m.program_id = t.id and m.role = 'player')) order by t.created_at, t.id)
      from public.programs t where t.org_id = o.id), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('team', t.name, 'email', cu.email, 'role', m.role) order by t.created_at, m.role, cu.email)
      from public.members m join public.programs t on t.id = m.program_id join auth.users cu on cu.id = m.user_id
      where t.org_id = o.id and m.role <> 'player'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'result', e.result, 'created_at', e.created_at) order by e.created_at desc)
      from (select * from private.stripe_events e where e.org_id = o.id order by e.created_at desc limit 25) e), '[]'::jsonb))
  into r from public.organizations o left join auth.users u on u.id = o.owner_id where o.id = org;
  if r is null then raise exception 'no such organization' using errcode = 'P0002'; end if;
  return r;
end $$;

create function public.pc_admin_audit(lim int default 100) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.pc_admin('view_audit', null, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', a.at, 'admin_email', u.email, 'action', a.action, 'org_id', a.org_id,
      'org_name', o.name, 'detail', a.detail) order by a.id desc), '[]'::jsonb)
  into r
  from (select * from public.admin_audit order by id desc limit least(greatest(coalesce(lim, 100), 1), 500)) a
  left join auth.users u on u.id = a.admin_id left join public.organizations o on o.id = a.org_id;
  return r;
end $$;

-- Support: move an organization to one of its coaches when the owner can't do it himself. The same rule as the
-- owner's own transfer (the new owner coaches one of its teams), and a reason, both in the audit log.
create function public.pc_admin_transfer_owner(org uuid, new_owner_email text, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare nu uuid; old uuid; why text := nullif(btrim(coalesce(reason, '')), '');
begin
  if why is null or length(why) > 500 then raise exception 'give a reason (up to 500 characters)' using errcode = '22023'; end if;
  select owner_id into old from public.organizations where id = org for update;
  if old is null then raise exception 'no such organization' using errcode = 'P0002'; end if;
  select u.id into nu from auth.users u where lower(u.email) = lower(btrim(coalesce(new_owner_email, ''))) and u.email_confirmed_at is not null;
  if nu is null or not exists (select 1 from public.members m join public.programs t on t.id = m.program_id
                               where t.org_id = org and m.user_id = nu and m.role <> 'player') then
    raise exception 'the new owner must be a coach on one of this organization''s teams' using errcode = '22023';
  end if;
  perform private.pc_admin('transfer_owner', org, jsonb_build_object('from', old, 'to', nu, 'reason', why));
  update public.organizations set owner_id = nu where id = org;
end $$;

revoke all on function public.pc_is_admin(), public.pc_admin_orgs(text), public.pc_admin_org(uuid), public.pc_admin_audit(int),
  public.pc_admin_transfer_owner(uuid, text, text) from public, anon;
grant execute on function public.pc_is_admin(), public.pc_admin_orgs(text), public.pc_admin_org(uuid), public.pc_admin_audit(int),
  public.pc_admin_transfer_owner(uuid, text, text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['grade_history', 'platform_admins', 'admin_audit'] loop
    execute format('revoke maintain on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
