-- Pitch Caller on Supabase (build step 2, Nov 3 2026)
--
-- One table per device store (app/db.js schema version 2), same ids. Each row keeps the device's record whole in `doc`
-- (jsonb), so a record moves between the iPad and the server unchanged; the few fields the server filters on are
-- generated columns read from `doc`, never stored twice.
--
-- Who sees what (row level security), per program:
--   head_coach  reads and writes everything
--   charter     reads everything, writes everything except pitchers (grades are the coach's call)
--   pitcher     reads his own pitcher record, check-ins, sessions, velo readings and learned model;
--               writes his own check-ins, sessions and readings
-- Nothing is ever hard-deleted from here: a delete on the iPad is a soft delete (deletedAt), synced like any edit.
--
-- Sync: pc_push(program, table, rows) upserts where the incoming record is newer (updatedAt), the same rule as Restore.
-- pc_pull(program, table, cursor) returns rows in commit-safe order: each row carries the id of the transaction that
-- last wrote it, and a pull only returns rows from transactions older than every transaction still running, so a
-- row committed a moment late can't be skipped by a cursor that already moved past it.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ programs and members
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

-- the signed-in user's role in a program (security definer: policies call it without recursing into members)
create function public.pc_role(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where program_id = p and user_id = auth.uid()
$$;

create function public.pc_my_pitcher(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select pitcher_id from public.members where program_id = p and user_id = auth.uid() and role = 'pitcher'
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
create policy pc_read on public.programs for select to authenticated using (public.pc_role(id) is not null);
create policy pc_read on public.members for select to authenticated using (public.pc_role(program_id) is not null);
-- programs and members are changed only through the functions below

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
        id text not null,
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
    execute format('create trigger pc_stamp before insert or update on public.%I for each row execute function public.pc_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy pc_read on public.%I for select to authenticated using (public.pc_can_read(%L, program_id, id, pitcher_id))', t, t);
    execute format('create policy pc_insert on public.%I for insert to authenticated with check (public.pc_can_write(%L, program_id, id, pitcher_id))', t, t);
    execute format('create policy pc_update on public.%I for update to authenticated using (public.pc_can_write(%L, program_id, id, pitcher_id)) with check (public.pc_can_write(%L, program_id, id, pitcher_id))', t, t, t);
    -- no delete policy: rows are never removed from here
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create index events_game on public.events (program_id, game_id);
alter table public.events add column type text generated always as (doc ->> 'type') stored;

revoke all on public.programs, public.members from anon;
revoke insert, update, delete, truncate, references, trigger on public.programs, public.members from authenticated;
grant select on public.programs, public.members to authenticated;
-- the stamp and helper functions aren't for calling directly
revoke all on function public.pc_stamp() from public, anon, authenticated;

-- ------------------------------------------------------------------ functions the app calls
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

-- the head coach adds someone who already has an account (by email), or changes their role
create function public.pc_set_member(p uuid, email text, member_role text, member_pitcher text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if public.pc_role(p) is distinct from 'head_coach' then raise exception 'only the head coach can change members' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(auth.users.email) = lower(pc_set_member.email);
  if uid is null then raise exception 'no account with that email yet: ask them to sign up first' using errcode = 'P0002'; end if;
  if uid = auth.uid() and member_role <> 'head_coach'
     and (select count(*) from public.members where program_id = p and role = 'head_coach') = 1 then
    raise exception 'a program needs at least one head coach' using errcode = '42501';
  end if;
  insert into public.members (program_id, user_id, role, pitcher_id) values (p, uid, member_role, member_pitcher)
  on conflict (program_id, user_id) do update set role = excluded.role, pitcher_id = excluded.pitcher_id;
  return uid;
end $$;

-- the programs the signed-in user belongs to, with their role
create function public.pc_my_programs() returns table (program_id uuid, name text, level text, role text, pitcher_id text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.level, m.role, m.pitcher_id from public.members m join public.programs p on p.id = m.program_id
  where m.user_id = auth.uid() order by p.name
$$;

-- push: upsert each record where it's newer than what the server has. Runs as the caller, so row level security
-- decides what they may write; a refused row is reported, the rest still go in.
create function public.pc_push(p uuid, tbl text, rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; n int; applied int := 0; skipped int := 0; rejected jsonb := '[]'::jsonb;
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then
    raise exception 'rows must be an array of at most 500 records' using errcode = '22023';
  end if;
  if public.pc_role(p) is null then raise exception 'not a member of this program' using errcode = '42501'; end if;
  set local statement_timeout = '8s';
  for r in select * from jsonb_array_elements(rows) loop
    begin
      execute format(
        'insert into public.%1$I as t (program_id, id, doc) values ($1, $2 ->> ''id'', $2)
         on conflict (program_id, id) do update set doc = excluded.doc
         where (excluded.doc ->> ''updatedAt'')::bigint > (t.doc ->> ''updatedAt'')::bigint', tbl)
      using p, r;
      get diagnostics n = row_count;
      if n = 1 then applied := applied + 1; else skipped := skipped + 1; end if;
    exception
      when insufficient_privilege then rejected := rejected || jsonb_build_object('id', r ->> 'id', 'reason', 'not allowed');
      when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
        rejected := rejected || jsonb_build_object('id', r ->> 'id', 'reason', 'bad record: ' || sqlerrm);
    end;
  end loop;
  return jsonb_build_object('applied', applied, 'skipped', skipped, 'rejected', rejected);
end $$;

-- pull: what changed after the cursor, in transaction order, only from transactions that have finished.
-- cursor = (after_xid, after_id); start at (0, ''). Returns { rows: [doc], next: { xid, id }, more }.
create function public.pc_pull(p uuid, tbl text, after_xid bigint default 0, after_id text default '', lim int default 500) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare cap bigint; out jsonb;
begin
  if tbl not in ('teams', 'pitchers', 'catchers', 'hitters', 'checkins', 'sessions', 'games', 'events', 'packs', 'readings', 'learned') then
    raise exception 'unknown table %', tbl using errcode = '22023';
  end if;
  if public.pc_role(p) is null then raise exception 'not a member of this program' using errcode = '42501'; end if;
  lim := least(greatest(coalesce(lim, 500), 1), 1000);
  -- every transaction with an id below this has finished: rows from them can't be joined later by an earlier one
  cap := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  execute format(
    'with page as (
       select doc, sync_xid, id from public.%1$I
       where program_id = $1 and (sync_xid, id) > ($2, $3) and sync_xid < $4
       order by sync_xid, id limit $5 + 1)
     select jsonb_build_object(
       ''rows'', coalesce((select jsonb_agg(doc order by sync_xid, id) from (select * from page order by sync_xid, id limit $5) x), ''[]''::jsonb),
       ''next'', coalesce((select jsonb_build_object(''xid'', sync_xid, ''id'', id) from (select * from page order by sync_xid, id limit $5) x order by sync_xid desc, id desc limit 1),
                         jsonb_build_object(''xid'', $2, ''id'', $3)),
       ''more'', (select count(*) from page) > $5)', tbl)
  into out using p, after_xid, after_id, cap, lim;
  return out;
end $$;

revoke all on function public.pc_create_program(text, text), public.pc_set_member(uuid, text, text, text), public.pc_my_programs(),
  public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int) from public, anon;
grant execute on function public.pc_create_program(text, text), public.pc_set_member(uuid, text, text, text), public.pc_my_programs(),
  public.pc_push(uuid, text, jsonb), public.pc_pull(uuid, text, bigint, text, int) to authenticated;
-- the helpers run inside policies for signed-in users only
revoke all on function public.pc_role(uuid), public.pc_my_pitcher(uuid), public.pc_can_read(text, uuid, text, text),
  public.pc_can_write(text, uuid, text, text) from public, anon;
grant execute on function public.pc_role(uuid), public.pc_my_pitcher(uuid), public.pc_can_read(text, uuid, text, text),
  public.pc_can_write(text, uuid, text, text) to authenticated;
