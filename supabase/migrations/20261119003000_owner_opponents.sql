-- Nov 19, 2026 (permission change approved by Drew, docs/PLAN_opponent_database_2026-11-18.md section 2): the
-- organization's owner reads and edits opponents on every active team of his organization, even when he isn't on that
-- team's staff: opponent teams (never the team's own record, isOurs), hitters (ratings, grid, notes, custom field values
-- live in their docs), suggestions and merges. Nothing else: rosters, games, events, packs, reports, check-ins and every
-- other table keep their rules (rls_matrix_test proves the rest of the matrix unchanged). Applied to the LOCAL
-- Supabase only.

-- the owner of the organization this team belongs to, on an active team
create function private.pc_owner_opp(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pc_team_active(p) and exists (
    select 1 from public.programs t join public.organizations o on o.id = t.org_id where t.id = p and o.owner_id = auth.uid())
$$;
revoke all on function private.pc_owner_opp(uuid) from public, anon;
grant execute on function private.pc_owner_opp(uuid) to authenticated, service_role;

-- reading: extra policies beside the coaches' (policies add up)
create policy owner_opp_read on public.teams for select to authenticated
  using (private.pc_owner_opp(program_id) and coalesce(doc -> 'isOurs', 'null'::jsonb) in ('false'::jsonb, 'null'::jsonb));
create policy owner_opp_read on public.hitters for select to authenticated using (private.pc_owner_opp(program_id));
-- (suggestions: no read policy for the owner path. Their text and counts come from the games, which he can't see; he gets
-- each suggestion's question through pc_opp_suggestions_owner below. Review fixes, Nov 19)
create policy owner_opp_read on public.opp_merges for select to authenticated using (private.pc_owner_opp(program_id));

-- the row rules pc_push uses


create or replace function private.pc_can_read(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a missing pitcherId (NULL) means no, never maybe
  select coalesce(case
    when not private.pc_team_active(p) then false
    when tbl in ('games', 'packs') then private.pc_sees_plan(p)
    when tbl in ('teams', 'hitters') and private.pc_owner_opp(p) then true   -- Nov 19: the owner reads opponents (pc_push only)
    when private.pc_can(p, 'view_team') then true
    when private.pc_role(p) = 'player' then case
      when tbl = 'pitchers' then row_id = any (private.pc_my_pitchers(p))
      when tbl in ('checkins', 'sessions', 'readings') then row_pitcher = any (private.pc_my_pitchers(p))
      else false end   -- events, learned and packs carry hitters and game plans: players get their own data through
                       -- redacted functions (Plan 3), never these rows
    else false end, false)
$$;

create or replace function private.pc_can_write(tbl text, p uuid, row_id text, row_pitcher text, is_insert boolean, touches_deleted boolean)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a missing pitcherId (NULL) means no, never maybe
  select coalesce(case
    when not private.pc_team_active(p) then false
    when tbl in ('teams', 'hitters') and private.pc_owner_opp(p) then true   -- Nov 19: the owner writes opponents (pc_push keeps him off isOurs)
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

-- writing: pc_push as before, with the owner's opponent path (two marked changes)
create or replace function public.pc_push(p uuid, tbl text, rows jsonb) returns jsonb
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
  -- Nov 19 (approved by Drew): the organization's owner may write opponent records (teams, hitters) on any active team
  -- of his organization without being on its staff; nothing else
  if role is null and not (tbl in ('teams', 'hitters') and private.pc_owner_opp(p)) then
    raise exception 'not a member of this team' using errcode = '42501'; end if;
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
    -- the owner writing through his owner path (off the staff, or on it without "manage opponents" / "manage roster"):
    -- opponents only, never the team's own record, new or stored. Any isOurs that isn't false or null counts as ours (the
    -- game app reads it as truthy). Review, Nov 19: was "role is null", which let an owner on the staff as a viewer or player
    -- through, and matched only the literal true.
    if tbl = 'teams' and private.pc_owner_opp(p) and not (private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster'))
       and (coalesce(r -> 'isOurs', 'null'::jsonb) not in ('false'::jsonb, 'null'::jsonb)
            or coalesce(cur -> 'isOurs', 'null'::jsonb) not in ('false'::jsonb, 'null'::jsonb)) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'not allowed'); continue;
    end if;
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

-- the suggestions waiting on one hitter, for the owner off the staff: the question only (kind, spot or rating, value),
-- never the evidence (its text and counts come from the games, which only the team's staff see). Review fixes, Nov 19
create or replace function public.pc_opp_suggestions_owner(p uuid, hitter text) returns table (id uuid, kind text, key text, value text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.pc_owner_opp(p) then raise exception 'only the organization''s owner can do this' using errcode = '42501'; end if;
  return query select s.id, s.kind, s.key, s.value from public.opp_suggestions s
    where s.program_id = p and s.hitter_id = hitter and s.status = 'pending' order by s.created_at;
end $$;
revoke all on function public.pc_opp_suggestions_owner(uuid, text) from public, anon;
grant execute on function public.pc_opp_suggestions_owner(uuid, text) to authenticated, service_role;

-- suggestions and merges: the owner too
create or replace function public.pc_opp_suggestion_decide(p uuid, suggestion uuid, accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.opp_suggestions;
begin
  if not (private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster') or private.pc_owner_opp(p)) then
    raise exception 'only a coach who manages opponents can do this' using errcode = '42501'; end if;
  update public.opp_suggestions x set status = case when accept then 'accepted' else 'dismissed' end, decided_by = auth.uid(), decided_at = now(), decided_n = x.n, updated_at = now()
  where x.id = suggestion and x.program_id = p and x.status = 'pending' returning * into s;
  if s.id is null then raise exception 'that suggestion isn''t waiting any more' using errcode = '22023'; end if;
  return jsonb_build_object('hitter_id', s.hitter_id, 'kind', s.kind, 'key', s.key, 'value', s.value);
end $$;
create or replace function public.pc_opp_merge_log(p uuid, kept text, merged text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.pc_can(p, 'manage_opponents') or private.pc_can(p, 'manage_roster') or private.pc_owner_opp(p)) then
    raise exception 'only a coach who manages opponents can merge hitters' using errcode = '42501'; end if;
  if kept = merged then raise exception 'pick two different hitters' using errcode = '22023'; end if;
  insert into public.opp_merges (program_id, kept, merged, merged_by) values (p, kept, merged, auth.uid());
end $$;
