-- Every table in public must have row-level security on. Prints the offenders and fails if there are any.
\set ON_ERROR_STOP on
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
do $$
declare bad int;
begin
  select count(*) into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad > 0 then raise exception '% public table(s) without row-level security', bad; end if;
  raise notice 'row-level security is on for every public table';
end $$;
