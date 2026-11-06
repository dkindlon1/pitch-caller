"""v1.0 call-sheet test (PLAN_v1.0.md 1.1, bands in section 4). Sweeps the shipped engine over a grid of situations,
checks every band, and writes results/callsheet_<tag>.json and .md.
  python3 callsheet.py --tier full --jobs 4 --tag v09     (about 1,000 table solves)
  python3 callsheet.py --tier ci --jobs 4 --tag ci        (under 4 minutes)
Exit code 1 if any enforced band fails. Tracked bands (T1-T4) print but never fail.

How the grid is built:
  main grid   level x arsenal x base-out x side x game state, all 12 counts on one table per plate appearance, the look at
              the table's starting look. B1-B3, B5-B8 and B11 read it.
  reference   bases-empty states that B8a compares against when the grid doesn't have them (full: empty 1 out; ci:
              empty 0 outs). Only B8a and B11 read them.
  variants    D3, slider_best and plus_changeup, bases empty 1 out and runner on 1st 0 outs, both sides, inning 4: hitter
              grades, crowding, in-game reads, at-bat history, landing (plus runner on 3rd 1 out, for B8c), trust.
Count weights for the chance-weighted bands (B5, B7): expected pitches in each count of a plate appearance, from the
engine's own at-bat chain (engine.at_bat_plan) when it exists, otherwise MLB pitch frequency by count (Statcast 2024-25,
cached in results/mlb_count_freq.json so the CI tier needs no Statcast files)."""
import argparse, concurrent.futures as cf, csv, glob, json, os, sys, time
from dataclasses import fields, replace

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import engine as e

ARSENALS = json.load(open(os.path.join(ROOT, "callsheet_arsenals.json")))
ARSENALS.pop("_note", None)
F, T = False, True
BASEOUT = {"empty0": ((F, F, F), 0), "empty1": ((F, F, F), 1), "empty2": ((F, F, F), 2), "on1_0": ((T, F, F), 0),
           "on1_1": ((T, F, F), 1), "on2_1": ((F, T, F), 1), "on3_0": ((F, F, T), 0), "on3_1": ((F, F, T), 1),
           "on13_1": ((T, F, T), 1), "loaded1": ((T, T, T), 1), "on23_2": ((F, T, T), 2)}
TIERS = {
    "full": dict(levels=["hs", "college_d3", "college_d1"], arsenals=list(ARSENALS),
                 baseout=["empty0", "empty2", "on1_0", "on1_1", "on2_1", "on3_0", "on3_1", "on13_1", "loaded1", "on23_2"],
                 ref=["empty1"], states=["i4", "late"]),
    "ci": dict(levels=["college_d3", "hs"], arsenals=["slider_best", "plus_changeup", "two_pitch"],
               baseout=["empty1", "on1_0", "on3_1", "loaded1"], ref=["empty0"], states=["i4"]),
}
VAR_ARS, VAR_BO, VAR_LEVEL = ["slider_best", "plus_changeup"], ["empty1", "on1_0"], "college_d3"
COUNTS = [(b, k) for (b, k) in e.COUNTS]
CORNERS_IN = ("up-in", "down-in")
DOWN = ("down-in", "down-away")
SITUATION_FIELDS = {f.name for f in fields(e.Situation)}
HAS_HISTORY = "history" in SITUATION_FIELDS
FREQ_PATH = os.path.join(ROOT, "results", "mlb_count_freq.json")


class Half:
    def random(self):
        return 0.5


def arsenal(name, edits=None):
    out = []
    for d in ARSENALS[name]:
        d = dict(d, **((edits or {}).get(d["name"], {})))
        out.append(e.Pitch(**d))
    return out


def base_situation(level, bo, same, state, extra):
    bases, outs = BASEOUT[bo]
    late = state == "late"
    inning = (6 if level in ("hs", "travel") else 8) if late else 4
    s = e.Situation(balls=0, strikes=0, outs=outs, bases=bases, inning=inning, margin=1 if late else 0, level=level,
                    same_side=same, home=True, **extra)
    return replace(s, win=e.win_constants(s))      # the app fills win at the plate appearance's start


def with_history(s, hist):
    """hist: ((pitch, target, result, read), ...). The engine's `last` is the newest pitch's first three fields."""
    if not hist:
        return s
    kw = dict(last=tuple(hist[-1][:3]))
    if HAS_HISTORY:
        kw["history"] = tuple(tuple(h) for h in hist)
    return replace(s, **kw)


def shares(dist):
    out = {}
    for pr, _c, p, q in dist:
        out[f"{p.name}|{q}"] = out.get(f"{p.name}|{q}", 0.0) + pr
    return out


def one_call(ars, s, tab, exclude=None):
    s = replace(s, b_h=e.lean_b_h(ars, s))
    _, dist, _, info = e.call_v08(ars, s, rng=Half(), exclude=exclude or None, tab=tab)
    allowed = sorted({a[0] for a in info["M"]})
    return shares(dist), allowed


def filler(x):
    return ("Fastball", "down-away") if (x[0], x[1]) != ("Fastball", "down-away") else ("Fastball", "up-away")


def history_cases(b, k, x):
    """B9 at-bat histories ending at count (b, k), built around call x = (pitch, target)."""
    out = {}
    if b + k >= 2:                      # RP1: the last two pitches were both x
        res = ["ball"] * b + ["cstrike"] * k
        hist = [filler(x) + (r, None) for r in res[:-2]] + [x + (r, None) for r in res[-2:]]
        out["rp1"] = hist
    if k >= 1:
        res = ["ball"] * b + ["cstrike"] * (k - 1)
        pre = [filler(x) + (r, None) for r in res]
        out["rp2"] = pre + [x + ("foul", "back")]
        out["foul"] = pre + [x + ("foul", None)]
        out["whiff"] = pre + [x + ("whiff", None)]
    return out


def solve_context(job):
    """The plate appearance's arsenal, starting situation and table."""
    ars = arsenal(job["arsenal"], job.get("edits"))
    s0 = base_situation(job["level"], job["bo"], job["same"], job["state"], job.get("extra", {}))
    tab = e.solve_table(ars, replace(s0, balls=0, strikes=0, last=None))
    return ars, s0, tab


def count_records(job, ars, s0, tab, with_x=False):
    """Every count (and the count-level variants) on one table. with_x: also exploitability X at the root (tune_v10)."""
    rec = dict(job, counts={}, secs=0.0)
    if hasattr(e, "at_bat_plan"):
        rec["visits"] = {f"{b}-{k}": v for (b, k), v in e.at_bat_plan(tab)["visits"].items()}
    for (b, k) in COUNTS:
        sc = replace(s0, balls=b, strikes=k, look=tab.h0)
        sh, allowed = one_call(ars, sc, tab)
        row = dict(sh=sh, allowed=allowed)
        if with_x:
            sx = replace(sc, b_h=e.lean_b_h(ars, sc))
            pi, sg, full, res, M = e.root_call(ars, sx, tab)
            row["X"] = e.exploitability(M, e.sit_options(ars), pi, sg)
        if job.get("shake"):            # B11: a shaken-off call is never called again
            top = max(sh, key=sh.get)
            sh2, _ = one_call(ars, sc, tab, exclude={tuple(top.split("|"))})
            row["shake"] = dict(excluded=top, share=sh2.get(top, 0.0))
        if job.get("history"):          # B9: repeats, around this count's top call
            top = max(sh, key=sh.get)
            x = tuple(top.split("|"))
            row["hist"] = {}
            for name, hist in history_cases(b, k, x).items():
                shh, _ = one_call(ars, with_history(sc, hist), tab)
                row["hist"][name] = dict(x=top, sh=shh)
        rec["counts"][f"{b}-{k}"] = row
    return rec


def run_context(job):
    """One plate appearance: solve its table, then every count (and the count-level variants on that table)."""
    t0 = time.time()
    ars, s0, tab = solve_context(job)
    rec = count_records(job, ars, s0, tab)
    rec["secs"] = round(time.time() - t0, 2)
    return rec


def jobs_for(tier):
    cfg = TIERS[tier]
    out = []
    for level in cfg["levels"]:
        for an in cfg["arsenals"]:
            for bo in cfg["baseout"] + cfg["ref"]:
                for same in (True, False):
                    for state in cfg["states"]:
                        grp = "ref" if bo in cfg["ref"] else "main"
                        out.append(dict(group=grp, variant="base", level=level, arsenal=an, bo=bo, same=same, state=state,
                                        shake=(grp == "main")))
    # variant groups (both tiers)
    for an in VAR_ARS:
        ars = ARSENALS[an]
        best_os = max((d for d in ars if d["kind"] != "FB"), key=lambda d: (d["grade"], d["conf"]))["name"]
        cut = e.LEVEL[VAR_LEVEL]["cutoff"]
        for same in (True, False):
            base = dict(group="var", level=VAR_LEVEL, arsenal=an, same=same, state="i4")
            for bo in VAR_BO:
                v = lambda name, **kw: out.append(dict(base, bo=bo, variant=name, **kw))
                v("base", history=True)
                for g in ("w", "c", "d"):
                    for val in (1, 5):
                        v(f"grade_{g}{val}", extra=dict(grades={g: val}))
                v("crowding", extra=dict(crowding=True))
                v("cr1_hard2", extra=dict(matchup={"hard|FB|middle": 2}))
                v("damage_middle", extra=dict(hitter_damage={"middle": (0.9, 8)}))
                for lt in ((0, 4), (2, 12)):
                    v(f"land_{lt[0]}of{lt[1]}", extra=dict(landing_today={best_os: lt}), notland=best_os)
            for lt in ((0, 4), (2, 12)):            # B8c: the same pitch with a runner on 3rd
                out.append(dict(base, bo="on3_1", variant=f"land_{lt[0]}of{lt[1]}", extra=dict(landing_today={best_os: lt}),
                                notland=best_os))
            # B10 trust: every pitch below the cutoff; the top-confidence pitch is a secondary
            names = [d["name"] for d in ars]
            top_n = best_os
            order = [top_n] + [n for n in names if n != top_n]
            edits = {n: {"conf": round(cut - 0.03 - 0.05 * i, 3)} for i, n in enumerate(order)}
            for bo in VAR_BO:
                tv = lambda name, lt, expect: out.append(dict(base, bo=bo, variant=name, edits=edits,
                                                              extra=dict(landing_today=lt), expect=expect))
                tv("trust_none", {}, top_n)
                fb = "Fastball"
                lt = {top_n: (2, 12), fb: (7, 12)}
                tv("trust_toplanding_bad", lt, fallback_expect(ars, edits, lt))
                lt = {fb: (1, 12), top_n: (2, 12)}
                for n in names:
                    if n not in lt:
                        lt[n] = (3, 10)
                tv("trust_all_bad", lt, fallback_expect(ars, edits, lt))
    return out


def fallback_expect(ars_dicts, edits, lt):
    """3.2's rule, computed here independently: among pitches still landing (or with fewer than LAND_BLOCK_N thrown) the
    highest confidence; if none, the highest shrunk strike estimate."""
    ps = [e.Pitch(**dict(d, **edits.get(d["name"], {}))) for d in ars_dicts]
    s = e.Situation(0, 0, 0, (F, F, F), level=VAR_LEVEL, landing_today=lt)
    ok = [p for p in ps if not e.not_landing(p, s)]
    if ok:
        return max(ok, key=lambda p: p.conf).name
    return max(ps, key=lambda p: e.landing_estimate(p, s)[0]).name


# ---------------------------------------------------------------------------
# count weights
# ---------------------------------------------------------------------------
def mlb_count_freq():
    if os.path.exists(FREQ_PATH):
        return {k: v for k, v in json.load(open(FREQ_PATH))["freq"].items()}
    files = sorted(glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv")))
    if not files:
        raise SystemExit("no MLB count frequencies: run fetch_statcast.py once (the result is cached in results/)")
    n = {f"{b}-{k}": 0 for (b, k) in COUNTS}
    for fn in files:
        for r in csv.DictReader(open(fn, encoding="utf-8-sig")):
            if r.get("game_type") != "R":
                continue
            key = f"{r['balls']}-{r['strikes']}"
            if key in n:
                n[key] += 1
    tot = sum(n.values())
    freq = {k: v / tot for k, v in n.items()}
    os.makedirs(os.path.dirname(FREQ_PATH), exist_ok=True)
    json.dump(dict(source="Statcast regular season 2024-25 (fetch_statcast.py days), pitches by count", pitches=tot,
                   counts=n, freq=freq), open(FREQ_PATH, "w"), indent=1)
    return freq


def weights(rec, freq):
    return rec.get("visits") or freq


# ---------------------------------------------------------------------------
# bands
# ---------------------------------------------------------------------------
def kinds(an):
    return {d["name"]: d["kind"] for d in ARSENALS[an]}


def by_pitch(sh):
    out = {}
    for k, v in sh.items():
        n = k.split("|")[0]
        out[n] = out.get(n, 0.0) + v
    return out


def by_target(sh):
    out = {}
    for k, v in sh.items():
        q = k.split("|")[1]
        out[q] = out.get(q, 0.0) + v
    return out


def label(rec, c=None, extra=""):
    s = f"{rec['level']} {rec['arsenal']} {rec['bo']} {'same' if rec['same'] else 'opp'} {rec['state']}"
    if rec.get("variant", "base") != "base":
        s += f" [{rec['variant']}]"
    return s + (f" {c}" if c else "") + (f" {extra}" if extra else "")


class Band:
    def __init__(self, key, text, enforced=True, strict=False):
        self.key, self.text, self.enforced, self.strict = key, text, enforced, strict
        self.rows = []          # (ok, miss, label, shares or None)
        self.exempt = 0         # variety bands: situations skipped (3-0, or one allowed pitch type)

    def add(self, ok, miss, lab, sh=None):
        self.rows.append((bool(ok), max(0.0, miss), lab, sh))

    def result(self):
        n = len(self.rows)
        p = sum(r[0] for r in self.rows)
        worst = sorted(self.rows, key=lambda r: -r[1])
        max_miss = worst[0][1] if worst and not worst[0][0] else 0.0
        if n == 0:
            passed = None
        elif self.strict:
            passed = p == n
        else:
            passed = p >= 0.98 * n and max_miss <= 0.03 + 1e-12
        mix_p, mix_q, m = {}, {}, 0
        for r in self.rows:
            if r[3]:
                m += 1
                for k, v in by_pitch_kind(r[3]).items():
                    mix_p[k] = mix_p.get(k, 0.0) + v
                for k, v in by_target(r[3]).items():
                    mix_q[k] = mix_q.get(k, 0.0) + v
        return dict(band=self.key, text=self.text, enforced=self.enforced, rule="100%" if self.strict else "98% / 3 pts",
                    eligible=n, passes=p, exempt=self.exempt, rate=(p / n if n else None), max_miss=max_miss, passed=passed,
                    worst=[dict(label=r[2], miss=round(r[1], 4)) for r in worst[:5] if not r[0]],
                    pitch_share={k: round(v / m, 4) for k, v in sorted(mix_p.items())} if m else {},
                    target_share={k: round(v / m, 4) for k, v in sorted(mix_q.items())} if m else {})


_KIND_OF = {}


def by_pitch_kind(sh):
    out = {}
    for k, v in sh.items():
        n = k.split("|")[0]
        kd = _KIND_OF.get(n, n)
        out[kd] = out.get(kd, 0.0) + v
    return out


B6_LIMIT = {(0, 1): 0.10, (0, 2): 0.10, (1, 2): 0.10, (0, 0): 0.35, (1, 1): 0.35, (2, 2): 0.35, (3, 2): 0.35,
            (1, 0): 0.55, (2, 1): 0.55, (2, 0): 0.70, (3, 1): 0.70}


def b5_ranges(an, name, grade, kind):
    if kind == "FB":
        return {"two_pitch": (0.50, 0.78), "changeup_first": (0.25, 0.55)}.get(an, (0.40, 0.70))
    if grade == 3:
        return (0.07, 0.30) if an == "four_pitch" else (0.10, 0.35)
    if grade == 5:
        return (0.25, 0.50)
    return None


def evaluate(recs, freq):
    for an in ARSENALS:
        _KIND_OF.update(kinds(an))
    B = {k: Band(k, t, en, st) for k, t, en, st in [
        ("B1", "No pitch type above 85%", True, False),
        ("B2", "Every allowed secondary (every allowed pitch but the top one) at least 5% (changeup to a same-side hitter 2%)", True, False),
        ("B3", "No single exact call above 60%, except 3-0 fastball", True, False),
        ("B5", "Overall usage, chance-weighted over counts (FB, grade-3 and grade-5 secondaries in range)", True, False),
        ("B6", "Middle share by count group (command 3+ arsenals; low_command +15 points)", True, False),
        ("B7", "Inside: >= 12% of fastball calls (chance-weighted) and >= 3% inside in at least half the non-three-ball counts", True, False),
        ("B8a", "Runner on 1st, < 2 outs, < 2 strikes: down share no more than 2 points below bases empty, same outs", True, False),
        ("B8b", "Runner on 3rd: off-speed share at least 60% of bases empty (per level, arsenal, count)", True, False),
        ("B8c", "A pitch that isn't landing gets 0% with a runner on 3rd", True, True),
        ("B9", "Repeats (3.1): no third straight exact call; not back after a foul straight back; a plain foul doesn't "
               "raise the repeat; a whiff keeps 90% of the pitch type", True, True),
        ("B10", "Fallback (3.2): nothing trusted -> the landing pitch with the highest confidence, 100%", True, True),
        ("B11", "Hard rules: no chase at 3-0, 3-1 or 2-2; a shaken-off call is never called again", True, True),
        ("B12", "Coach rules: CR1 (hit hard twice: that pitch at that spot 0%), CR2 (power 4+: no middle)", True, True),
        ("B13", "Eye grade 1 (chaser) raises two-strike chase share by >= 5 points over eye 3", True, False),
        ("T1", "Contact grade 5 vs 1 moves two-strike chase share by >= 5 points", False, False),
        ("T2", "Crowding raises the inside share of fastballs by >= 5 points", False, False),
        ("T3", "Power grade 5 vs 3 moves calls beyond CR2's middle rule (TV distance on non-middle calls >= 5 points)", False, False),
        ("T4", "Engine whiff per swing on heart / edge fastballs within 3 points of Statcast (13.6-15.8% / 21-24%)", False, False)]}
    main = [r for r in recs if r["group"] == "main"]
    ref_or_main = [r for r in recs if r["group"] in ("main", "ref")]
    for r in main:
        ars = ARSENALS[r["arsenal"]]
        kd = kinds(r["arsenal"])
        for (b, k) in COUNTS:
            c = f"{b}-{k}"
            row = r["counts"][c]
            sh, allowed = row["sh"], row["allowed"]
            bp = by_pitch(sh)
            exempt = (b, k) == (3, 0) or len(allowed) <= 1
            lab = label(r, c)
            if exempt:
                B["B1"].exempt += 1
                B["B2"].exempt += 1
            else:
                top = max(bp.values())
                B["B1"].add(top <= 0.85 + 1e-12, top - 0.85, lab, sh)
                top_n = max(bp, key=bp.get)
                miss = 0.0
                for n in allowed:
                    if n == top_n:
                        continue
                    thr = 0.02 if (kd[n] == "CH" and r["same"]) else 0.05
                    miss = max(miss, thr - bp.get(n, 0.0))
                B["B2"].add(miss <= 1e-12, miss, lab, sh)
            big = max((v for a, v in sh.items() if not ((b, k) == (3, 0) and kd[a.split("|")[0]] == "FB")), default=0.0)
            B["B3"].add(big <= 0.60 + 1e-12, big - 0.60, lab, sh)
            if (b, k) != (3, 0):
                lim = B6_LIMIT[(b, k)] + (0.15 if r["arsenal"] == "low_command" else 0.0)
                mid = by_target(sh).get("middle", 0.0)
                B["B6"].add(mid <= lim + 1e-12, mid - lim, lab, sh)
        # B5, B7: chance-weighted over counts
        w = weights(r, freq)
        tw = sum(w[f"{b}-{k}"] for (b, k) in COUNTS)
        use = {d["name"]: 0.0 for d in ars}
        fb_in, fb_all = 0.0, 0.0
        for (b, k) in COUNTS:
            c = f"{b}-{k}"
            sh = r["counts"][c]["sh"]
            for a, v in sh.items():
                n, q = a.split("|")
                use[n] += w[c] * v / tw
                if kd[n] == "FB":
                    fb_all += w[c] * v
                    fb_in += w[c] * v * (q in CORNERS_IN)
        allowed_any = set()
        for row in r["counts"].values():
            allowed_any |= set(row["allowed"])
        miss, notes = 0.0, []
        for d in ars:
            if d["name"] not in allowed_any:
                continue
            rg = b5_ranges(r["arsenal"], d["name"], d["grade"], d["kind"])
            if rg is None:
                continue
            u = use[d["name"]]
            m = max(rg[0] - u, u - rg[1])
            if m > 1e-12:
                notes.append(f"{d['name']} {u:.0%} not in {rg[0]:.0%}-{rg[1]:.0%}")
            miss = max(miss, m)
        B["B5"].add(miss <= 1e-12, miss, label(r, extra="; ".join(notes)), None)
        if r["arsenal"] != "low_command":
            fbs = fb_in / fb_all if fb_all else 0.0
            ins = sorted((sum(v for a, v in r["counts"][f"{b}-{k}"]["sh"].items() if a.split("|")[1] in CORNERS_IN)
                          for (b, k) in COUNTS if b < 3), reverse=True)
            fifth = ins[len(ins) // 2]           # >= 3% in at least half of the 9 non-three-ball counts
            miss = max(0.12 - fbs, 0.03 - fifth)
            B["B7"].add(miss <= 1e-12, miss, label(r, extra=f"FB inside {fbs:.1%}, median-count inside {fifth:.1%}"), None)
        # B11 on the main grid: no chase at 3-0/3-1/2-2, the shaken-off call
        for (b, k) in COUNTS:
            row = r["counts"][f"{b}-{k}"]
            if (b, k) in ((3, 0), (3, 1), (2, 2)):
                ch = by_target(row["sh"]).get("chase", 0.0)
                B["B11"].add(ch == 0.0, ch, label(r, f"{b}-{k}", "chase"))
            if "shake" in row:
                B["B11"].add(row["shake"]["share"] == 0.0, row["shake"]["share"],
                             label(r, f"{b}-{k}", f"shaken {row['shake']['excluded']}"))
    # B8a: runner on 1st vs bases empty, same outs
    idx = {(r["level"], r["arsenal"], r["bo"], r["same"], r["state"]): r for r in ref_or_main}
    for r in main:
        if r["bo"] not in ("on1_0", "on1_1"):
            continue
        ref = idx.get((r["level"], r["arsenal"], "empty" + r["bo"][-1], r["same"], r["state"]))
        if ref is None:
            continue
        for (b, k) in COUNTS:
            if k >= 2:
                continue
            c = f"{b}-{k}"
            d1 = sum(by_target(r["counts"][c]["sh"]).get(q, 0.0) for q in DOWN)
            d0 = sum(by_target(ref["counts"][c]["sh"]).get(q, 0.0) for q in DOWN)
            B["B8a"].add(d1 >= d0 - 0.02 - 1e-12, d0 - 0.02 - d1, label(r, c, f"down {d1:.1%} vs empty {d0:.1%}"))
    # B8b: off-speed with a runner on 3rd vs bases empty, averaged per level, arsenal, count
    groups = {}
    for r in main:
        kd = kinds(r["arsenal"])
        on3 = BASEOUT[r["bo"]][0][2]
        empty = not any(BASEOUT[r["bo"]][0])
        if not (on3 or empty):
            continue
        for (b, k) in COUNTS:
            c = f"{b}-{k}"
            os_ = sum(v for a, v in r["counts"][c]["sh"].items() if kd[a.split("|")[0]] != "FB")
            g = groups.setdefault((r["level"], r["arsenal"], c), {"on3": [], "empty": []})
            g["on3" if on3 else "empty"].append(os_)
    for (lv, an, c), g in sorted(groups.items()):
        if not g["on3"] or not g["empty"]:
            continue
        a3, a0 = sum(g["on3"]) / len(g["on3"]), sum(g["empty"]) / len(g["empty"])
        B["B8b"].add(a3 >= 0.6 * a0 - 1e-12, 0.6 * a0 - a3, f"{lv} {an} {c}: off-speed {a3:.1%} on 3rd vs {a0:.1%} empty")
    # variant bands
    var = [r for r in recs if r["group"] == "var"]
    vidx = {(r["arsenal"], r["bo"], r["same"], r["variant"]): r for r in var}
    for r in var:
        kd = kinds(r["arsenal"])
        for (b, k) in COUNTS:
            c = f"{b}-{k}"
            row = r["counts"][c]
            if (b, k) in ((3, 0), (3, 1), (2, 2)):
                ch = by_target(row["sh"]).get("chase", 0.0)
                B["B11"].add(ch == 0.0, ch, label(r, c, "chase"))
            if r["variant"].startswith("land_") and BASEOUT[r["bo"]][0][2]:
                v = by_pitch(row["sh"]).get(r["notland"], 0.0)
                B["B8c"].add(v == 0.0, v, label(r, c, f"{r['notland']} {v:.1%}"))
            if r["variant"].startswith("trust_"):
                v = by_pitch(row["sh"]).get(r["expect"], 0.0)
                B["B10"].add(v >= 1 - 1e-9, 1 - v, label(r, c, f"{r['expect']} {v:.1%}"))
            if r["variant"] == "cr1_hard2":
                v = row["sh"].get("Fastball|middle", 0.0)
                B["B12"].add(v == 0.0, v, label(r, c, f"CR1 FB middle {v:.1%}"))
            if r["variant"] == "grade_w5":
                v = by_target(row["sh"]).get("middle", 0.0)
                B["B12"].add(v == 0.0, v, label(r, c, f"CR2 middle {v:.1%}"))
            if r["variant"] == "base" and "hist" in row:
                base_sh = row["sh"]
                for name, hc in row["hist"].items():
                    x, sh = hc["x"], hc["sh"]
                    if name in ("rp1", "rp2"):
                        v = sh.get(x, 0.0)
                        B["B9"].add(v == 0.0, v, label(r, c, f"{name} {x} {v:.1%}"))
                    elif name == "foul":
                        v, v0 = sh.get(x, 0.0), base_sh.get(x, 0.0)
                        B["B9"].add(v <= v0 + 1e-9, v - v0, label(r, c, f"plain foul {x} {v:.1%} vs {v0:.1%}"))
                    elif name == "whiff":
                        n = x.split("|")[0]
                        v, v0 = by_pitch(sh).get(n, 0.0), by_pitch(base_sh).get(n, 0.0)
                        B["B9"].add(v >= 0.9 * v0 - 1e-9, 0.9 * v0 - v, label(r, c, f"whiff {n} {v:.1%} vs {v0:.1%}"))
        if r["variant"] == "base":
            def chase(rr, cc):
                return by_target(rr["counts"][cc]["sh"]).get("chase", 0.0)
            key = (r["arsenal"], r["bo"], r["same"])
            d1, c1, c5 = (vidx.get(key + (v,)) for v in ("grade_d1", "grade_c1", "grade_c5"))
            w5, cr = vidx.get(key + ("grade_w5",)), vidx.get(key + ("crowding",))
            for (b, k) in COUNTS:
                c = f"{b}-{k}"
                if k == 2 and (b, k) != (2, 2):
                    if d1:
                        v1, v3 = chase(d1, c), chase(r, c)
                        B["B13"].add(v1 >= v3 + 0.05 - 1e-12, v3 + 0.05 - v1, label(r, c, f"chase eye1 {v1:.1%} vs eye3 {v3:.1%}"))
                    if c1 and c5:
                        a1, a5 = chase(c1, c), chase(c5, c)
                        B["T1"].add(abs(a5 - a1) >= 0.05, 0.05 - abs(a5 - a1), label(r, c, f"chase c5 {a5:.1%} vs c1 {a1:.1%}"))
                if cr:
                    def fb_in(rr):
                        sh = rr["counts"][c]["sh"]
                        fb = sum(v for a, v in sh.items() if kinds(r["arsenal"])[a.split("|")[0]] == "FB")
                        return sum(v for a, v in sh.items() if kinds(r["arsenal"])[a.split("|")[0]] == "FB"
                                   and a.split("|")[1] in CORNERS_IN) / fb if fb else 0.0
                    i1, i0 = fb_in(cr), fb_in(r)
                    B["T2"].add(i1 - i0 >= 0.05, 0.05 - (i1 - i0), label(r, c, f"FB inside crowd {i1:.1%} vs {i0:.1%}"))
                if w5:
                    def nm(sh):
                        t = sum(v for a, v in sh.items() if not a.endswith("|middle"))
                        return {a: v / t for a, v in sh.items() if not a.endswith("|middle")} if t else {}
                    p5, p3 = nm(w5["counts"][c]["sh"]), nm(r["counts"][c]["sh"])
                    tv = 0.5 * sum(abs(p5.get(a, 0.0) - p3.get(a, 0.0)) for a in set(p5) | set(p3))
                    B["T3"].add(tv >= 0.05, 0.05 - tv, label(r, c, f"TV {tv:.1%}"))
    t4(B["T4"])
    return {k: b.result() for k, b in B.items()}


def t4(band):
    """Tracked: engine whiff per swing on heart and edge fastballs at MLB, an average fastball, averaged over counts."""
    p = e.Pitch("Fastball", "FB", 3, 3, 0.6, shape="ride", velo=93)
    ars = [p, e.Pitch("Slider", "SL", 3, 3, 0.6, shape="tight", velo=85)]
    acc = {"heart": [0.0, 0.0], "edge": [0.0, 0.0]}
    for (b, k) in COUNTS:
        s = e.Situation(b, k, 0, (F, F, F), level="mlb")
        for q in ("up-in", "up-away", "down-in", "down-away", "middle"):
            zo = {}
            e.outcome_probs(p, q, s, ars, zout=zo)
            for z in acc:
                acc[z][0] += zo[z]["L"] * zo[z]["S"] * zo[z]["W"]
                acc[z][1] += zo[z]["L"] * zo[z]["S"]
    for z, (lo, hi) in (("heart", (0.136, 0.158)), ("edge", (0.21, 0.24))):
        v = acc[z][0] / acc[z][1]
        miss = max(lo - 0.03 - v, v - hi - 0.03)
        band.add(miss <= 0, miss, f"{z}: engine {v:.1%} vs Statcast {lo:.1%}-{hi:.1%}")


def write(tag, tier, res, recs, secs):
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    jp, mp_ = (os.path.join(ROOT, "results", f"callsheet_{tag}.{x}") for x in ("json", "md"))
    ctx = {}
    for r in recs:
        if r["group"] != "main":
            continue
        ctx[label(r)] = {c: {a: round(v, 4) for a, v in row["sh"].items()} for c, row in r["counts"].items()}
    json.dump(dict(tag=tag, tier=tier, tables=len(recs), seconds=round(secs, 1), has_history=HAS_HISTORY,
                   weights="engine at-bat chain" if any("visits" in r for r in recs) else "MLB count frequency",
                   bands=res, main_grid=ctx), open(jp, "w"), indent=1)
    L = [f"# Call sheet: {tag} ({tier} tier)", "",
         f"{len(recs)} table solves, {secs / 60:.1f} min. Count weights: "
         f"{'engine at-bat chain' if any('visits' in r for r in recs) else 'MLB pitch frequency by count (until 3.8)'}.",
         "", "| band | enforced | rule | eligible | passes | rate | max miss | result |", "|---|---|---|---|---|---|---|---|"]
    for k, b in res.items():
        rs = "n/a" if b["passed"] is None else ("PASS" if b["passed"] else "FAIL")
        rate = f"{b['rate']:.1%}" if b["rate"] is not None else "-"
        L.append(f"| {k} | {'yes' if b['enforced'] else 'tracked'} | {b['rule']} | {b['eligible']} | {b['passes']} | {rate} | "
                 f"{b['max_miss'] * 100:.1f} pts | {rs} |")
    for k, b in res.items():
        L += ["", f"## {k}: {b['text']}", "",
              f"Eligible {b['eligible']}, passes {b['passes']}" + (f" ({b['rate']:.1%})" if b["rate"] is not None else "") +
              (f". Exempt (3-0, or one allowed pitch type): {b['exempt']}" if b["exempt"] else ""), ""]
        if b["worst"]:
            L += ["Worst five:", ""] + [f"- {w['label']}: misses by {w['miss'] * 100:.1f} pts" for w in b["worst"]] + [""]
        if b["pitch_share"]:
            L.append("Share by pitch type: " + ", ".join(f"{p} {v:.1%}" for p, v in b["pitch_share"].items()))
            L.append("")
            L.append("Share by target: " + ", ".join(f"{q} {v:.1%}" for q, v in b["target_share"].items()))
    open(mp_, "w").write("\n".join(L) + "\n")
    return jp, mp_


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", default="ci", choices=list(TIERS))
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--tag", default=None)
    a = ap.parse_args()
    tag = a.tag or a.tier
    freq = mlb_count_freq()
    jobs = jobs_for(a.tier)
    t0 = time.time()
    print(f"{len(jobs)} table solves ({a.tier} tier), {a.jobs} jobs", flush=True)
    recs = []
    with cf.ProcessPoolExecutor(a.jobs) as ex:
        for i, r in enumerate(ex.map(run_context, jobs, chunksize=1)):
            recs.append(r)
            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(jobs)} ({time.time() - t0:.0f}s)", flush=True)
    secs = time.time() - t0
    res = evaluate(recs, freq)
    jp, mp_ = write(tag, a.tier, res, recs, secs)
    bad = []
    for k, b in res.items():
        rs = "n/a " if b["passed"] is None else ("PASS" if b["passed"] else "FAIL")
        rate = f"{b['rate']:.1%}" if b["rate"] is not None else "-"
        print(f"{rs} {k:4s} {'enforced' if b['enforced'] else 'tracked '} {b['passes']}/{b['eligible']} ({rate}), "
              f"max miss {b['max_miss'] * 100:.1f} pts  {b['text'][:70]}")
        if b["enforced"] and b["passed"] is False:
            bad.append(k)
    print(f"wrote {os.path.relpath(jp, ROOT)} and {os.path.relpath(mp_, ROOT)} ({secs / 60:.1f} min)")
    print("enforced bands failing: " + (", ".join(bad) if bad else "none"))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
