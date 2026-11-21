-- Build 4: the team's watch list (docs/PLAN_watch_security_2026-11-18.md 2.2 and 2.8). After pairing a watch with its
-- passkey, the game app registers it to the team (watch id, name, role); the coach can remove one in the portal, and a
-- removed watch never gets another game key from any of the team's devices (the game app checks the list before it
-- sends a key, and forgets the watch). The keys themselves never come here. Additive. Applied to the LOCAL Supabase only.
create table public.team_watches (
  program_id uuid not null references public.programs (id) on delete cascade,
  watch_id text not null check (length(watch_id) between 1 and 200),       -- the browser's Bluetooth device id
  name text not null check (length(name) between 1 and 60),                 -- "Bangle.js 1a2b"
  role text not null check (role in ('pitcher', 'catcher')),
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  removed_by uuid references auth.users (id) on delete set null,
  removed_at timestamptz,
  primary key (program_id, watch_id)
);
alter table public.team_watches enable row level security;
-- every coach on the team sees the list (players don't)
create policy team_watches_read on public.team_watches for select to authenticated using (private.pc_can(program_id, 'view_team'));
revoke all on public.team_watches from anon;
revoke insert, update, delete, truncate, references, trigger on public.team_watches from authenticated;
grant select on public.team_watches to authenticated;
grant select, insert, update, delete on public.team_watches to service_role;

-- a coach who calls games registers a paired watch (or changes its role). A removed watch can't be put back this way:
-- it has to be paired again and re-added by someone who may manage the roster.
-- readd: a deliberate re-add after pairing the watch again (the game app's "pair a watch", never its automatic registration
-- on every link). Review fixes (Nov 19): automatic registration never clears a removal, so a head coach's laptop that
-- hadn't heard of it yet can't undo it; only a deliberate re-add by someone who manages the roster does.
create function public.pc_watch_register(p uuid, watch_id text, name text, role text, readd boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare cur public.team_watches;
begin
  if not private.pc_can(p, 'call_games') then raise exception 'not allowed' using errcode = '42501'; end if;
  if pc_watch_register.watch_id is null or length(pc_watch_register.watch_id) not between 1 and 200 or pc_watch_register.name is null
     or length(pc_watch_register.name) not between 1 and 60 or pc_watch_register.role is null or pc_watch_register.role not in ('pitcher', 'catcher') then
    raise exception 'bad watch' using errcode = '22023'; end if;
  select * into cur from public.team_watches w where w.program_id = p and w.watch_id = pc_watch_register.watch_id;
  if found and cur.removed_at is not null and not (pc_watch_register.readd and private.pc_can_manage(p, 'manage_roster')) then
    return jsonb_build_object('ok', false, 'removed', true);
  end if;
  insert into public.team_watches as w (program_id, watch_id, name, role, added_by)
  values (p, pc_watch_register.watch_id, pc_watch_register.name, pc_watch_register.role, auth.uid())
  on conflict (program_id, watch_id) do update set name = excluded.name, role = excluded.role, removed_at = null, removed_by = null,
    added_by = case when w.removed_at is not null then excluded.added_by else w.added_by end,
    added_at = case when w.removed_at is not null then now() else w.added_at end;
  return jsonb_build_object('ok', true);
end $$;

-- the head coach (manage roster) or the organization's owner removes a watch
create function public.pc_watch_remove(p uuid, watch_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.pc_can_manage(p, 'manage_roster') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.team_watches w set removed_at = now(), removed_by = auth.uid()
  where w.program_id = p and w.watch_id = pc_watch_remove.watch_id and w.removed_at is null;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.pc_watch_register(uuid, text, text, text, boolean), public.pc_watch_remove(uuid, text) from public, anon;
grant execute on function public.pc_watch_register(uuid, text, text, text, boolean), public.pc_watch_remove(uuid, text) to authenticated;

-- the list, for the game app (coaches on the team): which watches are registered and which were removed
create function public.pc_watch_list(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.pc_can(p, 'view_team') then coalesce((
    select jsonb_agg(jsonb_build_object('watch_id', w.watch_id, 'name', w.name, 'role', w.role, 'removed', w.removed_at is not null) order by w.added_at)
    from public.team_watches w where w.program_id = p), '[]'::jsonb) end
$$;
revoke all on function public.pc_watch_list(uuid) from public, anon;
grant execute on function public.pc_watch_list(uuid) to authenticated;
