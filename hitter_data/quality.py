"""v1.3 Part 1 reports: parser quality and pitch-string coverage per level x season, computed by our code.

Coverage uses the definitions of docs/PROMPT_chatgpt_archive_checkpoint_2026-11-21.md: a plate appearance has a
"full pitch string" if its count comes with letters, "count only" if a count without letters; a game is full when at
least 90% of its plate appearances have full strings, partial when some do, none otherwise. Distinct games =
canonical games after dedupe (one copy per game). Unlike the checkpoint, plate appearances are the ones our parser
recognised (not a first-word rule), so the numbers can differ a little."""
import csv, json, os
from collections import Counter, defaultdict
from . import DATA

OUT = os.path.join(DATA, "college", "reports")


def _w(name, header, rows):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)


def frac(a, b):
    return f"{a / b:.4f}" if b else ""


def report(con, log=print):
    rows = con.execute("""SELECT g.level, g.season, g.canonical, g.dup_status, q.* FROM games g
                          JOIN game_qc q ON q.game_id=g.id""").fetchall()
    cols = ["level", "season", "canonical", "dup_status"] + [d[1] for d in con.execute("PRAGMA table_info(game_qc)")]
    agg = defaultdict(Counter)
    cov = defaultdict(Counter)
    letters = Counter()
    for r in rows:
        d = dict(zip(cols, r))
        key = (d["level"] or "Unknown", d["season"] or "Unknown")
        a = agg[key]
        a["games"] += 1
        for c in ("lines", "parsed_lines", "pas", "pas_full", "halves", "halves_3out", "halves_last_short", "halves_bad",
                  "halves_scored", "halves_runs_match", "count_checked", "count_ok", "bat_total", "bat_matched",
                  "pit_total", "pit_matched", "bat_rostered"):
            a[c] += d[c] or 0
        if d["final_match"] is not None:
            a["final_known"] += 1; a["final_match"] += d["final_match"]
        if not d["canonical"]:
            continue
        cv = cov[key]
        cv["distinct_games"] += 1
        lt = json.loads(d["letters"] or "{}")
        if d["pas"] and d["pas_full"] >= 0.9 * d["pas"]:
            cv["full_games"] += 1; cv["pa_full_games"] += d["pas"]
            cv["pitches_full_games"] += sum(lt.values())
        elif d["pas_full"]:
            cv["partial_games"] += 1
        else:
            cv["none_games"] += 1
        # corrected: a first-pitch ball in play / HBP prints "(0-0)" with no letters because no pitch came before it;
        # in a game that letters its other plate appearances that string is complete, not "count only"
        adj = d["pas_full"] + (d["pas_zero_count"] or 0 if d["pas_full"] else 0)
        if d["pas"] and adj >= 0.9 * d["pas"]:
            cv["full_games_adj"] += 1; cv["pa_full_games_adj"] += d["pas"]
        letters.update(lt)
    # letter check on strikeouts
    last = Counter()
    for res, p in con.execute("SELECT p.result, p.pitches FROM pa p JOIN games g ON g.id=p.game_id "
                              "WHERE g.canonical=1 AND p.result IN ('K_L','K_S','K_L_reached','K_S_reached')"):
        kind = "looking" if res.startswith("K_L") else "swinging"
        last[(kind, p[-1] if p else "(no full string)")] += 1
    keys = sorted(agg, key=lambda k: (str(k[0]), str(k[1])))
    q_rows = []
    for k in keys:
        a = agg[k]
        q_rows.append([k[0], k[1], a["games"], a["lines"], frac(a["parsed_lines"], a["lines"]), a["halves"],
                       frac(a["halves_3out"], a["halves"]), a["halves_last_short"], a["halves_bad"],
                       frac(a["halves_runs_match"], a["halves_scored"]), a["halves_scored"],
                       frac(a["final_match"], a["final_known"]), frac(a["count_ok"], a["count_checked"]),
                       a["count_checked"], frac(a["bat_matched"], a["bat_total"]), frac(a["pit_matched"], a["pit_total"]),
                       frac(a["bat_rostered"], a["bat_total"])])
    _w("quality.csv", ["level", "season", "games", "lines", "lines_parsed_share", "half_innings", "three_out_share",
                       "last_half_short (walk-off / shortened)", "other_halves_not_3_outs",
                       "half_runs_match_site_score_share", "halves_with_site_score", "final_runs_match_box_share",
                       "count_replay_consistent_share", "pas_with_strings", "batter_bats_matched_share",
                       "pitcher_throws_matched_share", "batting_team_has_roster_share (ceiling)"], q_rows)
    c_rows = []
    for k in sorted(cov, key=lambda k: (str(k[0]), str(k[1]))):
        c = cov[k]
        c_rows.append([k[0], k[1], c["distinct_games"], c["full_games"], c["partial_games"], c["none_games"],
                       f"{c['full_games']}/{c['distinct_games']}", c["pa_full_games"], c["pitches_full_games"],
                       c["full_games_adj"], frac(c["full_games_adj"], c["distinct_games"]), c["pa_full_games_adj"]])
    _w("coverage.csv", ["level", "season", "distinct_games", "full_games", "partial_games", "none_games", "full_share",
                        "plate_appearances_in_full_games", "pitches_in_full_games",
                        "full_games_counting_0-0_in_play", "full_share_counting_0-0", "pas_in_those_games"], c_rows)
    _w("letters.csv", ["letter", "occurrences"], sorted(letters.items()))
    _w("last_letter.csv", ["strikeout_type", "last_pitch_letter", "plate_appearances"],
       [[a, b, n] for (a, b), n in sorted(last.items())])
    top = con.execute("SELECT pattern, COUNT(*), MIN(text) FROM unparsed GROUP BY pattern ORDER BY 2 DESC LIMIT 20").fetchall()
    _w("unparsed_top20.csv", ["pattern", "lines", "example"], top)
    dup = con.execute("""SELECT COALESCE(level,'Unknown'), COALESCE(season,'Unknown'), COUNT(*),
                         SUM(canonical), SUM(dup_status='dup_same' AND canonical=0), SUM(dup_status='dup_disagree')
                         FROM games GROUP BY 1,2 ORDER BY 1,2""").fetchall()
    _w("dupes.csv", ["level", "season", "archive_games", "distinct_games", "same_text_copies_dropped",
                     "games_in_disagreeing_groups (kept, flagged)"], dup)
    tot = Counter()
    for k in agg:
        tot.update(agg[k])
    lk = sum(n for (a, b), n in last.items() if a == "looking" and b != "(no full string)")
    ls = sum(n for (a, b), n in last.items() if a == "swinging" and b != "(no full string)")
    lines = [
        f"games parsed {tot['games']}; lines {tot['lines']}, parsed {frac(tot['parsed_lines'], tot['lines'])}",
        f"half-innings {tot['halves']}: exactly 3 outs {frac(tot['halves_3out'], tot['halves'])}; last half short "
        f"(walk-off / shortened) {tot['halves_last_short']}; other halves not ending at 3 outs {tot['halves_bad']}",
        f"half-inning runs = site running score {frac(tot['halves_runs_match'], tot['halves_scored'])} of {tot['halves_scored']}; "
        f"final runs = box score {frac(tot['final_match'], tot['final_known'])} of {tot['final_known']}",
        f"count replay consistent {frac(tot['count_ok'], tot['count_checked'])} of {tot['count_checked']} strings",
        f"letter check: struck out looking ends in K {frac(last[('looking', 'K')], lk)} ({last[('looking', 'K')]}/{lk}); "
        f"swinging ends in S {frac(last[('swinging', 'S')], ls)} ({last[('swinging', 'S')]}/{ls})",
        f"roster match: batters with bats {frac(tot['bat_matched'], tot['bat_total'])}, pitchers with throws "
        f"{frac(tot['pit_matched'], tot['pit_total'])}",
        f"letters: {dict(sorted(letters.items()))}",
    ]
    open(os.path.join(OUT, "summary.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    for l in lines:
        log(l)
    log(f"reports in {OUT}")
