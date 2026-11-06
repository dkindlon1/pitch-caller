-- Terms and Privacy acceptance (D15). Each account's agreement to a version of the Terms and the Privacy Policy, with
-- when it was given: at sign-up (recorded by the website with the server key, since a new account has no session until
-- its email is confirmed), or later from the portal for accounts made before a version existed.

create table public.legal_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  doc text not null check (doc in ('terms', 'privacy')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z0-9-]{0,20}$'),
  accepted_at timestamptz not null default now(),
  via text not null check (via in ('signup', 'portal')),
  primary key (user_id, doc, version)
);
alter table public.legal_acceptances enable row level security;
create policy legal_mine on public.legal_acceptances for select to authenticated using (user_id = auth.uid());
revoke all on public.legal_acceptances from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;

-- at sign-up (server only): the new account agreed to this version of both
create function public.pc_legal_signup(uid uuid, ver text) returns void
language sql security definer set search_path = '' as $$
  insert into public.legal_acceptances (user_id, doc, version, via)
  select uid, d, ver, 'signup' from unnest(array['terms', 'privacy']) d
  where exists (select 1 from auth.users u where u.id = uid)
  on conflict do nothing
$$;

-- signed in: agree to this version of both
create function public.pc_legal_accept(ver text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.legal_acceptances (user_id, doc, version, via)
  select auth.uid(), d, ver, 'portal' from unnest(array['terms', 'privacy']) d
  on conflict do nothing;
end $$;

revoke all on function public.pc_legal_signup(uuid, text), public.pc_legal_accept(text) from public, anon, authenticated;
grant execute on function public.pc_legal_signup(uuid, text) to service_role;
grant execute on function public.pc_legal_accept(text) to authenticated;
