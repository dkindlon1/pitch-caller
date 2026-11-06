-- PitchIQ lapse exports (Plan 2b, D7). Spec: "Billing and lockout": when a payment fails or the subscription ends,
-- every player gets his own data and every coach his team's (CSV bundle; a PDF summary for players), each by email as a
-- 30-day signed link, and every team locks. invoice.paid unlocks (Plan 2). The website builds the files with the
-- service key (web/lib/exports.ts): these functions give it who gets what and the rows, and record what was sent.
--
--   exports           one row per recipient per file per lapse; a member reads his own, even while locked
--   storage "exports" a private bucket: only the service key reads it; members get time-limited signed links
--
-- Under-13 data stays out of coach exports until a lawyer approves it (A8): a child's rows go only to his parent.

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  lapse_at timestamptz not null,                         -- organizations.billing_changed_at of the lapse
  kind text not null check (kind in ('player', 'coach')),
  pitcher_id text check (length(pitcher_id) between 1 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  team_name text not null default '' check (length(team_name) <= 200),   -- shown on the downloads page, which a locked
  pitcher_name text check (length(pitcher_name) <= 200),                 -- member can still open
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9]{8,14}/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,120}\.zip$'),
  rows int not null check (rows >= 0),
  bytes int not null check (bytes >= 0),
  link_expires_at timestamptz not null,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'no_provider')),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'player') = (pitcher_id is not null)),
  unique nulls not distinct (program_id, lapse_at, user_id, kind, pitcher_id)
);
create index exports_user on public.exports (user_id, created_at desc);
create index exports_org on public.exports (org_id, lapse_at);
alter table public.exports enable row level security;
create policy exports_mine on public.exports for select to authenticated using (user_id = auth.uid());
revoke all on public.exports from public, anon, authenticated;
grant select on public.exports to authenticated;

-- the bucket (Supabase only: the plain-Postgres migration check has no storage schema). No storage policies, so only
-- the service key reads or writes it.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('exports', 'exports', false, 52428800, array['application/zip'])
    on conflict (id) do nothing;
  end if;
end $$;

-- The organization a billing action names (its id, else its subscription's, else its customer's), as pc_billing_event
-- finds it.
create function private.pc_org_of(a jsonb) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.id from public.organizations o where coalesce(a ->> 'org', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and o.id = (a ->> 'org')::uuid),
    (select o.id from public.organizations o where o.stripe_subscription_id = nullif(a ->> 'subscription', '')),
    (select o.id from public.organizations o where o.stripe_customer_id = nullif(a ->> 'customer', '')))
$$;
revoke all on function private.pc_org_of(jsonb) from public, anon, authenticated;

-- Who gets what for a locked organization: {org, name, lapse_at, teams: [{id, name, coaches: [{user_id, email}],
-- players: [{user_id, email, pitcher_id, name}]}]}, or null when it isn't locked. Coaches are the team's staff and
-- the owner; players are the accounts linked to pitcher records (a parent's, for a child under 13).
create function public.pc_lapse_plan(a jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('org', o.id, 'name', o.name, 'lapse_at', o.billing_changed_at,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
        'coaches', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email) order by u.email)
          from auth.users u
          where u.email is not null and (u.id = o.owner_id or u.id in (select m.user_id from public.members m where m.program_id = t.id and m.role <> 'player'))), '[]'::jsonb),
        'players', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', l.user_id, 'email', u.email, 'pitcher_id', l.pitcher_id,
            'name', coalesce(nullif(p.doc ->> 'name', ''), 'Pitcher')) order by l.pitcher_id)
          from public.player_links l join auth.users u on u.id = l.user_id
          left join public.pitchers p on p.program_id = l.program_id and p.id = l.pitcher_id
          where l.program_id = t.id and u.email is not null), '[]'::jsonb))
        order by t.created_at, t.id)
      from public.programs t where t.org_id = o.id and t.status <> 'removed'), '[]'::jsonb))
  from public.organizations o
  where o.id = private.pc_org_of(a) and o.billing_status = 'locked'
$$;

-- The rows of one export: {table: [row, ...]}. For a player (pitcher given): his pitcher record, every record that
-- names him, the games he pitched in, his uploads and their pitches, and his grade history. For a coach (pitcher
-- null): the whole team, less any under-13 player's rows (and the stand-in id his game pitches are kept under while
-- he's held). Deleted records are left out.
create function public.pc_export_rows(p uuid, pitcher text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := '{}'::jsonb; t text; got jsonb;
  hidden text[] := coalesce((select array_agg(x) from (select m.pitcher_id as x from public.minors m where m.program_id = p
                             union select m.held_id from public.minors m where m.program_id = p) s), '{}');
begin
  if not exists (select 1 from public.programs where id = p) then raise exception 'no such team' using errcode = 'P0002'; end if;
  foreach t in array array['pitchers', 'catchers', 'hitters', 'teams', 'games', 'events', 'checkins', 'sessions', 'packs', 'readings', 'learned'] loop
    if pitcher is null then
      execute format($q$select coalesce(jsonb_agg(doc order by id), '[]'::jsonb) from public.%1$I
                        where program_id = $1 and deleted_at is null and coalesce(pitcher_id, '') <> all ($2)
                          and (%1$L <> 'pitchers' or id <> all ($2))$q$, t) into got using p, hidden;
    elsif t = 'pitchers' then
      select coalesce(jsonb_agg(doc), '[]'::jsonb) into got from public.pitchers where program_id = p and id = pitcher and deleted_at is null;
    elsif t = 'games' then
      select coalesce(jsonb_agg(g.doc order by g.id), '[]'::jsonb) into got from public.games g
      where g.program_id = p and g.deleted_at is null
        and g.id in (select e.game_id from public.events e where e.program_id = p and e.pitcher_id = pitcher and e.deleted_at is null);
    else
      execute format($q$select coalesce(jsonb_agg(doc order by id), '[]'::jsonb) from public.%1$I
                        where program_id = $1 and deleted_at is null and pitcher_id = $2$q$, t) into got using p, pitcher;
    end if;
    r := r || jsonb_build_object(t, got);
  end loop;
  r := r || jsonb_build_object(
    'uploads', (select coalesce(jsonb_agg(to_jsonb(u) - 'program_id' - 'uploaded_by' order by u.session_date, u.created_at), '[]'::jsonb)
                from public.uploads u where u.program_id = p and (u.pitcher_id = pitcher or (pitcher is null and u.pitcher_id <> all (hidden)))),
    'upload_pitches', (select coalesce(jsonb_agg(to_jsonb(x) - 'program_id' order by x.upload_id, x.idx), '[]'::jsonb)
                from public.upload_pitches x where x.program_id = p and (x.pitcher_id = pitcher or (pitcher is null and x.pitcher_id <> all (hidden)))),
    'grade_history', (select coalesce(jsonb_agg(to_jsonb(g) - 'program_id' - 'changed_by' - 'reverted_by' order by g.changed_at, g.id), '[]'::jsonb)
                from public.grade_history g where g.program_id = p and (g.pitcher_id = pitcher or (pitcher is null and g.pitcher_id <> all (hidden)))));
  return r;
end $$;

-- Record an export sent to someone (returns its id; null if this lapse already has it), then how its email went.
create function public.pc_export_save(e jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare got_id uuid;
begin
  insert into public.exports (org_id, program_id, lapse_at, kind, pitcher_id, user_id, team_name, pitcher_name, path, rows, bytes, link_expires_at)
  values ((e ->> 'org_id')::uuid, (e ->> 'program_id')::uuid, (e ->> 'lapse_at')::timestamptz, e ->> 'kind', nullif(e ->> 'pitcher_id', ''),
          (e ->> 'user_id')::uuid, left(coalesce(e ->> 'team_name', ''), 200), left(nullif(e ->> 'pitcher_name', ''), 200),
          e ->> 'path', (e ->> 'rows')::int, (e ->> 'bytes')::int, (e ->> 'link_expires_at')::timestamptz)
  on conflict (program_id, lapse_at, user_id, kind, pitcher_id) do nothing
  returning exports.id into got_id;
  return got_id;
end $$;

create function public.pc_export_emailed(export_id uuid, st text) returns void
language sql security definer set search_path = '' as $$
  update public.exports set email_status = st, emailed_at = case when st = 'sent' then now() else emailed_at end where id = export_id
$$;

-- What this lapse has already sent (so a second run only fills the gaps)
create function public.pc_export_sent(org uuid, lapse timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'program_id', x.program_id, 'kind', x.kind, 'pitcher_id', x.pitcher_id, 'user_id', x.user_id,
    'path', x.path, 'email_status', x.email_status)), '[]'::jsonb)
  from public.exports x where x.org_id = org and x.lapse_at = lapse
$$;

-- Super admin (D13): an organization's lapses and how their emails went, and asking for the exports to be sent again
-- (the website then fills in anyone missing and retries failed emails). Both go in the audit log.
create function public.pc_admin_exports(org uuid, resend boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o public.organizations%rowtype; r jsonb;
begin
  perform private.pc_admin(case when resend then 'resend_exports' else 'view_exports' end, org, '{}'::jsonb);
  select * into o from public.organizations where id = org;
  if o.id is null then raise exception 'no such organization' using errcode = 'P0002'; end if;
  if resend and o.billing_status <> 'locked' then raise exception 'only a locked organization''s exports are sent' using errcode = '22023'; end if;
  select jsonb_build_object('locked', o.billing_status = 'locked', 'lapses', coalesce((
    select jsonb_agg(jsonb_build_object('lapse_at', l.lapse_at, 'files', l.files, 'people', l.people, 'sent', l.sent, 'failed', l.failed,
      'no_provider', l.np, 'pending', l.pend) order by l.lapse_at desc)
    from (select x.lapse_at, count(distinct x.path) files, count(*) people, count(*) filter (where x.email_status = 'sent') sent,
            count(*) filter (where x.email_status = 'failed') failed, count(*) filter (where x.email_status = 'no_provider') np,
            count(*) filter (where x.email_status = 'pending') pend
          from public.exports x where x.org_id = org group by x.lapse_at order by x.lapse_at desc limit 10) l), '[]'::jsonb))
  into r;
  return r;
end $$;
revoke all on function public.pc_admin_exports(uuid, boolean) from public, anon;
grant execute on function public.pc_admin_exports(uuid, boolean) to authenticated;

revoke all on function public.pc_lapse_plan(jsonb), public.pc_export_rows(uuid, text), public.pc_export_save(jsonb),
  public.pc_export_emailed(uuid, text), public.pc_export_sent(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.pc_lapse_plan(jsonb), public.pc_export_rows(uuid, text), public.pc_export_save(jsonb),
  public.pc_export_emailed(uuid, text), public.pc_export_sent(uuid, timestamptz) to service_role;
