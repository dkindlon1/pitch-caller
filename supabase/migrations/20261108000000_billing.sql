-- PitchIQ billing (Plan 2): Stripe webhook events, the subscription's state on the organization, and the owner's
-- billing actions. Spec: "Billing and lockout", A5. The website verifies each event's signature, turns it into a small
-- action (web/lib/stripe_events.ts) and applies it here in one transaction with the service key.
--
-- Rules (A5):
--   * an event is applied once (stripe_events, keyed by its id), in the same transaction as its effect
--   * a lapse or an unlock changes only organizations.billing_status, and never an older event over a newer one
--     (billing_changed_at); the subscription's own state (quantity, period end, Stripe status) has its own clock
--   * removing a team changes only that team's status; the paid quantity switches pending teams on, oldest first,
--     and never more than were paid for, so an unlock can't revive a removed team

alter table public.organizations
  add column subscription_status text,                -- Stripe's own word: active, past_due, canceled...
  add column subscription_quantity int check (subscription_quantity >= 0),
  add column period_ends_at timestamptz,             -- the end of the paid year: when a removed team stops
  add column subscription_synced_at timestamptz;     -- time of the newest subscription event applied

create table private.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9_]{1,255}$'),
  type text not null check (length(type) <= 100),
  created_at timestamptz not null,
  org_id uuid references public.organizations (id) on delete set null,
  result text not null,
  received_at timestamptz not null default now()
);
create index stripe_events_org on private.stripe_events (org_id);
revoke all on private.stripe_events from public, anon, authenticated;

-- Switch on pending teams up to the quantity paid for (active teams count against it; ending ones were not renewed).
create function private.pc_seat_teams(org uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare q int; n int; k int;
begin
  select subscription_quantity into q from public.organizations where id = org;
  if q is null then return 0; end if;
  select count(*) into n from public.programs where org_id = org and status = 'active';
  update public.programs set status = 'active'
  where id in (select id from public.programs where org_id = org and status = 'pending' order by created_at, id limit greatest(q - n, 0));
  get diagnostics k = row_count;
  return k;
end $$;
revoke all on function private.pc_seat_teams(uuid) from public, anon, authenticated;

-- One Stripe event. a: {org, customer, subscription, status: active|locked, sub_status, quantity, period_end (unix
-- seconds), adopt (this event may start a new subscription for an organization whose old one ended)}.
-- Returns what happened: applied, duplicate, stale, unknown_org, other_subscription, second_subscription.
create function public.pc_billing_event(event_id text, event_type text, event_created timestamptz, a jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations%rowtype; got text; res text; did boolean := false;
  st text := nullif(a ->> 'status', '');
  sub text := nullif(a ->> 'subscription', ''); cus text := nullif(a ->> 'customer', '');
  q int; pe timestamptz; snap boolean;
  adopt boolean := coalesce((a ->> 'adopt')::boolean, false);
begin
  if event_id is null or event_type is null or event_created is null or a is null or jsonb_typeof(a) <> 'object' then
    raise exception 'an event needs its id, type, time and action' using errcode = '22023';
  end if;
  if st is not null and st not in ('active', 'locked') then raise exception 'unknown billing status' using errcode = '22023'; end if;
  if a ? 'quantity' and jsonb_typeof(a -> 'quantity') = 'number' then q := (a ->> 'quantity')::int; end if;
  if a ? 'period_end' and jsonb_typeof(a -> 'period_end') = 'number' then pe := to_timestamp((a ->> 'period_end')::bigint); end if;
  snap := q is not null or pe is not null or nullif(a ->> 'sub_status', '') is not null;

  insert into private.stripe_events (id, type, created_at, result) values (event_id, event_type, event_created, 'processing')
  on conflict (id) do nothing returning id into got;
  if got is null then return 'duplicate'; end if;

  -- the organization: the id we put in the metadata, else the subscription's, else the customer's
  if coalesce(a ->> 'org', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into o from public.organizations where id = (a ->> 'org')::uuid for update;
  end if;
  if o.id is null and sub is not null then select * into o from public.organizations where stripe_subscription_id = sub for update; end if;
  if o.id is null and cus is not null then select * into o from public.organizations where stripe_customer_id = cus for update; end if;

  if o.id is null then
    res := 'unknown_org';
  elsif sub is not null and o.stripe_subscription_id is not null and sub <> o.stripe_subscription_id then
    if adopt and o.subscription_status in ('canceled', 'incomplete_expired') then
      -- a new subscription after the old one ended: its clock starts over (billing_changed_at keeps running)
      update public.organizations set stripe_subscription_id = sub, subscription_status = null, subscription_quantity = null,
        period_ends_at = null, subscription_synced_at = null where id = o.id
      returning * into o;
    else
      -- an old subscription's late events, or a second Checkout paid while the first is live (refund by hand)
      res := case when adopt then 'second_subscription' else 'other_subscription' end;
    end if;
  end if;

  if o.id is not null and res is null then
    update public.organizations set
      stripe_subscription_id = coalesce(stripe_subscription_id, sub),
      stripe_customer_id = coalesce(stripe_customer_id,
        case when cus is not null and not exists (select 1 from public.organizations x where x.stripe_customer_id = cus) then cus end)
    where id = o.id;
    if st is not null and (o.billing_changed_at is null or event_created >= o.billing_changed_at) then
      update public.organizations set billing_status = st, billing_changed_at = event_created where id = o.id;
      did := true;
    end if;
    if snap and (o.subscription_synced_at is null or event_created >= o.subscription_synced_at) then
      update public.organizations set subscription_quantity = coalesce(q, subscription_quantity),
        subscription_status = coalesce(nullif(a ->> 'sub_status', ''), subscription_status),
        period_ends_at = coalesce(pe, period_ends_at), subscription_synced_at = event_created where id = o.id;
      did := true;
    end if;
    perform private.pc_seat_teams(o.id);
    -- a new year paid for: teams removed last year are gone for good
    if event_type = 'invoice.paid' then
      update public.programs set status = 'removed' where org_id = o.id and status = 'ending' and ends_at <= now();
    end if;
    res := case when did or (st is null and not snap) then 'applied' else 'stale' end;
  end if;

  update private.stripe_events set org_id = o.id, result = res where id = event_id;
  return res;
end $$;

-- What the website needs to call Stripe for an organization (service key only: the ids never reach a browser).
create function public.pc_billing_ids(org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('customer', o.stripe_customer_id, 'subscription', o.stripe_subscription_id,
    'sub_status', o.subscription_status, 'quantity', o.subscription_quantity,
    'seats', (select count(*) from public.programs t where t.org_id = o.id and t.status in ('active', 'pending')),
    'active', (select count(*) from public.programs t where t.org_id = o.id and t.status = 'active'),
    'owner_email', (select u.email from auth.users u where u.id = o.owner_id))
  from public.organizations o where o.id = org
$$;

-- The owner's billing page: the state, never the Stripe ids.
create function public.pc_billing_info(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not private.pc_is_owner(org) then raise exception 'only the organization''s owner sees its billing' using errcode = '42501'; end if;
  select jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'status', o.billing_status,
    'sub_status', o.subscription_status, 'quantity', o.subscription_quantity, 'period_ends_at', o.period_ends_at,
    'has_customer', o.stripe_customer_id is not null, 'has_subscription', o.stripe_subscription_id is not null,
    'live', o.stripe_subscription_id is not null and coalesce(o.subscription_status, 'active') not in ('canceled', 'incomplete_expired'),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'ends_at', t.ends_at) order by t.created_at, t.id)
                       from public.programs t where t.org_id = o.id and t.status <> 'removed'), '[]'::jsonb))
  into r from public.organizations o where o.id = org;
  return r;
end $$;

-- The owner removes a team: a pending one (never paid) goes at once; an active one stays usable until the paid year
-- ends. The website then lowers the quantity in Stripe, without a refund. The last active team can't be removed: to
-- stop altogether the owner cancels the subscription in Stripe's billing portal.
create function public.pc_end_team(team uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.programs%rowtype; o public.organizations%rowtype;
begin
  select * into t from public.programs where id = team for update;
  if t.id is null or not private.pc_is_owner(t.org_id) then raise exception 'only the organization''s owner can remove a team' using errcode = '42501'; end if;
  select * into o from public.organizations where id = t.org_id for update;
  if o.billing_status = 'locked' then raise exception 'billing is locked: update the card first' using errcode = '42501'; end if;
  if t.status = 'pending' then
    update public.programs set status = 'removed' where id = team;
    return 'removed';
  end if;
  if t.status <> 'active' then raise exception 'that team isn''t active' using errcode = '22023'; end if;
  if o.period_ends_at is null then raise exception 'the paid year isn''t known yet: try again in a minute' using errcode = '55000'; end if;
  if (select count(*) from public.programs x where x.org_id = t.org_id and x.status = 'active') <= 1 then
    raise exception 'that''s the last team: cancel the subscription instead' using errcode = '22023';
  end if;
  update public.programs set status = 'ending', ends_at = o.period_ends_at where id = team;
  return 'ending';
end $$;

-- The owner keeps a team he removed, before its year ends (it was already paid for this year).
create function public.pc_keep_team(team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.programs%rowtype;
begin
  select * into t from public.programs where id = team for update;
  if t.id is null or not private.pc_is_owner(t.org_id) then raise exception 'only the organization''s owner can keep a team' using errcode = '42501'; end if;
  if t.status <> 'ending' or t.ends_at <= now() then raise exception 'that team isn''t being removed' using errcode = '22023'; end if;
  if (select billing_status from public.organizations where id = t.org_id) = 'locked' then
    raise exception 'billing is locked: update the card first' using errcode = '42501';
  end if;
  update public.programs set status = 'active', ends_at = null where id = team;
end $$;

revoke all on function public.pc_billing_event(text, text, timestamptz, jsonb), public.pc_billing_ids(uuid),
  public.pc_billing_info(uuid), public.pc_end_team(uuid), public.pc_keep_team(uuid) from public, anon, authenticated;
grant execute on function public.pc_billing_event(text, text, timestamptz, jsonb), public.pc_billing_ids(uuid) to service_role;
grant execute on function public.pc_billing_info(uuid), public.pc_end_team(uuid), public.pc_keep_team(uuid) to authenticated;
