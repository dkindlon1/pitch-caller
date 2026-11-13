-- v1.1 (docs/PLAN_v1.1_2026-11-12.md, Step 5): six pitch kinds and the v1.1 profile tags in the uploads tables.
--   1. upload_pitches.kind takes FB / SI / FC / SL / CB / CH. Stored rows are remapped by pitch_type, the importer's type
--      names (app/import.js KIND): Two-seam and Sinker are sinkers, Cutter is a cutter; every other type keeps its kind.
--   2. pc_proposals_set: a shape proposal carries the pitch's kind and a v1.1 tag valid for that kind. The kind is the
--      pitch's own, read through the engine's migration table (a pitcher record still in v1.0 terms counts as migrated),
--      and a proposal can't change it.
--   3. Pending shape proposals with v1.0 tags are remapped through the same table; one that can't be (it would change the
--      pitch's kind, or the tag isn't one of that kind's) is superseded.
-- pc_proposal_decide is unchanged: accepting merges {kind, shape, ivb, hb} into the pitch, so an accepted proposal on a
-- record still in v1.0 terms leaves it a consistent v1.1 pitch.

-- BEGIN GENERATED (supabase/gen_v11_kinds_sql.py from engine.py)
-- (kind, shape) in v1.1 terms: a known type wins while the pitch still has that type's v1.0 tags; else the v1.0
-- kind and tag; v1.1 kinds and tags pass through (engine.py migrate_pitch).
create function private.pc_migrate_pitch(kind text, shape text, type text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(
    (select array[t.k2, t.s2] from (values
      ('Four-seam', 'FB', 'ride', 'FB', 'rides'),
      ('Two-seam', 'FB', 'run', 'SI', 'two-seam'),
      ('Sinker', 'FB', 'sink', 'SI', 'run'),
      ('Cutter', 'FB', 'cut', 'FC', ''),
      ('Slider', 'SL', 'tight', 'SL', 'tight'),
      ('Sweeper', 'SL', 'sweeper', 'SL', 'sweeper'),
      ('Slurve', 'SL', '', 'SL', 'slurve'),
      ('Curveball', 'CB', 'loopy', 'CB', ''),
      ('Knuckle curve', 'CB', 'sharp', 'CB', ''),
      ('12-6 curve', 'CB', 'sharp', 'CB', '12-6'),
      ('Changeup', 'CH', 'fade', 'CH', 'fade'),
      ('Splitter', 'CH', 'drop', 'CH', 'split'),
      ('Forkball', 'CH', 'drop', 'CH', 'split')
    ) as t(ty, k1, s1, k2, s2) where t.ty = type and t.k1 = kind and t.s1 = coalesce(shape, '')),
    (select array[g.k2, g.s2] from (values
      ('FB', 'ride', 'FB', 'rides'),
      ('FB', 'run', 'FB', 'runs'),
      ('FB', 'cut', 'FB', 'cuts'),
      ('FB', 'sink', 'SI', 'run'),
      ('CB', 'loopy', 'CB', 'slow'),
      ('CB', 'sharp', 'CB', 'power'),
      ('SI', 'sink', 'SI', 'run'),
      ('SI', 'ride', 'SI', 'two-seam'),
      ('SI', 'cut', 'SI', ''),
      ('FC', 'cut', 'FC', ''),
      ('FC', 'run', 'FC', ''),
      ('FC', 'sink', 'FC', '')
    ) as g(k1, s1, k2, s2) where g.k1 = kind and g.s1 = coalesce(shape, '')),
    array[kind, coalesce(shape, '')])
$$;
-- the v1.1 tags of each kind (engine.py SHAPE_TAGS)
create function private.pc_shape_ok(kind text, shape text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(shape, '') = any (case kind
    when 'FB' then array['rides', 'runs', 'cuts', 'straight', '']
    when 'SI' then array['run', 'drop', 'two-seam', '']
    when 'FC' then array['hard', 'big', 'ride', '']
    when 'SL' then array['gyro', 'tight', 'sweeper', 'slurve', '']
    when 'CB' then array['12-6', 'sweeping', 'power', 'slow', '']
    when 'CH' then array['fade', 'drop', 'split', 'firm', '']
    else array[]::text[] end)
$$;
-- END GENERATED
revoke all on function private.pc_migrate_pitch(text, text, text), private.pc_shape_ok(text, text) from public, anon, authenticated;

-- 1. six kinds in upload_pitches
alter table public.upload_pitches drop constraint upload_pitches_kind_check;
update public.upload_pitches set kind = 'SI' where pitch_type in ('Two-seam', 'Sinker') and kind = 'FB';
update public.upload_pitches set kind = 'FC' where pitch_type = 'Cutter' and kind = 'FB';
alter table public.upload_pitches add constraint upload_pitches_kind_check check (kind in ('FB', 'SI', 'FC', 'SL', 'CB', 'CH'));

-- 2. shape proposals in v1.1 terms
create or replace function public.pc_proposals_set(p uuid, pitcher text, list jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; x jsonb; pit jsonb; n int := 0; v jsonb; k text;
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
      -- v1.1: the pitch's own kind (through the migration table), and a tag that kind has
      k := (private.pc_migrate_pitch(pit ->> 'kind', pit ->> 'shape', pit ->> 'type'))[1];
      if jsonb_typeof(v) <> 'object' or not (v ? 'shape') or (v ? 'kind' and v ->> 'kind' is distinct from k) or not private.pc_shape_ok(k, v ->> 'shape')
         or private.pc_rng(v -> 'ivb', -40, 40) is null or private.pc_rng(v -> 'hb', -40, 40) is null then continue; end if;
      v := jsonb_build_object('kind', k, 'shape', coalesce(v ->> 'shape', ''), 'ivb', round(private.pc_rng(v -> 'ivb', -40, 40), 1),
                              'hb', round(private.pc_rng(v -> 'hb', -40, 40), 1));
    else
      if coalesce(v #>> '{}', '') not in ('over the top', 'high three-quarter', 'three-quarter', 'low three-quarter', 'sidearm', 'submarine') then continue; end if;
    end if;
    insert into public.proposals (program_id, pitcher_id, pitch_id, pitch_name, field, value, current, basis, created_by)
    values (p, pitcher, case when x ->> 'field' = 'slot' then null else pit ->> 'id' end, left(pit ->> 'name', 80), x ->> 'field', v,
            case when x ->> 'field' = 'slot' then doc -> 'slot' when x ->> 'field' = 'velo' then pit -> 'velo'
                 else jsonb_build_object('kind', pit -> 'kind', 'shape', pit -> 'shape', 'ivb', pit -> 'ivb', 'hb', pit -> 'hb') end,
            case when jsonb_typeof(x -> 'basis') = 'object' and length((x -> 'basis')::text) <= 2000 then x -> 'basis' else '{}'::jsonb end, auth.uid())
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 3. pending v1.0 shape proposals, remapped (or superseded)
do $$
declare r record; pit jsonb; k text; m text[];
begin
  for r in select pr.id, pr.value, pt.doc from public.proposals pr
           left join public.pitchers pt on pt.program_id = pr.program_id and pt.id = pr.pitcher_id
           where pr.status = 'pending' and pr.field = 'shape' loop
    pit := null;
    select e into pit from jsonb_array_elements(coalesce(r.doc -> 'pitches', '[]'::jsonb)) e
      where e ->> 'id' = (select pitch_id from public.proposals where id = r.id) limit 1;
    if pit is null then continue; end if;          -- the pitch is gone: deciding it already fails, as before
    k := (private.pc_migrate_pitch(pit ->> 'kind', pit ->> 'shape', pit ->> 'type'))[1];
    m := private.pc_migrate_pitch(k, r.value ->> 'shape', null);
    if m[1] = k and private.pc_shape_ok(k, m[2]) then
      update public.proposals set value = r.value || jsonb_build_object('kind', k, 'shape', m[2]) where id = r.id;
    else
      update public.proposals set status = 'superseded', decided_at = now() where id = r.id;
    end if;
  end loop;
end $$;
