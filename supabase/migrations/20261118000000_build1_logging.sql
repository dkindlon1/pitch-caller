-- Build 1, Part 1 (PLAN_style_layer 3.2, 3.3, 5): every pitch event now carries the engine's full mix ("mix": every
-- call in it as [pitch id, pitch name, spot, share]), the styled mix ("styledMix", equal to the engine mix until the
-- style layer exists), whose style applied ("styleApplied": "none" for now, later "coach" / "pitcher") and its strength
-- ("strength": null for now). Each event is a JSON document (doc), so pc_push and pc_pull carry them with no change, and
-- an older game app that doesn't send them still syncs. These two columns only make them queryable.
--
-- Review fixes (Nov 19, Drew): lock-free. They were STORED generated columns, which rewrite the whole events table
-- (twice) under an ACCESS EXCLUSIVE lock, so every iPad's sync would wait for the length of both rewrites. Now:
--   - plain nullable columns with no default: adding one only changes the catalog (no rewrite, no scan); the lock it
--     takes is held for milliseconds;
--   - a trigger fills them for every event written from now on, from its doc;
--   - events already in the table keep both columns null (null = "written before this migration"; nothing reads them
--     but the tests, and every reader treats null as "not logged").
-- Proof on a 1,000,000-row events table: docs/REVIEW_FIXES_REPORT.md. Applied to the LOCAL Supabase only.
alter table public.events add column if not exists style_applied text;
alter table public.events add column if not exists has_mix boolean;

create or replace function private.pc_events_logging_cols() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.style_applied := new.doc ->> 'styleApplied';
  new.has_mix := coalesce(jsonb_typeof(new.doc -> 'mix') = 'array', false);
  return new;
end $$;
revoke all on function private.pc_events_logging_cols() from public, anon;

drop trigger if exists pc_events_logging_cols on public.events;
create trigger pc_events_logging_cols before insert or update of doc on public.events
  for each row execute function private.pc_events_logging_cols();
