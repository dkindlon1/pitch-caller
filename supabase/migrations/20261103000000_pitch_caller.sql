-- Pitch Caller on Supabase (build step 2, Nov 3 2026; revised Nov 4 after the code review)
--
-- One table per device store (app/db.js schema version 2), same ids. Each row keeps the device's record whole in `doc`
-- (jsonb), so a record moves between the iPad and the server unchanged; the few fields the server filters on are
-- generated columns read from `doc`, never stored twice.
--
-- Who sees what, per program:
--   head_coach  reads and writes everything, invites and manages staff
--   charter     reads everything, writes everything except pitchers (grades are the coach's call)
--   pitcher     reads his own pitcher record, check-ins, sessions, velo readings and learned model;
--               writes his own check-ins, sessions and readings
-- Staff join by invitation only: the head coach invites an email, and the person signs in with that (confirmed) email
-- and accepts. Nobody can be added to a program without accepting, and inviting says nothing about whether an account
-- exists.
-- Nothing is ever hard-deleted from the synced tables: a delete on the iPad is a soft delete (deletedAt), synced like any
-- edit. The tables can only be written through pc_push (no direct inserts or updates through the REST API), so its
-- rules (newest wins, who may write what, sane timestamps) can't be gone around.
--
-- Sync: pc_push(program, table, rows) applies each record that is newer (updatedAt) than the server's copy and allowed for
-- the caller; for every record it didn't apply it says why and, where the caller may read it, sends back the server's
-- copy so the iPad can take it. pc_pull(program, table, cursor) returns rows in commit-safe order: each row carries the id
-- of the transaction that last wrote it, and a pull only returns rows from transactions older than every transaction
-- still running, so a row committed a moment late can't be skipped by a cursor that already moved past it.
--
-- After restoring this database into a new project (dump and restore), run once in the SQL editor:
--   select public.pc_restamp();
-- Transaction ids start over in a new cluster; this re-stamps every row so the iPads' pulls see them again.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ programs, members, invites
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  level text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.members (
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('head_coach', 'charter', 'pitcher')),
  pitcher_id text,                 -- role pitcher: the id of his pitcher record
  added_at timestamptz not null default now(),
  primary key (program_id, user_id),
  check (role <> 'pitcher' or pitcher_id is not null)
);

create table public.invites (
  program_id uuid not null references public.programs (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  role text not null check (role in ('head_coach', 'charter', 'pitcher')),
  pitcher_id text,
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (program_id, email),
  check (role <> 'pitcher' or pitcher_id is not null)
);

-- the signed-in user's role in a program (security definer: policies call it without recursing into members)
create function public.pc_role(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where program_id = p and user_id = auth.uid()
$$;

create function public.pc_my_pitcher(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select pitcher_id from public.members where program_id = p and user_id = auth.uid() and role = 'pitcher'
$$;

-- the signed-in user's email, only once Supabase Auth has confirmed it
create function public.pc_my_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create function public.pc_can_read(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case public.pc_role(p)
    when 'head_coach' then true
    when 'charter' then true
    when 'pitcher' then case
      when tbl = 'pitchers' then row_id = public.pc_my_pitcher(p)
      when tbl in ('checkins', 'sessions', 'readings', 'learned') then row_pitcher = public.pc_my_pitcher(p)
      else false end
    else false end, false)
$$;

create function public.pc_can_write(tbl text, p uuid, row_id text, row_pitcher text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case public.pc_role(p)
    when 'head_coach' then true
    when 'charter' then tbl <> 'pitchers'
    when 'pitcher' then tbl in ('checkins', 'sessions', 'readings') and row_pitcher = public.pc_my_pitcher(p)
    else false end, false)
$$;

alter table public.programs enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
create policy pc_read on public.programs for select to authenticated using (public.pc_role(id) is not null);
-- the member list is the head coach's to see; everyone else sees only his own row
create policy pc_read on public.members for select to authenticated
  using (user_id = auth.uid() or public.pc_role(program_id) = 'head_coach');
-- invites: no policies, so no direct access at all; only the functions below read or write them
-- programs, members and invites are changed only through the functions below

-- ------------------------------------------------------------------ the synced stores
-- stamped on every write: the transaction that wrote it (the pull cursor), when and by whom
create function public.pc_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sync_xid := pg_current_xact_id()::text::bigint;
  new.synced_at := now();
  new.synced_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned'] loop
    execute format($f$
      create table public.%1$I (
        program_id uuid not null references public.programs (id) on delete cascade,
        id text not null check (length(id) between 1 and 200),
        doc jsonb not null,
        updated_at bigint generated always as ((doc ->> 'updatedAt')::bigint) stored,
        deleted_at bigint generated always as ((doc ->> 'deletedAt')::bigint) stored,
        pitcher_id text generated always as (doc ->> 'pitcherId') stored,
        game_id text generated always as (doc ->> 'gameId') stored,
        sync_xid bigint not null default 0,
        synced_at timestamptz not null default now(),
        synced_by uuid,
        primary key (program_id, id),
        constraint %1$s_doc_id check (doc ->> 'id' = id),
        constraint %1$s_doc_updated check (jsonb_typeof(doc -> 'updatedAt') = 'number'),
        constraint %1$s_doc_size check (octet_length(doc::text) < 1000000)
      )$f$, t);
    execute format('create index %1$s_pull on public.%1$I (program_id, sync_xid, id)', t);
    -- a pitcher's pull reads only his own rows, through this index, instead of scanning the program
    execute format('create index %1$s_pull_pitcher on public.%1$I (program_id, pitcher_id, sync_xid, id)', t);
    execute format('create trigger pc_stamp before insert or update on public.%I for each row execute function public.pc_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy pc_read on public.%I for select to authenticated using (public.pc_can_read(%L, program_id, id, pitcher_id))', t, t);
    -- no insert, update or delete policies or grants: writes go through pc_push only
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create index events_game on public.events (program_id, game_id);
alter table public.events add column type text generated always as (doc ->> 'type') stored;

revoke all on public.programs, public.members, public.invites from anon;
revoke insert, update, delete, truncate, references, trigger on public.programs, public.members from authenticated;
revoke all on public.invites from authenticated;
grant select on public.programs, public.members to authenticated;
-- the stamp and helper functions aren't for calling directly
revoke all on function public.pc_stamp() from public, anon, authenticated;

-- ------------------------------------------------------------------ programs and staff
-- start a program: the caller becomes its head coach
create function public.pc_create_program(name text, level text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.programs (name, level, created_by) values (name, level, auth.uid()) returning id into pid;
  insert into public.members (program_id, user_id, role) values (pid, auth.uid(), 'head_coach');
  return pid;
end $$;

-- the head coach invites someone by email (or changes a pending invite). The same answer whether or not that email has
-- an account, so this can't be used to find out who's signed up.
create function public.pc_invite(p uuid, invite_email text, member_role text, member_pitcher text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.pc_role(p) is distinct from 'head_coach' then raise exception 'only the head coach can invite staff' using errcode = '42501'; end if;
  if member_role not in ('head_coach', 'charter', 'pitcher') then raise exception 'unknown role' using errcode = '22023'; end if;
  if member_role = 'pitcher' and member_pitcher is null then raise exception 'pick which pitcher he is' using errcode = '22023'; end if;
  insert into public.invites (program_id, email, role, pitcher_id, invited_by)
  values (p, lower(trim(invite_email)), member_role, case when member_role = 'pitcher' then member_pitcher end, auth.uid())
  on conflict (program_id, email) do update set role = excluded.role, pitcher_id = excluded.pitcher_id, invited_by = excluded.invited_by, created_at = now();
end $$;

-- the invitations waiting for the signed-in user (matched on his confirmed email)
create function public.pc_my_invites() returns table (program_id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select i.program_id, p.name, i.role from public.invites i join public.programs p on p.id = i.program_id
  where i.email = public.pc_my_email() order by p.name
$$;

-- accept: the signed-in user (confirmed email matching the invite) joins with the invited role
create function public.pc_accept_invite(p uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me text := public.pc_my_email(); inv public.invites;
begin
  if me is null then raise exception 'confirm your email first' using errcode = '42501'; end if;
  perform 1 from public.programs where id = p for update;   -- one membership change at a time per program
  select * into inv from public.invites where program_id = p and email = me;
  if not found then raise exception 'no invitation for you to that program' using errcode = 'P0002'; end if;
  if public.pc_role(p) = 'head_coach' and inv.role <> 'head_coach'
     and (select count(*) from public.members where program_id = p and role = 'head_coach') = 1 then
    raise exception 'a program needs at least one head coach' using errcode = '42501';
  end if;
  insert into public.members (program_id, user_id, role, pitcher_id) values (p, auth.uid(), inv.role, inv.pitcher_id)
  on conflict (program_id, user_id) do update set role = excluded.role, pitcher_id = excluded.pitcher_id;
  delete from public.invites where program_id = p and email = me;
  return inv.role;
end $$;

create function public.pc_decline_invite(p uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.invites where program_id = p and email = public.pc_my_email()
$$;

-- the head coach's staff list: members (with their emails) and pending invites
create function public.pc_staff(p uuid) returns table (user_id uuid, email text, role text, pitcher_id text, pending boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.pc_role(p) is distinct from 'head_coach' then raise exception 'only the head coach can see the staff list' using errcode = '42501'; end if;
  return query
    select m.user_id, lower(u.email)::text, m.role, m.pitcher_id, false from public.members m join auth.users u on u.id = m.user_id where m.program_id = p
    union all
    select null::uuid, i.email, i.role, i.pitcher_id, true from public.invites i where i.program_id = p
    order by 5, 2;
end $$;

-- the head coach changes a member's role; a program always keeps at least one head coach
create function public.pc_set_role(p uuid, member uuid, member_role text, member_pitcher text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.pc_role(p) is distinct from 'head_coach' then raise exception 'only the head coach can change roles' using errcode = '42501'; end if;
  if member_role not in ('head_coach', 'charter', 'pitcher') then raise exception 'unknown role' using errcode = '22023'; end if;
  perform 1 from public.programs where id = p for update;   -- two head coaches demoting themselves at once can't leave none
  if member_role <> 'head_coach' and (select role from public.members where program_id = p and user_id = member) = 'head_coach'
     and (select count(*) from public.members where program_id = p and role = 'head_coach') = 1 then
    raise exception 'a program needs at least one head coach' using errcode = '42501';
  end if;
  update public.members set role = member_role, pitcher_id = case when member_role = 'pitcher' then member_pitcher end
  where program_id = p and user_id = member;
  if not found then raise exception 'not a member' using errcode = 'P0002'; end if;
end $$;

-- remove a member (the head coach, or anyone leaving on his own); never the last head coach. Data already on that
-- person's iPad stays there (it's an offline app); what changes is everything from now on.
create function public.pc_remove_member(p uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.pc_role(p) is distinct from 'head_coach' and member is distinct from auth.uid() then
    raise exception 'only the head coach can remove staff' using errcode = '42501';
  end if;
  perform 1 from public.programs where id = p for update;
  if (select role from public.members where program_id = p and user_id = member) = 'head_coach'
     and (select count(*) from public.members where program_id = p and role = 'head_coach') = 1 then
    raise exception 'a program needs at least one head coach' using errcode = '42501';
  end if;
  delete from public.members where program_id = p and user_id = member;
end $$;

create function public.pc_cancel_invite(p uuid, invite_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.pc_role(p) is distinct from 'head_coach' then raise exception 'only the head coach can cancel invites' using errcode = '42501'; end if;
  delete from public.invites i where i.program_id = p and i.email = lower(trim(invite_email));
end $$;

-- the programs the signed-in user belongs to, with their role
create function public.pc_my_programs() returns table (program_id uuid, name text, level text, role text, pitcher_id text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.level, m.role, m.pitcher_id from public.members m join public.programs p on p.id = m.program_id
  where m.user_id = auth.uid() order by p.name
$$;

-- ------------------------------------------------------------------ sync
-- push: each record is checked (shape, a sane timestamp, who may write it, on both the incoming record and the one it
-- would replace) and applied only where it's newer than the server's copy. Nothing here can fail the whole batch for one
-- bad record, and no per-record subtransactions are used (hundreds of them per call would slow the whole database).
-- Returns { applied, skipped, rejected: [{ id, reason, doc? }], server: [{ id, doc }] }: `server` holds the server's copy
-- of every record that wasn't applied because the server's is as new or newer, and a rejected record carries the
-- server's copy when the caller may read it, so the iPad can take what the server has.
create function public.pc_push(p uuid, tbl text, rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; rid text; cur jsonb; n int; applied int := 0; rejected jsonb := '[]'::jsonb; server jsonb := '[]'::jsonb;
  ahead bigint := (extract(epoch from now()) * 1000)::bigint + 86400000;   -- a device clock a day fast is a broken clock
  num text := '^[0-9]{1,15}$';
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then
    raise exception 'rows must be an array of at most 500 records' using errcode = '22023';
  end if;
  if public.pc_role(p) is null then raise exception 'not a member of this program' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    rid := case when jsonb_typeof(r) = 'object' and jsonb_typeof(r -> 'id') = 'string' then r ->> 'id' end;
    if rid is null or length(rid) not between 1 and 200 then
      rejected := rejected || jsonb_build_object('id', left(coalesce(rid, ''), 200), 'reason', 'bad record: id'); continue;
    end if;
    if jsonb_typeof(r -> 'updatedAt') <> 'number' or (r ->> 'updatedAt') !~ num
       or (r ? 'deletedAt' and jsonb_typeof(r -> 'deletedAt') <> 'null' and (jsonb_typeof(r -> 'deletedAt') <> 'number' or (r ->> 'deletedAt') !~ num))
       or (r ? 'pitcherId' and jsonb_typeof(r -> 'pitcherId') not in ('string', 'null'))
       or (r ? 'gameId' and jsonb_typeof(r -> 'gameId') not in ('string', 'null')) then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'bad record: fields'); continue;
    end if;
    if (r ->> 'updatedAt')::bigint > ahead then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'clock: this iPad''s clock is more than a day ahead'); continue;
    end if;
    if octet_length(r::text) >= 1000000 then
      rejected := rejected || jsonb_build_object('id', rid, 'reason', 'bad record: too big'); continue;
    end if;
    execute format('select doc from public.%I where program_id = $1 and id = $2', tbl) into cur using p, rid;
    -- who may write it is checked before anything about the server's copy is compared, so a refused caller learns
    -- nothing about a record he can't read (not its timestamp, not whether his copy is older)
    if not public.pc_can_write(tbl, p, rid, r ->> 'pitcherId')
       or (cur is not null and not public.pc_can_write(tbl, p, rid, cur ->> 'pitcherId')) then
      rejected := rejected || (jsonb_build_object('id', rid, 'reason', 'not allowed')
        || case when cur is not null and public.pc_can_read(tbl, p, rid, cur ->> 'pitcherId') then jsonb_build_object('doc', cur) else '{}'::jsonb end);
      continue;
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
    if n = 1 then applied := applied + 1;
    else
      execute format('select doc from public.%I where program_id = $1 and id = $2', tbl) into cur using p, rid;
      server := server || jsonb_build_object('id', rid, 'doc', cur);
    end if;
  end loop;
  return jsonb_build_object('applied', applied, 'skipped', jsonb_array_length(server), 'rejected', rejected, 'server', server);
end $$;

-- pull: what changed after the cursor, in transaction order, only from transactions that have finished.
-- cursor = (after_xid, after_id); start at (0, ''). Returns
--   { rows: [doc], next: { xid, id }, more, access, held, reset }
--   access  the caller's role and pitcher: when it changes (a promotion, a new pitcher record), the iPad starts its
--           cursors over, because rows it couldn't see before were stepped past
--   held    newer rows exist but a transaction somewhere hasn't finished yet; they come on a later pull
--   reset   the cursor is from the future (the database was restored into a new project): start over from 0
create function public.pc_pull(p uuid, tbl text, after_xid bigint default 0, after_id text default '', lim int default 500) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare cap bigint; nxt bigint; out jsonb; role text := public.pc_role(p); mine text := public.pc_my_pitcher(p); flt text := ''; access text; held boolean;
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if role is null then raise exception 'not a member of this program' using errcode = '42501'; end if;
  access := role || ':' || coalesce(mine, '');
  lim := least(greatest(coalesce(lim, 500), 1), 1000);
  -- every transaction with an id below cap has finished: rows from them can't be joined later by an earlier one.
  -- xmax is the next id to be handed out; read from the snapshot so this pull doesn't take an id of its own.
  cap := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  nxt := pg_snapshot_xmax(pg_current_snapshot())::text::bigint;
  if coalesce(after_xid, 0) > nxt then
    return jsonb_build_object('rows', '[]'::jsonb, 'next', jsonb_build_object('xid', 0, 'id', ''), 'more', true, 'access', access, 'held', false, 'reset', true);
  end if;
  if role = 'pitcher' then
    if tbl not in ('pitchers', 'checkins', 'sessions', 'readings', 'learned') then   -- nothing here he may read
      return jsonb_build_object('rows', '[]'::jsonb, 'next', jsonb_build_object('xid', after_xid, 'id', after_id), 'more', false, 'access', access, 'held', false, 'reset', false);
    end if;
    flt := case when tbl = 'pitchers' then ' and id = $6' else ' and pitcher_id = $6' end;
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
  return out || jsonb_build_object('access', access, 'held', held, 'reset', false);
end $$;

-- after a dump and restore into a new project: re-stamp every row with this cluster's transaction ids (see the top)
create function public.pc_restamp() returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned'] loop
    execute format('update public.%I set doc = doc', t);
  end loop;
end $$;
revoke all on function public.pc_restamp() from public, anon, authenticated;

revoke all on function public.pc_create_program(text, text), public.pc_invite(uuid, text, text, text), public.pc_my_invites(),
  public.pc_accept_invite(uuid), public.pc_decline_invite(uuid), public.pc_staff(uuid), public.pc_set_role(uuid, uuid, text, text),
  public.pc_remove_member(uuid, uuid), public.pc_cancel_invite(uuid, text), public.pc_my_programs(),
  public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int) from public, anon;
grant execute on function public.pc_create_program(text, text), public.pc_invite(uuid, text, text, text), public.pc_my_invites(),
  public.pc_accept_invite(uuid), public.pc_decline_invite(uuid), public.pc_staff(uuid), public.pc_set_role(uuid, uuid, text, text),
  public.pc_remove_member(uuid, uuid), public.pc_cancel_invite(uuid, text), public.pc_my_programs(),
  public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int) to authenticated;
-- the helpers run inside policies and functions for signed-in users only
revoke all on function public.pc_role(uuid), public.pc_my_pitcher(uuid), public.pc_my_email(), public.pc_can_read(text, uuid, text, text),
  public.pc_can_write(text, uuid, text, text) from public, anon;
grant execute on function public.pc_role(uuid), public.pc_my_pitcher(uuid), public.pc_my_email(), public.pc_can_read(text, uuid, text, text),
  public.pc_can_write(text, uuid, text, text) to authenticated;
