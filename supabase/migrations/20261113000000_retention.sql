-- Retention (spec: "Billing and lockout", Resolved #1: server data is kept 12 months after a lapse, then deleted).
-- pc_retention_sweep finds what's past its 12 months: organizations locked for more than 12 months (with all their
-- teams' data) and lapse exports older than 12 months. With dry = true it only reports. The website runs it daily
-- (web/app/api/cron/retention) and deletes only when RETENTION_DELETE is turned on, and it removes the export files
-- from storage itself (the paths come back here).

create table private.retention_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  dry boolean not null,
  orgs int not null,
  teams int not null,
  exports int not null,
  detail jsonb not null default '{}'::jsonb
);
revoke all on private.retention_log from public, anon, authenticated;

create function public.pc_retention_sweep(dry boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz := now() - interval '12 months';
  orgs uuid[]; teams uuid[]; paths text[]; nexp int;
begin
  select coalesce(array_agg(o.id), '{}') into orgs from public.organizations o
  where o.billing_status = 'locked' and o.billing_changed_at is not null and o.billing_changed_at < cutoff;
  select coalesce(array_agg(t.id), '{}') into teams from public.programs t where t.org_id = any (orgs);
  -- the export files to remove: every export of those organizations, and any other export past 12 months
  select coalesce(array_agg(x.path), '{}'), count(*) into paths, nexp from public.exports x where x.org_id = any (orgs) or x.created_at < cutoff;
  if not dry then
    delete from public.exports where org_id = any (orgs) or created_at < cutoff;
    delete from public.programs where id = any (teams);
    delete from public.organizations where id = any (orgs);
  end if;
  insert into private.retention_log (dry, orgs, teams, exports, detail)
  values (dry, coalesce(array_length(orgs, 1), 0), coalesce(array_length(teams, 1), 0), nexp, jsonb_build_object('orgs', to_jsonb(orgs)));
  return jsonb_build_object('dry', dry, 'cutoff', cutoff, 'orgs', to_jsonb(orgs), 'teams', coalesce(array_length(teams, 1), 0),
    'exports', nexp, 'paths', to_jsonb(array(select distinct p from unnest(paths) p)));
end $$;
revoke all on function public.pc_retention_sweep(boolean) from public, anon, authenticated;
grant execute on function public.pc_retention_sweep(boolean) to service_role;
