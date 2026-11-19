-- Build 1, Part 2: outing reports and the season recap (docs/PLAN_reports_recap_2026-11-18.md).
-- Every number in a report is computed from the raw pitch events (public.events), the same rows the learner replays.
-- Only these are stored: coach notes, the seasons a coach marked over, the frozen final recaps, public recap links,
-- the under-18 parent who approves a public link, and a log of the report emails sent. Additive. Applied to the LOCAL
-- Supabase only; production is Drew's call.
--
-- Who reads what (row level security here, not only in the website):
--   * coaches on an active team read their team's events (existing policy), notes, seasons, recaps and links;
--   * a pitcher (or the parent account linked to a young player) reads his own outings through pc_my_report: his
--     pitches with the coach-only fields left out (who chose the call, the engine's mix, overrides, hitters'
--     identities), and only the notes a coach shared with him; never another pitcher's;
--   * a signed-out visitor reads a public recap only through pc_public_recap(token): only the sections the pitcher
--     chose, only while the link is live (not revoked; for a player under 18, approved by his parent account).

-- ------------------------------------------------------------------ coach notes (per outing, per at-bat)
create table public.report_notes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  game_id text not null check (length(game_id) between 1 and 200),
  pitcher_id text not null check (length(pitcher_id) between 1 and 200),
  scope text not null check (scope in ('outing', 'atbat')),
  at_bat text check (at_bat ~ '^\d{1,4}$'),            -- the at-bat's first pitch number in the game
  body text not null check (length(body) between 1 and 4000),
  shared boolean not null default false,               -- staff-only unless a coach shares it with the pitcher
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((scope = 'atbat') = (at_bat is not null))
);
create index report_notes_game on public.report_notes (program_id, game_id, pitcher_id);

-- a coach who may write notes: any staff role but Viewer, on an active team
create function private.pc_note_writer(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.pc_team_active(p) and m.role in ('head', 'pitching', 'caller')
                   from public.members m where m.program_id = p and m.user_id = auth.uid()), false)
$$;

alter table public.report_notes enable row level security;
create policy notes_read on public.report_notes for select to authenticated using (
  program_id in (select private.pc_coach_teams())
  or (shared and deleted_at is null and (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)));
create policy notes_insert on public.report_notes for insert to authenticated
  with check (private.pc_note_writer(program_id) and author_id = auth.uid());
create policy notes_update on public.report_notes for update to authenticated
  using (private.pc_note_writer(program_id)) with check (private.pc_note_writer(program_id));
revoke all on public.report_notes from anon;
revoke delete, truncate, references, trigger on public.report_notes from authenticated;
grant select, insert, update on public.report_notes to authenticated;
-- the author and the team never change after the note is written; updated_at is the server's
create function private.pc_note_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.program_id := old.program_id; new.game_id := old.game_id; new.pitcher_id := old.pitcher_id;
    new.scope := old.scope; new.at_bat := old.at_bat; new.author_id := old.author_id; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger pc_note_stamp before insert or update on public.report_notes for each row execute function private.pc_note_stamp();

-- ------------------------------------------------------------------ seasons
-- A season is the run of games between two "Mark season over" taps. The live "season so far" is every game after the
-- last season marked over.
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  ended_at timestamptz not null default now(),
  ended_by uuid
);
create index seasons_team on public.seasons (program_id, end_date desc);
alter table public.seasons enable row level security;
create policy seasons_read on public.seasons for select to authenticated using (program_id in (select private.pc_member_teams()));
revoke all on public.seasons from anon;
revoke insert, update, delete, truncate, references, trigger on public.seasons from authenticated;
grant select on public.seasons to authenticated;

-- the first day of the season so far: the day after the last season marked over (null: the team's first season)
create function private.pc_season_start(p uuid) returns date
language sql stable security definer set search_path = '' as $$
  select max(s.end_date) + 1 from public.seasons s where s.program_id = p
$$;

-- Mark season over: a coach who manages the roster (head coach preset). The season runs from the day after the last
-- one (or the team's first game) to today in the team's time zone. The website then builds and freezes each
-- pitcher's final recap (service role) and emails it.
create function public.pc_mark_season_over(p uuid, season_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid; first_day date; last_day date; tz text;
begin
  if not private.pc_can(p, 'manage_roster') then raise exception 'only a coach who manages the roster can mark the season over' using errcode = '42501'; end if;
  select coalesce(t.timezone, 'America/New_York') into tz from public.programs t where t.id = p;
  last_day := (now() at time zone tz)::date;
  first_day := private.pc_season_start(p);
  if first_day is null then
    select min((g.doc ->> 'date')::date) into first_day from public.games g
    where g.program_id = p and g.deleted_at is null and g.doc ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$';
  end if;
  first_day := least(coalesce(first_day, last_day), last_day);
  if exists (select 1 from public.seasons s where s.program_id = p and s.end_date >= last_day) then
    raise exception 'a season already ended today' using errcode = '22023';
  end if;
  insert into public.seasons (program_id, name, start_date, end_date, ended_by)
  values (p, btrim(season_name), first_day, last_day, auth.uid()) returning id into sid;
  return sid;
end $$;

-- ------------------------------------------------------------------ frozen final recaps (a version per rebuild)
create table public.recap_versions (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  pitcher_id text not null,
  version int not null default 1,
  data jsonb not null check (octet_length(data::text) < 2000000),
  created_at timestamptz not null default now(),
  unique (season_id, pitcher_id, version)
);
alter table public.recap_versions enable row level security;
create policy recaps_read on public.recap_versions for select to authenticated using (
  program_id in (select private.pc_coach_teams())
  or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l));
revoke all on public.recap_versions from anon;
revoke insert, update, delete, truncate, references, trigger on public.recap_versions from authenticated;
grant select on public.recap_versions to authenticated;
-- a frozen recap is never changed: a rebuild adds the next version
create function private.pc_recap_frozen() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'a frozen recap is never changed; add a new version' using errcode = '42501'; end $$;
create trigger pc_recap_frozen before update on public.recap_versions for each row execute function private.pc_recap_frozen();

-- ------------------------------------------------------------------ under 18: the parent who approves a public link
-- Marked by a coach who manages the roster. A player under 13 who joined through a parent (guardian_consents) is
-- under 18 without this, and that parent approves.
create table public.minor_guardians (
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  parent_email text not null check (parent_email = lower(parent_email) and parent_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  marked_by uuid,
  marked_at timestamptz not null default now(),
  primary key (program_id, pitcher_id)
);
alter table public.minor_guardians enable row level security;
create policy minors18_read on public.minor_guardians for select to authenticated using (
  program_id in (select private.pc_coach_teams())
  or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)
  or parent_email = private.pc_my_email());
revoke all on public.minor_guardians from anon;
revoke insert, update, delete, truncate, references, trigger on public.minor_guardians from authenticated;
grant select on public.minor_guardians to authenticated;

create function private.pc_is_minor18(p uuid, pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.minor_guardians m where m.program_id = p and m.pitcher_id = pitcher)
      or exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher)
      or exists (select 1 from public.minors m where m.program_id = p and m.pitcher_id = pitcher)
$$;
-- the signed-in parent of that player: the parent account a young player joined through, or the email a coach gave
create function private.pc_is_parent_of(p uuid, pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher and g.guardian_user_id = auth.uid())
    or exists (select 1 from public.minor_guardians m where m.program_id = p and m.pitcher_id = pitcher and m.parent_email = private.pc_my_email()))
$$;

create function public.pc_set_minor18(p uuid, pitcher text, parent_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pc_can(p, 'manage_roster') then raise exception 'only a coach who manages the roster can do this' using errcode = '42501'; end if;
  if parent_email is null or btrim(parent_email) = '' then
    delete from public.minor_guardians m where m.program_id = p and m.pitcher_id = pitcher;
    -- no longer marked: a link he made while marked still needs its approval (never goes live on its own)
    return;
  end if;
  insert into public.minor_guardians (program_id, pitcher_id, parent_email, marked_by) values (p, pitcher, lower(btrim(parent_email)), auth.uid())
  on conflict (program_id, pitcher_id) do update set parent_email = excluded.parent_email, marked_by = excluded.marked_by, marked_at = now();
  -- a new parent email: any approval given before is no longer his parent's, so live links stop until approved again
  update public.recap_shares s set approved_by = null, approved_at = null
  where s.program_id = p and s.pitcher_id = pitcher and s.approved_by is not null
    and not exists (select 1 from auth.users u where u.id = s.approved_by and lower(u.email) = lower(btrim(parent_email)))
    and not exists (select 1 from public.guardian_consents g where g.program_id = p and g.pitcher_id = pitcher and g.guardian_user_id = s.approved_by);
end $$;

-- ------------------------------------------------------------------ public recap links
create table public.recap_shares (
  -- two random UUIDs as 64 hex characters (244 random bits): unguessable, like the invite tokens
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  season_id uuid references public.seasons (id) on delete cascade,   -- null: his season so far
  sections jsonb not null default '{"summary": true, "heat": false, "pitches": false, "outings": false}'::jsonb
    check (jsonb_typeof(sections) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  approved_by uuid,               -- under 18: the parent account that turned it on
  approved_at timestamptz
);
create unique index recap_shares_one_live on public.recap_shares (program_id, pitcher_id, coalesce(season_id::text, 'current')) where revoked_at is null;
alter table public.recap_shares enable row level security;
create policy shares_read on public.recap_shares for select to authenticated using (
  program_id in (select private.pc_coach_teams())
  or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)
  or private.pc_is_parent_of(program_id, pitcher_id));
revoke all on public.recap_shares from anon;
revoke insert, update, delete, truncate, references, trigger on public.recap_shares from authenticated;
grant select on public.recap_shares to authenticated;

create function private.pc_share_live(s public.recap_shares) returns boolean
language sql stable security definer set search_path = '' as $$
  select s.revoked_at is null and private.pc_team_active(s.program_id)
     and (s.approved_at is not null or not private.pc_is_minor18(s.program_id, s.pitcher_id))
$$;

create function private.pc_clean_sections(x jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'summary', coalesce((x ->> 'summary')::boolean, true),
    'heat', coalesce((x ->> 'heat')::boolean, false),
    'pitches', coalesce((x ->> 'pitches')::boolean, false),
    'outings', coalesce((x ->> 'outings')::boolean, false))
$$;

-- the pitcher (his own account, or the parent account a young player joined through) makes his link; one live link per
-- recap. Under 18 it stays off until his parent approves.
create function public.pc_share_create(p uuid, pitcher text, season uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if not exists (select 1 from private.pc_my_links() l where l.program_id = p and l.pitcher_id = pitcher) then
    raise exception 'only the pitcher can share his recap' using errcode = '42501'; end if;
  if season is not null and not exists (select 1 from public.seasons s where s.id = season and s.program_id = p) then
    raise exception 'no such season' using errcode = '22023'; end if;
  select s.token into tok from public.recap_shares s
  where s.program_id = p and s.pitcher_id = pitcher and s.season_id is not distinct from season and s.revoked_at is null;
  if tok is not null then return tok; end if;
  insert into public.recap_shares (program_id, pitcher_id, season_id, created_by) values (p, pitcher, season, auth.uid()) returning token into tok;
  return tok;
end $$;

create function public.pc_share_sections(tok text, secs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.recap_shares;
begin
  select * into s from public.recap_shares x where x.token = tok and x.revoked_at is null;
  if s.token is null or not exists (select 1 from private.pc_my_links() l where l.program_id = s.program_id and l.pitcher_id = s.pitcher_id) then
    raise exception 'only the pitcher can change his link' using errcode = '42501'; end if;
  update public.recap_shares set sections = private.pc_clean_sections(secs) where token = tok;
end $$;

-- revoking kills the link for good; a new one gets a new token. The pitcher or his parent.
create function public.pc_share_revoke(tok text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.recap_shares;
begin
  select * into s from public.recap_shares x where x.token = tok;
  if s.token is null or not (exists (select 1 from private.pc_my_links() l where l.program_id = s.program_id and l.pitcher_id = s.pitcher_id)
                             or private.pc_is_parent_of(s.program_id, s.pitcher_id)) then
    raise exception 'only the pitcher or his parent can turn this link off' using errcode = '42501'; end if;
  update public.recap_shares set revoked_at = coalesce(revoked_at, now()) where token = tok;
end $$;

-- the parent account turns an under-18 player's link on (or back off)
create function public.pc_share_approve(tok text, approve boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.recap_shares;
begin
  select * into s from public.recap_shares x where x.token = tok and x.revoked_at is null;
  if s.token is null or not private.pc_is_parent_of(s.program_id, s.pitcher_id) then
    raise exception 'only his parent can approve this link' using errcode = '42501'; end if;
  update public.recap_shares set approved_by = case when approve then auth.uid() end, approved_at = case when approve then now() end where token = tok;
end $$;

-- links waiting on (or approved by) the signed-in parent, with the player's name
create function public.pc_my_share_requests() returns table (token text, program_id uuid, team_name text, pitcher_id text, pitcher_name text,
  season_name text, sections jsonb, approved boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.token, s.program_id, t.name, s.pitcher_id, coalesce(p.doc ->> 'name', 'Your player'), coalesce(se.name, 'Season so far'),
         s.sections, s.approved_at is not null, s.created_at
  from public.recap_shares s
  join public.programs t on t.id = s.program_id
  left join public.pitchers p on p.program_id = s.program_id and p.id = s.pitcher_id
  left join public.seasons se on se.id = s.season_id
  where s.revoked_at is null and private.pc_is_parent_of(s.program_id, s.pitcher_id)
  order by s.created_at desc
$$;

-- ------------------------------------------------------------------ the report email log (server only)
create table public.report_mail (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  kind text not null check (kind in ('outing', 'game_summary', 'final_recap', 'share_request')),
  ref text not null,                  -- the game id, the season id, or the link
  pitcher_id text not null default '',
  user_id uuid,
  email text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create unique index report_mail_once on public.report_mail (program_id, kind, ref, pitcher_id, email);
alter table public.report_mail enable row level security;   -- no policies: the website's server (service role) only
revoke all on public.report_mail from anon, authenticated;

-- ------------------------------------------------------------------ what a pitcher and a visitor may read
-- One pitch with only the fields a pitcher's own view uses: no who-chose-it (coach overrides), no engine mix or
-- probability, no hitter identity, no catcher, no prediction or snapshots beyond the count and runners. loc: include
-- where it was called and where it landed.
create function private.pc_report_event(d jsonb, loc boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', d -> 'id', 'gameId', d -> 'gameId', 'n', d -> 'n', 'seq', d -> 'seq', 'type', d -> 'type', 'pitcherId', d -> 'pitcherId',
    'pitchId', d -> 'pitchId', 'pitchName', d -> 'pitchName', 'kind', d -> 'kind', 'thrown', d -> 'thrown', 'thrownId', d -> 'thrownId',
    'bs', d -> 'bs', 'ph', d -> 'ph', 'count', d -> 'count', 'outs', d -> 'outs', 'inning', d -> 'inning', 'slot', d -> 'slot',
    'res', d -> 'res', 'out', d -> 'out', 'contact', d -> 'contact', 'wp', d -> 'wp', 'end', d -> 'end', 'paEnd', d -> 'paEnd',
    'runs', d -> 'runs', 'radar', d -> 'v08' -> 'radar', 'shaken', d -> 'shaken',
    'recall', case when d ->> 'choice' = 'recall' then 'true'::jsonb end,
    'sit', jsonb_strip_nulls(jsonb_build_object('balls', d -> 'sit' -> 'balls', 'strikes', d -> 'sit' -> 'strikes', 'outs', d -> 'sit' -> 'outs',
      'bases', d -> 'sit' -> 'bases', 'batters_faced', d -> 'sit' -> 'batters_faced', 'same_side', d -> 'sit' -> 'same_side')),
    'quad', case when loc then d -> 'quad' end, 'loc', case when loc then d -> 'loc' end, 'locCell', case when loc then d -> 'locCell' end))
$$;

-- the games a report counts: not deleted, not a duplicate, with a real date
create function private.pc_report_games(p uuid, from_day date, to_day date) returns table (id text, day date, doc jsonb)
language sql stable security definer set search_path = '' as $$
  select g.id, (g.doc ->> 'date')::date, g.doc from public.games g
  where g.program_id = p and g.deleted_at is null and g.doc ->> 'dupOf' is null and g.doc ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and (from_day is null or (g.doc ->> 'date')::date >= from_day) and (to_day is null or (g.doc ->> 'date')::date <= to_day)
$$;

-- A pitcher's own outings (one game, or a date range): his pitches with coach-only fields left out, the games' dates,
-- opponent team names and levels, and only the notes a coach shared with him. Nothing for another pitcher.
create function public.pc_my_report(p uuid, pitcher text, game text default null, from_day date default null, to_day date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ok as (select 1 where (p, pitcher) in (select l.program_id, l.pitcher_id from private.pc_my_links() l) and private.pc_team_active(p)),
  gs as (select g.* from private.pc_report_games(p, from_day, to_day) g, ok where game is null or g.id = game),
  ev as (
    select e.doc from public.events e join gs on gs.id = e.game_id
    where e.program_id = p and e.pitcher_id = pitcher and e.deleted_at is null and (e.type is null or e.type = 'pitch')
      and coalesce((e.doc ->> 'legacy')::boolean, false) = false)
  select jsonb_build_object(
    'pitcher', (select jsonb_build_object('id', x.id, 'name', x.doc ->> 'name', 'hand', x.doc ->> 'hand',
                  'pitches', (select coalesce(jsonb_agg(jsonb_build_object('id', q -> 'id', 'name', q -> 'name', 'kind', q -> 'kind')), '[]'::jsonb)
                              from jsonb_array_elements(case when jsonb_typeof(x.doc -> 'pitches') = 'array' then x.doc -> 'pitches' else '[]'::jsonb end) q))
                from public.pitchers x where x.program_id = p and x.id = pitcher),
    'team', (select t.name from public.programs t where t.id = p),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', gs.id, 'date', gs.day, 'level', gs.doc ->> 'level', 'status', gs.doc ->> 'status',
                         'opponent', (select o.doc ->> 'name' from public.teams o where o.program_id = p and o.id = gs.doc ->> 'opponentId'))
                         order by gs.day, gs.id) from gs where exists (select 1 from ev where ev.doc ->> 'gameId' = gs.id)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(private.pc_report_event(ev.doc, true)) from ev), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'game_id', n.game_id, 'scope', n.scope, 'at_bat', n.at_bat, 'body', n.body, 'created_at', n.created_at)
                         order by n.created_at)
                       from public.report_notes n join gs on gs.id = n.game_id
                       where n.program_id = p and n.pitcher_id = pitcher and n.shared and n.deleted_at is null), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'start', s.start_date, 'end', s.end_date) order by s.end_date desc)
                         from public.seasons s where s.program_id = p), '[]'::jsonb),
    'season_start', private.pc_season_start(p))
  from ok
$$;

-- A public recap: only while the link is live, only the sections the pitcher chose. A frozen final recap comes back as
-- stored, with the sections he didn't choose taken out; the season so far comes back as his pitches with the fields
-- the chosen sections need (where pitches were called and landed only with the heat maps; dates only with the outing
-- list or pitch by pitch). Never notes, style, overrides, hitters or opponents.
create function public.pc_public_recap(tok text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.recap_shares; secs jsonb; se public.seasons; frozen jsonb; from_day date; to_day date; lvl text; out jsonb;
begin
  if tok is null or tok !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into s from public.recap_shares x where x.token = tok;
  if s.token is null or not private.pc_share_live(s) then return null; end if;
  secs := private.pc_clean_sections(s.sections);
  select t.level into lvl from public.programs t where t.id = s.program_id;
  if s.season_id is not null then
    select * into se from public.seasons x where x.id = s.season_id;
    from_day := se.start_date; to_day := se.end_date;
    select v.data into frozen from public.recap_versions v where v.season_id = s.season_id and v.pitcher_id = s.pitcher_id order by v.version desc limit 1;
  else
    from_day := private.pc_season_start(s.program_id);
  end if;
  out := jsonb_build_object(
    'pitcher', (select jsonb_build_object('name', x.doc ->> 'name', 'hand', x.doc ->> 'hand',
                  'pitches', (select coalesce(jsonb_agg(jsonb_build_object('id', q -> 'id', 'name', q -> 'name', 'kind', q -> 'kind')), '[]'::jsonb)
                              from jsonb_array_elements(case when jsonb_typeof(x.doc -> 'pitches') = 'array' then x.doc -> 'pitches' else '[]'::jsonb end) q))
                from public.pitchers x where x.program_id = s.program_id and x.id = s.pitcher_id),
    'team', (select t.name from public.programs t where t.id = s.program_id),
    'level', lvl, 'sections', secs,
    'season', case when s.season_id is null then jsonb_build_object('name', 'Season so far', 'start', from_day, 'final', false)
                   else jsonb_build_object('name', se.name, 'start', se.start_date, 'end', se.end_date, 'final', true) end);
  if frozen is not null then
    return out || jsonb_build_object('frozen', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(frozen) j(k, v)
      where k in ('meta', 'line', 'comparison', 'completeness', 'pitchMix', 'trends') and (secs ->> 'summary')::boolean
         or k = 'heat' and (secs ->> 'heat')::boolean
         or k = 'outings' and (secs ->> 'outings')::boolean
         or k = 'pitchByPitch' and (secs ->> 'pitches')::boolean));
  end if;
  return out || jsonb_build_object(
    -- his games in order; their dates only with the outing list or pitch by pitch (otherwise outings are numbered)
    'games', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', g.id, 'level', g.doc ->> 'level',
                 'date', case when (secs ->> 'outings')::boolean or (secs ->> 'pitches')::boolean then g.day end)) order by g.day, g.id)
               from private.pc_report_games(s.program_id, from_day, to_day) g
               where exists (select 1 from public.events e where e.program_id = s.program_id and e.game_id = g.id and e.pitcher_id = s.pitcher_id and e.deleted_at is null)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(r)
      from (select private.pc_report_event(e.doc, (secs ->> 'heat')::boolean) - 'id' - 'pitcherId' - 'shaken' - 'recall' - 'slot' as r
            from public.events e join private.pc_report_games(s.program_id, from_day, to_day) g on g.id = e.game_id
            where e.program_id = s.program_id and e.pitcher_id = s.pitcher_id and e.deleted_at is null and (e.type is null or e.type = 'pitch')
              and coalesce((e.doc ->> 'legacy')::boolean, false) = false) x), '[]'::jsonb));
end $$;

revoke all on function private.pc_note_writer(uuid), private.pc_note_stamp(), private.pc_season_start(uuid), private.pc_recap_frozen(),
  private.pc_is_minor18(uuid, text), private.pc_is_parent_of(uuid, text), private.pc_share_live(public.recap_shares), private.pc_clean_sections(jsonb),
  private.pc_report_event(jsonb, boolean), private.pc_report_games(uuid, date, date) from public, anon;
grant execute on function private.pc_note_writer(uuid), private.pc_season_start(uuid), private.pc_is_minor18(uuid, text), private.pc_is_parent_of(uuid, text)
  to authenticated, service_role;
revoke all on function public.pc_mark_season_over(uuid, text), public.pc_set_minor18(uuid, text, text), public.pc_share_create(uuid, text, uuid),
  public.pc_share_sections(text, jsonb), public.pc_share_revoke(text), public.pc_share_approve(text, boolean), public.pc_my_share_requests(),
  public.pc_my_report(uuid, text, text, date, date), public.pc_public_recap(text) from public, anon;
grant execute on function public.pc_mark_season_over(uuid, text), public.pc_set_minor18(uuid, text, text), public.pc_share_create(uuid, text, uuid),
  public.pc_share_sections(text, jsonb), public.pc_share_revoke(text), public.pc_share_approve(text, boolean), public.pc_my_share_requests(),
  public.pc_my_report(uuid, text, text, date, date) to authenticated, service_role;
grant execute on function public.pc_public_recap(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ who gets the report emails (server only)
-- Everyone on the team with a confirmed email: coaches (any staff role) and players with the pitcher records they speak
-- for (a young player's parent account is that account). A catcher, an opponent or anyone off the team never.
create function public.pc_report_people(p uuid) returns table (user_id uuid, email text, role text, pitcher_id text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, lower(u.email), m.role, l.pitcher_id
  from public.members m
  join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
  left join public.player_links l on l.program_id = m.program_id and l.user_id = m.user_id
  where m.program_id = p and private.pc_team_active(p)
$$;
-- the parent email for an under-18 player's approval request
create function public.pc_report_parent(p uuid, pitcher text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.parent_email from public.minor_guardians m where m.program_id = p and m.pitcher_id = pitcher),
    (select lower(u.email) from public.guardian_consents g join auth.users u on u.id = g.guardian_user_id where g.program_id = p and g.pitcher_id = pitcher))
$$;
revoke all on function public.pc_report_people(uuid), public.pc_report_parent(uuid, text) from public, anon, authenticated;
grant execute on function public.pc_report_people(uuid), public.pc_report_parent(uuid, text) to service_role;
