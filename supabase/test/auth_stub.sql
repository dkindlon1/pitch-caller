-- TEST ONLY: never run against a real Supabase project (it already has all of this).
-- The minimum of Supabase's auth setup that the migration relies on, so row level security can be checked against a
-- plain local Postgres: the anon / authenticated roles, auth.users, and auth.uid() read from the request's JWT claims
-- the way Supabase does it (PostgREST sets request.jwt.claims for each request).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  -- Supabase's server-side role (the service key): skips row level security
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
-- like Supabase's auth.users: email is not unique on its own (SSO and password users can share one), and an email
-- counts only once it's confirmed (email_confirmed_at)
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase's default privileges: every new table in public is granted in full to anon and authenticated, so the
-- migration's own revokes and row level security are what actually protect the data (as on a real project)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
