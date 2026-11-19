-- Build 1, Part 1 (PLAN_style_layer 3.2, 3.3, 5): every pitch event now carries the engine's full mix ("mix": every
-- call in it as [pitch id, pitch name, spot, share]), the styled mix ("styledMix", equal to the engine mix until the
-- style layer exists), whose style applied ("styleApplied": "none" for now, later "coach" / "pitcher") and its strength
-- ("strength": null for now). Each event is a JSON document (doc), so pc_push and pc_pull carry them with no change, and
-- an older game app that doesn't send them still syncs. These generated columns only make them queryable, like the
-- v0.8 inputs and v0.9 intent migrations. Additive and idempotent. Applied to the LOCAL Supabase only; production is
-- Drew's call.
alter table public.events add column if not exists style_applied text generated always as (doc ->> 'styleApplied') stored;
alter table public.events add column if not exists has_mix boolean generated always as (coalesce(jsonb_typeof(doc -> 'mix') = 'array', false)) stored;
