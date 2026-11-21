# Research: hitter data sources, Nov 18, 2026

Desk research only (web search and page reads on Nov 18). **Nothing was downloaded, scraped or run.** Terms below are
what the pages said when read; Claude isn't a lawyer, so treat this as a map, not advice. This is a handoff for Drew's
separate scrape chat; how the hitter model uses each source is in `PLAN_hitter_model_revamp_2026-11-18.md`.

## Drew's calls that apply (Nov 18, final)
- **Levels to collect:** college D1, D2 and D3; high school; minor leagues; MLB.
- **Volume:** no limit, every season available. Recent seasons are weighted more in the fits, and the latest season is
  held out.
- **Terms:** the scrape may ignore site terms, and **all collected data may feed shipped numbers, MLB / MiLB data
  included.** This reverses the earlier "Statcast check-only" call.
- **Scope:** the scrape is its own task in a separate chat. A ChatGPT agent prompt for a college pilot is in
  `PROMPT_chatgpt_boxscore_collect_2026-11-18.md`.

## Sources

| Source | What it has | Access / terms as read | What it can teach the hitter model | Status |
|---|---|---|---|---|
| **School box scores** (Sidearm, PrestoSports athletics sites; D1, D2, D3) | Play-by-play per plate appearance with final count and pitch string, e.g. "walked (3-2 BBFBKB)", "singled to left field (0-1 K)" (Case Western 2026). Coverage varies: some games show only the final count, some neither (older D3 pages). | Each school's own terms. The PrestoSports site read (Hagerstown CC) bans robots / automated access, copying, and commercial use. The Sidearm page read links its own Terms of Service. | Swing / take, whiff, foul, called-strike share by count; first-pitch and two-strike behavior; in-at-bat adjustment; ball-in-play type and direction; per-hitter tendencies; K / BB / HBP; run values; per-pitcher lines. **No location, pitch type or velocity.** | Main college source |
| **stats.ncaa.org** | Same play-by-play for D1 / D2 / D3, plus season and game logs (baseballr `ncaa_pbp`, `ncaa_game_logs`). | Site tightened Akamai bot protection; baseballr's changelog describes clearing that block. NCAA.org terms bar reproduction or use beyond their terms without written permission. | As above | School sites carry the same data without the bot check |
| **baseballr / sportsdataverse NCAA PBP releases** | Pre-cleaned NCAA play-by-play by season (2022+ in the loader; a 2021 example has 1.76M rows). | Package is MIT; the data itself is scraped from NCAA. | As above, already parsed | Quick start for recent seasons |
| **Retrosheet** | MLB play-by-play with pitch sequences (most games from 1988), codes C called strike, S swinging, B ball, F foul, X in play. | Free for any use, commercial included, with a required notice statement. | Long MLB count history; comparison | In |
| **MLB Statcast** | Pitch-level location, type, movement, swing, bat tracking, exit velo / launch angle. | MLBAM notice: individual, non-commercial, non-bulk use only; any other use needs written approval. | Zone and pitch-type behavior, contact quality; shape-stability check | In (Drew) |
| **MiLB Statcast** (Baseball Savant) | All Triple-A since 2023; Single-A Florida State League parks since 2021; no Double-A. | Same MLBAM terms. | **Seeds the zone table** (Single-A: closest hitters to college with location). MLB.com: whiff on 95+ mph is 23% MLB, 25% AAA, 29% Single-A | In (Drew) |
| **MLB Stats API, lower minors** | Pitch-by-pitch calls for minor league games (analysts report swing data for every minor league hitter); location where tracked. | Same MLBAM terms. | Count behavior on a ladder from rookie ball to MLB | In (Drew); coverage per level to measure |
| **GameChanger / MaxPreps** | Most HS games (pitch counts, box scores, spray charts in the app; MaxPreps sync). | Closed app with its own terms; what's publicly visible per game isn't confirmed. | HS behavior, to whatever depth the data reaches | In (Drew); format and depth to explore first |
| **Mendeley: college TrackMan scrimmages** (Pifer, 2024) | 3,344 pitch-level TrackMan records from 21 college exhibition games, anonymized IDs; tagged pitch and hit type, count (full columns to confirm). | CC BY 4.0: commercial use OK with attribution. | Small check that the Single-A zone shape fits college | Optional check |
| **Driveline OpenBiomechanics (hitting)** | Motion capture and bat speed, mostly college hitters (one study: 87 hitters, 12 HS, 66 college). | Data CC BY-NC-SA 4.0 (non-commercial). | Bat speed by level (background only) | Background |
| **Commercial college tracking** (TrackMan + TruMedia, incl. Cape League data; Synergy; PBR / Perfect Game event TrackMan; Baseball Cube season stats) | Pitch-level location, type, swing and contact for many D1 programs and summer leagues. | Paid licenses or member access. | Everything Statcast teaches, at college level | Not chosen (Drew, Nov 18) |
| **Published aggregates** (MLB.com MiLB comparisons, Baseball America TrackMan college articles, Blast bat speed by level) | Level averages and examples (e.g. HS varsity bat speed about 60–70 mph). | Articles. | Reference points only | Reference |
| **PitchIQ customers' opted-in logs** | Every pitch the app logs: target, landing cell, result, contact, reads, hitter. | PitchIQ's own sharing design (LEARNING_SPEC section 10: opt-in, per-level only). | Amateur location data: refines the zone table over time | Future |

## Notes for the scrape chat
- **Letter meanings to verify:** B ball, F foul; K and S are most likely called and swinging strike. Check on strikeouts
  looking vs swinging before parsing at scale.
- **Rough scale (estimate, unmeasured):** a D1 or D3 season is several thousand games at roughly 250–300 pitches each,
  i.e. on the order of 2 million pitches per level per season if coverage were complete. D2 is similar in size. Coverage
  is the first thing to measure.
- **What the hitter plan needs:** plan section 6 (fields per level, every season, coverage report, a pilot first).
- **Tooling:** a browser agent (ChatGPT or Claude in Chrome) suits a pilot and odd sites. At this volume, the bulk pull
  needs scripts per site platform and for the MLB feeds.
- **Terms (Drew's call):** many school sites ban automated access and commercial use, and MLB's notice is
  non-commercial. Drew has chosen to collect and ship anyway; Claude suggested a legal read before launch.

## Sources
- [baseballr NCAA functions](https://search.r-project.org/CRAN/refmans/baseballr/html/ncaa.html);
  [baseballr changelog (Akamai bot protection)](https://mirror.uned.ac.cr/cran/web/packages/baseballr/news/news.html);
  [load_ncaa_baseball_pbp](https://billpetti.github.io/baseballr/reference/load_ncaa_baseball_pbp.html)
- [Case Western 2026 box score with pitch strings](https://athletics.case.edu/sports/baseball/stats/2026/mitchell-college/boxscore/9626);
  [PrestoSports site terms example](https://athletics.hagerstowncc.edu/terms-of-use);
  [NCAA.org terms](https://www.ncaa.org/terms-of-service/)
- [Retrosheet data use and pitch codes](https://www.retrosheet.org/datause.txt);
  [Retrosheet notice terms](https://retrosheet.org/newsltr3.htm)
- [MLBAM copyright notice](http://gdx.mlb.com/components/copyright.txt);
  [MLB.com: Minor League Statcast compared](https://www.mlb.com/news/minor-league-statcast-data-compared-to-mlb);
  [Dynasty Dugout: MiLB swing data from the MLB API](https://dynastydugout.substack.com/p/chris-cleggs-mlb-milb-advanced-data)
- [Mendeley: Optical Tracking Data from College Baseball Scrimmages](https://data.mendeley.com/datasets/xfnz6mkdzm/1)
- [Driveline OpenBiomechanics](https://www.github.com/drivelineresearch/openbiomechanics)
- [TruMedia / TrackMan / Cape League](https://www.trumedianetworks.com/analytics-news/trumedia-trackman-cape-cod-partnership);
  [NFHS / GameChanger](https://nfhs.org/stories/dicks-sporting-goods-nfhs-announce-partnership-between-gamechanger-and-nfhs)
- [Blast Motion bat speed by level](https://blastmotion.com/?p=123744)
