# Plan 4: uploads, proposals and stats

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` ("Upload pipeline", "Player stats", D10, D11, the walkthrough's
step 2). Build order step 7, after the player portal (Plan 3b). The 3D marketing site is Plan 6.

**Goal.** A player (or a coach with Review uploads) drops a TrackMan, Rapsodo or other pitch file on the portal. Its
pitches are stored normalized, he leaves out warmups and marks pitches he's developing, and the velocity, shape and
arm slot they show are proposed for his arsenal. Nothing changes until he or the coach accepts. His stats come from
games called in PitchIQ and TrackMan game files, labeled by source, with every rate's sample shown.

## Decisions

- **One parser.** The game app's `app/import.js` (already used on the iPad) now also reads a game file's count, result,
  batter side, exit speed and the pitcher's hand, and takes a saved column mapping. The website uses an identical copy
  (`web/lib/pc_import.js`, checked byte for byte in `docs.test.ts`).
- **Read in the browser.** The file is parsed on the device and previewed (pitches by type, notes, session type and
  date); only the normalized pitches are sent. `pc_upload_add` checks every value again and stores an impossible one
  (150 mph, a made-up result) as blank, never clamped into a wrong value. Up to 5000 pitches a file and 50 files per
  pitcher a day.
- **Arm side positive** whatever the file's convention: his fastballs run to his arm side, so the file is flipped if
  they don't (his hand decides when there are no fastballs). This settles spike S3 without assuming TrackMan's sign.
- **Weights** (config constants, `web/lib/uploads.ts`): game 1.0, live BP 0.7, bullpen 0.4, and a 60-day half-life.
  Excluded pitches count nowhere. Developing ones are stored, shown apart, and feed nothing.
- **Proposals** need 10 pitches of a type (the minimum sample rule) and a real difference: 0.5 mph, 1 inch of break, a
  different shape word, or a different slot. Shape words come from break: fastballs cut, sink, ride or run; sliders
  sweeper or tight; curves loopy or sharp (by the gap to his fastball); changeups drop or fade. The slot comes from
  the arm angle: release height against 70% of his height, and release side. A file pitch type he doesn't throw is
  reported, not added. Every upload change works the proposals out again from all his uploads.
- **Accepting** writes the value into his pitcher record with a new timestamp, so every iPad gets it on its next sync.
  The pitcher (or parent) or a coach with Review uploads decides. A Review uploads coach can therefore set velo, shape
  and slot through proposals; that's what the toggle is for.
- **Unknown files**: a one-time column match, kept for the team (`upload_templates`) and used automatically for the
  next file with the same columns.
- **Stats** from `pc_pitch_rows` (his called game pitches, with the hitter only as same or opposite side) and TrackMan
  game files. "All" counts a day charted in PitchIQ once (PitchIQ's copy, which has the calls). Strike % of pitches,
  whiff % of swings, strikeout % of two-strike pitches, contact on balls in play (TrackMan: 95+ mph exit hard, under
  80 weak). Under 10, only the count shows ("7 swings, not enough yet").
- **A child's uploads** go with his data: when a parent deletes him, when he's held without consent, and also when a
  parent's consent is withdrawn (this also fixes grade history, which missed that case in Plan 3b). They aren't
  restored on release: they live only on the server.

> **Status, Nov 6.** Done on `pitchiq-platform`: migration `20261110000000_uploads.sql` (checks in
> `rls_matrix_test.js` section 20), `web/lib/uploads.ts` and `stats.ts` with hand-calculated unit tests (D10, D11),
> the screens, and `web/tests/uploads_e2e.js` (the walkthrough's step 2 and the rest, in a browser) against a real
> local Supabase. Not merged to `main` yet: `main` now deploys to the live site, so it goes there together with a
> PROMOTE of the migration.

## Tasks

1. **Migration**: `uploads`, `upload_pitches`, `proposals`, `upload_templates`; `pc_upload_add`, `pc_upload_review`,
   `pc_upload_delete`, `pc_template_save`, `pc_proposals_set`, `pc_proposal_decide`, `pc_pitch_rows`; the child-data
   triggers.
2. **Parser**: game fields, mappings and header signature in `app/import.js` (the app's own tests still pass; the bundle
   is rebuilt).
3. **Libraries**: `web/lib/uploads.ts` (normalize, summarize, shape and slot rules, propose) and `web/lib/stats.ts`.
4. **Screens**: the player's Uploads (drop, preview, column match, proposals, weighted summary, list), an upload's
   review (leave out with a reason, developing, delete), Stats (sources, headline rates, by pitch, usage by count, each
   count and pitch, hitter side, outings, velocity and movement charts, learned next to grades). The same on the
   coach's pitcher page (Profile and arsenal · Uploads · Stats), and "Uploads waiting for review" on his home.
5. **Tests**: rls_matrix section 20; `uploads.test.ts`, `stats.test.ts`; `web/tests/uploads_e2e.js` in CI.

## Not verified yet

- **D10 on the public dataset.** The spec's check runs the parser on Mendeley's `Track_Combo.csv` (a TrackMan V3 college
  file). The unit tests use files with TrackMan V3's exact column names for a right- and a left-hander, but not that
  file: downloading it needs Drew's OK. With it: every row parses, signs come out right for both hands, and the
  per-type summary matches a hand calculation.
- **Real Rapsodo exports** (spike S2): headers are matched loosely, and anything else goes to the column match.

## Done when

Every task's test passes locally and in CI, the migration is promoted, and D10 has run on `Track_Combo.csv`.
