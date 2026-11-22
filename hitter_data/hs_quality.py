"""v1.3 Part 1 (HS / travel): per-game quality checks and the reports in PITCHIQ_DATA/hs/reports/.

Checks (same spirit as the college ones in quality.py):
- half-innings ending at exactly 3 outs (the game's last half may be short: walk-off, run rule, time limit);
- half-inning runs (from "scored" in the play text) equal the published line score; final runs equal the final score;
- count replay: the count shown after each pitch equals the count before it plus the pitch's letter; the pitch that
  ends the PA is checked too (a walk needs 3 balls before it, a strikeout 2 strikes);
- outs: where the scorecard shows outs, the outs our text reading implies agree;
- velocity / pitch type present share; batter bats and pitcher throws matched to the roster (player_id, else name);
  lineup slot found; top unparsed play-text patterns; our pitch count minus the box score's pitch total.

A game has a "full pitch log" when the box score has a pitch total and our pitch count is within 2 of it (most
differences of 1-2 are the box counting an intentional-walk or pickoff row differently); without a box total, when
at least 90% of its plate appearances have pitches."""
import csv, json, os
from collections import Counter, defaultdict
from . import DATA

OUT = os.path.join(DATA, "hs", "reports")


def _w(name, header, rows, out=None):
    d = out or OUT
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def frac(a, b):
    return f"{a / b:.4f}" if b else ""


def game_qc(game, pas, pitches, info, line):
    halves = info["halves"]
    n = len(halves)
    h3 = sum(1 for h in halves if h["outs_final"] == 3)
    last_short = 1 if n and halves[-1]["outs_final"] != 3 else 0
    hl = hm = 0
    line_halves = missing = None
    if line:
        # a line-score half with no log rows is a gap when a later half is logged or it scored; trailing halves
        # printed "0" after the log ends are games stopped early (time limit / run rule) that PG pads with zeros
        logged = {(h["inning"], 0 if h["half"] == "top" else 1) for h in halves}
        last = max(logged) if logged else (0, 0)
        line_halves = missing = 0
        for hi, side in ((0, "away"), (1, "home")):
            for i, x in enumerate(line.get(side) or [], 1):
                x = str(x).strip()
                if not x.isdigit():
                    continue
                if (i, hi) in logged:
                    line_halves += 1
                elif (i, hi) < last or int(x) > 0:
                    line_halves += 1
                    missing += 1
        for h in halves:
            col = line.get(h["side"]) or []
            i = (h["inning"] or 0) - 1
            if 0 <= i < len(col) and str(col[i]).strip().isdigit():
                hl += 1
                hm += int(col[i]) == h["runs"]
    try:
        final = int(info["final"]["away"] == int(game["away_runs"]) and info["final"]["home"] == int(game["home_runs"]))
    except (TypeError, ValueError):
        final = None
    nonterm = [p for p in pitches if p["result"] is None and p["count_ok"] is not None]
    term = [p for p in pitches if p["result"] is not None and p["count_ok"] is not None]
    try:
        box = int(game["box_pitch_total"])
    except (TypeError, ValueError):
        box = None
    npitch = len(pitches)
    diff = npitch - box if box is not None else None
    with_res = sum(1 for p in pas if p["result"])
    with_p = sum(1 for p in pas if p["n_pitches"])
    if box is not None:
        full = int(abs(diff) <= 2)
    else:
        full = int(bool(pas) and with_p >= 0.9 * len(pas))
    bat = [p for p in pas if p["batter"]]
    pit = [p for p in pas if p["pitcher"]]
    return dict(rows=info["rows"], pas=len(pas), pas_with_result=with_res, pas_with_pitches=with_p, pitches=npitch,
                pitches_velo=sum(1 for p in pitches if p["velo"] is not None),
                pitches_type=sum(1 for p in pitches if p["pitch_type"]), halves=n, halves_3out=h3,
                halves_last_short=last_short, halves_bad=n - h3 - last_short, halves_line=hl, halves_runs_match=hm,
                line_halves=line_halves, halves_missing=missing,
                final_match=final, count_checked=len(nonterm), count_ok=sum(p["count_ok"] for p in nonterm),
                term_checked=len(term), term_ok=sum(p["count_ok"] for p in term),
                outs_checked=info["outs_check"][1], outs_agree=info["outs_check"][0],
                bat_total=len(bat), bat_matched=sum(1 for p in bat if p["bats"]), pit_total=len(pit),
                pit_matched=sum(1 for p in pit if p["throws"]), slot_total=len(bat),
                slot_matched=sum(1 for p in bat if p["slot"] is not None), box_diff=diff,
                unparsed=len(info["unparsed"]), orphans_dropped=info["dropped_orphans"], full_log=full)


SUMS = ("rows", "pas", "pas_with_result", "pas_with_pitches", "pitches", "pitches_velo", "pitches_type", "halves",
        "halves_3out", "halves_last_short", "halves_bad", "halves_line", "halves_runs_match", "count_checked",
        "count_ok", "term_checked", "term_ok", "outs_checked", "outs_agree", "bat_total", "bat_matched", "pit_total",
        "pit_matched", "slot_total", "slot_matched", "unparsed", "full_log", "line_halves", "halves_missing")


def report(con, log=print, out=None, snap=None):
    from .hs_snapshot import SNAP
    out = out or OUT
    cols = [d[1] for d in con.execute("PRAGMA table_info(hs_game_qc)")]
    rows = con.execute("SELECT g.season, g.level, g.age_group, g.series, g.phase, g.ended_before_7, g.tie_breaker, "
                       "q.* FROM hs_games g JOIN hs_game_qc q ON q.game_id=g.game_id").fetchall()
    agg, cov, tot = defaultdict(Counter), defaultdict(Counter), Counter()
    diffs = Counter()
    fmt = defaultdict(Counter)
    errors = 0
    for r in rows:
        season, level, age, series, phase, short, tb = r[:7]
        d = dict(zip(cols, r[7:]))
        if d["error"]:
            errors += 1
            continue
        for a in (agg[(season, level)], tot):
            a["games"] += 1
            for c in SUMS:
                a[c] += d[c] or 0
            if d["final_match"] is not None:
                a["final_known"] += 1
                a["final_match"] += d["final_match"]
            if d["halves_missing"] is not None:
                a["games_all_halves"] += d["halves_missing"] == 0
                a["games_line"] += 1
                if d["halves_missing"] == 0 and d["final_match"] is not None:
                    a["final_known_complete"] += 1
                    a["final_match_complete"] += d["final_match"]
            if d["box_diff"] is not None:
                a["box_known"] += 1
                a["box_exact"] += d["box_diff"] == 0
                a["box_within2"] += abs(d["box_diff"]) <= 2
        if d["box_diff"] is not None:
            b = d["box_diff"]
            diffs["<= -5" if b <= -5 else ">= 5" if b >= 5 else str(b)] += 1
        c = cov[(season, level, age)]
        c["games"] += 1
        c["full"] += d["full_log"] or 0
        c["pitches"] += d["pitches"] or 0
        c["velo"] += d["pitches_velo"] or 0
        c["type"] += d["pitches_type"] or 0
        f = fmt[(season, series, phase or "unknown")]
        f["games"] += 1
        f["short"] += short or 0
        f["tie_breaker"] += tb or 0
    # scheduled finals per season x level x age group, from the archive's own coverage table
    sched = Counter()
    cp = os.path.join(snap or SNAP, "coverage.csv")
    if os.path.exists(cp):
        with open(cp, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                try:
                    sched[(int(r["event_year"]), r["level"], r["age_group"] or "Open")] += int(r["scheduled_finals"] or 0)
                except ValueError:
                    pass
    q_rows = []
    for k in sorted(agg, key=lambda k: (str(k[0]), str(k[1]))):
        a = agg[k]
        q_rows.append([k[0], k[1], a["games"], a["rows"], a["pitches"], a["pas"], frac(a["pas_with_result"], a["pas"]),
                       a["halves"], frac(a["halves_3out"], a["halves"]), a["halves_last_short"], a["halves_bad"],
                       frac(a["halves_runs_match"], a["halves_line"]), a["halves_line"],
                       frac(a["games_all_halves"], a["games_line"]), a["halves_missing"],
                       frac(a["final_match"], a["final_known"]),
                       frac(a["final_match_complete"], a["final_known_complete"]), frac(a["count_ok"], a["count_checked"]),
                       a["count_checked"], frac(a["term_ok"], a["term_checked"]), frac(a["outs_agree"], a["outs_checked"]),
                       frac(a["pitches_velo"], a["pitches"]), frac(a["pitches_type"], a["pitches"]),
                       frac(a["bat_matched"], a["bat_total"]), frac(a["pit_matched"], a["pit_total"]),
                       frac(a["slot_matched"], a["slot_total"]), frac(a["box_exact"], a["box_known"]),
                       frac(a["box_within2"], a["box_known"]), a["unparsed"]])
    _w("quality.csv", ["season", "level", "games", "rows", "pitches", "pas", "pas_with_result_share", "half_innings",
                       "three_out_share", "last_half_short", "other_halves_not_3_outs", "half_runs_match_line_share",
                       "halves_with_line", "games_with_every_half_logged_share", "halves_in_line_missing_from_log",
                       "final_runs_match_share", "final_runs_match_share_games_with_every_half",
                       "count_replay_consistent_share", "pitches_checked",
                       "terminal_pitch_count_ok_share", "outs_text_agree_share", "velocity_share", "pitch_type_share",
                       "batter_bats_matched_share", "pitcher_throws_matched_share", "lineup_slot_found_share",
                       "pitch_count_equals_box_share", "pitch_count_within_2_share", "unparsed_rows"], q_rows, out)
    c_rows = []
    keys = set(cov) | set(sched)
    for k in sorted(keys, key=lambda k: (str(k[0]), str(k[1]), str(k[2]))):
        c = cov.get(k, Counter())
        c_rows.append([k[0], k[1], k[2], sched.get(k, ""), c["games"], c["full"], frac(c["full"], c["games"]),
                       c["pitches"], c["velo"], frac(c["velo"], c["pitches"]), c["type"], frac(c["type"], c["pitches"]),
                       "held out (count only)" if k[0] and int(k[0]) >= 2026 else ""])
    _w("coverage.csv", ["season", "level", "age_group", "scheduled_finals (archive coverage.csv)", "games_parsed",
                        "games_full_pitch_log", "full_share", "pitches", "pitches_with_velocity", "velocity_share",
                        "pitches_with_type", "type_share", "note"], c_rows, out)
    oc = con.execute("SELECT outcome, COALESCE(letter,''), COALESCE(result,''), COUNT(*) FROM hs_pitch "
                     "GROUP BY 1,2,3 ORDER BY 4 DESC").fetchall()
    _w("outcomes.csv", ["pitch_outcome", "letter", "pa_result", "pitches"], oc, out)
    pt = con.execute("SELECT COALESCE(pitch_type,''), pitch_class, COUNT(*), ROUND(AVG(velo),1), "
                     "SUM(velo IS NOT NULL) FROM hs_pitch GROUP BY 1,2 ORDER BY 3 DESC").fetchall()
    _w("pitch_types.csv", ["pitch_type", "pitch_class", "pitches", "mean_velo", "with_velo"], pt, out)
    res = con.execute("SELECT COALESCE(result,'(no result)'), COUNT(*), SUM(in_play) FROM hs_pa GROUP BY 1 "
                      "ORDER BY 2 DESC").fetchall()
    _w("pa_results.csv", ["result", "pas", "in_play"], res, out)
    top = con.execute("SELECT pattern, COUNT(*), MIN(text) FROM hs_unparsed GROUP BY pattern ORDER BY 2 DESC "
                      "LIMIT 20").fetchall()
    _w("unparsed_top20.csv", ["pattern", "rows", "example"], top, out)
    _w("box_diff.csv", ["our_pitches_minus_box_total", "games"],
       sorted(diffs.items(), key=lambda x: (len(x[0]), x[0])), out)
    _w("format.csv", ["season", "series", "phase", "games", "ended_before_7", "tie_breaker_used"],
       [[k[0], k[1], k[2], v["games"], v["short"], v["tie_breaker"]] for k, v in sorted(fmt.items(),
                                                                                        key=lambda x: str(x[0]))], out)
    flags = Counter()
    for (f,) in con.execute("SELECT flags FROM hs_pa WHERE flags<>''"):
        flags.update(f.split(","))
    t = tot
    lines = [
        f"games parsed {t['games']} (parser errors {errors}); rows {t['rows']}; pitches {t['pitches']}; "
        f"plate appearances {t['pas']} (with a result {frac(t['pas_with_result'], t['pas'])})",
        f"half-innings {t['halves']}: exactly 3 outs {frac(t['halves_3out'], t['halves'])}; last half short "
        f"{t['halves_last_short']}; other halves not ending at 3 outs {t['halves_bad']}",
        f"half-inning runs = line score {frac(t['halves_runs_match'], t['halves_line'])} of {t['halves_line']}; "
        f"final runs = final score {frac(t['final_match'], t['final_known'])} of {t['final_known']} "
        f"({frac(t['final_match_complete'], t['final_known_complete'])} of the {t['final_known_complete']} games whose "
        f"log has every half-inning of the line score; {t['halves_missing']} line-score half-innings are gaps in the "
        f"log, not counting trailing zero halves of games stopped early)",
        f"count replay consistent {frac(t['count_ok'], t['count_checked'])} of {t['count_checked']} pitches; "
        f"PA-ending pitch at the right count {frac(t['term_ok'], t['term_checked'])} of {t['term_checked']}",
        f"outs read from text agree with shown outs {frac(t['outs_agree'], t['outs_checked'])} of {t['outs_checked']}",
        f"velocity present {frac(t['pitches_velo'], t['pitches'])}; pitch type present "
        f"{frac(t['pitches_type'], t['pitches'])}",
        f"handedness: batters {frac(t['bat_matched'], t['bat_total'])}, pitchers {frac(t['pit_matched'], t['pit_total'])}; "
        f"lineup slot found {frac(t['slot_matched'], t['slot_total'])}",
        f"pitch count vs box: equal {frac(t['box_exact'], t['box_known'])}, within 2 "
        f"{frac(t['box_within2'], t['box_known'])} of {t['box_known']} games; games with full pitch log "
        f"{t['full_log']}/{t['games']}",
        f"unparsed rows {t['unparsed']}; PA flags {dict(flags.most_common(10))}",
    ]
    with open(os.path.join(out, "summary.txt"), "w", newline="", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    for l in lines:
        log(l)
    log(f"hs reports in {out}")
    return t
