-- Spring waitlist for the landing page (docs/plans/2026-11-05-pitchiq-operate.md, Task 6).
-- Only the server can write it, through pc_join_waitlist with the service key. No client role can read or write the
-- table or call the function. No IP address is stored: the site sends an HMAC of it, used only to limit sign-ups.

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and length(email) between 6 and 320 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role text not null check (role in ('coach', 'parent', 'player', 'other')),
  level text check (level in ('hs', 'travel', 'college', 'other')),
  ip_hash text not null check (length(ip_hash) between 16 and 128),
  created_at timestamptz not null default now()
);
create index waitlist_ip_recent on public.waitlist (ip_hash, created_at);

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from public, anon, authenticated;

-- 'ok' | 'duplicate' | 'rate_limited' | 'invalid'. At most 5 new sign-ups per network per hour.
create function public.pc_join_waitlist(p_email text, p_role text, p_level text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  lv text := nullif(btrim(coalesce(p_level, '')), '');
  recent int;
begin
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 320
     or coalesce(p_role, '') not in ('coach', 'parent', 'player', 'other')
     or (lv is not null and lv not in ('hs', 'travel', 'college', 'other'))
     or coalesce(length(p_ip_hash), 0) not between 16 and 128 then
    return 'invalid';
  end if;
  if exists (select 1 from public.waitlist w where w.email = e) then
    return 'duplicate';
  end if;
  select count(*) into recent from public.waitlist w where w.ip_hash = p_ip_hash and w.created_at > now() - interval '1 hour';
  if recent >= 5 then
    return 'rate_limited';
  end if;
  insert into public.waitlist (email, role, level, ip_hash) values (e, p_role, lv, p_ip_hash)
  on conflict (email) do nothing;
  return case when found then 'ok' else 'duplicate' end;
end;
$$;

revoke all on function public.pc_join_waitlist(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pc_join_waitlist(text, text, text, text) to service_role;
