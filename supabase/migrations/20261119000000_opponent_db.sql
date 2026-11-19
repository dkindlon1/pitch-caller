-- Build 2: the opponent database (docs/PLAN_opponent_database_2026-11-18.md 3, 4, 6, 7). Pages and data only: nothing
-- here reaches the engine (section 5's mapping waits for the hitter model revamp).
-- A hitter's and an opponent team's scouting (ratings, zone grid, pitch checkboxes, speed / small ball, class year,
-- notes, tendencies, custom values, merges) lives in their own JSON docs, written through pc_push like every other
-- record, so the existing rules hold: coaches with "manage opponents" (or roster) write, every coach reads, players and
-- anyone signed out see nothing. New here: the organization's custom field definitions (its owner creates them), the
-- suggestions made after games, and a log of merges. Additive. Applied to the LOCAL Supabase only.

-- ------------------------------------------------------------------ custom fields (per organization)
create table public.opp_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null check (scope in ('hitter', 'team')),
  kind text not null check (kind in ('checkbox', 'dropdown', 'grid', 'text')),
  label text not null check (length(btrim(label)) between 1 and 60),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20),
  position int not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index opp_fields_org on public.opp_fields (org_id, scope, position);
alter table public.opp_fields enable row level security;
-- every coach on one of the organization's active teams reads them (to show and fill them in); players never
create policy opp_fields_read on public.opp_fields for select to authenticated using (
  org_id in (select t.org_id from public.programs t where t.id in (select private.pc_coach_teams()))
  or private.pc_is_owner(org_id));
revoke all on public.opp_fields from anon;
revoke insert, update, delete, truncate, references, trigger on public.opp_fields from authenticated;
grant select on public.opp_fields to authenticated;

-- the owner adds, edits and archives them (archived values stay on the records, shown read-only)
create function public.pc_opp_field_save(org uuid, field uuid, field_scope text, field_kind text, field_label text, field_options jsonb, field_position int, archive boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  if not private.pc_is_owner(org) then raise exception 'only the organization''s owner sets up custom fields' using errcode = '42501'; end if;
  if field is null then
    insert into public.opp_fields (org_id, scope, kind, label, options, position)
    values (org, field_scope, field_kind, btrim(field_label), coalesce(field_options, '[]'::jsonb), coalesce(field_position, 0)) returning id into fid;
  else
    -- a field's scope and kind never change once values may exist; its label, options, order and archive state can
    update public.opp_fields f set label = btrim(field_label), options = coalesce(field_options, f.options), position = coalesce(field_position, f.position),
      archived_at = case when archive then coalesce(f.archived_at, now()) else null end
    where f.id = field and f.org_id = org returning id into fid;
    if fid is null then raise exception 'no such field' using errcode = '22023'; end if;
  end if;
  return fid;
end $$;

-- ------------------------------------------------------------------ suggestions after games
create table public.opp_suggestions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  hitter_id text not null check (length(hitter_id) between 1 and 200),
  kind text not null check (kind in ('zone', 'rating')),
  key text not null check (length(key) between 1 and 20),
  value text not null check (length(value) between 1 and 20),
  text text not null check (length(text) <= 300),
  evidence jsonb not null default '{}'::jsonb,
  n int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decided_n int,
  unique (program_id, hitter_id, kind, key)
);
alter table public.opp_suggestions enable row level security;
create policy opp_suggestions_read on public.opp_suggestions for select to authenticated using (program_id in (select private.pc_coach_teams()));
revoke all on public.opp_suggestions from anon;
revoke insert, update, delete, truncate, references, trigger on public.opp_suggestions from authenticated;
grant select on public.opp_suggestions to authenticated;

-- a coach who may edit opponents accepts or dismisses (accepting also writes the hitter's doc, through pc_push)
create function public.pc_opp_suggestion_decide(p uuid, suggestion uuid, accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.opp_suggestions;
begin
  if not (private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster')) then
    raise exception 'only a coach who manages opponents can do this' using errcode = '42501'; end if;
  update public.opp_suggestions x set status = case when accept then 'accepted' else 'dismissed' end, decided_by = auth.uid(), decided_at = now(), decided_n = x.n, updated_at = now()
  where x.id = suggestion and x.program_id = p and x.status = 'pending' returning * into s;
  if s.id is null then raise exception 'that suggestion isn''t waiting any more' using errcode = '22023'; end if;
  return jsonb_build_object('hitter_id', s.hitter_id, 'kind', s.kind, 'key', s.key, 'value', s.value);
end $$;

-- ------------------------------------------------------------------ merges (the same hitter entered twice)
create table public.opp_merges (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  kept text not null,
  merged text not null,
  merged_by uuid,
  merged_at timestamptz not null default now()
);
alter table public.opp_merges enable row level security;
create policy opp_merges_read on public.opp_merges for select to authenticated using (program_id in (select private.pc_coach_teams()));
revoke all on public.opp_merges from anon;
revoke insert, update, delete, truncate, references, trigger on public.opp_merges from authenticated;
grant select on public.opp_merges to authenticated;
create function public.pc_opp_merge_log(p uuid, kept text, merged text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster')) then
    raise exception 'only a coach who manages opponents can merge hitters' using errcode = '42501'; end if;
  if kept = merged then raise exception 'pick two different hitters' using errcode = '22023'; end if;
  insert into public.opp_merges (program_id, kept, merged, merged_by) values (p, kept, merged, auth.uid());
end $$;

revoke all on function public.pc_opp_field_save(uuid, uuid, text, text, text, jsonb, int, boolean), public.pc_opp_suggestion_decide(uuid, uuid, boolean),
  public.pc_opp_merge_log(uuid, text, text) from public, anon;
grant execute on function public.pc_opp_field_save(uuid, uuid, text, text, text, jsonb, int, boolean), public.pc_opp_suggestion_decide(uuid, uuid, boolean),
  public.pc_opp_merge_log(uuid, text, text) to authenticated, service_role;
