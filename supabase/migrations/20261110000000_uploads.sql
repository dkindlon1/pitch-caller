-- PitchIQ uploads, proposals and stats (Plan 4). Spec: "Upload pipeline", "Player stats", D10, D11.
--
--   * uploads + upload_pitches: one row per TrackMan/Rapsodo/mapped file and one per pitch in it, already normalized by
--     the website (web/lib/uploads.ts: arm side positive, feet and inches, the app's pitch types). Each pitch can be
--     excluded (with a reason) or marked developing. A player owns his; a coach with review_uploads reviews them.
--   * proposals: values for the engine's fields (velo, shape, slot) drawn from the uploads. Nothing changes the pitcher
--     record until the pitcher or a coach with review_uploads accepts one.
--   * upload_templates: a team's saved column mappings for files that aren't TrackMan or Rapsodo.
--   * pc_pitch_rows: a pitcher's called game pitches for his stats, with the hitter reduced to "same side" or
--     "opposite side". No hitter, opponent or call reasoning leaves the function.
-- All of it is a child's data too: it goes when a parent deletes him and while he's held without consent.

-- ------------------------------------------------------------------ tables
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null check (length(pitcher_id) between 1 and 80),
  uploaded_by uuid references auth.users (id) on delete set null,
  source text not null check (source in ('trackman', 'rapsodo', 'mapped')),
  session_type text not null check (session_type in ('game', 'live_bp', 'bullpen')),
  session_date date not null,
  file_name text check (length(file_name) <= 200),
  n_pitches int not null check (n_pitches between 1 and 5000),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now()
);
create index uploads_pitcher on public.uploads (program_id, pitcher_id, session_date desc);
create index uploads_uploaded_by on public.uploads (uploaded_by);

create table public.upload_pitches (
  upload_id uuid not null references public.uploads (id) on delete cascade,
  idx int not null check (idx >= 0),
  program_id uuid not null,
  pitcher_id text not null,
  pitch_type text not null check (length(pitch_type) between 1 and 40),
  kind text not null check (kind in ('FB', 'SL', 'CB', 'CH')),
  velo_mph numeric, ivb_in numeric, hb_in numeric, spin_rpm numeric,
  rel_height_ft numeric, rel_side_ft numeric, extension_ft numeric, plate_x_ft numeric, plate_z_ft numeric,
  balls smallint check (balls between 0 and 3), strikes smallint check (strikes between 0 and 2),
  res text check (res in ('ball', 'cstrike', 'whiff', 'foul', 'play', 'hbp')),
  contact text check (contact in ('weak', 'solid', 'hard')),
  batter_side text check (batter_side in ('R', 'L')),
  excluded boolean not null default false,
  reason text check (reason in ('warmup', 'grip', 'mistag', 'other')),
  developing boolean not null default false,
  primary key (upload_id, idx),
  check (reason is null or excluded)
);
create index upload_pitches_pitcher on public.upload_pitches (program_id, pitcher_id);

create table public.proposals (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  pitcher_id text not null,
  pitch_id text,                                  -- the arsenal pitch (velo, shape); null for slot
  pitch_name text check (length(pitch_name) <= 80),
  field text not null check (field in ('velo', 'shape', 'slot')),
  value jsonb not null,
  current jsonb,                                  -- what the record held when it was proposed
  basis jsonb not null default '{}'::jsonb,       -- how many pitches, from which uploads
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  check ((field = 'slot') = (pitch_id is null))
);
create unique index proposals_one_pending on public.proposals (program_id, pitcher_id, coalesce(pitch_id, ''), field) where status = 'pending';
create index proposals_pitcher on public.proposals (program_id, pitcher_id, created_at desc);
create index proposals_created_by on public.proposals (created_by);
create index proposals_decided_by on public.proposals (decided_by);

create table public.upload_templates (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  header_sig text not null check (length(header_sig) <= 2000),   -- the file's column names, normalized, joined
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, header_sig)
);
create index upload_templates_created_by on public.upload_templates (created_by);

-- reads: the team's coaches (any preset, on an active team) see all of it; a player (or parent) sees his own pitcher's.
-- Writes go only through the functions below.
do $$
declare t text;
begin
  foreach t in array array['uploads', 'upload_pitches', 'proposals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke maintain on public.%I from public, anon, authenticated', t);
    execute format($p$create policy pc_read on public.%I for select to authenticated
      using (program_id in (select private.pc_coach_teams())
             or (program_id, pitcher_id) in (select l.program_id, l.pitcher_id from private.pc_my_links() l))$p$, t);
  end loop;
end $$;
alter table public.upload_templates enable row level security;
revoke all on public.upload_templates from anon, authenticated;
grant select on public.upload_templates to authenticated;
revoke maintain on public.upload_templates from public, anon, authenticated;
-- a team's mappings are visible to everyone who can upload on it (its coaches and its players)
create policy pc_read on public.upload_templates for select to authenticated
  using (program_id in (select private.pc_coach_teams()) or program_id in (select l.program_id from private.pc_my_links() l));

-- ------------------------------------------------------------------ helpers
-- who may upload for, review and decide on a pitcher: the pitcher himself (or his parent), or a coach with review_uploads
create function private.pc_upload_ok(p uuid, pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pc_team_active(p)
     and exists (select 1 from public.pitchers x where x.program_id = p and x.id = pitcher and x.deleted_at is null)
     and not private.pc_minor_unconsented(p, pitcher)
     and ((p, pitcher) in (select l.program_id, l.pitcher_id from private.pc_my_links() l) or private.pc_can(p, 'review_uploads'))
$$;

-- a number from a jsonb value, or null if it isn't one or is outside [lo, hi]
create function private.pc_rng(v jsonb, lo numeric, hi numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi then round((v #>> '{}')::numeric, 2) end
$$;

-- the child's data, gone with the rest of it (replaces 20261109's: also uploads and proposals, and also when a
-- parent's consent is withdrawn and the child is held again)
create or replace function private.pc_drop_grade_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid; pit text;
begin
  if tg_op = 'DELETE' then p := old.program_id; pit := old.pitcher_id; else p := new.program_id; pit := new.pitcher_id; end if;
  if tg_table_name = 'purged' or private.pc_minor_unconsented(p, pit) then
    delete from public.grade_history h where h.program_id = p and h.pitcher_id = pit;
    delete from public.uploads u where u.program_id = p and u.pitcher_id = pit;
    delete from public.proposals x where x.program_id = p and x.pitcher_id = pit;
  end if;
  return null;
end $$;
create trigger pc_child_data_consent_gone after delete on public.guardian_consents for each row execute function private.pc_drop_grade_history();

revoke all on function private.pc_upload_ok(uuid, text), private.pc_rng(jsonb, numeric, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------------ uploads
-- meta: {source, session_type, session_date, file_name, warnings}; pitches: the normalized rows (web/lib/uploads.ts).
-- Numbers outside what a pitch can be are stored as blank, never clamped into a wrong value.
create function public.pc_upload_add(p uuid, pitcher text, meta jsonb, pitches jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid; n int; d date;
begin
  if not private.pc_upload_ok(p, pitcher) then raise exception 'you can''t upload for this pitcher' using errcode = '42501'; end if;
  if jsonb_typeof(meta) <> 'object' or jsonb_typeof(pitches) <> 'array' then raise exception 'bad upload' using errcode = '22023'; end if;
  n := jsonb_array_length(pitches);
  if n < 1 or n > 5000 then raise exception 'an upload holds 1 to 5000 pitches' using errcode = '22023'; end if;
  if (select count(*) from public.uploads u where u.program_id = p and u.pitcher_id = pitcher and u.created_at > now() - interval '1 day') >= 50 then
    raise exception 'that''s 50 uploads for him today: try again tomorrow' using errcode = '54000';
  end if;
  begin d := (meta ->> 'session_date')::date; exception when others then d := null; end;
  if d is null or d > current_date + 1 or d < date '2000-01-01' then raise exception 'the session needs a date' using errcode = '22023'; end if;
  insert into public.uploads (program_id, pitcher_id, uploaded_by, source, session_type, session_date, file_name, n_pitches, warnings)
  values (p, pitcher, auth.uid(), meta ->> 'source', meta ->> 'session_type', d, left(nullif(meta ->> 'file_name', ''), 200), n,
          case when jsonb_typeof(meta -> 'warnings') = 'array' then (select coalesce(jsonb_agg(left(w #>> '{}', 300)), '[]'::jsonb)
                 from jsonb_array_elements(meta -> 'warnings') with ordinality a(w, i) where i <= 20 and jsonb_typeof(w) = 'string') else '[]'::jsonb end)
  returning id into uid;
  insert into public.upload_pitches (upload_id, idx, program_id, pitcher_id, pitch_type, kind, velo_mph, ivb_in, hb_in, spin_rpm,
    rel_height_ft, rel_side_ft, extension_ft, plate_x_ft, plate_z_ft, balls, strikes, res, contact, batter_side, excluded, reason, developing)
  select uid, (i - 1)::int, p, pitcher, left(r ->> 'pitch_type', 40), r ->> 'kind',
    private.pc_rng(r -> 'velo_mph', 30, 110), private.pc_rng(r -> 'ivb_in', -40, 40), private.pc_rng(r -> 'hb_in', -40, 40),
    private.pc_rng(r -> 'spin_rpm', 0, 4500), private.pc_rng(r -> 'rel_height_ft', 0, 10), private.pc_rng(r -> 'rel_side_ft', -8, 8),
    private.pc_rng(r -> 'extension_ft', 0, 10), private.pc_rng(r -> 'plate_x_ft', -5, 5), private.pc_rng(r -> 'plate_z_ft', -3, 8),
    private.pc_rng(r -> 'balls', 0, 3)::smallint, private.pc_rng(r -> 'strikes', 0, 2)::smallint,
    case when r ->> 'res' in ('ball', 'cstrike', 'whiff', 'foul', 'play', 'hbp') then r ->> 'res' end,
    case when r ->> 'contact' in ('weak', 'solid', 'hard') then r ->> 'contact' end,
    case when r ->> 'batter_side' in ('R', 'L') then r ->> 'batter_side' end,
    coalesce((r ->> 'excluded')::boolean, false),
    case when coalesce((r ->> 'excluded')::boolean, false) and r ->> 'reason' in ('warmup', 'grip', 'mistag', 'other') then r ->> 'reason' end,
    coalesce((r ->> 'developing')::boolean, false)
  from jsonb_array_elements(pitches) with ordinality a(r, i);
  return uid;
end $$;

-- include, exclude (with a reason) or mark developing: changes [{idx, excluded, reason, developing}]
create function public.pc_upload_review(upload uuid, changes jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare u public.uploads%rowtype; k int;
begin
  select * into u from public.uploads where id = upload;
  if u.id is null or not private.pc_upload_ok(u.program_id, u.pitcher_id) then raise exception 'you can''t review this upload' using errcode = '42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 5000 then raise exception 'bad changes' using errcode = '22023'; end if;
  update public.upload_pitches x set
    excluded = coalesce((c ->> 'excluded')::boolean, x.excluded),
    reason = case when coalesce((c ->> 'excluded')::boolean, x.excluded)
                  then case when c ? 'reason' then case when c ->> 'reason' in ('warmup', 'grip', 'mistag', 'other') then c ->> 'reason' end else x.reason end end,
    developing = coalesce((c ->> 'developing')::boolean, x.developing)
  from jsonb_array_elements(changes) c
  where x.upload_id = upload and jsonb_typeof(c -> 'idx') = 'number' and x.idx = (c ->> 'idx')::int;
  get diagnostics k = row_count;
  return k;
end $$;

create function public.pc_upload_delete(upload uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.uploads%rowtype;
begin
  select * into u from public.uploads where id = upload;
  if u.id is null or not private.pc_upload_ok(u.program_id, u.pitcher_id) then raise exception 'you can''t delete this upload' using errcode = '42501'; end if;
  delete from public.uploads where id = upload;
end $$;

-- a team's saved mapping for a kind of file nobody recognized (anyone who may upload on the team saves one)
create function public.pc_template_save(p uuid, template_name text, sig text, map jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pc_team_active(p) or not (private.pc_can(p, 'review_uploads') or p in (select l.program_id from private.pc_my_links() l)) then
    raise exception 'you can''t save a mapping on this team' using errcode = '42501';
  end if;
  if jsonb_typeof(map) <> 'object' or exists (select 1 from jsonb_each(map) e where e.key not in
       ('type', 'velo', 'ivb', 'hb', 'spin', 'ext', 'relH', 'relS', 'px', 'pz', 'call', 'pitcher', 'date', 'balls', 'strikes', 'side', 'exit', 'throws')
       or jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 100) or not map ? 'type' then
    raise exception 'a mapping needs at least the pitch type column' using errcode = '22023';
  end if;
  if (select count(*) from public.upload_templates t where t.program_id = p) >= 50 then raise exception 'that''s 50 saved mappings' using errcode = '54000'; end if;
  insert into public.upload_templates (program_id, name, header_sig, mapping, created_by)
  values (p, left(btrim(template_name), 60), left(sig, 2000), map, auth.uid())
  on conflict (program_id, header_sig) do update set name = excluded.name, mapping = excluded.mapping, created_by = excluded.created_by;
end $$;

-- ------------------------------------------------------------------ proposals
-- Replace a pitcher's pending proposals with a fresh set: [{pitch_id, field, value, current, basis}]. Values are checked
-- against the field's shape; a pitch must be in his arsenal.
create function public.pc_proposals_set(p uuid, pitcher text, list jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; x jsonb; pit jsonb; n int := 0; v jsonb;
begin
  if not private.pc_upload_ok(p, pitcher) then raise exception 'you can''t propose values for this pitcher' using errcode = '42501'; end if;
  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) > 40 then raise exception 'bad proposals' using errcode = '22023'; end if;
  select x2.doc into doc from public.pitchers x2 where x2.program_id = p and x2.id = pitcher;
  update public.proposals set status = 'superseded', decided_at = now() where program_id = p and pitcher_id = pitcher and status = 'pending';
  for x in select * from jsonb_array_elements(list) loop
    pit := null;
    if x ->> 'field' in ('velo', 'shape') then
      select e into pit from jsonb_array_elements(coalesce(doc -> 'pitches', '[]'::jsonb)) e where e ->> 'id' = x ->> 'pitch_id' limit 1;
      if pit is null then continue; end if;
    elsif x ->> 'field' <> 'slot' then continue;
    end if;
    v := x -> 'value';
    if x ->> 'field' = 'velo' then
      if private.pc_rng(v, 30, 110) is null then continue; end if;
      v := to_jsonb(round(private.pc_rng(v, 30, 110), 1));
    elsif x ->> 'field' = 'shape' then
      if jsonb_typeof(v) <> 'object' or coalesce(v ->> 'shape', '') not in ('ride', 'run', 'sink', 'cut', 'tight', 'sweeper', 'loopy', 'sharp', 'fade', 'drop')
         or private.pc_rng(v -> 'ivb', -40, 40) is null or private.pc_rng(v -> 'hb', -40, 40) is null then continue; end if;
      v := jsonb_build_object('shape', v ->> 'shape', 'ivb', round(private.pc_rng(v -> 'ivb', -40, 40), 1), 'hb', round(private.pc_rng(v -> 'hb', -40, 40), 1));
    else
      if coalesce(v #>> '{}', '') not in ('over the top', 'high three-quarter', 'three-quarter', 'low three-quarter', 'sidearm', 'submarine') then continue; end if;
    end if;
    insert into public.proposals (program_id, pitcher_id, pitch_id, pitch_name, field, value, current, basis, created_by)
    values (p, pitcher, case when x ->> 'field' = 'slot' then null else pit ->> 'id' end, left(pit ->> 'name', 80), x ->> 'field', v,
            case when x ->> 'field' = 'slot' then doc -> 'slot' when x ->> 'field' = 'velo' then pit -> 'velo'
                 else jsonb_build_object('shape', pit -> 'shape', 'ivb', pit -> 'ivb', 'hb', pit -> 'hb') end,
            case when jsonb_typeof(x -> 'basis') = 'object' and length((x -> 'basis')::text) <= 2000 then x -> 'basis' else '{}'::jsonb end, auth.uid())
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Accept or reject one. Accepting writes the value into the pitcher record (and its timestamp, so every iPad gets it).
create function public.pc_proposal_decide(proposal bigint, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare x public.proposals%rowtype; rec jsonb; arr jsonb := '[]'::jsonb; e jsonb; hit boolean := false;
begin
  select * into x from public.proposals where id = proposal for update;
  if x.id is null or not private.pc_upload_ok(x.program_id, x.pitcher_id) then raise exception 'you can''t decide on this' using errcode = '42501'; end if;
  if x.status <> 'pending' then raise exception 'that''s already been decided' using errcode = '22023'; end if;
  if accept then
    select t.doc into rec from public.pitchers t where t.program_id = x.program_id and t.id = x.pitcher_id and t.deleted_at is null for update;
    if rec is null or jsonb_typeof(rec) <> 'object' then raise exception 'that pitcher isn''t on the roster any more' using errcode = '22023'; end if;
    if x.field = 'slot' then
      rec := rec || jsonb_build_object('slot', x.value);
    else
      for e in select * from jsonb_array_elements(coalesce(rec -> 'pitches', '[]'::jsonb)) loop
        if e ->> 'id' = x.pitch_id then
          e := case when x.field = 'velo' then e || jsonb_build_object('velo', x.value) else e || x.value end;
          hit := true;
        end if;
        arr := arr || jsonb_build_array(e);
      end loop;
      if not hit then raise exception 'that pitch isn''t in his arsenal any more' using errcode = '22023'; end if;
      rec := rec || jsonb_build_object('pitches', arr);
    end if;
    update public.pitchers set doc = private.pc_bump(rec) where program_id = x.program_id and id = x.pitcher_id;
  end if;
  update public.proposals set status = case when accept then 'accepted' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = proposal;
end $$;

-- ------------------------------------------------------------------ stats rows
-- A pitcher's called game pitches (PitchIQ), the last 365 days: date, count, pitch, result, contact, how the PA
-- ended, and the hitter only as same or opposite side. For him (or his parent) and his team's coaches.
create function public.pc_pitch_rows(p uuid, pitcher text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ok as (select (private.pc_can(p, 'view_team') or (p, pitcher) in (select l.program_id, l.pitcher_id from private.pc_my_links() l)) as yes),
  me as (select coalesce(x.doc ->> 'hand', 'R') as hand from public.pitchers x where x.program_id = p and x.id = pitcher),
  ev as (
    select g.doc ->> 'date' as day, e.doc ->> 'count' as cnt, coalesce(nullif(e.doc ->> 'pitchName', ''), '?') as pitch,
           coalesce(nullif(e.doc ->> 'kind', ''), '?') as kind, e.doc ->> 'res' as res, e.doc ->> 'contact' as contact,
           e.doc ->> 'paEnd' as pa_end, e.doc ->> 'out' as out_type,
           (select case when h.doc ->> 'bats' = 'S' then 'opp' when h.doc ->> 'bats' in ('R', 'L') then
                     case when h.doc ->> 'bats' = (select hand from me) then 'same' else 'opp' end end
            from public.hitters h where h.program_id = e.program_id and h.id = e.doc ->> 'hitterId') as side,
           coalesce((e.doc ->> 'n')::int, 0) as n, e.game_id
    from public.events e join public.games g on g.program_id = e.program_id and g.id = e.game_id
    where e.program_id = p and e.pitcher_id = pitcher and (e.type is null or e.type = 'pitch')
      and coalesce((e.doc ->> 'legacy')::boolean, false) = false and e.deleted_at is null and g.deleted_at is null
      and g.doc ->> 'dupOf' is null and g.doc ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
      and g.doc ->> 'date' >= to_char(now() - interval '365 days', 'YYYY-MM-DD'))
  select case when (select yes from ok) then coalesce((
    select jsonb_agg(jsonb_build_object('date', day, 'count', cnt, 'pitch', pitch, 'kind', kind, 'res', res, 'contact', contact,
      'pa_end', pa_end, 'out', out_type, 'side', side) order by day, game_id, n)
    from (select * from ev order by day desc limit 20000) s), '[]'::jsonb) end
$$;

revoke all on function public.pc_upload_add(uuid, text, jsonb, jsonb), public.pc_upload_review(uuid, jsonb), public.pc_upload_delete(uuid),
  public.pc_template_save(uuid, text, text, jsonb), public.pc_proposals_set(uuid, text, jsonb), public.pc_proposal_decide(bigint, boolean),
  public.pc_pitch_rows(uuid, text) from public, anon;
grant execute on function public.pc_upload_add(uuid, text, jsonb, jsonb), public.pc_upload_review(uuid, jsonb), public.pc_upload_delete(uuid),
  public.pc_template_save(uuid, text, text, jsonb), public.pc_proposals_set(uuid, text, jsonb), public.pc_proposal_decide(bigint, boolean),
  public.pc_pitch_rows(uuid, text) to authenticated;
