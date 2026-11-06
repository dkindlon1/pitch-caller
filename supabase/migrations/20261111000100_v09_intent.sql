-- Pitch Caller v0.9 item 4: intent labels. Each event's doc already carries them (doc.v08.intent / .mechanism, written by
-- the app after the call is made); these generated columns only make them queryable, like the v0.8 inputs migration.
-- Additive and idempotent. NOT applied to any project: apply only on Drew's go-ahead.
alter table public.events add column if not exists intent text generated always as (doc -> 'v08' ->> 'intent') stored;
alter table public.events add column if not exists intent_mechanism text generated always as (doc -> 'v08' ->> 'mechanism') stored;
alter table public.events add column if not exists why_line text generated always as (doc -> 'v08' ->> 'why') stored;
