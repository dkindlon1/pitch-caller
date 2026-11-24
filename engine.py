"""
Pitch Caller - the engine, v1.0. One engine, no flags or modes.

Each call (call_v08) solves the at-bat once (solve_table: count x the hitter's look, with the hitter's sit game at each
count) and then the root: cost08(p, q | s) = sum_e P(e | p, q, s) * [value after e], with the outcome model
(outcome_probs: landing, swing, whiff, contact quality, typed balls in play) and every end of the plate appearance through
v_end (runs, blended with win expectancy late in close games). Calls are drawn at random, weighted toward low cost, inside
a stakes-scaled never-pick window (policy_from_costs); 3-ball counts rank by the pitch's own cost (no setups).

The research-backed principles from v0.2 still hold, now inside that solve: mix, don't script (R1); think in at-bats (R2);
no hard-coded count rules (R3, apart from the coach rules below); expand, don't waste (R4); avoid hitter strengths over
hunting holes (R5, the cross-game damage seed); timing and perceived speed (R7); no third-time-through cliff (R8).
Coach rules, each a named constant: no chase at 3-0 / 3-1; a pitch not landing today gives way when he is behind in the count or on the first pitch (LAND_BLOCK_*); mashed
twice at a height today (MASHED_PENALTY). Display only: the why line and the intent label (why_line, intent_label).

Fitted on real data: count kappas, timing, eye level, familiarity, tunneling on chase swings, matchup memory, inside/away
(SIDE), power HR, landing today (Statcast; seq_fit.py, readthrough/); level averages and pitcher/hitter spreads (college and
high school stats; calib.py, fit_all.py, fit_spread.py, fit_hitter_spread.py). Docs: docs/PLAN_v1.0_2026-11-09.md,
docs/BUILD_v1.0_REPORT.md.
"""
from dataclasses import dataclass, field, replace
import json as _json, os as _os
from math import exp, log
import random as _random
from itertools import combinations   # v1.2.2: the confidence band blend
from run_tables import IN_PLAY_BY_LEVEL   # v0.5: untyped in-play tables (calibration only; live calls use the count table)

# ---------------------------------------------------------------------------
# v1.3 Part 2: versioned tables (docs/TABLES_v13.md). The zone effects, the count layer and the run values come from
# data_tables/<kind>_<version>.json. The default versions reproduce v1.2 bit for bit; a fit writes a candidate file in the
# same format and is selected by version (TABLE_DEFAULT, or the environment: PITCH_ZONE_TABLE=v13 / a path to a .json).
# app/export_data.py copies the selected tables into app/engine_data.json for the JS engine.
# ---------------------------------------------------------------------------
TABLES_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "data_tables")
TABLE_DEFAULT = {"zone": "v13", "count": "v13core", "run": "v13core", "mp": "v13"}   # v1.3 core (feat/hitter-v13-core): zone_v13 (ruling 2, gate H = 0), count / run v13core (D1 + HS candidates, HS pitch kind x velocity; D2 / D3 v1.2 count layer)
TABLE_ENV = {"zone": "PITCH_ZONE_TABLE", "count": "PITCH_COUNT_TABLE", "run": "PITCH_RUN_TABLE", "mp": "PITCH_MP_TABLE"}
# v1.3 (Drew's Nov 24 ruling 12): the per-count mean-preservation scalars (mp_<v>.json): per level and count, one logit level
# shift per outcome, added to every band, zone cell, pitch kind and speed in that count (count_cells folds them in), computed
# by hitter_data/mean_preserve.py so the reference world reproduces the fitted count layer. mp_v0 = all 0 (before the ruling).
T_MP_OUT = ("swing", "whiff", "foul", "cstrike", "bip_gb")
T_MP_LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
T_BANDS = ("heart", "edge", "off", "noncomp")
T_PROFILES = ("FB", "SI", "FC", "SL", "SW", "CB", "CH", "SP")
T_COUNT_GROUPS = ("first", "ahead", "even", "behind", "two")
T_HEIGHTS = ("up", "mid", "down")
T_COUNTS = tuple(f"{b}-{k}" for k in range(3) for b in range(4))
T_BASE_OUT = tuple(f"{o}|{b}" for o in range(3) for b in ("000", "100", "020", "120", "003", "103", "023", "123"))
T_ZONE_OUT = ("swing", "cstrike", "whiff", "foul", "hard")
T_COUNT_BAND_OUT = ("swing", "whiff", "foul", "hard")


def table_path(kind, version=None):
    """the file for table kind at version (default: the environment override, else TABLE_DEFAULT); a .json path is used as is"""
    v = version or _os.environ.get(TABLE_ENV[kind]) or TABLE_DEFAULT[kind]
    return v if v.endswith(".json") else _os.path.join(TABLES_DIR, f"{kind}_{v}.json")


def _need(cond, path, what):
    if not cond:
        raise ValueError(f"{path}: {what} (format: docs/TABLES_v13.md)")


def check_table(t, path="table"):
    """Raises ValueError unless t is a complete table of its kind (every level / count / band / cell present, numbers)."""
    num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool) and x == x
    kind = t.get("kind")
    _need(kind in TABLE_DEFAULT and isinstance(t.get("version"), str) and t["version"], path, "needs kind and version")
    if kind == "zone":
        b = t.get("base", {})
        for o in ("swing", "cstrike", "whiff", "foul", "zone_in"):
            _need(all(num(b.get(o, {}).get(z)) for z in T_BANDS), path, f"base.{o} needs a number per band")
        _need(all(isinstance(b.get("quality", {}).get(z), list) and len(b["quality"][z]) == 3 and all(map(num, b["quality"][z]))
                  for z in T_BANDS), path, "base.quality needs [weak, solid, hard] per band")
        c = t.get("class", {})
        _need(all(num(c.get(k)) for k in ("whiff_fb", "line_low", "line_up", "line_whiff", "line_hard", "up_mid_hard", "hanger_hard"))
              and all(num(c.get("whiff_os", {}).get(k)) for k in ("SL", "CB", "CH"))
              and all(num(c.get("chase_os", {}).get(z)) for z in ("off", "noncomp")), path, "class terms missing")
        # v1.3 core, optional (absent = 0, as in the v12 / v13refit files): class.hanger_gate H (ruling 3: off-speed over the
        # heart gets H x min(1, wild_today / HANGER_GATE_FULL) more hard-contact logit when wild_today > 0) and class.gb_kind
        # {kind: logit} added to the ground-ball rate given contact (ruling 2's P3 row: the sinker's grounder ratio)
        _need(num(c.get("hanger_gate", 0.0)) and isinstance(c.get("gb_kind", {}), dict)
              and all(k in ("FB", "SI", "FC", "SL", "CB", "CH") and num(v) for k, v in c.get("gb_kind", {}).items()),
              path, "class.hanger_gate must be a number and class.gb_kind {kind: number}")
        for name, cells in [("cells", t.get("cells"))] + [(f"level_cells.{lv}", v) for lv, v in (t.get("level_cells") or {}).items()]:
            _need(isinstance(cells, dict), path, f"{name} missing")
            for o in T_ZONE_OUT:
                _need(all(num(cells.get(o, {}).get(z, {}).get(p, {}).get(g, {}).get(h)) for z in T_BANDS for p in T_PROFILES
                          for g in T_COUNT_GROUPS for h in T_HEIGHTS), path, f"{name}.{o} needs band > profile > count group > height")
    elif kind == "mp":
        for lv in T_MP_LEVELS:
            L = t.get("levels", {}).get(lv)
            _need(isinstance(L, dict) and all(num(L.get(o, {}).get(c)) for o in T_MP_OUT for c in T_COUNTS), path,
                  f"levels.{lv} needs swing / whiff / foul / cstrike / bip_gb > count (levels: {', '.join(T_MP_LEVELS)})")
    elif kind == "count":
        for lv, L in t.get("levels", {}).items():
            for o in T_COUNT_BAND_OUT:
                _need(all(num(L.get(o, {}).get(c, {}).get(z)) for c in T_COUNTS for z in T_BANDS), path, f"levels.{lv}.{o} needs count > band")
            _need(all(num(L.get("cstrike", {}).get(c)) for c in T_COUNTS), path, f"levels.{lv}.cstrike needs a number per count")
            _need(all(num(L.get("bip_gb", {}).get(c)) for c in T_COUNTS), path, f"levels.{lv}.bip_gb needs a number per count")
            _need(all(num(L.get("swing_base_out", {}).get(bo)) for bo in T_BASE_OUT), path, f"levels.{lv}.swing_base_out needs outs|bases")
            if "pitch_velo" in L:
                _check_pitch_velo(L["pitch_velo"], path, lv)
            if "fb_floor" in L:   # v1.3 (Drew's Nov 23 ruling 8): HS / travel fastball-share floor by count, hs only
                _need(lv == "hs" and all(num(L["fb_floor"].get(c)) and 0.0 <= L["fb_floor"][c] < 1.0 for c in T_COUNTS),
                      path, f"levels.{lv}.fb_floor: only the hs level (travel reads it), a share in [0, 1) per count")
            if "out_table" in L:
                _need(all(isinstance(L["out_table"].get(q, {}).get(ty), list) and len(L["out_table"][q][ty]) == 6
                          for q in ("weak", "solid", "hard") for ty in ("GB", "LD", "FB", "PU")), path, f"levels.{lv}.out_table")
                _need(all(num(L.get("runner", {}).get(k)) for k in ("p_GB", "p_FB", "S_DP")), path, f"levels.{lv}.runner")
        _need(all(lv in t.get("levels", {}) for lv in ("mlb", "college_d1", "college_d3", "hs")), path, "levels: mlb, college_d1, college_d3, hs")
    else:
        for lv, L in t.get("levels", {}).items():
            _need(all(num(L.get("re", {}).get(bo)) for bo in T_BASE_OUT), path, f"levels.{lv}.re needs outs|bases")
            _need(all(num(L.get("cv", {}).get(c)) for c in T_COUNTS), path, f"levels.{lv}.cv needs a number per count")
            _need(num(L.get("lw", {}).get("bb")) and num(L.get("lw", {}).get("k")), path, f"levels.{lv}.lw needs bb and k")
        _need(all(lv in t.get("levels", {}) for lv in ("mlb", "college_d1", "college_d3", "hs")), path, "levels: mlb, college_d1, college_d3, hs")
    return t


PV_KINDS = ("FB", "SI", "FC", "SL", "CB", "CH")


def _check_pitch_velo(T, path, lv):
    """v1.3 core (ruling 4): count_<v>.json levels.<lv>.pitch_velo, the HS / travel pitch kind x velocity multipliers"""
    num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool) and x == x
    six = lambda v: isinstance(v, list) and len(v) == 6 and all(num(x) and x > 0 for x in v)
    w = f"levels.{lv}.pitch_velo"
    _need(lv == "hs", path, f"{w}: only the hs level (travel reads it) carries the pitch kind x velocity table")
    _need(all(k in T for k in ("engine_kind", "engine_class", "vrel_edges", "vabs_edges", "kind", "velo_rel", "velo_abs")),
          path, f"{w} needs engine_kind, engine_class, vrel_edges, vabs_edges, kind, velo_rel, velo_abs")
    _need(all(k in T["engine_kind"] and k in T["engine_class"] for k in PV_KINDS), path, f"{w}: every engine kind mapped")
    classes = set(T["engine_class"].values())
    _need(len(T["vrel_edges"]) == 4 and all(len(T["vabs_edges"].get(c, ())) == 4 for c in classes), path, f"{w}: 4 edges each")
    for c in T_COUNTS:
        _need(all(six(T["kind"].get(c, {}).get(k)) for k in set(T["engine_kind"].values())), path, f"{w}.kind needs count > kind > 6")
        for term in ("velo_rel", "velo_abs"):
            _need(all(isinstance(T[term].get(c, {}).get(cl), list) and len(T[term][c][cl]) == 6 and all(map(six, T[term][c][cl]))
                      for cl in classes), path, f"{w}.{term} needs count > class > 6 bins > 6")


def load_table(kind, version=None):
    path = table_path(kind, version)
    with open(path, encoding="utf8") as f:
        t = _json.load(f)
    _need(t.get("kind") == kind, path, f"is a {t.get('kind')} table, not {kind}")
    return check_table(t, path)


TABLES = {k: load_table(k) for k in TABLE_DEFAULT}
TABLE_VERSIONS = {k: t["version"] for k, t in TABLES.items()}

_RUN_T = TABLES["run"]["levels"]
RE_BY_LEVEL = {lv: {(int(k[0]), k[2:]): v for k, v in L["re"].items()} for lv, L in _RUN_T.items()}
CV_BY_LEVEL = {lv: {(int(k[0]), int(k[2])): v for k, v in L["cv"].items()} for lv, L in _RUN_T.items()}
for _t in (RE_BY_LEVEL, CV_BY_LEVEL):
    _t["college"] = _t["college_d1"]   # 'college' = D1 by default
try:   # v0.6: in-play tables refit to each level's real hit mix (calib.py)
    from outcome_params import IN_PLAY_FIT
    IN_PLAY_BY_LEVEL.update(IN_PLAY_FIT)
except ImportError:
    pass

# ---------------------------------------------------------------------------
# One engine, v0.9 (Drew, Nov 6): no flags. Every term that used to sit behind a flag is either in (its v0.9 setting) or
# gone. The v0.9 golden (golden/golden_v09.py, made from the flagged engine running v0.9) proves the behavior is
# unchanged. The guardrail is on (docs/FOLLOWUPS_v0.9_REPORT.md); inside is on by Drew's call (docs/STEP4b_v0.9_REPORT.md).
# ---------------------------------------------------------------------------


# v0.8 parameters (docs/SPEC_v0.8.md). Starting values; seq_fit.py replaces the fitted ones (fit_v08.json).
P08 = dict(
    sit_tW=1.5, sit_hW=0.75, sit_tH=1.0, sit_hH=0.5, sit_tS=0.3, sit_hS=0.15,     # 2.2 sit effects (type, height)
    alpha=0.4, lam=0.6,                                                            # 2.6 look
    beta_T=0.5, gamma_T=0.3, dead=0.03, ramp=0.05, ch_hi=0.12, ch_decay=0.08, fast_mult=0.6,   # 3.1-3.2 timing
    capW=1.6, capH=1.2,                                                            # 3.4
    beta_E=0.25, beta_E_S=0.25, dstar_E=1.5, beta_tun_whiff=0.15, beta_tun_chase=0.15, kappa_brk=1.5,         # 4.1-4.2 (A3: W and S fit separately)
    rep_whiff_same=0.16, rep_whiff_other=0.12, rep_same_spot=-0.32,                # 4.3
    phi_FB=0.058, phi_OS=0.116, fam_cap=0.5,                                       # 5
    crowd=0.3,                                                                     # 2.8
    kv=0.5, kv_cap=4.0, kg=0.25, kg_cap=1.0,                                       # 8.1
    g_c=0.25, g_w=0.25, g_d=0.25,                                                  # 8.2
)
TYPED = dict(beta_y=-0.8, gamma={"weak": 0.3, "solid": 0.0, "hard": -0.3},       # 7.3 batted-ball types
             nongb={"weak": (0.10, 0.40, 0.50), "solid": (0.45, 0.45, 0.10), "hard": (0.45, 0.55, 0.0)},
             dp={"weak": 0.30, "solid": 0.20, "hard": 0.10}, gb_infield_in=0.10, gb_babip_in=0.08, r2_to_3rd={"GB": 0.50, "FB": 0.25},
             # v1.0 #16: MLB ground-ball rate by pitch, 2024 Statcast (fit_v08.json results.gb_types; _apply_fit loads
             # the exact values, these are the same to 4 places for a tree without the json)
             gb={"4-seam": 0.3400, "sink": 0.5558, "cut": 0.4124, "SL": 0.3969, "CB": 0.4343, "CH": 0.4940})
RHO_L = {"hs": 0.6, "travel": 0.6}            # 3.2 level scaling of MLB-fitted behavioral effects (others 1.0). v1.0 #19, one
# rule: every term fitted on MLB hitter behavior scales by it (timing, eye level, tunneling, familiarity, matchup memory,
# SIDE, POWER_HR); structural terms (count kappa, beta_y, ground-ball rates) and the unfitted repeat guesses do not.
# v1.3 (plan 3.5): college D2 takes the college default, 1.0, like D1 and D3 (a rule, not a D3 number to replace).
# v0.9 item 6, fitted in Step 3 (readthrough/step3_fits.py, results/step3): whiff | swing on a pitch class
# rises with the whiffs and called strikes that class got from this hitter in earlier trips today (M1, capped at 4), and
# falls after he hit that class hard at that spot in an earlier trip (M2, capped at 2), scaled by RHO_L. Their hard-contact
# effects did not ship. v1.0 #7 (readthrough/v10_memory_fit.py, results/v10/memory_fit.txt): MM is the one owner of
# in-game hitter memory. Refit with R5's in-game damage as a control, both still ship (M1 +0.079, +4.4 sd; M2 -0.240,
# +2.6 sd) and damage adds nothing that ships on top of them, so R5 damage reads only the cross-game seed (no in-game
# updates feed the engine) and MM keeps its values fitted without that control (0.107, -0.346: the effect MM carries
# alone). Each part has its own cap; the shared familiarity clip on their sum is gone. M2's earlier hard hits are
# keyed on the logged landing spot when the catcher logged one (as fitted), else the called target.
MM = dict(succ=0.131, succ_cap=4, hard=-0.341, hard_cap=2)

# v0.9 item 3, widened, fitted in Step 5 (readthrough/step5_inside_fit.py, results/step5): on and near the
# plate (heart and edge), MLB pitches on the inner half play differently from the outer half at the same height: an
# elevated fastball inside gets far less hard contact, fewer whiffs and more swings, and so on by class, height and
# platoon side. Each value is the fitted inside-minus-away logit difference (0 where it did not ship); a target on the
# inner half gets +half of it and one on the outer half -half, so the in/away average the outcome model was calibrated
# on is unchanged. Scaled by RHO_L (HS and travel 0.6) like the other MLB-fitted terms.
SIDE = {"hard": {"FB|up|same": -0.736, "FB|up|opp": -0.972, "FB|down|same": 0.052, "FB|down|opp": -0.082, "OS|up|same": -0.069, "OS|up|opp": -0.452, "OS|down|same": 0.553, "OS|down|opp": 0.353}, "whiff": {"FB|up|same": -0.535, "FB|up|opp": -0.361, "FB|down|same": -0.8, "FB|down|opp": -0.602, "OS|up|same": -0.901, "OS|up|opp": -0.747, "OS|down|same": -0.337, "OS|down|opp": 0.2}, "swing": {"FB|up|same": 1.086, "FB|up|opp": 0.61, "FB|down|same": 0.545, "FB|down|opp": -0.042, "OS|up|same": -0.379, "OS|up|opp": -0.339, "OS|down|same": 0.262, "OS|down|opp": 0.382}}


# v0.9 item 8, fitted in Step 4b (readthrough/step4b_power_hr.py, results/step4b/power_hr.txt): a power
# hitter's hard contact leaves the park more often, +0.112 logits on HR | hard ball in play per SD of power (P3; power x
# zone and the HR effect x heart did not ship). v1.0 #11/#28: one power-grade point = one SD of hitters' hard-hit share
# (0.0518, fit_hitter_spread.py's g_w target), so the fitted per-SD effect applies as is. The extra home runs come out of
# that type's outs.
# v1.3 (Drew's ruling 8): one power point = HARD_SD = 0.0728, the hitter talent SD with luck removed
# (hitter_data/hard_talent_sd.py); the refit's 0.177 per SD of its own power measure (0.0657) is restated per HARD_SD.
POWER_HR = 0.196


def power_hr_shift(s, gr):
    """Logit shift on HR given hard contact for the hitter's power grade (0 at grade 3)."""
    return RHO_L.get(s.level, 1.0) * POWER_HR * (gr.get("w", 3) - 3)


def side_shift(p, q, s, z, what):
    """Logit shift for 'swing' / 'whiff' / 'hard' at target q, landing band z (heart and edge only)."""
    if z not in ("heart", "edge") or q in ("middle", "chase", "down-middle"):     # no side: over the plate
        return 0.0
    h, side = q.split("-")
    b = SIDE[what][("OS" if is_offspeed(p.kind) else "FB") + "|" + h + "|" + ("same" if s.same_side else "opp")]
    return RHO_L.get(s.level, 1.0) * (0.5 if side == "in" else -0.5) * b


def matchup_whiff(p, q, s):
    """Logit shift on whiff | swing from earlier trips (s.matchup: 'succ|KIND' and 'hard|KIND|target' -> counts)."""
    m = s.matchup
    if not m:
        return 0.0
    x = MM["succ"] * min(MM["succ_cap"], m.get("succ|" + key_kind(p.kind), 0)) + \
        MM["hard"] * min(MM["hard_cap"], m.get("hard|" + key_kind(p.kind) + "|" + q, 0))      # v1.0 #7: separate caps, no shared clip
    return RHO_L.get(s.level, 1.0) * x
# v1.0 D3 (Drew's coach rule, Nov 5/9): a pitch type hit hard twice at one height in his earlier trips today is not gone
# back to. A coaching RULE, not a fit: a named soft cost (runs x run_scale) added in cost08, separate from the fitted MM
# logits, read from the same s.matchup counts. Soft so the pitch is still called when it is clearly the best one.
MASHED_N = 2
MASHED_PENALTY = 0.015


def target_height(q, kind):
    """up / middle / down for target q (HEIGHTS; fastball chase is up, off-speed chase is down)."""
    if q == "middle":
        return "middle"
    return "up" if (q.startswith("up") or (q == "chase" and is_fastball(kind))) else "down"


def mashed(p, q, s):
    """D3: his earlier trips today put this pitch type in play hard MASHED_N+ times at this target's height."""
    m = s.matchup
    if not m:
        return False
    h = target_height(q, p.kind)
    return sum(m.get("hard|" + key_kind(p.kind) + "|" + x, 0) for x in QUADS if target_height(x, p.kind) == h) >= MASHED_N


# v1.0 Step 7 (Drew, Nov 11): the coach's ground-ball rule. With a double play on (runner on 1st, fewer than 2 outs) or a
# runner on 3rd with fewer than 2 outs, and fewer than 3 balls and 2 strikes, a down target in the zone gets a soft
# credit (runs x run_scale) in cost08. A RULE, not a fit: the run math alone keeps the middle on top in these spots
# (aiming low adds ~6 points of balls, and a weak grounder is worse than a weak pop-up), and Drew wants a coach's
# "get a ground ball" call there. With three balls the goal is a strike, with two strikes the strikeout.
GB_RULE_BONUS = 0.005
GB_RULE_TARGETS = ("down-in", "down-away", "down-middle")


# v1.0 Step 7 (Drew, Nov 11, the read-through's second pass): coaching reads that the fitted terms only nudge, each a
# named soft credit (runs x run_scale) in cost08 like the ground-ball rule. RULES, not fits: Drew graded the calls a
# great pitching coach would make, and the fitted terms left these at 0-27% of calls. Each is sized on its read-through
# row (smallest size that passes it) with every other row checked. Positive = the call gets cheaper.
#   late_fb     he's late on the fastball (timing >= READ_T): fastball up or in, where a late bat can't get to it (F6)
#   early_os    he's out front on off-speed (timing <= -READ_T): stay soft and down (F7)
#   crowd       he crowds the plate: fastball in (H4)
#   squared_up  last pitch fouled straight back (he was on it): not that pitch at that spot again (F5; a cost)
#   away        he hit this pitch hard on one side earlier today: the same pitch to the other side (H3)
#   went_back   this pitch got a swing-and-miss or called strike at this spot earlier today: go back to it (I2)
#   hot         the pitch is landing clearly better than his normal today: lean on it (C5)
#   plus_opp    to an opposite-side hitter, a plus changeup (grade 4+) away and a plus slider at the back foot (J7)
# Sizes (runs before run_scale), each the smallest round size that passes its row with room (share of acceptable calls
# on its row at the size: F6 84%, F7 79%, H4 87%, F5 0% not-acceptable, H3 77%, I2 80%, C5 76%, J7 82%; all 71 rows pass).
# v1.1 Step 2: "away" 0.01 -> 0.012. Under the profile terms (the fastball's inside / away lines by batter side) 0.01
# moved its calls 19.9 points, just short of Drew's 20; 0.012 moves them 23.
COACH_RULE = {"late_fb": 0.027, "early_os": 0.02, "crowd": 0.03, "squared_up": 0.005, "away": 0.012, "went_back": 0.03,
              "hot": 0.03, "plus_opp": 0.015, "ride_up_2k": 0.003}
# v1.3 (Drew's ruling 5, Nov 21): ride_up_2k 0.008 -> 0.003, the smallest size that passes every graded row on the refit
# engine (C5 78% acceptable, E7 passes, S7f's climb-the-ladder floor holds); the 36% cap (tests_v11 Q4) is unchanged.
READ_T = 0.2           # the app labels a hitter "late on"/"early on" a pitch class from |timing| 0.2
HOT_EST = 0.10         # landing better than his normal by this much (the not-landing rule's shrinkage), at least LAND_BLOCK_N thrown
SIDE_TARGETS = {"in": ("up-in", "down-in"), "away": ("up-away", "down-away")}

# ---------------------------------------------------------------------------
# v1.2 Part B: hitter tags (plan 2.8). A tag is the top / bottom third of the trait among hitters at his level (+1 / -1);
# unknown = 0 = no effect. Fitted on MLB Statcast (research_v12/hitter_fits.py -> results/v12/hitter_fits.json): traits from
# 2024 -> 2025 pitches to fit, 2025 traits -> 2026 pitches held out, shipped where the held-out gain beat 2 bootstrap SD,
# each net of the hitter's own general rate (the grades / damage memory carry that) and the pitch's height / zone / count.
#   approach (ships, gain 91.7 vs SD 14.0): in-zone swing at 0-0, 1-0 and 0-1, logit per tag step
#   spray    shipped narrowly (hard 8.5 vs 4.1, grounders 21.6 vs 5.2) but the opposite way to the coaching read (a
#            pull-heavy hitter hit pitches away harder); Drew (Nov 13): dropped, not in the engine or the tags.
# Behavioral, so x RHO_L at HS / travel like every MLB-fitted term.
#   path     (doesn't ship: held-out gains -1.3 / -0.3 / +0.3 against SD 0.8 / 2.6 / 0.6): a named COACH RULE instead, in
#            coach_credit: a flat swing makes the fastball up costlier; a lift swing makes the off-speed pitch down costlier.
#            Sized on proposed rows H1 / H2 (research_v12/hitter_sizes.py); shrinks as his spot memory builds (10 / (n + 10)).
#   offspeed (doesn't ship, persistence 0.03-0.10; Q7): a small coach-set prior on his off-speed damage seed, N0
#            pseudo-pitches at score HIT_OS_PRIOR, which real off-speed evidence outweighs.
HIT_FIT = {"approach": 0.224}
HIT_PATH_RULE = 0.003
HIT_OS_PRIOR, HIT_OS_N0 = 0.3, 3.0
HIT_TAG_VALUES = {"approach": {"aggressive": 1, "patient": -1}, "path": {"lift": 1, "flat": -1}, "offspeed": {"hits": 1}}
EARLY_COUNTS = ((0, 0), (1, 0), (0, 1))


def hit_tag(s, key):
    """+1 / -1 / 0 for one of the coach's hitter tags (0 = unknown or not set)"""
    t = s.hitter_tags
    return HIT_TAG_VALUES[key].get(t.get(key), 0) if t else 0



# v1.1 (FINDING_v1.0_game_mix_collapse, Nov 12): "lean on it" wears off once he has leaned. In a game, a hot pitch gets
# called more, which keeps it hot, and the flat credit (3x the mix temperature) pushed every other pitch out: the v1.0 app
# threw 75-95% of one pitch over 82 pitches of random results. The read keeps its full size until this pitch's share of
# today's pitches is HOT_FADE[0] times its normal share (its class's half of the pitches, split evenly; the count prior's
# shape), then fades to nothing at HOT_FADE[1] times it (v1.2: a ratio, so an off-speed pitch with a 25% share fades
# from 30% to 40%, a lone fastball from 60% to 80%). Today's pitches = the larger of the pitch count and the landing record.
HOT_FADE = (1.2, 1.6)   # v1.2 Step 5 (L6): by ratio to the normal share (v1.1: +0.10 to +0.40 over it, in points)


def hot_fade(p, s, arsenal):
    lt = s.landing_today or {}
    if not arsenal or p.name not in lt:
        return 1.0
    ns = {x.name: landing_triple(x, lt[x.name])[-1] for x in arsenal if x.name in lt}
    total = max(s.pitch_count, sum(ns.values()))
    if total <= 0:
        return 1.0
    fbs = sum(1 for x in arsenal if is_fastball(x.kind))
    oss = len(arsenal) - fbs
    base = (0.5 / fbs if is_fastball(p.kind) else 0.5 / oss) if fbs and oss else 1.0 / len(arsenal)
    ratio = ns.get(p.name, 0) / total / base
    return min(1.0, max(0.0, 1.0 - (ratio - HOT_FADE[0]) / (HOT_FADE[1] - HOT_FADE[0])))


def landing_hot(p, s):
    ev = landing_triple(p, s.landing_today.get(p.name)) if s.landing_today else None
    if not ev or ev[-1] < LAND_BLOCK_N:
        return False
    st, ex, n = ev
    return (st - ex) / (LAND_BLOCK_K + n) >= HOT_EST


# ---------------------------------------------------------------------------
# v1.1 Step 3: at-bat setup and payoff rules (plan 2.4; research doc Part 3). Only the payoff pitch gets credit, only after
# the setup pitch was actually thrown in this at-bat, and only at the root (s.pa_log is empty in every table solve), so a
# setup pitch never gains from a credit (E5). Each rule needs its setup pattern in pa_log and five checks: the setup landed
# near its target; he didn't square it up; the payoff pitch is live (trusted, not shaken off, not "not landing"); the
# count allows it (no credit at three balls; chase payoffs only where targets() has a chase); the arsenal has the
# profiles the rule names. Sizes in runs before run_scale (like COACH_RULE): the smallest round value that passes the
# rule's rows on top of what the engine already gives the call (Step 3 rows; Drew grades them at Step 4). The Statcast
# direction checks (setup_checks.py, results/v11/step3_checks.txt) and the plan's decision rule: S8, S10 and N1 point the
# wrong way with intervals excluding 0 and are not built unless Drew keeps them; N2 points the right way (sized from its
# fitted effect); the rest have intervals that include 0 and get the smallest size that passes their rows; S1 is kept
# by O2 at its smallest size although its chase check points the wrong way; S7's whiff and chase checks disagree.
# ---------------------------------------------------------------------------
# sized by readthrough/setup_sizes.py on the Step 3 rows (results/v11/step3_sizes.json): the smallest grid size that lifts
# the payoff 5+ points on its fire row (N2: the sinker down 3+) with the fire and no-fire rows passing. PROVISIONAL until
# Drew grades the rows (they are Claude's proposals, Nov 12).
# v1.1 Step 4 (Drew, Nov 13: "lower all sizes"): every Step 3 size halved. Credits alone then change the top call on
# 8-11% of pitches after a qualifying setup (three staffs); below half the rate stops falling (near-tie flips).
# v1.2 Step 5 (L7): S4 narrowed, then S2 / S4 / S5 resized after the location model: the smallest size that lifts each
# one's fire row 5+ points (research_v12/step5_setups.py -> results/v12/step5_setups.json: S2 0.004, S4 0.005, S5 0.004),
# checked against the 2-10% credit-only change band on three staffs (readthrough/setup_game_check.py, 10 games each). With
# all three at those sizes the rate was 17-22% (S4 and S2 drove it); S2 and S4 can't lift their rows and stay in the band,
# so they're dropped (size 0; their code stays). S5 at 0.004 kept the band (4.9% / 3.5% / 10.0%) but 2 of game_mix_e2e's 21
# games went over 70% of one pitch; Drew (Nov 13): drop S5 too (size 0; code and its lean gate stay).
SETUP_RULE = {"S1": 0.002, "S2": 0.0, "S3": 0.003, "S4": 0.0, "S5": 0.0, "S6": 0.004, "S7": 0.005, "S9": 0.001, "N2": 0.001}
SETUP_CAP = 0.02            # setup credit <= 0.02 x run scale; coach + setup <= max(coach, 0.02 x run scale)
UPS, DOWNS, INS, AWAYS = ("up-in", "up-away"), ("down-in", "down-away", "down-middle"), ("up-in", "down-in"), ("up-away", "down-away")
STRIKE_RES = ("cstrike", "whiff", "foul")
S4_GAP = 8.0                # v1.2 Step 5 (L7): S4's payoff is 8+ mph slower than the fastball away
SETUP_TEXT = {"S1": "up, then down", "S2": "in, then away", "S3": "hard in, soft away", "S4": "same lane, slower",
              "S5": "front door / back door", "S6": "stole strike one", "S7": "climb the ladder", "S9": "expand off the edge"}


def _pitch_by(arsenal, name):
    return next((x for x in arsenal if x.name == name), None)


def landed_near(e, kind):
    """check 1: a logged cell in or next to the target's area; way off fails; nothing logged: a called strike, whiff or
    foul passes and a ball fails (a ball of unknown location may have been a wild miss)"""
    name, q, res, landed = e[0], e[1], e[2], e[3]
    if landed == "way":
        return False
    if landed is None:
        return res in STRIKE_RES
    r, c, br = landed
    if not (0 <= r <= 4 and 0 <= c <= 4):      # v1.2: a directional "Way off" cell sits outside the grid: way off
        return False
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            rr, cc = r + dr, c + dc
            if 0 <= rr <= 4 and 0 <= cc <= 4 and loc_quad((rr, cc), kind, br) == q:
                return True
    return False


def squared_up_entry(e):
    """check 2: he was on it: fouled straight back, or hit hard"""
    return (e[2] == "foul" and e[5] == "back") or e[4] == "hard"


def on_time_or_early(e):
    """the read rule for S2, S3 and S7 (plan 2.4): a pulled foul, a straight-back foul or an out-in-front whiff means on
    time or early (no fire); a foul with no read is unknown (no fire); a called strike, a whiff with no read or a late /
    fooled whiff passes; a ball passes on its landing (check 1)"""
    res, rd = e[2], e[5]
    if res == "foul":
        return rd != "opposite"
    if res == "whiff":
        return rd == "front"
    return res == "play"


def pa_counts(pa_log):
    """the count before each logged pitch of this at-bat"""
    b = k = 0
    out = []
    for e in pa_log:
        out.append((b, k))
        if e[2] == "ball":
            b += 1
        elif e[2] in ("cstrike", "whiff") or (e[2] == "foul" and k < 2):
            k += 1
    return out


def _fb_rides(x):
    return x is not None and ((x.kind == "FB" and x.shape == "rides") or (x.kind == "FC" and x.shape == "ride"))


def setup_payoff(p, q, s, arsenal):
    """(credit, rule, setup entry) for the call (p, q): the rule with the largest credit whose setup is in this at-bat and
    whose checks pass (N2 is a cost: negative credit). (0.0, None, None) when none applies."""
    if not s.pa_log or s.balls >= 3 or q not in targets(s.balls, s.strikes):
        return 0.0, None, None
    if p not in candidates(arsenal, s) or not_landing(p, s):          # check 3 (a shaken-off pitch is never a candidate call)
        return 0.0, None, None
    log, counts = s.pa_log, pa_counts(s.pa_log)
    same, two_k = s.same_side, s.strikes == 2
    best = (0.0, None, None)
    os_low = q in ("down-in", "down-away", "down-middle", "chase")

    def offer(rule, e):
        nonlocal best
        v = SETUP_RULE.get(rule, 0.0)
        if v > best[0]:
            best = (v, rule, e)
    for i, e in enumerate(log):
        x = _pitch_by(arsenal, e[0])
        if x is None or squared_up_entry(e) or not landed_near(e, x.kind):       # checks 1, 2 (and 5 for the setup pitch)
            continue
        last = i == len(log) - 1
        # S1 up, then down: riding fastball (or ride cutter) up for a strike -> 12-6 / power curve or drop / split change low
        if (_fb_rides(x) and e[1] in UPS and e[2] in STRIKE_RES and (s.balls, s.strikes) in ((0, 1), (1, 1), (0, 2), (1, 2), (2, 2))
                and os_low and ((p.kind == "CB" and p.shape in ("12-6", "power")) or (p.kind == "CH" and p.shape in ("drop", "split")))):
            offer("S1", e)
        # S2 in, then away, same-side hitter: sinker / running fastball inside -> slider down-away
        if (same and ((x.kind == "SI") or (x.kind == "FB" and x.shape == "runs")) and e[1] in INS and not on_time_or_early(e)
                and p.kind == "SL" and q in ("down-away", "chase")):
            offer("S2", e)
        # S3 hard in, soft away, opposite-side hitter: hard cutter / fastball inside -> fade / split / typical change away
        if (not same and ((x.kind == "FC" and x.shape == "hard") or x.kind == "FB") and e[1] in INS and not on_time_or_early(e)
                and p.kind == "CH" and p.shape in ("fade", "split", "") and q in ("down-away", "chase")):
            offer("S3", e)
        # S4 same lane, slower: fastball away for a strike, the previous pitch -> changeup (not firm) / curve away and low,
        # 8+ mph slower (v1.2 Step 5, L7: narrowed from any fastball away and a 6 mph changeup gap)
        if (last and is_fastball(x.kind) and x.kind != "FC" and e[1] in AWAYS and e[2] in STRIKE_RES and q in ("down-away", "chase")
                and ((p.kind == "CH" and p.shape != "firm") or p.kind == "CB") and x.mph() - p.mph() >= S4_GAP
                and s.timing.get("OS", 0.0) > -READ_T):
            offer("S4", e)
        # S6 steal strike one: a first-pitch curve / gyro slider called strike -> fastball at 0-1, any strike target
        if (last and i == 0 and e[2] == "cstrike" and (x.kind == "CB" or (x.kind == "SL" and x.shape == "gyro"))
                and (s.balls, s.strikes) == (0, 1) and is_fastball(p.kind) and q != "chase"):
            offer("S6", e)
        # S7 climb the ladder: riding fastball up, a late swing (whiff not out in front, or an opposite-way foul) -> the
        # riding fastball above the zone (its chase target), two strikes
        if (two_k and _fb_rides(x) and e[1] in UPS and e[2] in ("whiff", "foul") and not on_time_or_early(e)
                and _fb_rides(p) and q == "chase"):
            offer("S7", e)
        # S9 work the edge, then expand off it: an early-count fastball / cutter on an edge -> with two strikes, a cutter or
        # slider to the same side (a cutter in after the inside edge; a slider away / chase after the outside edge)
        if (two_k and counts[i][1] < 2 and is_fastball(x.kind) and x.kind != "SI" and e[1] in INS + AWAYS):
            side_in = e[1] in INS
            if (side_in and p.kind == "FC" and q in INS) or (not side_in and p.kind in ("SL", "FC") and q in AWAYS + ("chase",)):
                offer("S9", e)
        # S5 front door / back door, two strikes only: command 4+, the payoff landing, and he was worked away / expanded with
        # soft stuff earlier: the run sinker in to an opposite-side hitter, or a breaking ball / cutter back over the outer edge
        if (two_k and p.command >= 4 and not same and is_offspeed(x.kind) and e[1] in AWAYS + ("chase",)
                and ((p.kind == "SI" and q in INS) or (p.kind in ("SL", "CB", "FC") and q in AWAYS))):
            offer("S5", e)
    credit, rule, ent = best
    # N2 (anti-setup): a sinker right after a changeup
    if p.kind == "SI" and log[-1][0] and (_pitch_by(arsenal, log[-1][0]) or p).kind == "CH":
        n2 = SETUP_RULE.get("N2", 0.0)
        if n2:
            credit, rule, ent = (credit - n2, rule or "N2", ent if rule else log[-1])
    return min(credit, SETUP_CAP), rule, ent


def coach_credit(p, q, s, arsenal=None):
    """Sum of the coaching-read credits for call (p, q) in situation s (runs, before run_scale). arsenal: for the hot
    read's fade (without it, the read is at full size)."""
    R, c = COACH_RULE, 0.0
    fb = is_fastball(p.kind)
    tm = s.timing or {}
    if fb and tm.get("FB", 0.0) >= READ_T and q in ("up-in", "up-away", "down-in"):
        c += R["late_fb"]
    if not fb and tm.get("OS", 0.0) <= -READ_T and q in ("down-in", "down-away", "down-middle", "chase"):
        c += R["early_os"]
    if fb and s.crowding and q in SIDE_TARGETS["in"]:
        c += R["crowd"]
    if s.last and len(s.last) > 3 and s.last[3] == "back" and s.last[0] == p.name and s.last[1] == q:
        c -= R["squared_up"]
    m = s.matchup
    if m:
        for side, other in (("in", "away"), ("away", "in")):
            if q in SIDE_TARGETS[other] and any(m.get(f"hard|{key_kind(p.kind)}|{x}", 0) for x in SIDE_TARGETS[side]):
                c += R["away"]
        if m.get(f"succ|{key_kind(p.kind)}|{q}", 0):
            c += R["went_back"]
    if s.landing_today and landing_hot(p, s):
        c += R["hot"] * hot_fade(p, s, arsenal)
    if not s.same_side and p.grade >= 4 and ((p.kind == "CH" and q in ("down-away", "chase")) or (p.kind == "SL" and q == "down-in")):
        c += R["plus_opp"]
    if ride_up_2k(p, q, s):
        c += R["ride_up_2k"] * RHO_L.get(s.level, 1.0)   # v1.2 Step 5 (Q5): x RHO_L at HS / travel, like every MLB-sized term
    c -= path_cost(p, q, s)
    return c


def path_cost(p, q, s):
    """v1.2 Part B swing-path coach rule (the data didn't ship it): flat swing -> the fastball up costs HIT_PATH_RULE; lift
    swing -> the off-speed pitch down (and its chase) costs it. Shrinks as his memory at that class and spot builds
    (10 / (n + 10)), x RHO_L at HS / travel."""
    t = hit_tag(s, "path")
    if not t:
        return 0.0
    if t < 0 and is_fastball(p.kind) and q in ("up-in", "up-away"):
        pass
    elif t > 0 and is_offspeed(p.kind) and q in ("down-in", "down-away", "down-middle", "chase"):
        pass
    else:
        return 0.0
    n = (s.hitter_damage.get(key_kind(p.kind) + "|" + q) or (0, 0))[1]
    return HIT_PATH_RULE * RHO_L.get(s.level, 1.0) * 10.0 / (n + 10.0)


def ride_up_2k(p, q, s):
    """v1.1 Step 4 (Drew, Nov 13): "it's a strikeout pitch, also can be a setup pitch, but we can't overly lean on it." The
    data give the riding four-seam no extra edge up beyond its ride (Step 2, row C5), so this is a coaching rule: a small
    credit for a riding four-seam aimed up with two strikes (up-in, up-away, or its chase above the zone), never at three
    balls. Sized to the smallest value that passes C5; its share of two-strike calls is checked on the grid (tests.py)."""
    return p.kind == "FB" and p.shape == "rides" and s.strikes == 2 and s.balls < 3 and q in ("up-in", "up-away", "chase")


def ground_ball_spot(s):
    b1, _, b3 = s.bases
    return s.outs < 2 and (b1 or b3) and s.balls < 3 and s.strikes < 2


Y_TARGET = {"up-in": 3.2, "up-away": 3.2, "middle": 2.5, "down-in": 1.8, "down-away": 1.8, "down-middle": 1.8}
HEIGHTS = ("up", "middle", "down")   # amendment A1: middle is its own sit option (spec had up/down with middle = half)


def y_target(q, kind):
    """2.6 target height in ft (chase depends on pitch class)."""
    if q == "chase":
        return 1.2 if kind in ("SL", "CB", "CH") else 3.8
    return Y_TARGET[q]


def height_member(q, kind, j):
    """2.1 (amendment A1) target q's height option: up-in, up-away, fastball chase -> up; middle -> middle;
    down-in, down-away, off-speed chase -> down."""
    if q == "middle":
        h = "middle"
    elif q.startswith("up") or (q == "chase" and is_fastball(kind)):
        h = "up"
    else:
        h = "down"
    return 1.0 if h == j else 0.0


# ---------------------------------------------------------------------------
# State values
# ---------------------------------------------------------------------------

# Base-out run expectancy, MLB 2010-15 approx. Key: (outs, "123" occupancy)
RE24 = {
    (0, "000"): 0.481, (0, "100"): 0.859, (0, "020"): 1.100, (0, "120"): 1.437,
    (0, "003"): 1.350, (0, "103"): 1.784, (0, "023"): 1.964, (0, "123"): 2.292,
    (1, "000"): 0.254, (1, "100"): 0.509, (1, "020"): 0.664, (1, "120"): 0.884,
    (1, "003"): 0.950, (1, "103"): 1.130, (1, "023"): 1.376, (1, "123"): 1.541,
    (2, "000"): 0.098, (2, "100"): 0.224, (2, "020"): 0.319, (2, "120"): 0.429,
    (2, "003"): 0.353, (2, "103"): 0.478, (2, "023"): 0.580, (2, "123"): 0.752,
}

# Generic count value (MLB average), hitter's runs relative to 0-0. [R2] replaces this
# with values solved from the actual matchup when at_bat=True.
CV = {
    (0, 0): 0.000, (1, 0): 0.038, (2, 0): 0.104, (3, 0): 0.214,
    (0, 1): -0.044, (1, 1): -0.011, (2, 1): 0.049, (3, 1): 0.162,
    (0, 2): -0.106, (1, 2): -0.077, (2, 2): -0.039, (3, 2): 0.059,
}
COUNTS = list(CV.keys())


def bases_key(b1, b2, b3):
    return ("1" if b1 else "0") + ("2" if b2 else "0") + ("3" if b3 else "0")


def re(outs, bases, level="mlb"):
    return 0.0 if outs >= 3 else RE_BY_LEVEL[level][(outs, bases_key(*bases))]


# v1.3 (Drew's ruling 10, Nov 21): the run-scale denominator is pinned at v1.2's MLB RE[0|000] = 0.481 (the 2010-15
# table), not the refit MLB table's .503: a higher-scoring MLB in recent seasons is no reason for HS / college credits
# and randomness to shrink. Pinned until college run values exist; after that, college levels take no scale from MLB.
# RE_BY_LEVEL["mlb"] itself stays as fitted (used everywhere else). Same constant in app/engine.js.
RUN_SCALE_MLB_RE00 = 0.481
# v1.3 full data (ruling 10 takes effect, Drew Nov 22): the college levels' run values are now fit on their own
# play-by-play (run_v13core college_d1 / d2 / d3), so they take no scale from MLB: their run scale is 1 (the sizes are
# used in the level's own runs). The 0.481 pin stays for the levels without that (MLB itself, HS / travel). Same in
# app/engine.js.
RUN_SCALE_OWN = ("college", "college_d1", "college_d2", "college_d3")


def run_scale(level):
    """How big runs are at this level vs MLB (runs per inning from scratch). Randomness settings scale with it.
    College levels (own fitted run values, ruling 10): 1, no MLB scale."""
    if level in RUN_SCALE_OWN:
        return 1.0
    return RE_BY_LEVEL[level][(0, "000")] / RUN_SCALE_MLB_RE00


def V(balls, strikes, outs, bases, cv=None, level="mlb"):
    return re(outs, bases, level) + (cv or CV_BY_LEVEL[level])[(balls, strikes)]


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

# v1.0 Step 7 (Drew, Nov 11): "down-middle" is the coach's "keep it down": knee-high over the plate. It sits near one
# edge of the zone (the bottom) where a corner sits near two and the middle near none, so it misses between the two;
# it is as low as the down corners, so it gets their ground balls. Kept last so every older target keeps its place.
QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle", "down-middle"]
NO_CHASE = {(3, 0), (3, 1)}     # v0.7b coach rule W1 (Drew): never a chase target at 3-0 or 3-1


def targets(balls, strikes):
    """The targets the engine may call in this count. v0.8 (zone_22, Drew's rule): attack the zone at 2-2 too."""
    if (balls, strikes) in NO_CHASE or (balls, strikes) == (2, 2):
        return [q for q in QUADS if q != "chase"]
    return QUADS
ZONES = ["heart", "edge", "off", "noncomp"]

LEVEL = {  # c_L confidence weight, h_L hitter-read weight, confidence cutoff, fatigue start
    "hs": dict(cL=1.5, hL=0.5, cutoff=0.50, fatigue=60),
    "college": dict(cL=1.0, hL=1.0, cutoff=0.40, fatigue=80),        # run tables: D1
    "college_d1": dict(cL=1.0, hL=1.0, cutoff=0.40, fatigue=80),
    "college_d3": dict(cL=1.2, hL=0.8, cutoff=0.45, fatigue=75),
    "mlb": dict(cL=1.0, hL=1.0, cutoff=0.40, fatigue=90),
}

# v0.6: league environment by level, fitted to real rates (calib.py). Logit shifts, 0 = baseline.
#   cmd  effective command offset (1-5 scale)   zsw/osw  swing shift in / out of the zone
#   wz/wo  whiff shift in / out of the zone      cs  called-strike shift on the edges
#   hbp  share of way-off taken pitches that hit the batter (scaled by location)
#   wild  level wildness: share of in-zone landing mass that misses off the plate instead
OUTCOME_ADJ = {lvl: dict(cmd=0.0, zsw=0.0, osw=0.0, wz=0.0, wo=0.0, cs=0.0, hbp=0.0, wild=0.0)
               for lvl in ("hs", "college", "college_d1", "college_d2", "college_d3", "mlb")}   # v1.3 full data: D2 own fit
HBP_LOC = {"up-in": 1.6, "down-in": 1.6, "chase": 0.8, "middle": 0.5, "up-away": 0.3, "down-away": 0.3,
           "down-middle": 0.5}     # down-middle: over the plate, like middle
try:
    from outcome_params import OUTCOME_FIT
    for _lvl, _d in OUTCOME_FIT.items():
        OUTCOME_ADJ[_lvl].update(_d)
except ImportError:
    pass
try:   # v0.7: one grade point = one SD of real pitchers at the level (fit_spread.py); absent = scale 1, the v0.6 engine
    from spread_params import SPREAD_FIT
    for _lvl, _d in SPREAD_FIT.items():
        for _l in ([_lvl, "college"] if _lvl == "college_d1" else [_lvl]):
            LEVEL[_l]["cmd_scale"] = _d["cmd_scale"]; LEVEL[_l]["stuff_scale"] = _d["stuff_scale"]
            if _d.get("cmd_whiff"):
                LEVEL[_l]["cmd_whiff"] = _d["cmd_whiff"]
except ImportError:
    pass


# [R7] Effective velocity: how much faster (+) or slower (-) a pitch looks by location.
# Up and in plays fastest, down and away slowest (Husband: ~3 mph per 6 in. lateral).
EV_ADJ = {"up-in": 3.0, "up-away": 0.0, "down-in": 0.0, "down-away": -3.0,
          "middle": 0.0, "chase": -3.0, "down-middle": -1.5}     # down-middle: the down half of the table, no side


def ev_adj(p, q):
    """v1.0 #10: the chase target is class-aware. A fastball chase is up (y_target 3.8 ft), so it plays fast like up-in
    (+3); an off-speed chase is below the zone (-3), which is what seq_fit.py's "chase" label meant when beta_T was fit."""
    if q == "chase":
        return -3.0 if is_offspeed(p.kind) else 3.0
    return EV_ADJ[q]


def hbp_loc(p, q):
    """v1.0 #10: a fastball chase is aimed above the zone, away from the batter's body, so its multiplier is the away
    spots' 0.3 (Drew, Nov 10: the plan's 0.5 left it hitting 1.3-1.4x as many batters as a middle fastball, because a
    chase target misses off the plate more; 0.3 puts it at ~0.85x middle). An off-speed chase in the dirt keeps 0.8."""
    if q == "chase":
        return 0.8 if is_offspeed(p.kind) else 0.3
    return HBP_LOC[q]


@dataclass
class Pitch:
    name: str
    kind: str          # FB, SI, FC, SL, CB, CH (v1.1)
    grade: int         # 1-5 stuff
    command: int       # 1-5
    conf: float        # 0-1 confidence today
    shape: str = ""    # e.g. "ride", "sweeper", "loopy"
    velo: float = 0.0  # mph; 0 = the profile's default speed (default_mph, v1.1 Step 1b)
    base_conf: float = -1.0   # bullpen feel; set from conf at creation
    # v0.4 tunneling. Leave 0/None to use the shape tag and arm slot.
    ivb: float = None          # induced vertical break, inches (measured)
    hb: float = None           # horizontal break, inches, + = arm side (measured)
    slot: str = "three-quarter"
    height_ft: float = 6.1
    release_offset_in: tuple = (0.0, 0.0)   # (side, height) vs his fastball slot; nonzero = tips the pitch
    # v0.7 personal traits (learned per pitcher; None/absent = the default engine, exactly as before)
    strike_rate: float = None  # his expected strike rate with this pitch (served by the learner); confidence news is scaled by it
    strike_ref: float = None   # v1.0 Step 3: the same model rate for an average (3/3) pitch at his level, served with it
    traits: dict = None        # situational effects and miss tendency, see TRAIT_KEYS
    type: str = None           # v1.1: the pitch's real name from the app ("Cutter", "12-6 curve"); used only to migrate
    main: bool = False         # v1.1: the coach's "main fastball" mark (primary_fb)
    fb_mph: float = None       # v1.1 Step 1b: his main fastball's entered speed in this arsenal (resolve_speeds); None = not set
    lean_x: float = 0.0        # v1.2: miss lean, inches, + = his arm side (- glove side); 0 = even (plan 2.1)
    lean_z: float = 0.0        # v1.2: miss lean, inches, + = up
    spread: float = 1.0        # v1.2: miss size vs what his command says (1 = as command says)

    def __post_init__(self):
        if self.base_conf < 0:
            self.base_conf = self.conf
        self.kind, self.shape = migrate_pitch(self.kind, self.shape, self.type)   # v1.1 Step 1: the one migration point

    def mph(self):
        if self.velo:
            return self.velo
        # v1.1 Step 1b: a pitch with no speed is his main fastball's entered speed less the profile's gap (plan 2.1:
        # everything off his own fastball); with no fastball speed entered, the default fastball (85) less the gap
        if self.fb_mph:
            return round(self.fb_mph - profile(self.kind, self.shape, PROFILE_LEVEL)[0], 1)
        return default_mph(self.kind, self.shape)


@dataclass
class Situation:
    balls: int
    strikes: int
    outs: int
    bases: tuple       # (on1, on2, on3)
    inning: int = 1
    margin: int = 0    # our runs minus theirs
    pitch_count: int = 0
    batters_faced: int = 0          # [R8] continuous decline, no third-time cliff
    level: str = "college_d3"          # v1.0 #27: same default as engine.js
    same_side: bool = True          # pitcher and hitter same handedness
    last: tuple = None              # (pitch name, quad[, result]) of previous pitch this AB
    hitter_seen: dict = field(default_factory=dict)       # pitch name -> times seen
    usage_this_count: dict = field(default_factory=dict)  # pitch name -> times thrown in this count today
    timing: dict = field(default_factory=dict)            # "FB"/"OS" -> -1 early .. +1 late
    hitter_damage: dict = field(default_factory=dict)     # [R5] key ("FB"/"OS" or "KIND|quad", v1.0 #21) -> (score -1..+1, n pitches)
    catcher_block: int = 3
    landing_today: dict = field(default_factory=dict)     # v1.0 Step 3: pitch name -> (strikes, expected strikes, pitches)
                                                          # today, this pitcher, non-chase targets only
    wild_true: dict = field(default_factory=dict)         # v0.6f: simulator truth only: a pitch's real off-day wildness
    # v0.8 inputs (all inert at their defaults, so v0.7c callers are unchanged)
    sit_sigma: dict = None          # hitter's sit mix {(pitch name, 'up'|'down'): prob}; set by the solver (2.3)
    look: tuple = None              # (v_hat mph, y_hat ft): what the hitter is tuned to (2.6)
    familiar: dict = field(default_factory=dict)          # class 'FB'/'OS' -> pitches seen from this pitcher in earlier PAs (5)
    crowding: bool = False          # coach flag: hitter crowds the plate (2.8)
    grades: dict = None             # hitter grades {'c','w','d'} 1..5 (8.2)
    ump_u: float = 0.0              # today's umpire shift on edge/off called strikes (7.5)
    radar: dict = field(default_factory=dict)             # pitch name -> today's measured speed (8.1)
    infield_in: bool = False        # coach input (7.3): runner on 3rd scores on a GB out only 10%
    win: dict = None                # 7.2 objective constants fixed at the PA start: omega, WE0, m0, margin0, and the WE lookup
    usage_by_call: dict = field(default_factory=dict)     # 2.3 (pitch name, target) -> times called in this count today
    b_h: dict = field(default_factory=dict)               # 2.5 hitter's lean per sit option (eta*s + in-at-bat evidence)
    steal: dict = None              # 7.4 {'a': per-pitch attempt chance, 'runner': 1 or 2, 't': time to plate or None}
    pitch_cap: int = 105            # 7.6
    home: bool = None               # 7.1 we're the home team (None: unknown, win objective off)
    sched_innings: int = None       # 7.1 scheduled innings (default 7 HS/travel, 9 otherwise)
    extras_runner: bool = False     # 7.1 runner on 2nd to start extra innings
    # v0.9 inputs (inert at their defaults)
    matchup: dict = field(default_factory=dict)           # item 6: earlier trips today, 'succ|KIND' / 'hard|KIND|target' -> n
    since_thrown: dict = field(default_factory=dict)      # v1.1: pitch name -> his pitches since he last threw it today
    # v1.1 Step 3: this at-bat's pitches so far, oldest first, each (pitch name, target, result, landed, contact, read):
    # result ball / cstrike / whiff / foul / play / hbp; landed None (not logged), "way" (way off) or (row, col, batter
    # right) of the app's 5x5 grid; contact weak / solid / hard or None; read None or the coach's read (whiff: front / late
    # / fooled; foul: pull / opposite / back), kept only at logging level 3+. Root only: tables never see it.
    pa_log: tuple = ()
    # v1.2 Part B: the coach's hitter tags {"approach": "aggressive"|"patient", "path": "lift"|"flat",
    # "offspeed": "hits"}; a missing key or None = unknown = average (no effect)
    hitter_tags: dict = None


# ---------------------------------------------------------------------------
# Confidence model (v0.3): good results can't run a pitch away from its bullpen feel
# ---------------------------------------------------------------------------

CONF_DELTA = {"ball": -0.02, "cstrike": 0.03, "whiff": 0.05, "hard": -0.08, "shakeoff": -0.05}
# v1.2.1 (Drew, Nov 14): a shake-off costs 0.05 (was 0.20). A shake is mostly about this hitter, count or sequence, not
# his feel for the pitch all game; the at-bat itself is handled by the shake list (a second shake is a hard switch).
CONF_CAP_ABOVE = 0.10      # at most +0.10 above bullpen feel
CONF_REGRESS = 0.15        # 15% back toward bullpen feel each new batter


def update_confidence(p, event):
    d = CONF_DELTA[event]
    if event == "whiff" and is_fastball(p.kind):
        d += 0.02                       # blowing a fastball by someone still counts extra
    if p.strike_rate is not None and p.strike_ref is not None:   # v0.7: news is measured against HIS usual strike rate,
        c = min(0.95, max(0.05, p.strike_ref))   # so a pitcher who is always wild doesn't sink all game. v1.0 Step 3: the
        q = min(0.95, max(0.05, p.strike_rate))  # average pitcher's rate comes from the same model (strike_ref), not the
                                                 # deleted LAND_CENTER, since the learner now serves rates on that scale
        if event == "ball":
            d *= (1 - c) / (1 - q)
        elif event in ("cstrike", "whiff"):
            d *= c / q
    p.conf = max(0.0, min(p.base_conf + CONF_CAP_ABOVE, 1.0, p.conf + d))


def regress_confidence(p):
    p.conf += CONF_REGRESS * (p.base_conf - p.conf)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def logit(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return log(p / (1 - p))


def sig(x):
    return 1 / (1 + exp(-x))


def is_offspeed(kind):
    return kind in ("SL", "CB", "CH")


# v1.1 Step 1: six kinds. Fastball class = four-seam, sinker, cutter. Every "fastball vs off-speed" decision reads
# is_fastball / pclass; every stored situation key that contains a kind (damage, matchup memory, coach reads) reads
# key_kind, so a sinker or cutter uses the same stored keys a v1.0 fastball did (matchup memory was fitted by class).
FASTBALL_KINDS = ("FB", "SI", "FC")


def is_fastball(kind):
    return kind in FASTBALL_KINDS


def pclass(kind):
    return "FB" if kind in FASTBALL_KINDS else "OS"


def key_kind(kind):
    return "FB" if kind in FASTBALL_KINDS else kind


# v1.1 Step 1: the one migration table (docs/PLAN_v1.1_2026-11-12.md, Step 1). Keyed on the pitch's real name (the app's
# stored `type`) when there is one, else on the v1.0 kind and tag. Idempotent: v1.1 kinds and tags pass through.
MIGRATE_BY_TYPE = {
    "Four-seam": ("FB", "rides"), "Two-seam": ("SI", "two-seam"), "Sinker": ("SI", "run"), "Cutter": ("FC", ""),
    "Slider": ("SL", "tight"), "Sweeper": ("SL", "sweeper"), "Slurve": ("SL", "slurve"), "Curveball": ("CB", ""),
    "Knuckle curve": ("CB", ""), "12-6 curve": ("CB", "12-6"), "Changeup": ("CH", "fade"),
    "Splitter": ("CH", "split"), "Forkball": ("CH", "split"),
}
# The v1.0 kind and tag each type was stored with (app/db.js at v1.0). A type migrates a pitch only while the pitch still
# carries exactly these, so a coach's later edit of a v1.1 pitch is never undone by its type.
V10_TYPE_TAGS = {
    "Four-seam": ("FB", "ride"), "Two-seam": ("FB", "run"), "Sinker": ("FB", "sink"), "Cutter": ("FB", "cut"),
    "Slider": ("SL", "tight"), "Sweeper": ("SL", "sweeper"), "Slurve": ("SL", ""), "Curveball": ("CB", "loopy"),
    "Knuckle curve": ("CB", "sharp"), "12-6 curve": ("CB", "sharp"), "Changeup": ("CH", "fade"),
    "Splitter": ("CH", "drop"), "Forkball": ("CH", "drop"),
}
# Without a type, "cut" and "run" may be a four-seamer's own movement, so they stay four-seam profiles; "sink" was only
# ever a sinker.
MIGRATE_BY_TAG = {
    ("FB", "ride"): ("FB", "rides"), ("FB", "run"): ("FB", "runs"), ("FB", "cut"): ("FB", "cuts"),
    ("FB", "sink"): ("SI", "run"), ("CB", "loopy"): ("CB", "slow"), ("CB", "sharp"): ("CB", "power"),
    # a v1.0 fastball tag that reaches a v1.1 sinker or cutter (a shape accepted from a v1.0 portal proposal) maps to that
    # kind's nearest tag instead of being rejected
    ("SI", "sink"): ("SI", "run"), ("SI", "ride"): ("SI", "two-seam"), ("SI", "cut"): ("SI", ""),
    ("FC", "cut"): ("FC", ""), ("FC", "run"): ("FC", ""), ("FC", "sink"): ("FC", ""),
}
SHAPE_TAGS = {
    "FB": ("rides", "runs", "cuts", "straight", ""), "SI": ("run", "drop", "two-seam", ""),
    "FC": ("hard", "big", "ride", ""), "SL": ("gyro", "tight", "sweeper", "slurve", ""),
    "CB": ("12-6", "sweeping", "power", "slow", ""), "CH": ("fade", "drop", "split", "firm", ""),
}


def migrate_pitch(kind, shape, type_=None):
    """(kind, shape) in v1.1 terms. A known type wins while the pitch still has that type's v1.0 tags; else the v1.0
    kind/tag map; anything else (every v1.1 kind and tag) passes through."""
    shape = shape or ""
    if type_ in MIGRATE_BY_TYPE and V10_TYPE_TAGS[type_] == (kind, shape):
        return MIGRATE_BY_TYPE[type_]
    return MIGRATE_BY_TAG.get((kind, shape), (kind, shape))


def is_big_spot(s):
    """Late and close with a runner in scoring position. v1.0 #8: "late" is the last three innings of the scheduled game
    (5th on in a 7-inning HS game, 7th on in a 9-inning game), not a fixed 7th inning."""
    return s.inning >= sched(s) - 2 and abs(s.margin) <= 2 and (s.bases[1] or s.bases[2])


# ---------------------------------------------------------------------------
# Stage 1: command -> landing zone shares
# ---------------------------------------------------------------------------

# v0.6d: "if the off-speed gets it over, then get it over" (Drew). v1.0 Step 3 (#4): one landing anchor. Each pitch's
# record today is (strikes, expected strikes, pitches), where expected sums the model's own strike probability at each
# called target (expected_strike, with no landing news), so a pitcher doing exactly what the model expects reads zero.
# Chase targets stay out of the record: a chase is a ball by design and says nothing about whether he can throw the
# pitch for strikes (four chase takes leave it unchanged). The estimate is his deviation from his own expectation,
# shrunk toward zero (worth LAND_K pitches). Two-sided (Drew, Nov 10, for D1): missing more than expected makes the
# pitch wilder (up to LAND_MAX), landing better than expected sharpens it (up to LAND_SHARP_MAX), so "the pitch he is
# controlling today" rises in the mix ("if the off-speed gets it over, then get it over").
# v1.0 Step 5 (Drew, Nov 11; readthrough/v10_landing_fit.py, results/v10/landing_fit.txt): K and GAIN fitted on Statcast
# (a pitcher's strikes vs his own expectation on a pitch type earlier in the game -> his next pitch of that type; 2024
# train, 2025 held out +5.6 boot SD). K = 20 on train likelihood; beta = 1.05 logits per unit est, which at the engine's
# strike-chance slope (0.119 per unit wild-today) is GAIN 2.0. A separate slope for landing better vs missing didn't ship
# (+1.8 SD). The caps stay: in the data the deviation never reaches them (|wild-today| <= ~0.35 at the 2025 extremes).
LAND_K = 20.0
LAND_GAIN = 1.8
LAND_MAX = 0.6
LAND_SHARP_MAX = 0.3


def expected_strike(p: Pitch, q: str, s: Situation, arsenal):
    """The model's chance this call is a strike (anything but a ball, wild-pitch ball or HBP), with no landing news."""
    P = outcome_probs(p, q, replace(s, landing_today={}, wild_true={}), arsenal)
    return 1.0 - P["ball"] - P["wp_ball"] - P["hbp"]


def landing_record(rec, strike, expected):
    """Add one non-chase pitch to a (strikes, expected strikes, pitches) record."""
    st, ex, n = rec if rec else (0, 0.0, 0)
    return (st + (1 if strike else 0), ex + expected, n + 1)


# A record saved before v1.0 is a (strikes, pitches) pair over every target; it is read once as expected = pitches x the
# old typical rate for the pitch class (the plan's compat rule, for open games, older inputs and offline tools).
LEGACY_LAND_RATE = {"FB": 0.66, "OS": 0.58}


def landing_triple(p, rec):
    if rec is not None and len(rec) == 2:
        st, n = rec
        return (st, n * LEGACY_LAND_RATE["OS" if is_offspeed(p.kind) else "FB"], n)
    return rec


def landing_estimate(p: Pitch, s: Situation):
    """-> (deviation from his own expectation, shrunk toward 0; his expected strike rate on these calls; pitches)."""
    ev = landing_triple(p, s.landing_today.get(p.name)) if s.landing_today else None
    if not ev or not ev[-1]:
        return 0.0, None, 0
    st, ex, n = ev
    return (st - ex) / (LAND_K + n), ex / n, n


def wild_today(p: Pitch, s: Situation):
    if s.wild_true:                        # the simulated world: how off the pitch really is today, not an estimate
        return s.wild_true.get(p.name, 0.0)
    est, _, n = landing_estimate(p, s)
    return max(-LAND_SHARP_MAX, min(LAND_MAX, -LAND_GAIN * est)) if n else 0.0   # < 0: sharper than his normal today


def ball_conf_event(q, loc=None):
    """v1.0 Step 3 (#4): the confidence event for a ball. A ball on a chase target is what was asked for: no debit when it
    landed just off, or when no location was logged (location is optional in the app); a way-off miss still counts."""
    if q == "chase" and loc != "noncomp":
        return None
    return "ball"


# v0.7 personal traits. Effects are offsets in grade points; all default to 0, which is the default engine.
#   side_cmd, side_grade: same-side minus opposite-side hitters (coded +1/2 same, -1/2 opposite, so the base value is the average)
#   ahead_cmd, behind_cmd: command when ahead / behind in the count, relative to an even count
#   stretch_cmd: command with anyone on base, relative to the bases empty
#   miss_heart: -1..1, where his misses go: + leaks over the heart (hittable), - goes off the plate (balls)
TRAIT_KEYS = ("side_cmd", "side_grade", "ahead_cmd", "behind_cmd", "stretch_cmd", "miss_heart")


def effective(p: Pitch, s: Situation):
    """His command and stuff in this situation: the base values plus his personal situational effects."""
    t = p.traits
    if not t:
        return p.command, p.grade
    side = 0.5 if s.same_side else -0.5
    cmd = p.command + side * t.get("side_cmd", 0.0) + t.get("stretch_cmd", 0.0) * (1.0 if any(s.bases) else 0.0)
    if s.strikes > s.balls:
        cmd += t.get("ahead_cmd", 0.0)
    elif s.balls > s.strikes:
        cmd += t.get("behind_cmd", 0.0)
    return cmd, p.grade + side * t.get("side_grade", 0.0)


# ---------------------------------------------------------------------------
# v1.2 location model (plan 2.2-2.3): a miss lean (side, height) and spread per pitch. At lean 0 / spread 1 nothing
# here runs, so landing() and the HBP / wild-pitch terms are v1.1's floats exactly. Otherwise a 2-D normal miss model
# (inches, batter frame: x + = toward the batter, z + = up from the zone's middle) gives the *difference* the lean makes,
# added to landing()'s own shares. Its sigma is solved per call from landing()'s own pre-floor shares, so it carries
# command, confidence, traits, level wildness, wild-today and fatigue.
LEAN_MAX, SPREAD_MIN, SPREAD_MAX = 6.0, 0.5, 2.0
# The engine's four landing zones are Baseball Savant's attack zones (heart, shadow, chase, waste), set relative to the
# strike zone (half-width 10 in. with the ball, half-height 12 in.): heart inside 67% of it, the edge (shadow) to 133%,
# off (chase) to 200%, non-competitive (waste) beyond. Checked Nov 13 against landing()'s own shares: a corner target fits
# within about 0.08 of each share; a middle target's heart doesn't (landing() is more peaked there than any normal), so
# the lean's effect on a middle target's heart share is approximate (BUILD_v1.2_REPORT Step 1).
GEO_HEART, GEO_ZONE, GEO_EXT = (6.7, 8.04), (13.3, 15.96), (20.0, 24.0)
GEO_Q = {"up-in": (20.0 / 3.0, 8.0), "up-away": (-20.0 / 3.0, 8.0), "down-in": (20.0 / 3.0, -8.0),
         "down-away": (-20.0 / 3.0, -8.0), "middle": (0.0, 0.0), "down-middle": (0.0, -8.0)}   # target, batter frame
GEO_DOWN = ("down-in", "down-away", "down-middle")
# MLB 2024-25 HBP rate by where the pitch crossed, inches toward the batter from plate centre (research doc section 3,
# results/v12/proxies_mlb_2024.txt and _2025.txt, the two seasons averaged). Only its shape matters here: it enters as
# a ratio, so the level's own HBP price is untouched.
GEO_HBP_BANDS = ((12.0, 0.00359), (15.0, 0.0142), (18.0, 0.0401), (21.0, 0.0987), (24.0, 0.196), (27.0, 0.33), (30.0, 0.521))
# v1.2 Step 6 (Drew, option A for row L5): with two strikes, the extra way-off mass an UP lean adds to an up target swings
# like the chase band (a riding fastball missing high with two strikes is a chase pitch), not like waste


def geo_ncdf(x):
    """Standard normal CDF by Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7), written the same way in engine.js so
    Python and JS agree (JS has no erf)."""
    z = abs(x) / 1.4142135623730951
    t = 1.0 / (1.0 + 0.3275911 * z)
    y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z)
    return 0.5 * (1.0 + y) if x >= 0 else 0.5 * (1.0 - y)


def _geo_in(m, sd, a):
    return geo_ncdf((a - m) / sd) - geo_ncdf((-a - m) / sd)


def geo_shares(mx, mz, sx, sz):
    """heart / edge / off / noncomp shares of a 2-D normal miss around (mx, mz), inches."""
    h = _geo_in(mx, sx, GEO_HEART[0]) * _geo_in(mz, sz, GEO_HEART[1])
    zn = _geo_in(mx, sx, GEO_ZONE[0]) * _geo_in(mz, sz, GEO_ZONE[1])
    e = _geo_in(mx, sx, GEO_EXT[0]) * _geo_in(mz, sz, GEO_EXT[1])
    return {"heart": h, "edge": zn - h, "off": e - zn, "noncomp": 1.0 - e}


def geo_target(p, q):
    """The target's position, batter frame. A chase is above the zone for a fastball, below it for off-speed."""
    if q == "chase":
        return (0.0, -18.0 if is_offspeed(p.kind) else 18.0)    # in the chase band (150% of the half-height)
    return GEO_Q[q]


def geo_sigma(mx, mz, ext):
    """The miss size (inches, same both ways) at which the normal model keeps `ext` of the mass out of the waste band:
    landing()'s own 1 - noncomp, so the tail that drives hit batters and wild pitches is matched exactly. That share
    falls as the size grows (the target is inside the band), so bisection finds it. A labeled assumption: the same size
    side to side and up and down."""
    ext = min(0.999, max(0.05, ext))
    lo, hi = 0.25, 120.0
    for _ in range(48):
        mid = 0.5 * (lo + hi)
        if _geo_in(mx, mid, GEO_EXT[0]) * _geo_in(mz, mid, GEO_EXT[1]) > ext:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def has_lean(p):
    return bool(p.lean_x) or bool(p.lean_z) or p.spread != 1.0


def lean_geometry(p, q, s, z_pre):
    """(target, lean, sigma, spread) in the batter frame. lean_x is in the pitcher's frame: his arm side is toward a
    same-side hitter and away from an opposite-side hitter (a switch hitter bats opposite: same_side False)."""
    mx, mz = geo_target(p, q)
    lx = p.lean_x if s.same_side else -p.lean_x
    sd = geo_sigma(mx, mz, 1.0 - z_pre["noncomp"])
    return mx, mz, lx, p.lean_z, sd, p.spread


def lean_delta(p, q, s, z_pre):
    mx, mz, lx, lz, sd, sp = lean_geometry(p, q, s, z_pre)
    a = geo_shares(mx + lx, mz + lz, sd * sp, sd * sp)
    b = geo_shares(mx, mz, sd, sd)
    d = {k: a[k] - b[k] for k in ZONES}
    if s.strikes == 2 and lz > 0 and mz > 0 and d["noncomp"] > 0:    # L5: high misses with two strikes are chases
        d["off"] += d["noncomp"]
        d["noncomp"] = 0.0
    return d


def _geo_hbp_weight(mx, sd):
    """Expected HBP weight of a lateral miss ~ Normal(mx, sd) under the MLB curve (piecewise constant, exact)."""
    w = 0.0
    for i, (x0, h) in enumerate(GEO_HBP_BANDS):
        x1 = GEO_HBP_BANDS[i + 1][0] if i + 1 < len(GEO_HBP_BANDS) else None
        top = 1.0 if x1 is None else geo_ncdf((x1 - mx) / sd)
        w += h * (top - geo_ncdf((x0 - mx) / sd))
    return w


def lean_hbp_wp(p, q, s):
    """(HBP factor, wild-pitch factor) for a lean: per unit of way-off mass, how much more of it is at the batter's body
    (or in the dirt). The landing delta already moves the mass, so this scales the hit rate per unit of it and never
    counts the lean twice (plan 2.3, review finding 3). (1.0, 1.0) without a lean."""
    if not has_lean(p):
        return 1.0, 1.0
    mx, mz, lx, lz, sd, sp = lean_geometry(p, q, s, landing_pre(p, q, s))
    s1 = sd * sp
    n0 = geo_shares(mx, mz, sd, sd)["noncomp"]
    n1 = geo_shares(mx + lx, mz + lz, s1, s1)["noncomp"]
    b0, b1 = _geo_hbp_weight(mx, sd), _geo_hbp_weight(mx + lx, s1)
    rh = (b1 / n1) / (b0 / n0) if (b0 > 1e-12 and n0 > 1e-9 and n1 > 1e-9) else 1.0
    rw = 1.0
    if (q in GEO_DOWN or (q == "chase" and is_offspeed(p.kind))) and lz < 0:
        d0 = geo_ncdf((-GEO_EXT[1] - mz) / sd)
        d1 = geo_ncdf((-GEO_EXT[1] - mz - lz) / s1)
        rw = (d1 / n1) / (d0 / n0) if (d0 > 1e-12 and n0 > 1e-9 and n1 > 1e-9) else 1.0
    return rh, rw


def landing(p: Pitch, q: str, s: Situation):
    z = landing_pre(p, q, s)
    if has_lean(p):                          # v1.2 (plan 2.2): the lean's difference, before the one floor and divide
        dz = lean_delta(p, q, s, z)
        z = {k: z[k] + dz[k] for k in ZONES}
    z = {k: max(v, 0.01) for k, v in z.items()}
    t = sum(z.values())
    return {k: v / t for k, v in z.items()}


def landing_pre(p: Pitch, q: str, s: Situation):
    """landing()'s shares before its final floor and divide (v1.2 split them out; the arithmetic is v1.1's)."""
    command, _ = effective(p, s)
    # v0.7 spread calibration: one grade point of command = one SD of real pitchers at this level (talent_spread.py,
    # fit_spread.py). cmd_scale 1 = the v0.6 engine. The level offset and confidence keep their own (unscaled) effect.
    sc = LEVEL[s.level].get("cmd_scale", 1.0)
    if sc == 1.0:   # the v0.6 formula exactly (same rounding)
        d = min(5, max(1, command + OUTCOME_ADJ[s.level]["cmd"] + 2.0 * (p.conf - 0.6))) - 3   # low confidence = worse command
    else:
        d = min(8.0, max(-8.0, sc * (command - 3) + OUTCOME_ADJ[s.level]["cmd"] + 2.0 * (p.conf - 0.6)))
    if q == "chase":
        # [R4] expand, don't waste: aim just off the zone, not way off
        z0, sl = {"heart": 0.05, "edge": 0.24, "off": 0.57, "noncomp": 0.14}, {"heart": -0.01, "edge": 0.0, "off": 0.04, "noncomp": -0.03}
    elif q == "middle":   # "get it over": aim at the heart
        z0, sl = {"heart": 0.50, "edge": 0.30, "off": 0.13, "noncomp": 0.07}, {"heart": 0.03, "edge": 0.0, "off": -0.02, "noncomp": -0.01}
    elif q == "down-middle":   # v1.0 Step 7 "keep it down": one zone edge near, halfway between middle and a corner
        z0, sl = {"heart": 0.38, "edge": 0.36, "off": 0.175, "noncomp": 0.085}, {"heart": 0.0, "edge": 0.04, "off": -0.025, "noncomp": -0.015}
    else:
        z0, sl = {"heart": 0.26, "edge": 0.42, "off": 0.22, "noncomp": 0.10}, {"heart": -0.03, "edge": 0.08, "off": -0.03, "noncomp": -0.02}
    if sc == 1.0:   # the v0.6 straight-line shares, exactly
        z = {k: z0[k] + sl[k] * d for k in z0}
        if is_offspeed(p.kind):
            # breaking balls and changeups are harder to land for strikes
            z["edge"] -= 0.12
            z["off"] += 0.07
            z["noncomp"] += 0.05
    else:
        # v0.7: with command spread to real pitchers, d gets large and straight lines run into zero. Each zone's share
        # moves exponentially instead, with the same first-order change around an average pitcher, so nothing saturates.
        if is_offspeed(p.kind):
            z0 = {"heart": z0["heart"], "edge": z0["edge"] - 0.12, "off": z0["off"] + 0.07, "noncomp": z0["noncomp"] + 0.05}
        w = {k: z0[k] * exp(sl[k] / z0[k] * d) for k in z0}
        t = sum(w.values())
        z = {k: v / t for k, v in w.items()}
    mh = p.traits.get("miss_heart", 0.0) if p.traits else 0.0
    if mh:                                   # v0.7: where his misses go, beyond what command says
        mh = min(1.0, max(-1.0, mh))
        if mh > 0:
            m = 0.3 * mh * z["off"]
            z["off"] -= m
            z["heart"] += m
        else:
            m = 0.3 * -mh * z["heart"]
            z["heart"] -= m
            z["off"] += m
    w = OUTCOME_ADJ[s.level]["wild"]          # v0.6: league-level wildness (amateur pitchers miss more)
    if w:
        mh, me = w * z["heart"], w * z["edge"]
        z["heart"] -= mh
        z["edge"] -= me
        z["off"] += 0.6 * (mh + me)
        z["noncomp"] += 0.4 * (mh + me)
    wt = wild_today(p, s)                    # v0.6d: this pitch isn't landing today (v1.0: < 0 = landing better than his
    if wt < 0 and q == "chase":              # normal, the same shift run backwards). v0.6e: misses go both ways, so a
        wt = 0.0                             # wild pitch also leaves more over the plate. v1.0 review (Drew, Nov 11): no
    if wt:                                   # sharpening on a chase target; run backwards it would move the chase toward
                                             # the plate, when a sharper chase lands just off
        me = wt * z["edge"]                  # edge pitches miss off the plate, and some leak over the heart
        mh = 0.6 * wt * z["heart"]           # heart pitches spray to the edge and off it
        z["edge"] += 0.6 * mh - me
        z["heart"] += 0.30 * me - mh
        z["off"] += 0.45 * me + 0.4 * mh
        z["noncomp"] += 0.25 * me
    over = s.pitch_count - LEVEL[s.level]["fatigue"]
    if over > 0:  # fatigue: 2% of mass from edge to heart per 10 pitches
        shift = min(z["edge"] - 0.05, 0.02 * over / 10)
        z["edge"] -= shift
        z["heart"] += shift
    return z


# ---------------------------------------------------------------------------
# Stage 2: hitter vs pitch, per landing zone
# ---------------------------------------------------------------------------

# v1.3 Part 2: the band base rates and the hand class terms come from the zone table (TABLES["zone"], docs/TABLES_v13.md);
# zone_v12.json holds v1.2's values: swing heart .72 / edge .50 / off .28 / way-off .05, called strike .98 / .55 / .08 / 0,
# whiff .12 / .20 / .34 / .50, foul .40 / .50 / .50 / .45, (weak, solid, hard) by band, ZONE_IN 1 / .5 / 0 / 0 (edge
# straddles the border), W_FB -0.20 (whiff level of the four-seam class, v1.0 KIND_W["FB"]).
_ZT = TABLES["zone"]
S0 = dict(_ZT["base"]["swing"])
C0 = dict(_ZT["base"]["cstrike"])
W0 = dict(_ZT["base"]["whiff"])
F0 = dict(_ZT["base"]["foul"])
Q0 = {z: tuple(v) for z, v in _ZT["base"]["quality"].items()}
ZONE_IN = dict(_ZT["base"]["zone_in"])
ZONE_CLASS = _ZT["class"]
W_FB = ZONE_CLASS["whiff_fb"]
HANGER = ZONE_CLASS["hanger_hard"]     # v1.2's hanger: off-speed over the heart is hit harder (logit)
# v1.3 core, Drew's ruling 3 (DECISIONS_refit_v13.md section 4): the quality-gated hanger. An off-speed pitch landing over the
# heart gets HANGER_GATE x min(1, wild_today / HANGER_GATE_FULL) more hard-contact logit, only when wild_today > 0 (he isn't
# landing it today). H is the zone table's class.hanger_gate (absent = 0); the next agent sizes it on graded rows.
HANGER_GATE = ZONE_CLASS.get("hanger_gate", 0.0)
HANGER_GATE_FULL = 0.30
GB_KIND = dict(ZONE_CLASS.get("gb_kind", {}))   # v1.3 core (ruling 2, P3): ground-ball logit by pitch kind (absent = 0)


def zone_profile(p):
    """the zone table's profile of pitch p (hitter_data/zone_defs.py PROFILES: sweeper = SL|sweeper, splitter = CH|split)"""
    if p.kind == "SL" and p.shape == "sweeper":
        return "SW"
    if p.kind == "CH" and p.shape == "split":
        return "SP"
    return p.kind


_T_HT = {"up": "up", "middle": "mid", "down": "down"}   # target_height -> the zone table's height thirds


def count_group(b, k):
    """the zone table's count group (hitter_data/zone_defs.py count_group)"""
    if k == 2:
        return "two"
    if b == 0 and k == 0:
        return "first"
    if b > k:
        return "ahead"
    return "even" if b == k else "behind"


_ZCELL = {}


def use_zone_table(t):
    """Swap the zone table in place (fit code: compute with a candidate without a new process). Returns the table it replaced.
    Python only; the JS engine takes its tables from engine_data.json (app/export_data.py with PITCH_ZONE_TABLE)."""
    global _ZT, ZONE_CLASS, W_FB, HANGER, HANGER_GATE
    check_table(t)
    old = _ZT
    _ZT = TABLES["zone"] = t
    TABLE_VERSIONS["zone"] = t["version"]
    for d, k in ((S0, "swing"), (C0, "cstrike"), (W0, "whiff"), (F0, "foul"), (ZONE_IN, "zone_in")):
        d.clear(); d.update(t["base"][k])
    Q0.clear(); Q0.update({z: tuple(v) for z, v in t["base"]["quality"].items()})
    ZONE_CLASS = t["class"]
    W_FB, HANGER = ZONE_CLASS["whiff_fb"], ZONE_CLASS["hanger_hard"]
    HANGER_GATE = ZONE_CLASS.get("hanger_gate", 0.0)
    GB_KIND.clear(); GB_KIND.update(ZONE_CLASS.get("gb_kind", {}))
    KIND_W_OS.clear(); KIND_W_OS.update(ZONE_CLASS["whiff_os"])
    _ZCELL.clear()
    return old


def zone_cells(level, prof, cg, ht):
    """{band: (swing, cstrike, whiff, foul, hard)} logit offsets of the zone table's cell (level_cells override per level)"""
    key = (level, prof, cg, ht)
    v = _ZCELL.get(key)
    if v is None:
        lc = _ZT.get("level_cells") or {}
        cells = lc.get(level) or lc.get(TABLE_LEVEL_ALIAS.get(level, level)) or _ZT["cells"]
        v = {z: tuple(cells[o][z][prof][cg][ht] for o in T_ZONE_OUT) for z in T_BANDS}
        _ZCELL[key] = v
    return v


TABLE_LEVEL_ALIAS = {"travel": "hs", "college": "college_d1"}
_CT = TABLES["count"]["levels"]
_MP = TABLES["mp"]["levels"]
_CNT = {}


def mp_cells(level, b, k):
    """v1.3 ruling 12: the mean-preservation scalars (swing, whiff, foul, cstrike, bip_gb logit shifts) for this level and count"""
    M = _MP.get(level) or _MP[TABLE_LEVEL_ALIAS[level]]
    c = f"{b}-{k}"
    return tuple(M[o][c] for o in T_MP_OUT)


def use_mp_table(t):
    """Swap the mean-preservation table in place (fit code). Returns the table it replaced. Python only (JS: engine_data.json)."""
    global _MP
    check_table(t)
    old = TABLES["mp"]
    TABLES["mp"] = t
    TABLE_VERSIONS["mp"] = t["version"]
    _MP = t["levels"]
    _CNT.clear()
    _GBV.clear()
    return old


def count_cells(level, b, k):
    """the count table's row for this level and count: ({band: (swing, whiff, foul, hard)}, called-strike kappa, ball-in-play
    ground-ball offset), with the mean-preservation scalars (mp_cells, ruling 12) added to swing / whiff / foul on every band,
    to the kappa and to the ground-ball offset. Travel uses high school's, 'college' D1's; a level the file lacks raises KeyError."""
    key = (level, b, k)
    v = _CNT.get(key)
    if v is None:
        L = _CT.get(level) or _CT[TABLE_LEVEL_ALIAS[level]]
        c = f"{b}-{k}"
        msw, mwh, mfo, mcs, mgb = mp_cells(level, b, k)
        v = ({z: (L["swing"][c][z] + msw, L["whiff"][c][z] + mwh, L["foul"][c][z] + mfo, L["hard"][c][z]) for z in T_BANDS},
             L["cstrike"][c] + mcs, L["bip_gb"][c] + mgb)
        _CNT[key] = v
    return v


def count_base_out(level, outs, bases):
    L = _CT.get(level) or _CT[TABLE_LEVEL_ALIAS[level]]
    return L["swing_base_out"][f"{outs}|{bases_key(*bases)}"]


def gb_by_count(level):
    """True when the level's ball-in-play ground-ball offset differs between counts (ball-in-play values then depend on the
    count, and the speed caches key on it)"""
    v = _GBV.get(level)
    if v is None:
        L = _CT.get(level) or _CT.get(TABLE_LEVEL_ALIAS.get(level, ""))
        v = _GBV[level] = bool(L) and len({count_cells(level, b, k)[2] for b in range(4) for k in range(3)}) > 1
    return v


_GBV = {}


# ---------------------------------------------------------------------------
# Tunneling (v0.4): pitch flight paths from movement + release
# ---------------------------------------------------------------------------
# v1.1 Step 1b: every kind and tag has its own speed gap and movement by level (plan 2.2), measured on 2024 Statcast for
# MLB, from Rapsodo's college averages plus each profile's MLB difference for college, and college shrunk 15% for HS.
# --- PROFILES: generated by profiles_fit.py --write-engines from 2024 Statcast (results/v11/profiles.json); do not edit ---
# (dmph off his main fastball, IVB, HB arm side +) for a right-hander, by level, kind and tag
PROFILES = {
    "mlb": {
        ("FB", ""): (0.0, 16.2, 7.7),
        ("FB", "rides"): (0.0, 19.2, 6.5),
        ("FB", "runs"): (0.0, 14.4, 12.5),
        ("FB", "cuts"): (0.0, 14.9, 0.8),
        ("FB", "straight"): (0.0, 13.0, 8.0),
        ("SI", ""): (0.4, 8.4, 15.2),
        ("SI", "two-seam"): (0.2, 13.3, 13.8),
        ("SI", "drop"): (0.6, 2.8, 16.1),
        ("SI", "run"): (0.4, 7.9, 18.2),
        ("FC", ""): (4.8, 7.9, -2.5),
        ("FC", "big"): (7.8, 4.6, -6.5),
        ("FC", "hard"): (3.0, 9.2, -1.1),
        ("FC", "ride"): (4.6, 12.5, -4.2),
        ("SL", ""): (9.2, 1.6, -6.0),
        ("SL", "sweeper"): (11.5, 0.8, -13.7),
        ("SL", "slurve"): (11.3, -4.4, -8.8),
        ("SL", "gyro"): (8.0, 2.5, -1.4),
        ("SL", "tight"): (8.4, 1.9, -5.2),
        ("CB", ""): (14.0, -10.3, -8.8),
        ("CB", "12-6"): (13.5, -12.7, -3.7),
        ("CB", "sweeping"): (13.8, -7.0, -12.4),
        ("CB", "power"): (8.3, -10.6, -7.4),
        ("CB", "slow"): (17.0, -13.9, -9.8),
        ("CH", ""): (8.0, 5.2, 14.0),
        ("CH", "firm"): (4.2, 4.4, 14.8),
        ("CH", "split"): (8.2, 2.5, 11.5),
        ("CH", "drop"): (8.0, 2.8, 15.2),
        ("CH", "fade"): (8.3, 8.8, 14.9),
    },
    "college_d1": {
        ("FB", ""): (0.0, 16.0, 8.0),
        ("FB", "rides"): (0.0, 19.0, 6.8),
        ("FB", "runs"): (0.0, 14.2, 12.8),
        ("FB", "cuts"): (0.0, 14.7, 1.1),
        ("FB", "straight"): (0.0, 12.8, 8.3),
        ("SI", ""): (0.4, 8.4, 15.2),
        ("SI", "two-seam"): (0.2, 13.3, 13.8),
        ("SI", "drop"): (0.6, 2.8, 16.1),
        ("SI", "run"): (0.4, 7.9, 18.2),
        ("FC", ""): (4.8, 7.9, -2.5),
        ("FC", "big"): (7.8, 4.6, -6.5),
        ("FC", "hard"): (3.0, 9.2, -1.1),
        ("FC", "ride"): (4.6, 12.5, -4.2),
        ("SL", ""): (9.0, 4.0, -1.5),
        ("SL", "sweeper"): (11.3, 3.2, -9.2),
        ("SL", "slurve"): (11.1, -2.0, -4.3),
        ("SL", "gyro"): (7.8, 4.9, 3.1),
        ("SL", "tight"): (8.2, 4.3, -0.7),
        ("CB", ""): (12.0, -1.0, -8.8),
        ("CB", "12-6"): (11.5, -3.4, -3.7),
        ("CB", "sweeping"): (11.8, 2.3, -12.4),
        ("CB", "power"): (6.3, -1.3, -7.4),
        ("CB", "slow"): (15.0, -4.6, -9.8),
        ("CH", ""): (7.0, 5.2, 14.0),
        ("CH", "firm"): (3.2, 4.4, 14.8),
        ("CH", "split"): (7.2, 2.5, 11.5),
        ("CH", "drop"): (7.0, 2.8, 15.2),
        ("CH", "fade"): (7.3, 8.8, 14.9),
    },
    "college_d3": {
        ("FB", ""): (0.0, 16.0, 8.0),
        ("FB", "rides"): (0.0, 19.0, 6.8),
        ("FB", "runs"): (0.0, 14.2, 12.8),
        ("FB", "cuts"): (0.0, 14.7, 1.1),
        ("FB", "straight"): (0.0, 12.8, 8.3),
        ("SI", ""): (0.4, 8.4, 15.2),
        ("SI", "two-seam"): (0.2, 13.3, 13.8),
        ("SI", "drop"): (0.6, 2.8, 16.1),
        ("SI", "run"): (0.4, 7.9, 18.2),
        ("FC", ""): (4.8, 7.9, -2.5),
        ("FC", "big"): (7.8, 4.6, -6.5),
        ("FC", "hard"): (3.0, 9.2, -1.1),
        ("FC", "ride"): (4.6, 12.5, -4.2),
        ("SL", ""): (9.0, 4.0, -1.5),
        ("SL", "sweeper"): (11.3, 3.2, -9.2),
        ("SL", "slurve"): (11.1, -2.0, -4.3),
        ("SL", "gyro"): (7.8, 4.9, 3.1),
        ("SL", "tight"): (8.2, 4.3, -0.7),
        ("CB", ""): (12.0, -1.0, -8.8),
        ("CB", "12-6"): (11.5, -3.4, -3.7),
        ("CB", "sweeping"): (11.8, 2.3, -12.4),
        ("CB", "power"): (6.3, -1.3, -7.4),
        ("CB", "slow"): (15.0, -4.6, -9.8),
        ("CH", ""): (7.0, 5.2, 14.0),
        ("CH", "firm"): (3.2, 4.4, 14.8),
        ("CH", "split"): (7.2, 2.5, 11.5),
        ("CH", "drop"): (7.0, 2.8, 15.2),
        ("CH", "fade"): (7.3, 8.8, 14.9),
    },
    "hs": {
        ("FB", ""): (0.0, 13.6, 6.8),
        ("FB", "rides"): (0.0, 16.1, 5.8),
        ("FB", "runs"): (0.0, 12.1, 10.9),
        ("FB", "cuts"): (0.0, 12.5, 0.9),
        ("FB", "straight"): (0.0, 10.9, 7.1),
        ("SI", ""): (0.4, 7.1, 12.9),
        ("SI", "two-seam"): (0.2, 11.3, 11.7),
        ("SI", "drop"): (0.6, 2.4, 13.7),
        ("SI", "run"): (0.4, 6.7, 15.5),
        ("FC", ""): (4.8, 6.7, -2.1),
        ("FC", "big"): (7.8, 3.9, -5.5),
        ("FC", "hard"): (3.0, 7.8, -0.9),
        ("FC", "ride"): (4.6, 10.6, -3.6),
        ("SL", ""): (9.0, 3.4, -1.3),
        ("SL", "sweeper"): (11.3, 2.7, -7.8),
        ("SL", "slurve"): (11.1, -1.7, -3.7),
        ("SL", "gyro"): (7.8, 4.2, 2.6),
        ("SL", "tight"): (8.2, 3.7, -0.6),
        ("CB", ""): (12.0, -0.8, -7.5),
        ("CB", "12-6"): (11.5, -2.9, -3.1),
        ("CB", "sweeping"): (11.8, 2.0, -10.5),
        ("CB", "power"): (6.3, -1.1, -6.3),
        ("CB", "slow"): (15.0, -3.9, -8.3),
        ("CH", ""): (7.0, 4.4, 11.9),
        ("CH", "firm"): (3.2, 3.7, 12.6),
        ("CH", "split"): (7.2, 2.1, 9.8),
        ("CH", "drop"): (7.0, 2.4, 12.9),
        ("CH", "fade"): (7.3, 7.5, 12.7),
    },
    "travel": {
        ("FB", ""): (0.0, 13.6, 6.8),
        ("FB", "rides"): (0.0, 16.1, 5.8),
        ("FB", "runs"): (0.0, 12.1, 10.9),
        ("FB", "cuts"): (0.0, 12.5, 0.9),
        ("FB", "straight"): (0.0, 10.9, 7.1),
        ("SI", ""): (0.4, 7.1, 12.9),
        ("SI", "two-seam"): (0.2, 11.3, 11.7),
        ("SI", "drop"): (0.6, 2.4, 13.7),
        ("SI", "run"): (0.4, 6.7, 15.5),
        ("FC", ""): (4.8, 6.7, -2.1),
        ("FC", "big"): (7.8, 3.9, -5.5),
        ("FC", "hard"): (3.0, 7.8, -0.9),
        ("FC", "ride"): (4.6, 10.6, -3.6),
        ("SL", ""): (9.0, 3.4, -1.3),
        ("SL", "sweeper"): (11.3, 2.7, -7.8),
        ("SL", "slurve"): (11.1, -1.7, -3.7),
        ("SL", "gyro"): (7.8, 4.2, 2.6),
        ("SL", "tight"): (8.2, 3.7, -0.6),
        ("CB", ""): (12.0, -0.8, -7.5),
        ("CB", "12-6"): (11.5, -2.9, -3.1),
        ("CB", "sweeping"): (11.8, 2.0, -10.5),
        ("CB", "power"): (6.3, -1.1, -6.3),
        ("CB", "slow"): (15.0, -3.9, -8.3),
        ("CH", ""): (7.0, 4.4, 11.9),
        ("CH", "firm"): (3.2, 3.7, 12.6),
        ("CH", "split"): (7.2, 2.1, 9.8),
        ("CH", "drop"): (7.0, 2.4, 12.9),
        ("CH", "fade"): (7.3, 7.5, 12.7),
    },
}
PROFILE_T = {"fb_rides_ivb": 2.0, "fb_runs_hb": 3.0, "fb_cuts_hb": -5.0, "fb_straight_ivb": -2.0, "fb_straight_hb": 3.0, "si_twoseam_ivb": 3.0, "si_drop_ivb": -3.0, "si_run_hb": 2.0, "fc_big_hb": -7.0, "fc_big_dmph": 7.0, "fc_hard_dmph": 4.0, "fc_hard_hb": -4.0, "fc_ride_ivb": 3.0, "sl_sweeper_hb": -10.0, "sl_slurve_ivb": -3.0, "sl_slurve_hb": -6.0, "sl_gyro_abshb": 3.0, "cb_power_dmph": 9.0, "cb_slow_dmph": 15.0, "ch_firm_dmph": 5.0, "ch_split_divb": -12.0, "ch_split_dhb": 4.0, "ch_drop_divb": -11.0, "ch_fade_dhb": 4.0}
MOVE_RATIO = {"mlb": 1.0, "college_d1": 1.0, "college_d3": 1.0, "hs": 0.85, "travel": 0.85}
# --- end PROFILES ---
# --- PROFILE_TERMS: generated by profile_terms_tables.py --write-engines from the Step 2 fits (results/v11/step2_fit.json,
# step2_terms.json); do not edit. Fitted: PT_C (2a model C), PT_B (2a model B over C), PT_FBZ_W (2b), PT_CHASE_OPP (2c).
# Priors (plan 2.3, at their 2025 no-harm scale): PT_FBZ_H, PT_FBL_H (lane), PT_PLAT. Descriptive: GB_PROFILE (2e), SLOT_ANGLE,
# SLOT_MOVE (slot adjustment, E10). The fitted class values (CLASS_TERMS) are held for Drew and not written here. ---
PT_C = {"whiff": {"FB": (-0.0378, 0.0295, -0.0104, -0.0132), "SL": (0.041, 0.0218, 0.0059, 0.0051), "CB": (0.0193, 0.0076, -0.0005, -0.0017), "CH": (0.0757, 0.0138, 0.007, 0.0164)}, "chase": {"FB": (0.0174, -0.0276, 0.0055, 0.0054), "SL": (-0.0336, 0.0018, -0.0273, 0.0007), "CB": (-0.0161, 0.0163, -0.0234, -0.0034), "CH": (0.0085, -0.0317, 0.0081, 0.0062)}, "cstrike": {"FB": (0.0249, -0.011, 0.0066, 0.0054), "SL": (0.0186, -0.0048, 0.002, -0.0013), "CB": (0.0025, -0.0012, 0.0027, -0.0004), "CH": (0.0281, 0.0038, 0.0126, -0.0014)}, "hard": {"FB": (-0.0063, 0.016, 0.0128, 0.0001), "SL": (-0.0356, -0.0229, 0.0166, -0.0048), "CB": (-0.0531, -0.0199, 0.0127, -0.0019), "CH": (-0.0706, -0.0218, -0.0243, -0.0104)}}
PT_B = {"whiff": {"FB|rides": 0.3925, "FB|runs": -0.0333, "FB|cuts": -0.0185, "FB|straight": -0.2454, "FB|": 0.0, "SI|run": -0.307, "SI|drop": -0.4105, "SI|two-seam": -0.0315, "SI|": -0.4128, "FC|hard": 0.2013, "FC|big": 0.6067, "FC|ride": 0.3573, "FC|": 0.32, "SL|gyro": 0.0284, "SL|tight": 0.0, "SL|sweeper": -0.0646, "SL|slurve": -0.1443, "SL|": 0.0, "CB|12-6": 0.0698, "CB|sweeping": 0.069, "CB|power": 0.1485, "CB|slow": 0.0877, "CB|": 0.0, "CH|fade": 0.0564, "CH|drop": 0.0807, "CH|split": 0.0665, "CH|firm": 0.0215, "CH|": 0.0}, "chase": {"FB|rides": 0.1834, "FB|runs": -0.0384, "FB|cuts": 0.1239, "FB|straight": -0.1672, "FB|": 0.0, "SI|run": 0.251, "SI|drop": 0.085, "SI|two-seam": 0.0984, "SI|": -0.0376, "FC|hard": 0.48, "FC|big": 0.6515, "FC|ride": 0.4582, "FC|": 0.5702, "SL|gyro": 0.0351, "SL|tight": 0.0, "SL|sweeper": -0.0255, "SL|slurve": -0.0368, "SL|": 0.0, "CB|12-6": 0.0318, "CB|sweeping": 0.0182, "CB|power": -0.0015, "CB|slow": 0.0432, "CB|": 0.0, "CH|fade": -0.1459, "CH|drop": -0.0724, "CH|split": -0.0651, "CH|firm": -0.0759, "CH|": 0.0}}
PT_FBZ_W = {"FB|rides": (-0.2524, -0.1116, -0.0142, 0.1186), "FB|runs": (0.0466, 0.0484, -0.2847, 0.294), "FB|cuts": (0.068, 0.4008, 0.1325, -0.0904), "FB|straight": (0.2204, 0.085, -0.036, -0.127), "FB|": (0.0, 0.0, 0.0, 0.0), "SI|run": (-0.1934, 0.7404, 0.2343, 0.0962), "SI|drop": (-0.1535, 0.9954, 0.2439, -0.1097), "SI|two-seam": (0.0271, 0.2791, -0.2844, 0.2056), "SI|": (0.222, 0.8249, -0.0352, -0.0042), "FC|hard": (0.098, 0.8676, -0.1092, 0.0502), "FC|big": (0.0572, 1.1182, -0.2993, 0.1373), "FC|ride": (0.1988, 1.1039, -0.1821, 0.1494), "FC|": (0.1988, 1.1039, -0.1821, 0.1494)}
PT_FBZ_H = {"FB|rides": (0.0084, -0.0154, 0.0185, 0.0309, 0.03, 0.0283, 0.0107, -0.0232, -0.061, 0.0078, -0.0245, -0.017), "FB|runs": (-0.0945, -0.0916, 0.0741, 0.0406, 0.0067, -0.0014, -0.0115, 0.0039, 0.06, 0.1332, -0.1261, -0.1308), "FB|cuts": (0.0782, 0.0794, -0.1229, -0.0477, 0.0212, -0.0097, 0.0039, 0.0608, -0.1912, -0.2011, 0.1805, -0.0237), "FB|straight": (-0.0205, -0.0819, -0.0216, 0.001, -0.0085, 0.0384, -0.0277, 0.0578, -0.0154, 0.0638, 0.0402, -0.135), "FB|": (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0), "SI|run": (-0.3756, -0.3465, 0.1356, 0.0694, -0.0563, -0.0774, 0.0151, 0.0096, 0.2053, 0.1905, -0.2094, -0.284), "SI|drop": (-0.2382, -0.2403, 0.1446, 0.1179, -0.0666, -0.0593, 0.0088, -0.0319, 0.0464, 0.0595, -0.2027, -0.2669), "SI|two-seam": (-0.1534, -0.1551, 0.0024, 0.0315, -0.0581, -0.0204, -0.0013, 0.0369, 0.1611, 0.1166, -0.0843, -0.2151), "SI|": (-0.2281, -0.2647, 0.1317, 0.0591, -0.0639, -0.0486, 0.0105, 0.0293, 0.1389, 0.1562, -0.21, -0.2914), "FC|hard": (0.1602, 0.1192, -0.1267, -0.1524, 0.0401, 0.0195, -0.0072, 0.0004, -0.2743, -0.2253, 0.0638, -0.0701), "FC|big": (0.095, 0.1869, -0.2692, -0.1001, -0.0023, 0.1128, 0.076, 0.1093, -0.1662, -0.2589, -0.0862, -0.3622), "FC|ride": (0.2104, 0.1869, -0.0944, -0.1001, -0.0259, 0.0078, 0.0168, -0.0466, -0.2422, -0.2181, 0.0756, -0.1148), "FC|": (0.2104, 0.1869, -0.1607, -0.1001, 0.0101, 0.0078, -0.0394, -0.0466, -0.2422, -0.2181, 0.0756, -0.1148)}
PT_FBL_H = {"SI|run": (-0.0214, 0.3121, 0.3606, -0.2615, 0.0843, 0.0687), "SI|drop": (0.0087, 0.1587, 0.1247, -0.1902, 0.0341, 0.0266), "SI|two-seam": (-0.0292, 0.0443, 0.2708, -0.0976, 0.0414, -0.0026), "SI|": (-0.0221, 0.1662, 0.2247, -0.2083, 0.056, 0.0382)}
PT_PLAT = {"whiff": {"FB|rides": (0.0234, 0.0193, -0.0213, -0.0216), "FB|runs": (-0.2271, -0.1816, 0.1507, 0.1246), "FB|cuts": (0.2469, 0.079, -0.2343, -0.0802), "FB|straight": (0.1296, 0.0583, -0.091, -0.0421), "FB|": (0.0751, 0.0743, -0.0566, -0.0608), "SI|run": (-0.0136, 0.0272, -0.001, -0.0625), "SI|drop": (0.0598, 0.1028, -0.1147, -0.1991), "SI|two-seam": (-0.2454, -0.1905, 0.2851, 0.1795), "SI|": (-0.0577, -0.0536, 0.0693, 0.0531), "FC|hard": (0.1693, 0.0647, -0.1202, -0.0384), "FC|big": (0.0842, 0.0624, -0.1611, -0.1272), "FC|ride": (0.2639, 0.1274, -0.266, -0.1463), "FC|": (0.1322, 0.0389, -0.1279, -0.0369), "SL|gyro": (-0.0354, -0.0415, -0.0069, 0.0319), "SL|tight": (-0.0199, -0.0345, -0.0461, 0.0194), "SL|sweeper": (0.0004, 0.0293, -0.1232, -0.1227), "SL|slurve": (-0.0839, -0.0151, 0.0715, 0.0018), "SL|": (-0.0199, -0.0345, -0.0461, 0.0194), "CB|12-6": (-0.1315, -0.1098, 0.1028, 0.0879), "CB|sweeping": (0.0148, -0.0332, -0.0132, 0.0324), "CB|power": (-0.3925, -0.2068, 0.2514, 0.1387), "CB|slow": (0.0083, -0.0256, 0.0279, 0.0363), "CB|": (-0.1618, -0.1352, 0.1159, 0.1003), "CH|fade": (-0.1279, -0.0507, 0.086, 0.0544), "CH|drop": (-0.0467, 0.0396, 0.0656, 0.0106), "CH|split": (0.0737, 0.0586, 0.0114, -0.0173), "CH|firm": (-0.0233, 0.1597, 0.0591, -0.0426), "CH|": (0.0846, 0.0708, 0.0356, 0.0016)}, "hard": {"FB|rides": (0.1314, 0.1256, -0.1236, -0.1143), "FB|runs": (-0.0315, -0.167, 0.0173, 0.1225), "FB|cuts": (0.2613, 0.3993, -0.1809, -0.3272), "FB|straight": (0.1136, 0.1328, -0.0879, -0.0939), "FB|": (0.1013, 0.122, -0.0855, -0.0937), "SI|run": (-0.0338, -0.2482, 0.0828, 0.3227), "SI|drop": (-0.0987, -0.0673, 0.1397, 0.0914), "SI|two-seam": (-0.0339, -0.1076, 0.0964, 0.1367), "SI|": (-0.07, -0.1199, 0.1436, 0.1751), "FC|hard": (-0.0486, -0.1028, 0.0181, 0.0678), "FC|big": (-0.0572, -0.123, 0.1212, 0.195), "FC|ride": (-0.1611, 0.0, 0.0999, 0.0), "FC|": (-0.0586, -0.0918, 0.0541, 0.0906), "SL|gyro": (-0.0737, -0.0547, 0.1514, 0.1134), "SL|tight": (-0.0479, -0.0453, 0.1276, 0.1172), "SL|sweeper": (-0.0485, -0.0458, 0.1547, 0.1664), "SL|slurve": (0.0071, 0.0681, 0.0177, -0.059), "SL|": (-0.0479, -0.0453, 0.1276, 0.1172), "CB|12-6": (0.044, 0.0866, -0.0333, -0.0733), "CB|sweeping": (-0.0892, -0.036, 0.0814, 0.0393), "CB|power": (0.0, 0.0, 0.0, -0.0921), "CB|slow": (0.0965, 0.0685, -0.0599, -0.0623), "CB|": (0.0562, -0.0578, -0.0405, 0.019), "CH|fade": (0.4169, 0.3315, -0.0936, -0.1385), "CH|drop": (0.3227, 0.1571, -0.094, -0.0933), "CH|split": (0.0523, 0.0844, -0.0332, -0.0703), "CH|firm": (0.1676, 0.2959, -0.0582, -0.1289), "CH|": (0.1165, 0.1763, -0.0422, -0.0983)}, "cstrike": {"FB|rides": (-0.0, -0.0, 0.0, 0.0), "FB|runs": (0.0, 0.0, -0.0, -0.0), "FB|cuts": (-0.0, -0.0, 0.0, 0.0), "FB|straight": (0.0, 0.0, -0.0, -0.0), "FB|": (-0.0, 0.0, 0.0, -0.0), "SI|run": (0.0, -0.0, -0.0, 0.0), "SI|drop": (0.0, -0.0, -0.0, -0.0), "SI|two-seam": (-0.0, 0.0, -0.0, -0.0), "SI|": (0.0, -0.0, -0.0, 0.0), "FC|hard": (-0.0, -0.0, 0.0, 0.0), "FC|big": (-0.0, -0.0, 0.0, 0.0), "FC|ride": (-0.0, -0.0, 0.0, 0.0), "FC|": (-0.0, -0.0, 0.0, 0.0), "SL|gyro": (-0.0, 0.0, 0.0, -0.0), "SL|tight": (-0.0, -0.0, 0.0, 0.0), "SL|sweeper": (-0.0, -0.0, 0.0, 0.0), "SL|slurve": (-0.0, -0.0, 0.0, 0.0), "SL|": (-0.0, -0.0, 0.0, 0.0), "CB|12-6": (-0.0, -0.0, 0.0, -0.0), "CB|sweeping": (-0.0, -0.0, 0.0, 0.0), "CB|power": (-0.0, 0.0, 0.0, -0.0), "CB|slow": (-0.0, 0.0, 0.0, -0.0), "CB|": (-0.0, 0.0, 0.0, -0.0), "CH|fade": (0.0, 0.0, 0.0, -0.0), "CH|drop": (0.0, 0.0, -0.0, -0.0), "CH|split": (-0.0, 0.0, 0.0, -0.0), "CH|firm": (0.0, 0.0, -0.0, -0.0), "CH|": (0.0, 0.0, 0.0, -0.0)}}
PT_CHASE_OPP = {"FB": (0.0, 0.0052, 0.0145), "SL": (-0.0401, 0.0263, -0.006), "CB": (0.0, 0.0307, -0.0099), "CH": (-0.0441, 0.0193, 0.0069)}
PT_CHASE_MEAN = {"FB": -0.0074, "OS": 0.0072}
GB_PROFILE = {"FB|rides": 0.2497, "FB|runs": 0.3661, "FB|cuts": 0.4177, "FB|straight": 0.4136, "FB|": 0.3287, "SI|run": 0.5739, "SI|drop": 0.6483, "SI|two-seam": 0.4275, "SI|": 0.5492, "FC|hard": 0.4309, "FC|big": 0.389, "FC|ride": 0.3522, "FC|": 0.4187, "SL|gyro": 0.4352, "SL|tight": 0.4168, "SL|sweeper": 0.3617, "SL|slurve": 0.4629, "SL|": 0.4168, "CB|12-6": 0.5246, "CB|sweeping": 0.4206, "CB|power": 0.5735, "CB|slow": 0.4504, "CB|": 0.5139, "CH|fade": 0.4601, "CH|drop": 0.5529, "CH|split": 0.5386, "CH|firm": 0.5695, "CH|": 0.4805}
SLOT_ANGLE = {"sidearm": 14.8, "low three-quarter": 29.5, "three-quarter": 40.0, "high three-quarter": 48.9, "over the top": 58.6, "submarine": 0.0}
PT_FB_IVB = 16.2
SLOT_MOVE = {"FB": (0.0801, -0.0686, 41.5), "SI": (0.0891, -0.0103, 33.3), "FC": (0.0295, -0.0679, 39.8), "SL": (-0.0495, 0.0129, 37.4), "CB": (-0.088, 0.0543, 44.7), "CH": (0.1969, -0.112, 37.8)}
# --- end PROFILE_TERMS ---
BASE_FB_MPH = 85.0          # the default fastball when no speed is entered (v1.0's DEFAULT_VELO["FB"], college scale)
PROFILE_LEVEL = "college_d3"   # the table used when a call has no level (default speeds, tests)
# A pitch name that names a profile sets the tag (Step 1b: those labels carry grip information movement can't see)
PROFILE_NAMES = {"Two-seam": "two-seam", "Sweeper": "sweeper", "Slurve": "slurve", "Splitter": "split", "Forkball": "split",
                 "12-6 curve": "12-6"}


def profile(kind, shape, level=None):
    """(dmph, IVB, HB) for this kind and tag at this level; a tag with no row of its own uses its kind's typical row."""
    tab = PROFILES.get(level or PROFILE_LEVEL, PROFILES[PROFILE_LEVEL])
    return tab.get((kind, shape or ""), tab[(kind, "")])


def default_mph(kind, shape=""):
    """The speed a pitch is given when none is entered: the default fastball less its profile's college speed gap."""
    return round(BASE_FB_MPH - profile(kind, shape, PROFILE_LEVEL)[0], 1)


# Release point by arm slot, as (height as share of body height, side in ft toward arm side)
SLOTS = {"over the top": (1.05, 1.0), "high three-quarter": (0.95, 1.6), "three-quarter": (0.88, 2.0),
         "low three-quarter": (0.78, 2.5), "sidearm": (0.62, 3.0), "submarine": (0.35, 3.2)}
FLIGHT_FT = 54.0            # release to plate, ~6 ft extension
DECISION_S = 0.175          # hitter's decision point: 175 ms before the plate (Baseball Prospectus)
G_IN = 32.17 * 12           # gravity, in/s^2


def movement(p: Pitch, level=None):
    """(IVB, HB) in inches: measured when entered, else the profile's typical movement at his level."""
    _, ivb, hb = profile(p.kind, p.shape, level)
    # v1.1 Step 2 (E10, built because 2a shipped): his slot moves the default movement of an untagged (typical) pitch, by
    # the 2024 slopes within each kind and tag (SLOT_MOVE: inches per degree of arm angle from the kind's median). A tag
    # already describes the movement (a "rides" fastball rides at any slot), and measured numbers win over both.
    if p.kind in SLOT_MOVE and not p.shape:          # a tagged pitch's profile already says how it moves
        si, sh, ref = SLOT_MOVE[p.kind]
        da = SLOT_ANGLE.get(p.slot, SLOT_ANGLE["three-quarter"]) - ref
        r = MOVE_RATIO.get(level or PROFILE_LEVEL, 1.0)
        ivb, hb = ivb + r * si * da, hb + r * sh * da
    if p.ivb is not None:
        ivb = p.ivb
    if p.hb is not None:
        hb = p.hb
    return ivb, hb


def flight_time(p: Pitch):
    return FLIGHT_FT / (p.mph() * 1.4667 * 0.92)      # ~8% speed loss on the way in


def target_xy(q: str, same_side: bool, offspeed: bool):
    """Plate target in inches, catcher's view: x + = pitcher's arm side, z = height."""
    inside = 1 if same_side else -1          # for a same-side hitter, inside is the arm side
    t = {"up-in": (7 * inside, 38), "up-away": (-7 * inside, 38), "down-in": (7 * inside, 22),
         "down-away": (-7 * inside, 22), "middle": (0, 30), "down-middle": (0, 22),
         "chase": ((-10 * inside, 14) if offspeed else (0, 46))}[q]
    return t


def path_at(p: Pitch, q: str, same_side: bool, secs_before_plate: float, level=None):
    """Where the pitch is (x, z inches) `secs_before_plate` before it reaches the plate."""
    tf = flight_time(p)
    u = max(0.0, 1 - secs_before_plate / tf)
    h_ratio, side = SLOTS.get(p.slot, SLOTS["three-quarter"])
    rx = side * 12 + p.release_offset_in[0]
    rz = h_ratio * p.height_ft * 12 + p.release_offset_in[1]
    ivb, hb = movement(p, level)
    mx, mz = hb, ivb - 0.5 * G_IN * tf ** 2           # total deviation from a straight line, incl. gravity
    tx, tz = target_xy(q, same_side, is_offspeed(p.kind))
    ax, az = tx - mx, tz - mz                          # aim point that lands on target
    return (rx + (ax - rx) * u + mx * u * u, rz + (az - rz) * u + mz * u * u)


def _remaining_break(p: Pitch, secs_before_plate: float, level=None):
    """Movement (incl. gravity) still to come after the decision point, inches (x, z)."""
    tf = flight_time(p)
    u = max(0.0, 1 - secs_before_plate / tf)
    ivb, hb = movement(p, level)
    mx, mz = hb, ivb - 0.5 * G_IN * tf ** 2
    return mx * (1 - u * u), mz * (1 - u * u)


def tunnel_score(p1: Pitch, q1: str, p2: Pitch, q2: str, same_side: bool, level=None):
    """-1..+1. High when two pitches look alike at the hitter's decision point and then
    split: by different late movement (break differential) and/or different finishing spots.
    Returns (score, inches apart at decision point, inches of break difference after it, inches apart at plate)."""
    a1, a2 = path_at(p1, q1, same_side, DECISION_S, level), path_at(p2, q2, same_side, DECISION_S, level)
    b1, b2 = path_at(p1, q1, same_side, 0.0, level), path_at(p2, q2, same_side, 0.0, level)
    r1, r2 = _remaining_break(p1, DECISION_S, level), _remaining_break(p2, DECISION_S, level)
    d_tunnel = ((a1[0] - a2[0]) ** 2 + (a1[1] - a2[1]) ** 2) ** 0.5
    d_plate = ((b1[0] - b2[0]) ** 2 + (b1[1] - b2[1]) ** 2) ** 0.5
    d_break = ((r1[0] - r2[0]) ** 2 + (r1[1] - r2[1]) ** 2) ** 0.5
    # a different release point tips the pitch out of the hand, before the decision point matters
    d_release = ((p1.release_offset_in[0] - p2.release_offset_in[0]) ** 2 +
                 (p1.release_offset_in[1] - p2.release_offset_in[1]) ** 2) ** 0.5
    score = 0.6 * min(d_break, 18) / 18 + 0.4 * min(d_plate, 24) / 24 - d_tunnel / 10 - d_release / 8
    return max(-1.0, min(1.0, score)), d_tunnel, d_break, d_plate


def resolve_speeds(arsenal):
    """v1.1 Step 1b: tell every pitch his main fastball's entered speed (0 if none), so a pitch with no speed of its own is
    read off it (Pitch.mph). Called where a call is solved (call_v08, solve_table, root_call) and lazily by outcome_probs;
    idempotent."""
    fb = primary_fb(arsenal) if arsenal else None
    v = float(fb.velo) if fb is not None and fb.velo else 0.0
    for x in arsenal:
        x.fb_mph = v
    return arsenal


def primary_fb(arsenal):
    """v1.1 (plan 2.1): his main fastball. The coach's mark; else the first of FB, SI, FC in his arsenal (the app passes
    the most-thrown one as the mark once his records show it); else his fastest pitch."""
    for x in arsenal:
        if getattr(x, "main", False):
            return x
    for k in FASTBALL_KINDS:
        for x in arsenal:
            if x.kind == k:
                return x
    return max(arsenal, key=lambda x: x.velo or default_mph(x.kind, x.shape))


def rel_shape(p, arsenal, level=None):
    """v1.1 (plan 2.1): (dmph = main FB - pitch, dIVB = pitch - main FB, HB arm side +), measured numbers when entered,
    else the profile defaults for his level."""
    fb = primary_fb(arsenal)
    ivb, hb = movement(p, level)
    return (round(fb.mph() - p.mph(), 3), round(ivb - movement(fb, level)[0], 3), hb)


def tag_for(kind, ivb, hb, mph, fb_mph, fb_ivb, fb_hb, level=None, type_=None):
    """v1.1 (plan 2.2): the tag for a measured pitch (a right-hander's numbers; mirror a lefty first). A pitch name that
    names a profile sets it; else the thresholds, first match wins: fastball-class kinds against the typical pitch of
    their kind at this level, off-speed against his main fastball. Movement thresholds scale by the level's movement
    ratio; speed gaps don't. "" = typical."""
    if type_ in PROFILE_NAMES and MIGRATE_BY_TYPE.get(type_, (None,))[0] == kind:
        return PROFILE_NAMES[type_]
    lv = level or PROFILE_LEVEL
    t, r = PROFILE_T, MOVE_RATIO.get(lv, 1.0)
    _, ti, th = profile(kind, "", lv)
    dmph, divb, dhb = fb_mph - mph, ivb - fb_ivb, hb - fb_hb
    if kind == "FB":
        if ivb >= ti + t["fb_rides_ivb"] * r: return "rides"
        if hb >= th + t["fb_runs_hb"] * r: return "runs"
        if hb <= th + t["fb_cuts_hb"] * r: return "cuts"
        if ivb <= ti + t["fb_straight_ivb"] * r and abs(hb - th) <= t["fb_straight_hb"] * r: return "straight"
    elif kind == "SI":
        if ivb >= ti + t["si_twoseam_ivb"] * r: return "two-seam"
        if ivb <= ti + t["si_drop_ivb"] * r: return "drop"
        if hb >= th + t["si_run_hb"] * r: return "run"
    elif kind == "FC":
        if hb <= t["fc_big_hb"] * r or dmph >= t["fc_big_dmph"]: return "big"
        if dmph <= t["fc_hard_dmph"] and hb >= t["fc_hard_hb"] * r: return "hard"
        if ivb >= ti + t["fc_ride_ivb"] * r: return "ride"
    elif kind == "SL":
        if hb <= t["sl_sweeper_hb"] * r: return "sweeper"
        if ivb <= t["sl_slurve_ivb"] * r and hb <= t["sl_slurve_hb"] * r: return "slurve"
        if abs(hb) <= t["sl_gyro_abshb"] * r: return "gyro"
        return "tight"
    elif kind == "CB":
        drop = -ivb
        if drop >= 2 * abs(hb): return "12-6"
        if abs(hb) >= drop: return "sweeping"
        if dmph <= t["cb_power_dmph"]: return "power"
        if dmph >= t["cb_slow_dmph"]: return "slow"
    elif kind == "CH":
        if dmph <= t["ch_firm_dmph"]: return "firm"
        if divb <= t["ch_split_divb"] * r and abs(dhb) <= t["ch_split_dhb"] * r: return "split"
        if divb <= t["ch_drop_divb"] * r: return "drop"
        if dhb >= t["ch_fade_dhb"] * r: return "fade"
    return ""


KIND_W_OS = dict(ZONE_CLASS["whiff_os"])   # v1.0's off-speed class whiff weights (hand-set; the zone table's "class")


def class_terms(p: Pitch, q: str, s: Situation):
    """The off-speed class terms, v1.0's hand values: class whiff weight (KIND_W), the off-speed location line (down or
    chase helps, up hangs), "aimed up or middle leaves it up" on hard contact, and +0.2 on chasing an off-speed ball off
    the plate. v1.1 Step 2's fitted class values (results/v11/step2_terms.txt, "Class terms") would replace these, as the
    plan's 2a says, but they move the calls past Drew's v1.0 floors (hitter's-count fastball share 36%); held for his
    decision (BUILD_v1.1_REPORT). Fastballs: 0 (their differences are profile_terms')."""
    if is_fastball(p.kind):
        return {"whiff": 0.0, "chase": {"off": 0.0, "noncomp": 0.0}, "cstrike": 0.0, "hard": 0.0}
    zc = ZONE_CLASS          # v1.3 Part 2: the numbers are the zone table's "class" terms (zone_v12.json: v1.0's values)
    up = q.startswith("up")
    f = zc["line_low"] if (not up or q == "chase") else zc["line_up"]
    return {"whiff": (KIND_W_OS[p.kind] - W_FB) + zc["line_whiff"] * f, "chase": zc["chase_os"], "cstrike": 0.0,
            "hard": zc["line_hard"] * f + (zc["up_mid_hard"] if (up or q == "middle") else 0.0)}


def pt_key(p):
    """the (kind, tag) key of the profile tables; a tag with no row uses its kind's typical row"""
    k = p.kind + "|" + (p.shape or "")
    return k if k in GB_PROFILE else p.kind + "|"


_PT_REF = {}


def pt_ref(c, level):
    """the typical pitch of class c at this level, in profile_terms' units (MLB scale), thrown off the typical four-seam
    from a 3/4 slot: the point where the profile terms are 0, so every level's typical pitch keeps its v1.0 class value"""
    k = (c, level)
    if k not in _PT_REF:
        r = MOVE_RATIO.get(level or PROFILE_LEVEL, 1.0)
        dm = profile(c, "", level)[0]
        ivb, hb = movement(Pitch("_ref", c, 3, 3, 0.7, shape=""), level)             # 3/4 slot (the Pitch default)
        fbi = movement(Pitch("_ref", "FB", 3, 3, 0.7, shape=""), level)[0]
        vert = ivb / r - PT_FB_IVB if c == "FB" else (ivb - fbi) / r
        _PT_REF[k] = (dm, vert, hb / r, SLOT_ANGLE["three-quarter"])
    return _PT_REF[k]


def profile_terms(p: Pitch, q: str, s: Situation, arsenal):
    """v1.1 Step 2 (plan 2.3): the profile's logit terms on whiff | swing, chase (swing | out of the zone), called strike
    | take and hard | contact, as differences from the typical pitch of its class (which keeps its v1.0 value).
    Fitted: shape (PT_C: speed off his main fastball, vertical, arm-side break, arm angle), the profile beyond its shape
    (PT_B), the fastball zone (PT_FBZ_W), the opposite-side chase (PT_CHASE_OPP). Priors: PT_FBZ_H, PT_PLAT.
    Movement is read on the MLB scale; at HS every term is scaled by RHO_L."""
    lv = s.level
    r = MOVE_RATIO.get(lv, 1.0)
    fbc = is_fastball(p.kind)
    c = "FB" if fbc else p.kind
    fb = primary_fb(arsenal)
    ivb, hb = movement(p, lv)
    vert = ivb / r - PT_FB_IVB if fbc else (ivb - movement(fb, lv)[0]) / r
    x = (fb.mph() - p.mph(), vert, hb / r, SLOT_ANGLE.get(p.slot, SLOT_ANGLE["three-quarter"]))
    ref = pt_ref(c, lv)
    key = pt_key(p)
    t = {}
    for tgt in ("whiff", "chase", "cstrike", "hard"):
        b = PT_C[tgt][c]
        v = b[0] * (x[0] - ref[0]) + b[1] * (x[1] - ref[1]) + b[2] * (x[2] - ref[2]) + b[3] * (x[3] - ref[3])
        if tgt in PT_B:
            v += PT_B[tgt][key]
        t[tgt] = v
    side = 0 if s.same_side else 1
    ss = 2 * side + (1 if s.strikes == 2 else 0)          # (same, early), (same, 2k), (opp, early), (opp, 2k)
    if fbc:
        h = "up" if (q.startswith("up") or q == "chase") else ("down" if q.startswith("down") else "mid")
        zw = PT_FBZ_W[key]
        t["whiff"] += (zw[0] if h == "up" else (zw[1] if h == "down" else 0.0)) + (zw[2 + side] if q.endswith("-in") else 0.0)
        if key in PT_FBZ_H:
            t["hard"] += PT_FBZ_H[key][4 * ("up", "mid", "down").index(h) + ss]
        # v1.1 Step 4 (Drew): the target is where it crosses; hard contact by that lane (a sinker in to a same-side hitter
        # is hit softer than a four-seam there, away harder). Chase has no lane.
        ln = "in" if q.endswith("-in") else ("away" if q.endswith("-away") else ("mid" if q in ("middle", "down-middle") else None))
        if ln and key in PT_FBL_H:
            t["hard"] += PT_FBL_H[key][2 * ("in", "away", "mid").index(ln) + side]
    for tgt in ("whiff", "hard", "chase", "cstrike"):
        if tgt in PT_PLAT:
            t[tgt] += PT_PLAT[tgt][key][ss]
    if not s.same_side:
        co = PT_CHASE_OPP[c]
        t["chase"] += co[0] + co[1] * x[2] + co[2] * x[1] - PT_CHASE_MEAN[pclass(p.kind)]
    rho = RHO_L.get(lv, 1.0)
    return {k: rho * v for k, v in t.items()}


# v0.6e: hitter damage scaled so a strong masher (0.8, well established) is worth about +0.03 runs per pitch at MLB,
# the range of the best fastball hitters' pitch values (FanGraphs 2021: +2.5 to +3.7 runs per 100 four-seamers).
DMG_SCALE = 3.0


def damage(p: Pitch, q: str, s: Situation):
    """[R5] Hitter's damage read for this pitch class and location, shrunk toward 0.
    Strengths (+) count fully; holes (-) count half until well established (20+ pitches)."""
    total = 0.0
    osp = hit_tag(s, "offspeed") > 0 and is_offspeed(p.kind)     # v1.2 Part B: the coach's "hits off-speed hard" prior
    for key in (pclass(p.kind), key_kind(p.kind) + "|" + q):     # v1.0 #21: spot read per pitch kind (v1.1: key_kind)
        if osp and key == "OS":
            score, n = s.hitter_damage.get("OS", (0.0, 0))
            n2 = n + HIT_OS_N0
            score, n = (score * n + HIT_OS_PRIOR * HIT_OS_N0) / n2, n2
        elif key in s.hitter_damage:
            score, n = s.hitter_damage[key]
        else:
            continue
        eff = score * n / (n + 10.0)
        if eff < 0 and n < 20:
            eff *= 0.5
        total += eff
    return total


# ---------------------------------------------------------------------------
# v0.8 hitter expectation, timing and pair terms (docs/SPEC_v0.8.md sections 2-5, 8)
# ---------------------------------------------------------------------------

def sit_options(arsenal):
    """2.1 pure sits: (pitch name, height), in arsenal order."""
    return [(x.name, j) for x in arsenal for j in HEIGHTS]


def sit_prior(arsenal, s):
    """v0.7c count prior over pitches (no policy, no usage), split evenly over heights."""
    m = len(arsenal)
    hitters_count = s.balls > s.strikes and s.strikes < 2
    fb = [x for x in arsenal if is_fastball(x.kind)]
    os_ = [x for x in arsenal if not is_fastball(x.kind)]
    if fb and os_:
        fb_share = 0.65 if hitters_count else (0.35 if s.strikes == 2 else 0.5)
        pr = {x.name: (fb_share / len(fb) if is_fastball(x.kind) else (1 - fb_share) / len(os_)) for x in arsenal}
    else:
        pr = {x.name: 1 / m for x in arsenal}
    return {(n, j): pr[n] / len(HEIGHTS) for n in pr for j in HEIGHTS}


def speed_today(p, s):
    """8.1 his speed with this pitch today: radar if logged, else listed speed minus the fatigue loss."""
    if p.name in s.radar:
        return s.radar[p.name]
    v = p.mph()
    v -= min(P08["kv_cap"], P08["kv"] * max(0, s.pitch_count - LEVEL[s.level]["fatigue"]) / 10)
    return v


def sit_shift(p, q, arsenal, s, sit):
    """2.2 (m_t, m_h, v_sit): the sit's type and height terms for call (p, q) and the speed the sit times him for.
    sit = ('pure', name, height) or ('mix', sigma)."""
    k_t = len(arsenal)
    if sit[0] == "pure":
        _, i, j = sit
        sp = next(x for x in arsenal if x.name == i)
        return (1.0 if p.name == i else 0.0) - 1 / k_t, height_member(q, p.kind, j) - 1 / len(HEIGHTS), speed_today(sp, s)
    sigma = sit[1]
    mt = sum(v for (n, j), v in sigma.items() if n == p.name) - 1 / k_t
    mh = sum(v * height_member(q, p.kind, j) for (n, j), v in sigma.items()) - 1 / len(HEIGHTS)
    vs = sum(v * speed_today(next(x for x in arsenal if x.name == n), s) for (n, j), v in sigma.items())
    return mt, mh, vs


def timing_B(p, q, s, v_sit):
    """3.1 timing surprise benefit, 0..1."""
    v_hat = s.look[0] if s.look else v_sit
    vt = (1 - P08["alpha"]) * v_hat + P08["alpha"] * v_sit
    vp = speed_today(p, s) + 0.5 * ev_adj(p, q)
    r = (vt - vp) / vt
    sr = min(1.0, max(0.0, (abs(r) - P08["dead"]) / P08["ramp"]))
    if r < 0:
        return P08["fast_mult"] * sr
    if p.kind == "CH" and r > P08["ch_hi"]:
        return sr * exp(-(r - P08["ch_hi"]) / P08["ch_decay"])
    return sr


def g_mod(d, dstar):
    """4.1 moderate-is-best curve: 0 at d <= 0, peak 1 at d = d*."""
    return (d / dstar) * exp(1 - d / dstar) if d > 0 else 0.0


def pair_terms(p, q, s, arsenal):
    """4.1-4.3 (whiff shift, off-zone swing shift) from eye level, tunneling and repeats; halved in a big spot."""
    y_hat = s.look[1] if s.look else 2.5
    ey = g_mod((1 if is_fastball(p.kind) else -1) * (y_target(q, p.kind) - y_hat), P08["dstar_E"])
    rho = RHO_L.get(s.level, 1.0)       # v1.0 #19: every MLB-fitted behavioral term scales by RHO_L (eye level, tunneling)
    w = rho * (P08["beta_E"] * ey)
    sw = rho * (P08["beta_E_S"] * ey)
    if s.last:
        last = next((x for x in arsenal if x.name == s.last[0]), None)
        lq = s.last[1]
        res = s.last[2] if len(s.last) > 2 else None
        if last is not None:
            if last.name == p.name:
                if res == "whiff":
                    w += P08["rep_whiff_same"] if lq == q else P08["rep_whiff_other"]
                elif lq == q and res not in ("ball", "cstrike"):
                    w += P08["rep_same_spot"]      # v1.0 D8: after a foul or contact only; a take is no reason to move
            else:
                _, d_tun, _, d_plate = tunnel_score(last, lq, p, q, s.same_side, s.level)
                d_rel = ((last.release_offset_in[0] - p.release_offset_in[0]) ** 2 +
                         (last.release_offset_in[1] - p.release_offset_in[1]) ** 2) ** 0.5
                tun = max(-1.0, min(1.0, exp(-d_tun / 6) * g_mod(d_plate, 18) - d_rel / 8))
                kap = P08["kappa_brk"] if p.kind in ("SL", "CB") else 1.0
                w += rho * (kap * P08["beta_tun_whiff"] * tun)     # v1.0 D5: whiff and chase-swing tunneling, each from its fit
                sw += rho * (kap * P08["beta_tun_chase"] * tun)
    if is_big_spot(s):
        w, sw = 0.5 * w, 0.5 * sw
    return w, sw


def _bin(x, edges):
    """np.digitize(x, edges) (right=False): the number of edges at or below x"""
    return sum(1 for e in edges if x >= e)


def pitch_velo_factors(p, s, arsenal):
    """v1.3 core (Drew's ruling 4): HS / travel's pitch kind x velocity multipliers on the six pitch events (ball, hbp,
    called strike, whiff, foul, in play), defined exactly as the fit (hitter_data/fit_count_hs.pitch_table): the count's
    kind multiplier x relative-velocity multiplier x absolute-velocity multiplier. Velocity is the pitch's entered arsenal
    speed (Pitch.velo); relative = velo minus the mean entered speed of his arsenal's pitches of the same class (the fit's
    "his own mean for that class"). No entered speed: both velocity terms are skipped, as the fit skips missing velocity
    (the kind term still applies). None when the level's count table has no pitch_velo (every level but hs / travel)."""
    L = _CT.get(s.level) or _CT.get(TABLE_LEVEL_ALIAS.get(s.level, ""))
    T = L.get("pitch_velo") if L else None
    if not T:
        return None
    c = f"{s.balls}-{s.strikes}"
    f = list(T["kind"][c][T["engine_kind"][p.kind]])
    if p.velo:
        cls = T["engine_class"][p.kind]
        pool = list(arsenal) if any(x is p for x in arsenal) else list(arsenal) + [p]
        vs = [x.velo for x in pool if x.velo and T["engine_class"][x.kind] == cls]
        rel = p.velo - sum(vs) / len(vs)
        fr = T["velo_rel"][c][cls][_bin(rel, T["vrel_edges"])]
        fa = T["velo_abs"][c][cls][_bin(p.velo, T["vabs_edges"][cls])]
        f = [f[i] * fr[i] * fa[i] for i in range(6)]
    return f


def hanger_gate(p, s):
    """v1.3 core (Drew's ruling 3): the extra hard-contact logit for an off-speed pitch landing over the heart,
    HANGER_GATE x min(1, wild_today / HANGER_GATE_FULL) when wild_today > 0, else 0 (and 0 for fastballs or H = 0)."""
    if not HANGER_GATE or not is_offspeed(p.kind):
        return 0.0
    wt = wild_today(p, s)
    return HANGER_GATE * min(1.0, wt / HANGER_GATE_FULL) if wt > 0 else 0.0


class _OPConst:
    """Speed only (feat/sim-speed): the parts of outcome_probs that don't depend on the hitter's look or sit, for one
    (pitch, target, situation apart from its look). Each float is built by the same expression, in the same order, as the
    single-pass form it replaced, so outcome_probs returns bit-identical numbers (hitter_data/sim_speed.py proof).
    solve_table keeps these per (pitch, target, count) for one solve, where only the look and the sit change."""
    __slots__ = ("big", "hL", "pv", "bands")


def _op_const(p, q, s, arsenal):
    L = LEVEL[s.level]
    A = OUTCOME_ADJ[s.level]
    big = is_big_spot(s)
    cL = L["cL"] * (1.5 if big else 1.0)
    hL = L["hL"]
    gr = s.grades or GRADES_OVERRIDE    # 8.2 (override: fit hook)
    ct = class_terms(p, q, s)
    pt = profile_terms(p, q, s, arsenal)
    dmg = damage(p, q, s)
    tau = s.timing.get("OS" if is_offspeed(p.kind) else "FB", 0.0)
    tau_eff = tau if is_fastball(p.kind) else -tau        # late (+) helps fastballs, early (-) helps off-speed

    t_appr, rho_h = hit_tag(s, "approach"), RHO_L.get(s.level, 1.0)      # v1.2 Part B (0 = unknown: no effect)
    land = landing(p, q, s)
    lean_h, lean_w = lean_hbp_wp(p, q, s)     # v1.2: (1.0, 1.0) without a lean
    command, grade = effective(p, s)
    grade = grade - min(P08["kg_cap"], P08["kg"] * max(0, s.pitch_count - LEVEL[s.level]["fatigue"]) / 20)
    gs = 0.25 * L.get("stuff_scale", 1.0)        # v0.7: one grade point of stuff = one SD of real pitchers (fit_spread.py)
    # v0.7b command and swing-and-miss: real pitchers' walk and strikeout rates are nearly independent (correlation about
    # -0.1 in 2026 D3 and D1 lines), so better command must not also buy many more strikeouts. Precise pitchers work in
    # and around the zone, where hitters make more contact; this term sets how much (fit_spread.py). 0 = off.
    cw = L.get("cmd_whiff", 0.0) * (command - 3)
    # v1.3 Part 2: the count layer (count table: offsets by count and band, by base-out, the called-strike kappa) and the zone
    # table's fitted cells (by band, profile, count group, height of the target). v12 files: v1.2's count terms, cells 0.
    cnt, kap, _ = count_cells(s.level, s.balls, s.strikes)
    bo_sw = count_base_out(s.level, s.outs, s.bases)
    zcell = zone_cells(s.level, zone_profile(p), count_group(s.balls, s.strikes), _T_HT[target_height(q, p.kind)])
    gate = hanger_gate(p, s)
    bands = []
    for z, pz in land.items():
        c_sw, c_wh, c_fo, c_hd = cnt[z]
        z_sw, z_cs, z_wh, z_fo, z_hd = zcell[z]
        # swing (hitter behavior by count: modeled, not a pitcher rule). v1.2's count terms (count_v12.json): +0.9 at two
        # strikes, -0.4 at 0-0, -2.0 at 3-0, hitter's counts +0.3 in the zone and -0.4 out of it.
        # The swing logit is built as: sl (here) + the sit term + (off the zone) the pair term ps + each of sl_post in turn.
        sl = logit(S0[z])
        sl += c_sw
        sl += bo_sw
        if z in ("off", "noncomp"):
            sl += ct["chase"][z]
        sl += z_sw
        wz_ = ZONE_IN[z]            # v0.6: share of this landing band inside the rulebook zone
        sl += wz_ * A["zsw"] + (1 - wz_) * A["osw"]
        offz = z in ("off", "noncomp")
        sl_post = []
        if gr and offz:
            sl_post.append(-(gval("g_d", s.level) * (gr.get("d", 3) - 3)))     # x - y is exactly x + (-y)
        sl_post.append(side_shift(p, q, s, z, "swing"))
        if t_appr and (s.balls, s.strikes) in EARLY_COUNTS:      # v1.2 Part B: early-count approach, in-zone swings
            sl_post.append(rho_h * HIT_FIT["approach"] * t_appr * wz_)
        if offz:
            sl_post.append(pt["chase"])
        if z in ("edge", "off"):
            C = sig(logit(C0[z]) + A["cs"] + kap + s.ump_u + ct["cstrike"] + pt["cstrike"] + z_cs)
        else:
            C = C0[z]
        # whiff: wl0, + (the clamped sit / timing term ex - the damage term), + (pw + class whiff), + each of wl_post
        wl0 = logit(W0[z]) + W_FB + gs * (grade - 3) + cL * 1.5 * (p.conf - 0.6)
        w_tau = hL * 0.6 * tau_eff
        w_lo, w_hi = -P08["capW"] * hL, P08["capW"] * hL
        w_dmg = hL * 0.4 * DMG_SCALE * dmg
        wl_post = [c_wh + z_wh, wz_ * A["wz"] + (1 - wz_) * A["wo"]]
        if cw:
            wl_post.append(-cw)
        if gr:
            wl_post.append(-(gval("g_c", s.level) * (gr.get("c", 3) - 3)))
        if s.matchup:
            wl_post.append(matchup_whiff(p, q, s))
        wl_post.append(side_shift(p, q, s, z, "whiff"))
        wl_post.append(pt["whiff"])
        F = sig(logit(F0[z]) + c_fo + z_fo)          # v1.2: +0.3 at two strikes (count_v12.json)
        # contact quality: shift hard share. hl0 + the clamped sit / timing term hx + damage + class hard + each of hl_post
        h_tau = hL * 0.5 * tau_eff
        h_lo, h_hi = -P08["capH"] * hL, P08["capH"] * hL
        hl0 = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6)
        h_dmg = hL * 0.8 * DMG_SCALE * dmg
        c_ = "OS" if is_offspeed(p.kind) else "FB"
        hl_post = [RHO_L.get(s.level, 1.0) * min(P08["fam_cap"], P08["phi_" + c_] * s.familiar.get(c_, 0))]   # familiarity within the game (#19: x RHO_L)
        if gr:
            hl_post.append(gval("g_w", s.level) * (gr.get("w", 3) - 3))
        if s.crowding and q in ("up-in", "down-in"):
            hl_post.append(-P08["crowd"])
        if z == "heart" and is_offspeed(p.kind):
            hl_post.append(HANGER)     # hanger: off-speed over the middle gets hit hard (zone table class term; v1.2 +0.5)
            if gate:
                hl_post.append(gate)   # v1.3 core (ruling 3): the quality-gated hanger, only while he isn't landing it today
        hl_post.append(c_hd + z_hd)
        hl_post.append(side_shift(p, q, s, z, "hard"))
        hl_post.append(pt["hard"])
        weak, solid, hard = Q0[z]
        hb = wp = None
        if z in ("noncomp", "off") and A["hbp"] > 0:   # v0.6: hit by pitch
            hb = min(0.9, A["hbp"] * hbp_loc(p, q) * (1.0 if z == "noncomp" else 0.1))
            if lean_h != 1.0:
                hb = min(0.9, hb * lean_h)
        if z == "noncomp" and any(s.bases):   # wild pitch risk with runners on
            wp = (0.12 if is_offspeed(p.kind) else 0.04) * (1 - 0.15 * (s.catcher_block - 3))
            if lean_w != 1.0:
                wp = min(0.9, wp * lean_w)
        bands.append((z, pz, sl, offz, tuple(sl_post), S0[z] > 0, C, wl0, w_tau, w_lo, w_hi, w_dmg, ct["whiff"],
                      tuple(wl_post), F, h_tau, h_lo, h_hi, hl0, h_dmg, ct["hard"], tuple(hl_post), logit(hard), weak,
                      solid, hb, wp, wz_))
    K = _OPConst()
    K.big, K.hL, K.bands = big, hL, tuple(bands)
    K.pv = pitch_velo_factors(p, s, arsenal)
    return K


def outcome_probs(p: Pitch, q: str, s: Situation, arsenal, policy=None, stats=None, sit=None, zout=None, _pre=None):
    """_pre (speed only): a dict solve_table keeps for one solve, holding _op_const per (pitch, target, count). Every call
    sharing it must have the same situation apart from its look."""
    if p.fb_mph is None:
        resolve_speeds(arsenal)
        if p.fb_mph is None:          # a pitch passed with an arsenal that doesn't hold it
            resolve_speeds([p] + [x for x in arsenal if x is not p])
    if sit is None:
        sit = ("mix", s.sit_sigma if s.sit_sigma is not None else sit_prior(arsenal, s))
    if _pre is None:
        K = _op_const(p, q, s, arsenal)
    else:
        key = (p.name, q, s.balls, s.strikes)
        K = _pre.get(key)
        if K is None:
            K = _pre[key] = _op_const(p, q, s, arsenal)
    big, hL = K.big, K.hL
    if _pre is None or sit[0] == "pure":
        m_t, m_h, v_sit = sit_shift(p, q, arsenal, s, sit)          # 2.2 what he's sitting on
    else:                         # the same sums as sit_shift's mix branch, with its members / speeds looked up
        ks = ("sit", p.name, q, s.balls, s.strikes)
        hm_sp = _pre.get(ks)
        if hm_sp is None:
            hm_sp = _pre[ks] = ({j: height_member(q, p.kind, j) for j in HEIGHTS},
                                {x.name: speed_today(x, s) for x in arsenal})
        hm, sp_ = hm_sp
        sigma = sit[1]
        m_t = sum(v for (n, j), v in sigma.items() if n == p.name) - 1 / len(arsenal)
        m_h = sum(v * hm[j] for (n, j), v in sigma.items()) - 1 / len(HEIGHTS)
        v_sit = sum(v * sp_[n] for (n, j), v in sigma.items())
    pw, ps = pair_terms(p, q, s, arsenal)
    tB = RHO_L.get(s.level, 1.0) * timing_B(p, q, s, v_sit) * (0.5 if big else 1.0)   # 4: pair terms halved in a big spot
    sitS = hL * (P08["sit_tS"] * m_t + P08["sit_hS"] * m_h)
    exW = -hL * (P08["sit_tW"] * m_t + P08["sit_hW"] * m_h)
    bTtB = P08["beta_T"] * tB
    exH = hL * (P08["sit_tH"] * m_t + P08["sit_hH"] * m_h)
    gTtB = P08["gamma_T"] * tB
    o_ball = o_cs = o_wh = o_fo = o_weak = o_solid = o_hard = o_wp = o_hbp = 0
    for (z, pz, sl, offz, sl_post, s_on, C, wl, w_tau, w_lo, w_hi, w_dmg, ctw, wl_post, F, h_tau, h_lo, h_hi, hl, h_dmg,
         cth, hl_post, lg_hard, weak, solid, hb, wp, wz_) in K.bands:
        sl += sitS
        if offz:
            sl += ps
        for x in sl_post:
            sl += x
        S = sig(sl) if s_on else 0
        ex = exW + w_tau + bTtB
        ex = max(w_lo, min(w_hi, ex))
        wl += ex - w_dmg
        wl += pw + ctw
        for x in wl_post:
            wl += x
        W = sig(wl)
        hx = exH - h_tau - gTtB
        hx = max(h_lo, min(h_hi, hx))
        hl = hl + hx + h_dmg + cth
        for x in hl_post:
            hl += x
        hard2 = sig(lg_hard + hl)
        if zout is not None:
            zout[z] = dict(L=pz, S=S, C=C, W=W, F=F, H=hard2, offz=offz, cz=z in ("edge", "off"))
        scale = (1 - hard2) / (weak + solid)
        weak2, solid2 = weak * scale, solid * scale

        take = 1 - S
        ball_p = pz * take * (1 - C)
        if hb is not None:
            o_hbp += ball_p * hb
            ball_p *= (1 - hb)
        if wp is not None:
            o_wp += ball_p * wp
            ball_p *= (1 - wp)
        o_ball += ball_p
        o_cs += pz * take * C
        o_wh += pz * S * W
        o_fo += pz * S * (1 - W) * F
        contact = pz * S * (1 - W) * (1 - F)
        o_weak += contact * weak2
        o_solid += contact * solid2
        o_hard += contact * hard2
        if stats is not None:
            stats["pitches"] += pz
            stats["zone"] += pz * wz_
            stats["zswing"] += pz * S * wz_
            stats["oswing"] += pz * S * (1 - wz_)
            stats["zcontact"] += pz * S * (1 - W) * wz_
            stats["ocontact"] += pz * S * (1 - W) * (1 - wz_)
    out = {"ball": o_ball, "cstrike": o_cs, "whiff": o_wh, "foul": o_fo, "weak": o_weak, "solid": o_solid, "hard": o_hard,
           "wp_ball": o_wp, "hbp": o_hbp}
    pv = K.pv
    if pv is not None:            # v1.3 core (ruling 4): HS / travel pitch kind x velocity, then renormalise (as the fit)
        mb, mh, mc, mw, mf, mi = pv
        for k_, m_ in (("ball", mb), ("wp_ball", mb), ("hbp", mh), ("cstrike", mc), ("whiff", mw), ("foul", mf),
                       ("weak", mi), ("solid", mi), ("hard", mi)):
            out[k_] *= m_
        tot = (out["ball"] + out["wp_ball"] + out["hbp"] + out["cstrike"] + out["whiff"] + out["foul"]
               + out["weak"] + out["solid"] + out["hard"])
        for k_ in out:
            out[k_] /= tot
    return out


# ---------------------------------------------------------------------------
# Situation terms: what each outcome does to the game
# ---------------------------------------------------------------------------


def end_pa_value(outs, bases, runs, level="mlb"):
    return runs + re(outs, bases, level)


# v0.8 typed batted-ball tables: OUT_TABLE[level][contact][type] = (out, 1B, 2B, 3B, HR, E) and the runner rules. v1.3 Part 2:
# from the count table (out_table / runner per level; count_v12.json = inplay_fit.py's inplay_typed_params.py). A level the
# file leaves out (college D2) gets D3's in _fill_d2_placeholders.
OUT_TABLE = {lv: L["out_table"] for lv, L in _CT.items() if "out_table" in L}
RUNNER_FIT = {lv: L["runner"] for lv, L in _CT.items() if "out_table" in L}
for _t in (OUT_TABLE, RUNNER_FIT):
    for _a, _b in TABLE_LEVEL_ALIAS.items():
        if _b in _t and _a not in _t:
            _t[_a] = _t[_b]
B_TYPES = ("GB", "LD", "FB", "PU")


def gb_rate(p):
    """7.3 MLB ground-ball rate | ball in play by kind and profile: v1.1 Step 2e (2024 Statcast, GB_PROFILE; same definition
    as v1.0's TYPED["gb"], seq_fit.py gb_types). A profile with under 200 balls in play uses its kind's rate."""
    return GB_PROFILE[pt_key(p)]


def type_mix(p, q, c, s=None):
    """batted-ball type mix of contact quality c; with a situation, plus the count table's ground-ball offset (bip_gb) for
    its level and count (v1.3 Part 2; 0 in count_v12.json)"""
    g = sig(logit(gb_rate(p)) + TYPED["beta_y"] * (y_target(q, p.kind) - 2.5) + TYPED["gamma"][c]
            + (count_cells(s.level, s.balls, s.strikes)[2] if s is not None else 0.0) + GB_KIND.get(p.kind, 0.0))
    lfp = TYPED["nongb"][c]
    return {"GB": g, "LD": (1 - g) * lfp[0], "FB": (1 - g) * lfp[1], "PU": (1 - g) * lfp[2]}


def v_end(s, o, bases, r):
    """7.2 end-of-plate-appearance value (runs, or run-equivalents with the win blend fixed at the PA start)."""
    base = r + re(o, bases, s.level)
    w = s.win
    if not (w and w["omega"] > 0):
        return base
    we = w["we"](o, bases, w["margin0"] - r)
    return (1 - w["omega"]) * base + w["omega"] * (w["WE0"] - we) / w["m0"]


def in_play_value_typed(c, p, q, s):
    """7.3 value of contact quality c on call (p, q), by batted-ball type and its runner rules."""
    o, (b1, b2, b3), L = s.outs, s.bases, s.level
    tab, rf = OUT_TABLE[L][c], RUNNER_FIT[L]
    ev = lambda o_, b_, r_: v_end(s, o_, b_, r_)
    tm = type_mix(p, q, c, s)
    gr = (s.grades or GRADES_OVERRIDE) if c == "hard" else None
    dh = power_hr_shift(s, gr) if gr else 0.0
    total = 0.0
    for t in B_TYPES:
        po, p1, p2, p3, phr, pe = tab[t]
        if dh and 0 < phr < 1:                 # item 8: more of a power hitter's hard contact leaves the park
            nhr = sig(logit(phr) + dh)
            po, phr = max(0.0, po - (nhr - phr)), nhr
        if s.infield_in and t == "GB":         # v1.0 #12: drawn in, more ground balls get through (outs -> singles)
            sh = min(po, TYPED["gb_babip_in"])
            po, p1 = po - sh, p1 + sh
        # out
        if o + 1 >= 3:
            v_out = ev(3, (False, False, False), 0)
        else:
            if t == "GB":
                psc = TYPED["gb_infield_in"] if s.infield_in else rf["p_GB"]
                dp = min(0.95, TYPED["dp"][c] * rf["S_DP"]) if b1 else 0.0
            elif t == "FB":
                psc, dp = rf["p_FB"], 0.0
            else:
                psc, dp = 0.01, 0.0
            if dp:
                v_dp = ev(3, (False, False, False), 0) if o + 2 >= 3 else ev(o + 2, (False, False, b2), 1 if b3 else 0)
            else:
                v_dp = 0.0
            adv = TYPED["r2_to_3rd"].get(t, 0.0)
            def after(scored):
                third_open = not b3 or scored
                if b2 and third_open and adv:
                    return adv * ev(o + 1, (b1, False, True), 1 if (b3 and scored) else 0) + \
                        (1 - adv) * ev(o + 1, (b1, b2, b3 and not scored), 1 if (b3 and scored) else 0)
                return ev(o + 1, (b1, b2, b3 and not scored), 1 if (b3 and scored) else 0)
            v_reg = (psc * after(True) + (1 - psc) * after(False)) if b3 else after(False)
            v_out = dp * v_dp + (1 - dp) * v_reg
        total_t = po * v_out
        runs = 1 if b3 else 0
        if b2:
            v1 = 0.55 * ev(o, (True, b1, False), runs + 1) + 0.45 * ev(o, (True, b1, True), runs)
        else:
            v1 = ev(o, (True, b1, False), runs)
        total_t += (p1 + pe) * v1
        runs = (1 if b2 else 0) + (1 if b3 else 0)
        if b1:
            v2 = 0.4 * ev(o, (False, True, False), runs + 1) + 0.6 * ev(o, (False, True, True), runs)
        else:
            v2 = ev(o, (False, True, False), runs)
        total_t += p2 * v2
        total_t += p3 * ev(o, (False, False, True), b1 + b2 + b3)
        total_t += phr * ev(o, (False, False, False), b1 + b2 + b3 + 1)
        total += tm[t] * total_t
    return total


def walk_value(outs, bases, level="mlb"):
    b1, b2, b3 = bases
    runs = 1 if (b1 and b2 and b3) else 0
    nb = (True, b1 or b2, b3 or (b1 and b2))   # forced advances only
    return end_pa_value(outs, nb, runs, level)


def advance_all(bases):
    b1, b2, b3 = bases
    return (False, b1, b2), (1 if b3 else 0)


# ---------------------------------------------------------------------------
# Decision rule: [R1] weighted random pick at a game-theory balance point
# ---------------------------------------------------------------------------

# v1.2.2 (Drew, Nov 14): the confidence band. A pitch under the cutoff but within RAMP_W of it is neither in nor out: the
# root call blends the call with it allowed and the call without it, weighted by how far up the band it sits
# (band_weight: 0 at the bottom, 1 at the cutoff). So one called strike or ball near the cutoff moves its share a few
# points instead of switching it between none and its full share (game-readiness review, problem 2). When nothing clears
# the cutoff the same blend mixes his band pitches (Drew D2: mix), and the band applies in every count (D3). The PA table,
# setup payoffs (check 3) and the shake-off rules keep the trusted set as before.
RAMP_W = 0.10
RAMP_MIN_W = 1e-3          # blend combinations under this weight are skipped


def band_weight(p, s):
    """v1.2.2: 1 at or over the level's cutoff, 0 at or under cutoff - RAMP_W, linear in between"""
    cutoff = LEVEL[s.level]["cutoff"]
    if p.conf >= cutoff:
        return 1.0
    return max(0.0, (p.conf - (cutoff - RAMP_W)) / RAMP_W)


def band_pitches(arsenal, s, exclude=None):
    """v1.2.2: names of the pitches inside the band (not shaken off this at-bat), in arsenal order"""
    ex = shaken_names(exclude)
    return [x.name for x in arsenal if 0.0 < band_weight(x, s) < 1.0 and x.name not in ex]


def candidates(arsenal, s, forced=None, extra=()):
    """the pitches he trusts now (conf at or over the level's cutoff); extra: band pitches the root call allows (v1.2.2)"""
    cutoff = LEVEL[s.level]["cutoff"]
    c = [x for x in arsenal if x.conf >= cutoff or x.name in extra or (forced and x.name == forced)]
    if not c:
        # v0.4: he trusts nothing right now. Fall back to his most-trusted pitch;
        # the app should flag this to the coach as a sign it may be time for a change.
        c = [max(arsenal, key=lambda x: x.conf)]
    return c


import json as _json, os as _os
# walk and strikeout run values by level (v1.3 Part 2: the run table; v1.2's came from college_run_values.json)
LW_BY_LEVEL = {lv: (L["lw"]["bb"], L["lw"]["k"]) for lv, L in _RUN_T.items()}
LW_BY_LEVEL["college"] = LW_BY_LEVEL["college_d1"]

# v0.7c travel ball (Drew): uses the high school numbers until there's travel-ball data of its own
for _t in (LEVEL, OUTCOME_ADJ, RE_BY_LEVEL, CV_BY_LEVEL, IN_PLAY_BY_LEVEL, LW_BY_LEVEL):
    if "hs" in _t:
        _t["travel"] = _t["hs"]


def zone_area(b, k):
    """7.5 called-zone size by count, sq ft (3.7 at 3-0, 2.4 at 0-2; linear in between until the Statcast fit)."""
    return 3.03 + 0.22 * b - 0.30 * k


A_BAR = {}   # 7.5 weighted geometric mean of zone_area per level (sim_constants.json); 3.0 until computed
I_BAR_UMP = {}   # 7.5 average per-take information d^2/(p(1-p)) per level (sim_constants.json)
SIM_CONST = {}
try:
    SIM_CONST = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "sim_constants.json")))
    A_BAR.update(SIM_CONST.get("A_BAR", {})); I_BAR_UMP.update(SIM_CONST.get("I_BAR_UMP", {}))
except Exception:
    pass


GRADES_OVERRIDE = None   # 8.2 fit_hitter_spread.py hook: grades for every hitter when s.grades is None


def count_kappa(b, k, level):
    """the called-strike count shift (logit). v1.3 Part 2: the count table's cstrike per level (count_v12.json: seq_fit.py's
    kappas centred on the simulated take mix, as v1.2's _apply_fit made them). zone_area is the pre-fit rule, kept for
    reference."""
    return count_cells(level, b, k)[1]


def _apply_fit():
    """Statcast values that shipped (fit_v08.json, seq_fit.py decide()) replace the spec's starting guesses."""
    try:
        sh = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "fit_v08.json")))["ship"]
    except Exception:
        return
    for k_ in ("beta_T", "gamma_T", "lam", "alpha", "beta_E", "beta_E_S", "dstar_E", "beta_tun_whiff", "beta_tun_chase",
               "phi_FB", "phi_OS"):
        if sh.get(k_) is not None:
            P08[k_] = float(sh[k_])
    if sh.get("beta_y") is not None:
        TYPED["beta_y"] = float(sh["beta_y"])
    try:   # v1.0 #16: the fitted ground-ball rates replace the spec guesses
        gbt = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "fit_v08.json")))["results"]["gb_types"]
        TYPED["gb"] = {k_: float(gbt[k_]) for k_ in ("4-seam", "sink", "cut", "SL", "CB", "CH")}
    except Exception:
        pass
    # v1.3 Part 2: the count kappas (ship.kappa, centred on sim_constants.json TAKE_W) moved into the count table (cstrike);
    # data_tables/build_v12.py computes them from fit_v08.json the way this function did.


_apply_fit()


def count_stakes(b, k, level):
    """Runs between a ball and a strike from this count (strike = K at 2 strikes, ball = walk at 3 balls)."""
    cv = CV_BY_LEVEL[level]
    bb, kk = LW_BY_LEVEL.get(level, (0.337, -0.271))
    strike = kk if k == 2 else cv[(b, k + 1)]
    ball = bb if b == 3 else cv[(b + 1, k)]
    return ball - strike


def stakes_factor(b, k, level):
    """v0.6c: lean harder on the best calls in big counts (2-2, 3-2), mix more freely in small ones."""
    if level not in LW_BY_LEVEL:
        return 1.0
    if (b, k) == (3, 0):
        # v0.7c (Drew, 2026-11-03): 3-0 gets the tightest setting, like 3-2. By the stakes formula it looked like a small
        # count (a ball there only turns a near-walk into a walk), so the mix was at its loosest and off-speed took about
        # half the calls even when the engine's own costs favored the fastball.
        return 0.5
    if (b, k) in ((0, 0), (1, 0)):
        # v1.0 Step 2, D7 (Drew, Nov 10): with the guardrail gone the formula's cap (1.5) let 0-0 and 1-0 mix off-speed
        # into the zone far more than v0.9; on the yardstick those two counts carried 55% of the 0.31-0.35 runs/game
        # variety cost, over the 0.25 budget. Drew: tighten 0-0 and 1-0 only, keep the hitter's-count variety. 0.9 is
        # projected at ~0.20 with tunneling on (regret proxy, checked against the yardstick's 0-0 number); the
        # yardstick re-run decides. The first pitch still mixes (average three-pitch starter: fastball 47-60%).
        return 0.9
    if (b, k) == (3, 1):
        # v1.0 D1 (Drew, Nov 10): 3-1 mixes moderately among the pitches landing today, top call ~55-70%, one setting at
        # every level. With the guardrail gone the formula's 0.85-0.94 left the average three-pitch starter at 62-93%
        # fastball. Chosen as the single value that best fits after Step 2's recalibration: 1.3 puts 8 of 9 situations
        # (3 levels x bases empty / R1 / R3) in 55-70%; D1 with a runner on 1st reads 78.9% (a walk costs more with a
        # runner on, which the count setting can't see). Before the recalibration the best single value was 1.2.
        return 1.3
    avg = sum(count_stakes(b_, k_, level) for (b_, k_) in COUNTS) / len(COUNTS)
    return min(1.5, max(0.5, avg / count_stakes(b, k, level)))


LOC_WINDOW = 0.010   # v0.3: a location this much worse than the best call is never picked


KINDS = ("FB", "SI", "FC", "SL", "CB", "CH")


def check_inputs(arsenal, s: Situation):
    """v0.7c: reject impossible input with a clear message instead of a crash deep inside (or a silent empty call)."""
    if not arsenal:
        raise ValueError("no pitches: the arsenal is empty")
    names = [x.name for x in arsenal]
    if len(set(names)) != len(names):
        raise ValueError(f"two pitches share a name: {names}")
    for x in arsenal:
        if x.kind not in KINDS:
            raise ValueError(f"unknown pitch kind {x.kind!r} for {x.name} (expected one of {KINDS})")
        if x.shape not in SHAPE_TAGS[x.kind]:   # v1.1: checked after migration, so v1.0 tags arrive already mapped
            raise ValueError(f"unknown shape {x.shape!r} for {x.name} ({x.kind}: expected one of {SHAPE_TAGS[x.kind]})")
        if not (abs(x.lean_x) <= LEAN_MAX and abs(x.lean_z) <= LEAN_MAX and SPREAD_MIN <= x.spread <= SPREAD_MAX):
            raise ValueError(f"miss lean / spread out of range for {x.name}: lean {x.lean_x}, {x.lean_z} in. (limit "
                             f"{LEAN_MAX}), spread {x.spread} ({SPREAD_MIN}-{SPREAD_MAX})")
    if s.level not in LEVEL or s.level not in RE_BY_LEVEL:
        raise ValueError(f"unknown level {s.level!r}")
    for k_, v_ in (s.hitter_tags or {}).items():      # v1.2 Part B
        if k_ not in HIT_TAG_VALUES or (v_ is not None and v_ not in HIT_TAG_VALUES[k_]):
            raise ValueError(f"unknown hitter tag {k_}={v_!r} (expected {HIT_TAG_VALUES})")
    if not (0 <= s.balls <= 3 and 0 <= s.strikes <= 2):
        raise ValueError(f"impossible count {s.balls}-{s.strikes}")
    if not (0 <= s.outs <= 2):
        raise ValueError(f"impossible number of outs {s.outs}")
    if len(s.bases) != 3:
        raise ValueError(f"bases must be three flags (1st, 2nd, 3rd), got {s.bases!r}")


# ---------------------------------------------------------------------------
# v0.8 sit game (docs/SPEC_v0.8.md 2.3): pure-sit costs, the hitter's response, exploitability
# ---------------------------------------------------------------------------


def sit_payoff(M, ks, pi):
    """C-bar(pi, k): expected runs to the pitcher when the hitter sits on k against call mix pi."""
    return {k: sum(pi.get(a, 0.0) * M[a][k] for a in M) for k in ks}


def sit_response(M, ks, pi, T, b=None):
    """2.3 the hitter's soft best response sigma*(pi): sigma(k) ~ exp(C-bar(pi,k)/T + b(k))."""
    cb = sit_payoff(M, ks, pi)
    u = {k: cb[k] / T + (b.get(k, 0.0) if b else 0.0) for k in ks}
    mx = max(u.values())
    w = {k: exp(u[k] - mx) for k in ks}
    t = sum(w.values())
    return {k: w[k] / t for k in ks}


def exploitability(M, ks, pi, sigma):
    """2.3 X: runs a hitter gains by sitting on the single best option instead of his mix."""
    cb = sit_payoff(M, ks, pi)
    return max(cb.values()) - sum(sigma[k] * cb[k] for k in ks)


# ---------------------------------------------------------------------------
# v0.8 umpire learner (7.5) and take statistics
# ---------------------------------------------------------------------------

def take_stats(p, q, s, arsenal, sit=None):
    """7.5 at the current ump_u: p_i = P(called strike | take), d_i = dp_i/du (edge and off bands only)."""
    zo = {}
    P = outcome_probs(p, q, s, arsenal, sit=sit, zout=zo)
    den = P["cstrike"] + P["ball"] + P["wp_ball"] + P["hbp"]
    pi = P["cstrike"] / den if den > 0 else 0.0
    tw = sum(v["L"] * (1 - v["S"]) for v in zo.values())
    d = sum(v["L"] * (1 - v["S"]) * v["C"] * (1 - v["C"]) for v in zo.values() if v["cz"]) / tw if tw > 0 else 0.0
    return pi, d


# v1.2.3 (Drew, Nov 14): the umpire prior is worth UMP_A0 typical takes (was 20, SPEC v0.8 7.5). At 20 the prior was almost
# flat (D3 prior info 0.32, sd ~1.8 logits), so one called strike on a "get it over" fastball moved u to +0.82. At 200 one take
# moves u by at most ~0.1; the coach's wide / tight seed (+-0.4) stays the main way to set the zone.
UMP_A0 = 200.0


def ump_estimate(takes, level, u0=0.0, a0=UMP_A0):
    """7.5 today's umpire from takes [(s_i, p_i, d_i)] stored at u = u0, prior a0 typical takes at u0 (A4: Newton
    iterated to the posterior mode; the first step is the spec's one-step formula). Clamped to [-1.5, 1.5]."""
    ib = I_BAR_UMP.get(level, 0.05)
    if not takes:
        return u0
    return map_logit_shift(takes, u0, u0, a0 * ib, -1.5, 1.5)


V_CENTERS = (1.00, 0.94, 0.88)        # 2.7 speed bins as a share of his main fastball
Y_CENTERS = (3.0, 2.0)                # 2.7 height bins (ft)
QRE_ITERS, QRE_TOL, QRE_WMIN = 3000, 1e-3, 0.002


def v_fb(arsenal, s):
    fbs = [x for x in arsenal if is_fastball(x.kind)]
    return max(speed_today(x, s) for x in (fbs or arsenal))


# v1.0 #24: height (ft) of each row of the app's 5x5 landing grid (catcher's view, row 0 = above the zone), on the same
# scale as Y_TARGET and the chase heights: the look follows where the pitch ended up when the catcher logged it.
LOC_ROW_Y = (3.8, 3.2, 2.5, 1.8, 1.2)


def loc_quad(cell, kind, batter_right):
    """v1.0 #7: the engine target a logged landing cell (row, col of the app's 5x5 catcher's-view grid) falls in, for
    keying M2's earlier hard hits on where the pitch actually went. The center cell is middle; out of the zone on the
    chase side (low for off-speed, high for a fastball) is chase; otherwise up (rows 0-1) or down (rows 2-4, as Statcast's
    split puts mid-height off-center pitches) and in or away (a right-handed hitter stands on the catcher's left)."""
    r, c = cell
    if (r, c) == (2, 2):
        return "middle"
    if (r == 4 and not is_fastball(kind)) or (r == 0 and is_fastball(kind)):
        return "chase"
    if c == 2 and r >= 3:
        return "down-middle"     # low over the plate (v1.0 Step 7)
    inside = (c <= 1) if batter_right else (c >= 3)
    return ("up" if r <= 1 else "down") + ("-in" if inside else "-away")


def look_update(look, p, q, s, y=None):
    """2.6 the hitter's look after pitch (p, q). y: the logged landing height (LOC_ROW_Y) when there is one; otherwise the
    called target's height (v1.0 #24)."""
    lam = P08["lam"]
    vp = speed_today(p, s) + 0.5 * ev_adj(p, q)
    return (lam * look[0] + (1 - lam) * vp, lam * look[1] + (1 - lam) * (y_target(q, p.kind) if y is None else y))


def _interp_axis(x, centers):
    """Linear weights on the two nearest centers (centers sorted descending), clamped outside."""
    if x >= centers[0]:
        return [(0, 1.0)]
    if x <= centers[-1]:
        return [(len(centers) - 1, 1.0)]
    for i in range(len(centers) - 1):
        hi, lo = centers[i], centers[i + 1]
        if lo <= x <= hi:
            w = (x - lo) / (hi - lo)
            return [(i, w), (i + 1, 1 - w)]


class Table:
    """Count (x look) values for one plate appearance, solved with inputs frozen at its start (6.2)."""

    def __init__(self, arsenal, s):
        self.ars, self.s0 = arsenal, s
        self.vfb = v_fb(arsenal, s)
        self.bins = [(iv, iy) for iv in range(len(V_CENTERS)) for iy in range(len(Y_CENTERS))]
        self.V = {}           # (b, k) -> {bin: value}
        self.N = {}           # (b, k) -> {bin: expected pitches left in the PA} (7.6)
        self.sigma = {}       # (b, k) -> sit mix
        self.h0 = None
        self.sweeps = 0
        self.residuals = []

    def bin_look(self, bn):
        if bn is None:
            return self.h0
        return (V_CENTERS[bn[0]] * self.vfb, Y_CENTERS[bn[1]])

    def value(self, b, k, look, which="V"):
        tab = (self.V if which == "V" else self.N)[(b, k)]
        lk = (look[0], look[1])
        ws = self.__dict__.setdefault("_w", {}).get(lk)
        if ws is None:          # speed only: the interpolation weights (wv * wy, as before) per look
            ws = self._w[lk] = tuple(((iv, iy), wv * wy) for iv, wv in _interp_axis(look[0] / self.vfb, V_CENTERS)
                                     for iy, wy in _interp_axis(look[1], Y_CENTERS))
        tot = 0.0
        for key, w in ws:
            tot += w * tab[key]
        return tot


def temperature(arsenal, s):
    """6.6 T(b, k): the v0.7c temperature. (v1.0 #18: the uncertainty floor never bound -- at most 0.47 of T -- and is gone.)"""
    k_ = run_scale(s.level)
    f = stakes_factor(s.balls, s.strikes, s.level)
    return 0.010 * k_ * (0.5 if is_big_spot(s) else 1.0) * f


def windows(s):
    k_ = run_scale(s.level)
    f = min(1.0, stakes_factor(s.balls, s.strikes, s.level))
    return 0.030 * k_ * f, LOC_WINDOW * k_ * f


TAPER = 0.2     # A2: a window's last 20% tapers linearly to zero (continuous operator, so the sit game has a balance point)


def _taper(g, w):
    if g >= w:
        return 0.0
    edge = w * (1 - TAPER)
    return 1.0 if g <= edge else (w - g) / (w - edge)


def _soft(costs, temp, w, ref):
    wt = {k: exp(-(c - ref) / temp) * _taper(c - ref, w) for k, c in costs.items()}
    t = sum(wt.values())
    return {k: v / t for k, v in wt.items() if v > 0} if t > 0 else {}


# v1.3 (Drew's Nov 23 ruling 8): the HS / travel engine's fastball share in a count can't go below what the most
# off-speed-heavy real HS pitchers throw there: count_<v>.json levels.hs.fb_floor[count], the 10th percentile of pitcher-
# season fastball share in that count (hs.sqlite3, fit seasons, pitchers with enough pitches in that count; hitter_data/
# hs_fb_floor.py). Applied to the policy the engine plays: the PA table's per-count policy (so the continuation values see
# the floored mix) and the root call after its tie-break. The hitter's sit game is solved on the unfloored operator: with
# the floor inside the quantal-response map the solve cycles instead of converging (2-2 residual 0.17 after 3000 steps on a
# travel sinker / cutter arsenal), so the floor is a guard on the output, not a term of the game. When the allowed calls' fastball share
# w is above 0 and below the floor f, every fastball call is scaled by f / w and every other call by (1 - f) / (1 - w)
# (shares of the policy's own total). Drew's Nov 24 ruling 14: the never-pick window and every other safety / hitter rule
# outrank the floor, which applies only among the allowed calls (the policy's support): when no fastball call is allowed
# (every one outside the never-pick window, or shaken off) the policy is left as it is. (Nov 23's e00cfe5 brought the
# fastball back from outside the window; withdrawn.) The simulator also floors the coach's own pitch (simulate.py).
# Every other level, and any count table without fb_floor (v12, v13refit): no change.
def fb_floor(s):
    """the fastball-share floor at s's count, or None (level without a floor table)"""
    L = _CT.get(s.level) or _CT.get(TABLE_LEVEL_ALIAS.get(s.level, ""))
    T = L.get("fb_floor") if L else None
    return T[f"{s.balls}-{s.strikes}"] if T else None


def fb_names(arsenal, s):
    """the arsenal's fastball-class pitch names when s's level has a floor table, else None (the floor is off)"""
    if fb_floor(s) is None:
        return None
    return frozenset(x.name for x in arsenal if is_fastball(x.kind))


def apply_fb_floor(pi, s, fb, costs=None, temp=None):
    """pi {(name, q): prob} -> pi with the allowed fastball calls' share raised to fb_floor(s) (see above); plain
    left-to-right sums in pi's order (app/engine.js applyFbFloor does the same operations). costs / temp: unused since
    ruling 14 (kept for the callers)."""
    if not fb:
        return pi
    f = fb_floor(s)
    w = t = 0.0
    for a, v in pi.items():
        t += v
        if a[0] in fb:
            w += v
    if not (w > 0.0 and w < f * t):
        return pi
    kf = f * t / w
    ko = (1.0 - f) * t / (t - w)
    return {a: v * (kf if a[0] in fb else ko) for a, v in pi.items()}


def policy_from_costs(costs, s, temp, fb=None):
    """v0.8 two-stage operator Phi (A2: continuous form of v0.7c's). Pitch type: softmax over each pitch's best cost,
    weight tapered to zero at the never-pick window. Location within a pitch: softmax from the pitch's own best, inside a
    window that shrinks from LOC_WINDOW as the pitch's best falls behind the overall best (floor 20%), tapered the same
    way. Nothing outside either window is ever picked. costs: {(name, q): cost} of allowed calls."""
    win, lwin = windows(s)
    names = []
    for (n, q) in costs:
        if n not in names:
            names.append(n)
    best_by = {n: min(c for (m, q), c in costs.items() if m == n) for n in names}
    overall = min(best_by.values())
    pp = _soft(best_by, temp, win, overall)
    pi = {}
    for n, pn in pp.items():
        lw = max(TAPER * lwin, lwin - (best_by[n] - overall))
        loc = _soft({q: c for (m, q), c in costs.items() if m == n}, temp, lw, best_by[n])
        for q, pq in loc.items():
            pi[(n, q)] = pn * pq
    return apply_fb_floor(pi, s, fb, costs, temp)


from operator import mul as _mul    # noqa: E402  (speed only: solve_sit_game's sums)


def solve_sit_game(M, ks, s, temp, b_h=None, usage=None, fb=None):
    """2.3 (A2) the quantal-response balance point. pi = Phi(M sigma) exactly at every step, so the residual is
    ||sigma - sigma*(pi~)||_inf; sigma moves by a damped step w (0.3, halved whenever the residual grows, floor 0.002)
    until the residual < QRE_TOL or QRE_ITERS steps. Deterministic. Returns (pi, sigma, residual)."""
    calls = list(M)
    usage = {a: v for a, v in (usage or {}).items() if a in M}
    n_u = sum(usage.values())

    def tilde(p_):
        return {a: (4 * p_.get(a, 0.0) + usage.get(a, 0)) / (4 + n_u) for a in calls} if n_u else p_

    # speed only: M as rows (per call) and columns (per sit), so each sum below runs over the same products in the same
    # order as sum(sg[k] * M[a][k] for k in ks) and sit_response's sit_payoff
    rows = [[M[a][k] for k in ks] for a in calls]
    cols = [[M[a][k] for a in calls] for k in ks]

    def phi(sg):
        sgl = [sg[k] for k in ks]
        return policy_from_costs({a: sum(map(_mul, sgl, r)) for a, r in zip(calls, rows)}, s, temp, fb)

    def response(pi_):
        """sit_response(M, ks, pi_, temp, b_h)"""
        pil = [pi_.get(a, 0.0) for a in calls]
        cb = {k: sum(map(_mul, pil, c)) for k, c in zip(ks, cols)}
        u = {k: cb[k] / temp + (b_h.get(k, 0.0) if b_h else 0.0) for k in ks}
        mx = max(u.values())
        w_ = {k: exp(u[k] - mx) for k in ks}
        t_ = sum(w_.values())
        return {k: w_[k] / t_ for k in ks}

    sg = {k: 1.0 / len(ks) for k in ks}
    w, last = 0.3, None
    for t in range(QRE_ITERS):
        pi = phi(sg)
        f = response(tilde(pi))
        res = max(abs(sg[k] - f[k]) for k in ks)
        if res < QRE_TOL:
            return pi, sg, res
        if last is not None and res > last:
            w = max(QRE_WMIN, w / 2)
        last = res
        sg = {k: (1 - w) * sg[k] + w * f[k] for k in ks}
    pi = phi(sg)
    f = response(tilde(pi))
    return pi, sg, max(abs(sg[k] - f[k]) for k in ks)


# v0.9 item 9: a pitch that isn't landing today (at least LAND_BLOCK_N thrown and its shrunk strike rate
# at or below LAND_BLOCK_EST) gives way to the pitches that are. With two strikes and fewer than three balls it may still
# be called as a chase; otherwise it is left out. If nothing is landing, or the rule would leave nothing to call, the
# filter stands down (there is no landing pitch to give way to). v1.0 Step 3: measured as a deviation from his own
# expectation, so a pitch with a low normal strike rate isn't blocked for being itself.
# v1.0 Step 5: the block is a coaching rule, so it keeps its own shrinkage (LAND_BLOCK_K = the Step 3 K of 5) and does
# not move when the fitted LAND_K does (rules and fits don't share a parameter).
# v1.0 Step 7 (Drew, Nov 11): the rule applies only when he is behind in the count (more balls than strikes), where a
# pitch that isn't landing walks him, and on the first pitch ("first-pitch strike is super important"). Otherwise, a pitch that isn't landing is still callable at any spot, for a
# strike too: "a pitch that isn't landing doesn't just have to be a chase pitch; it can still be used in an up count,
# as a setup pitch, or just for a strike to see if he can gain confidence." Today's landing still prices it there
# (wild_today raises its ball chance), so the call leans off it without being forced to the chase spot. (Until now the
# rule held at every count, and with two strikes left only the chase spot open.)
LAND_BLOCK_N = 4
LAND_BLOCK_EST = -0.15
LAND_BLOCK_K = 5.0
# v1.1 (Drew, Nov 12): a comeback. The hold lifts once he has gone COMEBACK_N pitches without throwing that pitch (about
# two hitters), so a pitch that went cold early gets a fresh chance instead of disappearing for the game; if he throws
# it and it is still cold, the hold is back and the count starts again. (Found in a whole game: the fastball went
# 5-for-12 on random results and got 12 throws in 60 pitches, so the slider took 79% of the game.)
COMEBACK_N = 8


def comeback(p, s):
    return (s.since_thrown or {}).get(p.name, 0) >= COMEBACK_N


def land_block_count(s):
    return s.balls > s.strikes or (s.balls == 0 and s.strikes == 0)


def not_landing(p, s):
    ev = landing_triple(p, s.landing_today.get(p.name)) if s.landing_today else None
    if not ev or ev[-1] < LAND_BLOCK_N:
        return False
    st, ex, n = ev
    return (st - ex) / (LAND_BLOCK_K + n) <= LAND_BLOCK_EST


def shaken_names(exclude):
    """v1.0 #6 / D2: a shake-off means "not that pitch" at any spot. Entries may be pitch names or the older
    (pitch, spot) pairs; either way the whole pitch is excluded."""
    return {e if isinstance(e, str) else e[0] for e in (exclude or ())}


def hard_shaken(exclude):
    """v1.2.1 (Drew, Nov 14): pitches shaken off twice or more this at-bat. The exclude list carries one entry per shake
    (names or older (pitch, spot) pairs), so a name that appears twice was shaken twice."""
    n = {}
    for e_ in (exclude or ()):
        k = e_ if isinstance(e_, str) else e_[0]
        n[k] = n.get(k, 0) + 1
    return {k for k, v in n.items() if v >= 2}


def allowed_calls(arsenal, s, exclude=None, extra=()):
    tq = targets(s.balls, s.strikes)
    ex = shaken_names(exclude)
    out = [(p.name, q) for p in candidates(arsenal, s, extra=extra) if p.name not in ex for q in tq]
    if s.landing_today and out and land_block_count(s):      # behind in the count or 0-0 (v1.0 Step 7, Drew)
        names = {a[0] for a in out}
        bad = {p.name for p in arsenal if p.name in names and not_landing(p, s) and not comeback(p, s)}
        if bad and bad != names:
            out = [a for a in out if a[0] not in bad]
    return out


def _cost_const(p, q, s, arsenal, tab):
    """Speed only: the parts of cost08 that don't depend on the look, the sit or the table's values (PA-end values,
    in-play values, the mashed / ground-ball / coaching terms), each built by the expression cost08 used before."""
    b, k, o, B = s.balls, s.strikes, s.outs, s.bases
    base_end = v_end(s, o, B, 0)

    def walk_end(bases, runs):
        b1, b2, b3 = bases
        r_ = 1 if (b1 and b2 and b3) else 0
        return v_end(s, o, (True, b1 or b2, b3 or (b1 and b2)), runs + r_)

    walk0 = walk_end(B, 0)
    nb, r = advance_all(B)
    if b + 1 == 4:
        wp_end, wp_shift = walk_end(nb, r), None
    else:
        wp_end, wp_shift = None, v_end(s, o, nb, r)
    k_end = v_end(s, o + 1, B, 0) if k + 1 == 3 else None
    ipv = _ipv_cached(tab, p, q, s)
    mash = MASHED_PENALTY * run_scale(s.level) if (s.matchup and mashed(p, q, s)) else None   # v1.0 D3: mashed twice at this height today
    gb = GB_RULE_BONUS * run_scale(s.level) if (q in GB_RULE_TARGETS and ground_ball_spot(s)) else None   # v1.0 Step 7: the ground-ball rule
    cc = coach_credit(p, q, s, arsenal)
    sp = setup_payoff(p, q, s, arsenal)[0] if s.pa_log else 0.0      # v1.1 Step 3 (root only: tables have no pa_log)
    if sp:
        cc = min(cc + sp, max(cc, SETUP_CAP)) if sp > 0 else cc + sp  # stacking cap on the setup part only
    ccv = cc * run_scale(s.level) if cc else None    # v1.0 Step 7: the coaching reads (COACH_RULE); v1.1: + setup credits
    return base_end, walk0, wp_end, wp_shift, k_end, ipv, mash, gb, ccv


def cost08(p, q, s, arsenal, tab, look, sit, myopic=False, _pre=None):
    """Cost of call (p, q) in the v0.8 solve: outcome probabilities at this look and sit, next counts read from the
    table at the look this pitch leaves (myopic: at the PA's starting look), every PA end through v_end.
    _pre: speed only, solve_table's per-solve cache (see outcome_probs); same numbers with or without it."""
    s_ = s if s.look is look else replace(s, look=look)
    P = outcome_probs(p, q, s_, arsenal, sit=sit, _pre=_pre)
    b, k = s.balls, s.strikes
    if _pre is None:
        nl = tab.h0 if myopic else look_update(look, p, q, s)
        cst = _cost_const(p, q, s, arsenal, tab)
    else:
        if myopic:
            nl = tab.h0
        else:
            kn = ("nl", look, p.name, q, b, k)
            nl = _pre.get(kn)
            if nl is None:
                nl = _pre[kn] = look_update(look, p, q, s)
        kc = ("cost", p.name, q, b, k)
        cst = _pre.get(kc)
        if cst is None:
            cst = _pre[kc] = _cost_const(p, q, s, arsenal, tab)
    base_end, walk0, wp_end, wp_shift, k_end, ipv, mash, gb, ccv = cst
    value = tab.value
    v = 0.0
    if b + 1 == 4:
        v += P["ball"] * walk0
        v += P["wp_ball"] * wp_end
    else:
        t_b = value(b + 1, k, nl)
        v += P["ball"] * t_b
        v += P["wp_ball"] * (t_b + wp_shift - base_end)
    v += P["hbp"] * walk0
    t_k = value(b, k + 1, nl) if k < 2 else None
    v += (P["cstrike"] + P["whiff"]) * (k_end if k + 1 == 3 else t_k)
    v += P["foul"] * (t_k if k < 2 else value(b, k, nl))
    v += P["weak"] * ipv[0]
    v += P["solid"] * ipv[1]
    v += P["hard"] * ipv[2]
    if s.steal and s.steal.get("a", 0) > 0:
        v += steal_cost(p, q, s, tab, nl)
    if mash is not None:
        v += mash
    if gb is not None:
        v -= gb
    if ccv is not None:
        v -= ccv
    if s.level in ("hs", "travel"):
        w_ = min(1.0, max(0.0, (s.pitch_count - (s.pitch_cap - 20)) / 20))
        if w_ > 0:
            nxt = P["ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N")) +                   (P["cstrike"] + P["whiff"]) * (0 if k + 1 == 3 else tab.value(b, k + 1, nl, "N")) +                   P["foul"] * tab.value(b, min(k + 1, 2), nl, "N") + P["wp_ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N"))
            v += 0.002 * run_scale(s.level) * w_ * (1 + nxt)
    return v, P


def _ipv_cached(tab, p, q, s):
    """Speed only: the ball-in-play values of (p, q) don't depend on the count, look or sit; cached per base-out state and
    objective on the table (same numbers)."""
    w = s.win
    key = (p.name, q, s.outs, s.bases, s.infield_in, s.level,
           (w["omega"], w["WE0"], w["m0"], w["margin0"]) if (w and w["omega"] > 0) else None,
           ((s.grades or GRADES_OVERRIDE) or {}).get("w", 3),
           (s.balls, s.strikes) if gb_by_count(s.level) else None)    # v1.3 Part 2: a count table whose bip_gb varies by count
    cache = tab.__dict__.setdefault("ipv", {})
    v = cache.get(key)
    if v is None:
        v = tuple(in_play_value_typed(c, p, q, s) for c in ("weak", "solid", "hard"))
        cache[key] = v
    return v


def pitches_left(P, s, tab, nl):
    b, k = s.balls, s.strikes
    return 1 + P["ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N")) + \
        P["wp_ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N")) + \
        (P["cstrike"] + P["whiff"]) * (0 if k + 1 == 3 else tab.value(b, k + 1, nl, "N")) + \
        P["foul"] * tab.value(b, min(k + 1, 2), nl, "N")


def steal_cost(p, q, s, tab, nl):
    """7.4 a * [p_s V(steal) + (1 - p_s) V(caught) - V(no attempt)], values shifted to the new base-out state."""
    st = s.steal
    a = st["a"] * (0.5 if st.get("runner") == 2 else 1.0)
    y = y_target(q, p.kind)
    d_l = RUN_GAME.get(s.level, 0.08)
    d_t = min(0.15, max(-0.15, 0.10 * (st["t"] - 1.4) / 0.2)) if st.get("t") else 0.0
    ps = min(0.95, max(0.30, 0.64 + 0.20 * min(1.0, max(0.0, (4 - y) / 3)) + d_l + d_t))
    b1, b2, b3 = s.bases
    o = s.outs
    if st.get("runner") == 2:
        safe, out_b = (b1, False, True), (b1, False, b3)
    else:
        safe, out_b = (False, True, b3), (False, b2, b3)
    here = tab.value(s.balls, s.strikes, nl)
    base_end = v_end(s, o, s.bases, 0)
    v_safe = here + v_end(s, o, safe, 0) - base_end
    v_caught = v_end(s, 3, (False, False, False), 0) if o + 1 >= 3 else here + v_end(s, o + 1, out_b, 0) - base_end
    return a * (ps * v_safe + (1 - ps) * v_caught - here)


RUN_GAME = {}   # 7.4 delta_L by level (we_rates.json steal success minus 0.72), filled at load


def solve_table(arsenal, s, sweeps=10, tol=0.001):
    """6.1 sweeps over counts (deepest first), sit game per count, values per look bin."""
    check_inputs(arsenal, s)      # v1.0 #9
    resolve_speeds(arsenal)       # v1.1 Step 1b
    tab = Table(arsenal, s)
    order = sorted(COUNTS, key=lambda c: -(c[0] + c[1]))
    ks = sit_options(arsenal)
    by = {x.name: x for x in arsenal}
    fb = fb_names(arsenal, s)     # v1.3 ruling 8 (None off HS / travel)
    pre = {}                      # speed only: look / sit-free outcome terms per (pitch, target, count), this solve
    # start: v0.7c count values on top of the base-out value, flat across looks; N from a rough 4 pitches
    for (b, k) in COUNTS:
        v0 = v_end(s, s.outs, s.bases, 0) + CV_BY_LEVEL[s.level][(b, k)]
        tab.V[(b, k)] = {bn: v0 for bn in tab.bins}
        tab.N[(b, k)] = {bn: 2.0 for bn in tab.bins}
    prior = sit_prior(arsenal, replace(s, balls=0, strikes=0, pa_log=()))
    tab.h0 = (sum(v * speed_today(by[n], s) for (n, j), v in prior.items()), 2.5)
    for sw in range(sweeps):
        delta = 0.0
        for (b, k) in order:
            sc = replace(s, balls=b, strikes=k, last=None, pa_log=(), usage_this_count={}, usage_by_call={},
                         b_h=dict(s.b_h))
            temp = temperature(arsenal, sc)
            calls = allowed_calls(arsenal, sc)
            # sit game at the PA's starting look
            scH = replace(sc, look=tab.h0)
            M = {a: {kk: cost08(by[a[0]], a[1], scH, arsenal, tab, tab.h0, ("pure",) + kk, _pre=pre)[0] for kk in ks}
                 for a in calls}
            pi, sg, res = solve_sit_game(M, ks, sc, temp, sc.b_h)
            tab.sigma[(b, k)] = sg
            tab.residuals.append(res)
            for bn in tab.bins:
                look = tab.bin_look(bn)
                cs, Ps = {}, {}
                scL = replace(sc, look=look)
                for a in calls:
                    cs[a], Ps[a] = cost08(by[a[0]], a[1], scL, arsenal, tab, look, ("mix", sg), _pre=pre)
                pol = policy_from_costs(cs, sc, temp, fb)
                new = sum(pv * cs[a] for a, pv in pol.items())
                delta = max(delta, abs(new - tab.V[(b, k)][bn]))
                tab.V[(b, k)][bn] = new
                nl = lambda a: look_update(look, by[a[0]], a[1], sc)
                tab.N[(b, k)][bn] = sum(pv * pitches_left(Ps[a], sc, tab, nl(a)) for a, pv in pol.items())
        if (0, 0) in tab.sigma:
            s00 = tab.sigma[(0, 0)]
            tab.h0 = (sum(v * speed_today(by[n], s) for (n, j), v in s00.items()), 2.5)
        tab.sweeps = sw + 1
        if delta < tol:
            break
    return tab


def root_call(arsenal, s, tab, exclude=None, look_value=True):
    """6.3/6.4 the pitch being called now: live look, last pitch and lean; sit game re-solved. v1.0 Step 2 (#1, #25): no
    separate guardrail cut. The stakes-scaled never-pick window inside policy_from_costs is the only rule that removes a
    call, so the root and the table (solve_table) use one operator. Three-ball counts rank by myopic cost (no setups).
    v1.2.2: with pitches in the confidence band, the call is the blend over each with / without combination of them,
    weighted by the product of band_weight (with) and 1 - band_weight (without). No band pitch: exactly one solve, as
    v1.2.1. Returned sit mix, residual: the heaviest combination's; M: every combination's calls (a call's sit costs don't
    depend on which pitches are allowed); full: M at that sit mix."""
    band = band_pitches(arsenal, s, exclude)
    if not band:
        return _root_solve(arsenal, s, tab, exclude, look_value)
    w = {x.name: band_weight(x, s) for x in arsenal if x.name in band}
    acc, M, best, bw, cache = {}, {}, None, -1.0, {}
    for k in range(len(band) + 1):
        for S in combinations(band, k):
            wt = 1.0
            for n in band:
                wt *= w[n] if n in S else 1.0 - w[n]
            if wt < RAMP_MIN_W:
                continue
            pi_, sg_, full_, res_, M_ = _root_solve(arsenal, s, tab, exclude, look_value, extra=S, cache=cache)
            for a, v in pi_.items():
                acc[a] = acc.get(a, 0.0) + wt * v
            for a, v in M_.items():
                if a not in M:
                    M[a] = v
            if wt > bw:
                best, bw = (sg_, res_), wt
    t = sum(acc.values())
    pi = {a: v / t for a, v in acc.items()}
    sg, res = best
    ks = sit_options(arsenal)
    full = {a: sum(sg[kk] * M[a][kk] for kk in ks) for a in M}
    return pi, sg, full, res, M


def _root_solve(arsenal, s, tab, exclude=None, look_value=True, extra=(), cache=None):
    """one root solve with the trusted pitches plus extra (band pitches); the v1.2.1 root_call body. cache: the blend's
    shared {call: sit costs}"""
    resolve_speeds(arsenal)       # v1.1 Step 1b
    by = {x.name: x for x in arsenal}
    ks = sit_options(arsenal)
    look = s.look or tab.h0
    temp = temperature(arsenal, s)
    calls = allowed_calls(arsenal, s, exclude, extra)
    if not calls:
        # every trusted pitch is shaken off. v1.2.1 (Drew, Nov 14): a pitch shaken once may come back (a strong pitch
        # can be re-called); a pitch shaken twice this at-bat stays out, and the call goes to the rest of his pitches,
        # trusted first, else his most-trusted of them (candidates' own fallback). Only if every pitch is shaken twice
        # are the shake-offs set aside, so there is always a call.
        hard = hard_shaken(exclude)
        rest = [x for x in arsenal if x.name not in hard]
        calls = allowed_calls(rest, s) if hard and rest else allowed_calls(arsenal, s)
    sL = replace(s, look=look)
    my = s.balls == 3 or not look_value     # three-ball counts rank by myopic cost (no setups); test switch
    pre = {}        # speed only: every cost below is at sL with this arsenal, so the look / sit-free terms are shared
    if cache is None:
        M = {a: {kk: cost08(by[a[0]], a[1], sL, arsenal, tab, look, ("pure",) + kk, myopic=my, _pre=pre)[0] for kk in ks}
             for a in calls}
    else:       # v1.2.2: the blend's combinations share one cost per call (a call's sit costs don't depend on the allowed set)
        for a in calls:
            if a not in cache:
                cache[a] = {kk: cost08(by[a[0]], a[1], sL, arsenal, tab, look, ("pure",) + kk, myopic=my, _pre=pre)[0]
                            for kk in ks}
        M = {a: cache[a] for a in calls}
    usage = s.usage_by_call
    fb = fb_names(arsenal, s)     # v1.3 ruling 8 (None off HS / travel)
    pi, sg, res = solve_sit_game(M, ks, s, temp, s.b_h, usage)
    full = {a: sum(sg[kk] * M[a][kk] for kk in ks) for a in M}
    pi = apply_fb_floor(tie_break(pi, full, arsenal, s, exclude, M), s, fb, full, temp)
    return pi, sg, full, res, M


TIE_CAP = 0.05              # v1.1 Step 3 (E5): at most 5 points of probability moved per call by the tie-break


def enables_payoff(a, arsenal, s, exclude=None):
    """v1.1 Step 3: the call a = (pitch, target) is a strike target and, if it goes for a strike, some rule's payoff
    (with a as its setup) would pass checks 3-5 at the count it leads to"""
    if a[1] == "chase" or s.strikes >= 2 or s.balls >= 3:
        return False
    ent = (a[0], a[1], "cstrike", None, None, None)
    s2 = replace(s, strikes=s.strikes + 1, pa_log=tuple(s.pa_log) + (ent,))
    for (n, q2) in allowed_calls(arsenal, s2, exclude):
        x = _pitch_by(arsenal, n)
        v, rule, e = setup_payoff(x, q2, s2, arsenal)
        if v > 0 and e is ent:
            return True
    return False


def tie_break(pi, full, arsenal, s, exclude=None, M=None):
    """v1.1 Step 3 (E5, Drew: "if two calls are exactly the same on their own, take the one that sets up a payoff"): a
    smooth shift after the solve. For a setup-enabling call A and a call B that doesn't enable one, whose full costs differ
    by gap, a share max(0, 1 - gap / TIE_EPS) of B's probability moves to A; TIE_EPS = INTENT_E x run scale (the engine's
    numerical-noise margin); at most TIE_CAP moved in total; never at three balls. With the sit-game costs M, the shift
    is scaled back so the hitter's best-response gain against the shifted mix stays within TIE_EPS (the plan's check)."""
    if s.balls >= 3 or s.strikes >= 2:
        return pi
    eps = INTENT_E * run_scale(s.level)
    live = [a for a, v in pi.items() if v > 0]
    en = [a for a in pi if enables_payoff(a, arsenal, s, exclude)]        # pi's own order (JS sorts the same keys stably)
    if not en or len(en) == len(pi):
        return pi
    ens = set(en)
    out = dict(pi)
    left = TIE_CAP
    for A in sorted(en, key=lambda a: full[a]):
        for B in sorted((b for b in live if b not in ens), key=lambda b: abs(full[b] - full[A])):
            gap = abs(full[A] - full[B])
            if gap >= eps or left <= 0:
                continue
            mv = min(out[B] * (1 - gap / eps), left)
            out[B] -= mv
            out[A] += mv
            left -= mv
    if M:
        ks = list(next(iter(M.values())).keys())
        brv = lambda p_: max(sum(p_.get(a, 0.0) * M[a][k] for a in M) for k in ks)
        g = brv(out) - brv(pi)
        if g > eps:                       # best response is convex in the mix: scaling the shift by t scales the gain <= t
            t = eps / g
            out = {a: pi[a] + t * (out[a] - pi[a]) for a in pi}
    return out


def call_v08(arsenal, s, rng=None, exclude=None, tab=None):
    """v0.8 call: solve (or reuse) the PA table, then the root. Returns ((p, q, prob, cost), dist, tab, info)."""
    check_inputs(arsenal, s)      # v1.0 #9: the live entry point validates like callV08 does
    resolve_speeds(arsenal)       # v1.1 Step 1b
    rng = rng or _random
    if tab is None:
        tab = solve_table(arsenal, s)
    pi, sg, full, res, M = root_call(arsenal, s, tab, exclude)
    p_pitch = {}
    for (n, q), v in pi.items():
        p_pitch[n] = p_pitch.get(n, 0.0) + v
    keep_n = {n for n, v in p_pitch.items() if v > 0.005}
    dist = [(v, full[a], next(x for x in arsenal if x.name == a[0]), a[1]) for a, v in pi.items() if a[0] in keep_n and v > 0]
    t = sum(d[0] for d in dist)
    dist = [(d[0] / t,) + tuple(d[1:]) for d in dist]
    dist.sort(key=lambda d: -d[0])
    r, acc = rng.random(), 0.0
    pick = dist[-1]
    for d in dist:
        acc += d[0]
        if r <= acc:
            pick = d
            break
    info = dict(sigma=sg, residual=res, M=M, table=tab)
    return (pick[2], pick[3], pick[0], pick[1]), dist, tab, info


def lean_b_h(arsenal, s, fooled=()):
    """2.5 b_h(k): the in-at-bat evidence e_h(k) (the spec's eta * damage lean shipped at eta = 0 and is gone, v1.0 #18).
    fooled: classes ('FB'/'OS') of this at-bat's whiffs marked fooled; each adds log 1.3 to every sit whose pitch is not
    in that class."""
    out = {}
    for (n, j) in sit_options(arsenal):
        p = next(x for x in arsenal if x.name == n)
        c = pclass(p.kind)
        v = sum(log(1.3) for fc in fooled if fc != c)
        if v:
            out[(n, j)] = v
    return out


def frozen_inputs(arsenal, s):
    """6.2 the inputs a plate-appearance table is solved with, for the re-solve triggers."""
    out = dict(conf={x.name: x.conf for x in arsenal}, wild={x.name: wild_today(x, s) for x in arsenal}, ump=s.ump_u,
               names=tuple(x.name for x in arsenal), outs=s.outs, bases=tuple(bool(b) for b in s.bases),
               infield_in=bool(s.infield_in), lean=lean_key(arsenal))
    if any(tag_key(s)):
        out["tags"] = tag_key(s)       # v1.2 Part B: only when a tag is set (an untagged table's inputs are unchanged)
    return out


def tag_key(s):
    """v1.2 Part B: the hitter's tags as numbers (approach, path, offspeed); a change re-solves the table"""
    return tuple(hit_tag(s, k) for k in ("approach", "path", "offspeed"))


def lean_key(arsenal):
    """v1.2: each pitch's (lean_x, lean_z, spread); a change re-solves the table (a lean changes landing and HBP)."""
    return tuple((x.lean_x, x.lean_z, x.spread) for x in arsenal)


def needs_resolve(frozen, arsenal, s):
    """6.2 re-solve mid at-bat when the pitcher changes, the outs, bases or infield-in setting change (v1.0 #2: the
    table's count values are priced at the base-out state it was solved at), a confidence or wild-today value moves by
    > 0.10, or the umpire shift moves by > 0.20 logits."""
    if frozen is None or frozen["names"] != tuple(x.name for x in arsenal):
        return True
    fl = frozen.get("lean") or tuple((0.0, 0.0, 1.0) for _ in arsenal)
    if tuple(tuple(v) for v in fl) != lean_key(arsenal):
        return True    # v1.2: a frozen table from before leans existed counts as every pitch at lean 0
    if tuple(frozen.get("tags") or (0, 0, 0)) != tag_key(s):
        return True    # v1.2 Part B: a tag changed (no "tags" key = untagged)
    if (frozen.get("outs") != s.outs or frozen.get("bases") != tuple(bool(b) for b in s.bases)
            or frozen.get("infield_in") != bool(s.infield_in)):
        return True
    if any(abs(x.conf - frozen["conf"][x.name]) > 0.10 for x in arsenal):
        return True
    if any(abs(wild_today(x, s) - frozen["wild"][x.name]) > 0.10 for x in arsenal):
        return True
    return abs(s.ump_u - frozen["ump"]) > 0.20


def root_costs(arsenal, s, tab, sigma=None):
    """Exact sum_k sigma(k) C(a | k) for every allowed call at the live state (sigma: the table's for this count)."""
    by = {x.name: x for x in arsenal}
    ks = sit_options(arsenal)
    sg = sigma or tab.sigma[(s.balls, s.strikes)]
    look = s.look or tab.h0
    return {a: sum(sg[k] * cost08(by[a[0]], a[1], s, arsenal, tab, look, ("pure",) + k)[0] for k in ks if sg[k] > 1e-4)
            for a in allowed_calls(arsenal, s)}


# ---------------------------------------------------------------------------
# v0.8 win expectancy, leverage and the objective blend (7.1, 7.2), intentional walk suggestion (7.7)
# ---------------------------------------------------------------------------
_WE = {}
WE_LEVEL = {"travel": "hs", "college": "college_d1",
            "college_d2": "college_d3"}   # PLACEHOLDER_D2: D3's win tables until we_tables.py has D2 rates
MCAP_WE = 15


def _we_tab(level, N, xr):
    key = f"{WE_LEVEL.get(level, level)}|{N}|{int(bool(xr))}"
    if not _WE:
        try:
            _WE.update(_json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "we_tables.json"))))
        except Exception:
            return None
    return _WE.get(key)


def _bits(bases):
    return (1 if bases[0] else 0) | (2 if bases[1] else 0) | (4 if bases[2] else 0)


def sched(s):
    return s.sched_innings or (7 if s.level in ("hs", "travel") else 9)


def we_pitch(s, o, bases, margin, field="W"):
    """WE (or LI with field 'L') for the PITCHING team in the current half-inning, at (o, bases) with the pitching team
    ahead by margin; o = 3 is the end of the half. We pitch the top when home, the bottom when away."""
    N = sched(s)
    t = _we_tab(s.level, N, s.extras_runner)
    h = "t" if s.home else "b"
    i = min(max(1, s.inning), N + 1)
    half = t["tab"][f"{i}{h}"]
    m_home = margin if s.home else -margin
    j = max(-MCAP_WE, min(MCAP_WE, m_home)) + MCAP_WE
    if field == "L":
        return half["L"][f"{min(o, 2)}{_bits(bases)}"][j]
    v = half["E"][j] if o >= 3 else half["W"][f"{o}{_bits(bases)}"][j]
    return v if s.home else 1.0 - v


def win_constants(s):
    """7.2 fixed at the plate appearance's start: omega = clip(LI - 1, 0, 1), WE0, m0 (floored at 0.005), margin0."""
    if s.home is None or _we_tab(s.level, sched(s), s.extras_runner) is None:
        return None
    li = we_pitch(s, s.outs, s.bases, s.margin, "L")
    we0 = we_pitch(s, s.outs, s.bases, s.margin)
    m0 = max(0.005, we0 - we_pitch(s, s.outs, s.bases, s.margin - 1))
    s_ = replace(s, win=None)
    return dict(omega=min(1.0, max(0.0, li - 1)), WE0=we0, m0=m0, margin0=s.margin, LI=li,
                we=lambda o, bases, m: we_pitch(s_, o, bases, m))


def walk_suggestion(arsenal, s, tab):
    """7.7 suggest (never auto-call) a walk when V_end(walk state) < V(0-0, h0) - 0.010 x run scale."""
    b1, b2, b3 = s.bases
    r_ = 1 if (b1 and b2 and b3) else 0
    v_walk = v_end(s, s.outs, (True, b1 or b2, b3 or (b1 and b2)), r_)
    v_pa = tab.value(0, 0, tab.h0)
    return v_walk < v_pa - 0.010 * run_scale(s.level), v_walk, v_pa


def _fill_run_game():
    """7.4 delta_L = level steal success minus MLB's 0.72 (D1 +0.08, HS +0.10, D3 from we_rates.json)."""
    RUN_GAME.update({"college_d1": 0.08, "college": 0.08, "hs": 0.10, "travel": 0.10, "mlb": 0.0})
    try:
        d = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "we_rates.json")))
        RUN_GAME["college_d3"] = d["college_d3"]["steal_success"] - 0.72
    except Exception:
        RUN_GAME["college_d3"] = 0.12


_fill_run_game()


# ---------------------------------------------------------------------------
# v0.8 hitter grades (8.2): per-level effects and the cross-game learner
# ---------------------------------------------------------------------------
try:
    from hitter_spread_params import HITTER_SPREAD
except Exception:
    HITTER_SPREAD = {}


def gval(name, level):
    return HITTER_SPREAD.get(level, {}).get(name, P08[name])


def grade_call(arsenal, s, pitch_name, quad, tab=None, rng=None, exclude=None):
    """Learning mode: how the engine rates a human call, priced the way the engine prices its own calls (the live root,
    against the hitter's sit mix, with the at-bat table). Mirror of engine.js v08.gradeCall (v1.0 #18: replaces the
    v0.7c grade_call, which graded against a solver the engine no longer runs)."""
    rng = rng or _random.Random(0)
    pick, dist, tab, info = call_v08(arsenal, s, rng=rng, exclude=exclude, tab=tab)
    sg, ks = info["sigma"], sit_options(arsenal)
    costs = root_costs(arsenal, s, tab, sg)
    p = next(x for x in arsenal if x.name == pitch_name)
    look = s.look or tab.h0
    c_human = costs[(pitch_name, quad)] if (pitch_name, quad) in costs else \
        sum(sg[k] * cost08(p, quad, s, arsenal, tab, look, ("pure",) + k)[0] for k in ks if sg[k] > 1e-4)
    best = min(sum(sg[k] * info["M"][a][k] for k in ks) for a in info["M"])
    allowed = quad in targets(s.balls, s.strikes)
    prob = sum(d[0] for d in dist if d[2].name == pitch_name and d[3] == quad)
    verdict = ("costly" if not allowed else "in the engine's mix" if prob >= 0.02
               else "close" if c_human - best <= 0.03 * run_scale(s.level) else "costly")
    return dict(call=f"{pitch_name} {quad}", engine_prob=prob, runs_vs_best=c_human - best, allowed=allowed,
                verdict=verdict, engine_top=[(d[2].name, d[3], d[0]) for d in dist[:3]])


def grade_stats(p, q, s, arsenal, sit=None, grades=None):
    """8.2 for one pitch: {grade: (p_i, d_i)} for contact (whiff | swing), power (hard | ball in play) and discipline
    (swing), each computed with THAT grade at 3 and the other two at their current values (grades; default 3).
    The caller keeps the entry whose event was observed."""
    out = {}
    for g in ("c", "w", "d"):
        gr = dict(grades or {})
        gr[g] = 3
        zo = {}
        outcome_probs(p, q, replace(s, grades=gr), arsenal, sit=sit, zout=zo)
        sw = sum(v["L"] * v["S"] for v in zo.values())
        bipw = {z: v["L"] * v["S"] * (1 - v["W"]) * (1 - v["F"]) for z, v in zo.items()}
        bip = sum(bipw.values())
        if g == "c" and sw > 0:
            pw = sum(v["L"] * v["S"] * v["W"] for v in zo.values()) / sw
            out["c"] = (pw, -gval("g_c", s.level) * sum(v["L"] * v["S"] / sw * v["W"] * (1 - v["W"]) for v in zo.values()))
        elif g == "w" and bip > 0:
            ph = sum(bipw[z] * v["H"] for z, v in zo.items()) / bip
            out["w"] = (ph, gval("g_w", s.level) * sum(bipw[z] / bip * v["H"] * (1 - v["H"]) for z, v in zo.items()))
        elif g == "d":
            out["d"] = (sw, -gval("g_d", s.level) * sum(v["L"] * v["S"] * (1 - v["S"]) for v in zo.values() if v["offz"]))
    return out


def map_logit_shift(obs, x0, prior_mean, prior_info, lo, hi, iters=20):
    """A4: the posterior mode of a logit shift x from stored pairs (y_i, p_i, d_i) taken at x0, each pitch extrapolated as
    p_i(x) = sig(logit p_i + a_i (x - x0)), a_i = d_i / (p_i (1 - p_i)), with a normal prior (mean, information).
    Its first Newton step from x0 is exactly the spec's one-step formula; later steps remove the linearization bias."""
    obs = [(y, p_, d / (p_ * (1 - p_))) for y, p_, d in obs if 0 < p_ < 1 and d != 0]
    x = x0
    for _ in range(iters):
        sc = -prior_info * (x - prior_mean)
        inf = prior_info
        for y, p_, a in obs:
            pp = sig(logit(p_) + a * (x - x0))
            sc += (y - pp) * a
            inf += pp * (1 - pp) * a * a
        if inf <= 0:
            break
        step = sc / inf
        x = max(lo, min(hi, x + step))
        if abs(step) < 1e-6:
            break
    return x


def grade_estimate(obs, g_coach, I0, g_prev=None, n_pitches=None):
    """8.2 estimate of one grade from obs [(y_i, p_i, d_i)] stored with that grade at 3, shrunk to the coach's grade by
    I0 (A4: Newton iterated to the posterior mode). Rails (learner v2): no effect until 30 pitches; at most 0.5 grade
    points of change per game (from g_prev); a flag, not a change, when the estimate is more than 1 point from the
    coach's grade. Returns (grade used, estimate, flag)."""
    est = map_logit_shift(obs, 3.0, g_coach, I0, 1.0, 5.0)
    if (n_pitches if n_pitches is not None else len(obs)) < 30:
        return g_coach, est, False
    if abs(est - g_coach) > 1.0:
        return (g_prev if g_prev is not None else g_coach), est, True
    base = g_prev if g_prev is not None else g_coach
    return max(base - 0.5, min(base + 0.5, est)), est, False


I0_GRADE = SIM_CONST.get("I0_GRADE", {})


# ---------------------------------------------------------------------------
# v0.8 "why" line (9)
# ---------------------------------------------------------------------------
_WHY_PARAMS = {
    "sit": ("sit_tW", "sit_hW", "sit_tH", "sit_hH", "sit_tS", "sit_hS"),
    "timing": ("beta_T", "gamma_T"),
    "eye level": ("beta_E", "beta_E_S"),
    "tunneling": ("beta_tun_whiff", "beta_tun_chase"),
    "repeat": ("rep_whiff_same", "rep_whiff_other", "rep_same_spot"),
    "familiarity": ("phi_FB", "phi_OS"),
    "setup": (),            # v1.1 Step 3: SETUP_RULE zeroed (not P08)
}


def _root_cost_pair(arsenal, s, tab, a, b, sigma, myopic=False):
    by = {x.name: x for x in arsenal}
    look = s.look or tab.h0
    ks = sit_options(arsenal)

    def c(x):
        return sum(sigma[k] * cost08(by[x[0]], x[1], s, arsenal, tab, look, ("pure",) + k, myopic=myopic)[0]
                   for k in ks if sigma[k] > 1e-4)
    return c(a), c(b)


def _explain(arsenal, s, tab, pick, info, exclude=None):
    """v1.0 Step 4 (#3): the one comparison behind both the why line and the intent label. Costs are re-priced the way
    root_call ranked them (myopic at three balls). b* = the allowed call with the lowest myopic cost; the comparator is b*,
    or, when the drawn call is b* itself, the next-lowest myopic cost. Delta_k = [C(a) - C(b)] - [C_-k(a) - C_-k(b)].
    Cached on info, since the why line and the intent read the same numbers."""
    key = (pick[0].name, pick[1], tuple(sorted(exclude or ())))
    cache = info.setdefault("explain", {})
    if key in cache:
        return cache[key]
    sigma = info["sigma"]
    p, q = pick[0], pick[1]
    a = (p.name, q)
    allowed = list(info["M"])
    calls = allowed + ([a] if a not in info["M"] else [])
    my = s.balls == 3
    cmy = {x: _root_cost_one(arsenal, s, tab, x, sigma, True) for x in calls}
    cful = cmy if my else {x: _root_cost_one(arsenal, s, tab, x, sigma) for x in calls}
    bstar = allowed[0]
    for x in allowed:
        if cmy[x] < cmy[bstar]:
            bstar = x
    others = [x for x in allowed if x != a]
    comp = bstar if bstar != a else (min(others, key=lambda x: cmy[x]) if others else None)
    label = intent_from_costs(s.balls, s.strikes, q, cmy[a], cmy[bstar], cful[a], cful[bstar], INTENT_E * run_scale(s.level))
    deltas = {}
    if comp is not None:
        base = cful[a] - cful[comp]
        for term, names in _WHY_PARAMS.items():
            saved = {n: P08[n] for n in names}
            saved_sr = dict(SETUP_RULE) if term == "setup" else None
            try:
                for n in names:
                    P08[n] = 0.0
                if saved_sr is not None:
                    for n in SETUP_RULE:
                        SETUP_RULE[n] = 0.0
                ca, cb = _root_cost_pair(arsenal, s, tab, a, comp, sigma, myopic=my)
            finally:
                P08.update(saved)
                if saved_sr is not None:
                    SETUP_RULE.update(saved_sr)
            deltas[term] = base - (ca - cb)
        if not my:      # three-ball counts are ranked without look value, so it explains nothing there
            deltas["look value"] = base - (cmy[a] - cmy[comp])
        for term, s_off in (("situation", replace(s, win=None)), ("umpire", replace(s, ump_u=0.0)),
                            ("running game", replace(s, steal=None)), ("grades", replace(s, grades=None))):
            ca, cb = _root_cost_pair(arsenal, s_off, tab, a, comp, sigma, myopic=my)
            deltas[term] = base - (ca - cb)
    sp = setup_payoff(p, q, s, arsenal) if s.pa_log else (0.0, None, None)
    if sp[0] > 0 and sp[1] != "N2" and s.balls < 3 and s.strikes < 2:
        label = "Payoff"                  # v1.1 Step 3: a credited call; at two strikes Finish / Expand keep their label
    out = dict(a=a, bstar=bstar, comp=comp, cmy=cmy, cful=cful, label=label, deltas=deltas,
               setup=sp if (sp[0] > 0 and sp[1] != "N2") else None)
    cache[key] = out
    return out


def why_line(arsenal, s, tab, pick, info, exclude=None):
    """9 / v1.0 Step 4: the term that most favors the drawn call a over the comparator (see _explain). v1.1 Step 3: a call
    credited by a setup rule names it ("Set up by the X spot: Y spot"); look value and the setup term are otherwise not
    eligible. Delta values rank only. Returns (line, {term: Delta}, comparator)."""
    X = _explain(arsenal, s, tab, pick, info, exclude)
    deltas, b = X["deltas"], X["comp"]
    p, q = pick[0], pick[1]
    if X["setup"]:                        # v1.1 Step 3: a payoff call names its setup
        e = X["setup"][2]
        return f"Set up by the {e[0].lower()} {e[1]}: {p.name.lower()} {q}", deltas, b
    if b is None:
        return "Only call allowed here", {}, None
    elig = [t for t in deltas if t not in ("look value", "setup")]
    term = min(elig, key=lambda t: deltas[t])
    if deltas[term] >= -1e-6:
        if X["cful"][X["a"]] <= X["cful"][b] + 1e-9:
            return "Best call on its own merits", deltas, b
        return "Mixed in so he can't sit on one pitch", deltas, b
    look = s.look or tab.h0
    sigma = info["sigma"]
    if term == "timing":
        vs = sum(v * speed_today(next(x for x in arsenal if x.name == n), s) for (n, j), v in sigma.items())
        vt = (1 - P08["alpha"]) * look[0] + P08["alpha"] * vs
        vp = speed_today(p, s) + 0.5 * ev_adj(p, q)
        line = f"He's timed for {vt:.0f} mph; this plays {abs(vt - vp):.0f} mph {'slower' if vt > vp else 'faster'}"
    elif term == "eye level":
        line = "Stays at his eye level — a change costs here" if P08["beta_E"] < 0 else "Changes his eye level"
    elif term == "familiarity":
        c_ = "OS" if is_offspeed(next(x for x in arsenal if x.name == b[0]).kind) else "FB"
        line = f"He's seen the {b[0].lower()} {s.familiar.get(c_, 0)} times today"
    elif term == "sit":
        by_t, by_h = {}, {}
        for (n, j), v in sigma.items():
            by_t[n] = by_t.get(n, 0.0) + v
            by_h[j] = by_h.get(j, 0.0) + v
        top_t = max(by_t, key=lambda n: by_t[n])
        if top_t != p.name:
            line = f"He's sitting {top_t.lower()} ({by_t[top_t]:.0%})"
        else:
            top_h = max((j for j in by_h if j != target_height(q, p.kind)), key=lambda j: by_h[j])
            line = f"He's looking {top_h} ({by_h[top_h]:.0%})"
    elif term == "situation":
        line = "Tying run on third: need a strikeout or a ground ball" if (s.bases[2] and s.win and abs(s.margin) <= 1) \
            else "Game situation: protect the lead" if s.margin > 0 else "Game situation: keep it close"
    elif term == "umpire":
        line = f"Today's umpire is calling {'more' if s.ump_u > 0 else 'fewer'} strikes than usual"
    elif term == "running game":
        line = "Runner may go: a pitch he can throw on"
    elif term == "grades":
        line = "Matches this hitter's scouting grades"
    elif term == "repeat":
        line = "Back to what he just missed"
    else:
        line = "Tunnels off the last pitch"
    return line, deltas, b


# ---------------------------------------------------------------------------
# v0.9 item 4: intent labels. DISPLAY ONLY: computed from costs the root call already has, after the call is drawn; nothing
# here feeds back into a call, so every call and probability is identical whether or not it is used.
# ---------------------------------------------------------------------------
INTENT_E = 0.0005           # x run scale: numerical-noise margin for "costs more now" (plan item 4)
INTENT_TERMS = ("timing", "eye level", "repeat", "tunneling")   # what can do a setup's work (side to side did not ship)
INTENT_MECH = {"timing": "of his timing", "repeat": "he just saw it", "tunneling": "it tunnels off the last pitch",
               None: "of the counts it leads to"}


def intent_mech_text(m):
    if m == "eye level":        # v1.0 Step 4: the sign of the fitted coefficient decides what the eye-level term rewards
        return "it stays at his eye level" if P08["beta_E"] < 0 else "it changes his eye level"
    return INTENT_MECH[m]


def intent_from_costs(balls, strikes, quad, c_my_a, c_my_best, c_a, c_best, e):
    """The label rule (plan item 4), first match wins. v1.1 Step 3: the dead look-value "Setup" label is gone (look value
    stays in the costs); a call credited by a setup rule is labeled "Payoff" in _explain. The cost arguments are kept so
    the signature doesn't move."""
    if balls == 3 and strikes < 2:
        return "Get it over"
    if strikes == 2:
        return "Expand" if quad == "chase" else "Finish"
    return "Early off-zone" if quad == "chase" else "Get ahead"


def _root_cost_one(arsenal, s, tab, x, sigma, myopic=False):
    by = {p.name: p for p in arsenal}
    look = s.look or tab.h0
    return sum(sigma[k] * cost08(by[x[0]], x[1], s, arsenal, tab, look, ("pure",) + k, myopic=myopic)[0]
               for k in sit_options(arsenal) if sigma[k] > 1e-4)


def intent_label(arsenal, s, tab, pick, info, exclude=None):
    """v0.9 item 4 / v1.0 Step 4. Returns (label, mechanism, coach line). pick = (pitch, quad, ...) as returned by call_v08;
    info its info. The same comparison as the why line (_explain). Mechanism (Setup and Early off-zone only, when the call
    is not b* itself): the timing / eye level / repeat / tunneling term that most favors the call over b*, or None."""
    X = _explain(arsenal, s, tab, pick, info, exclude)
    p, q = pick[0], pick[1]
    label = X["label"]
    mech = None
    if label == "Early off-zone" and X["bstar"] != X["a"]:
        best_d = -1e-9
        for term in INTENT_TERMS:
            d = X["deltas"][term]
            if d < best_d:
                best_d, mech = d, term
    spot = q
    if label == "Get ahead":
        line = f"Best strike here: {p.name.lower()} {spot}"
    elif label == "Get it over":
        line = f"Need a strike: {p.name.lower()} {spot} is the safest one"
    elif label == "Payoff":
        e = X["setup"][2]
        line = f"Payoff: {p.name.lower()} {spot}, set up by the {e[0].lower()} {e[1]}"
    elif label == "Expand":
        line = f"Two strikes: {p.name.lower()} {spot}, off the zone"
    elif label == "Finish":
        line = f"Put-away: {p.name.lower()} {spot}"
    else:
        line = f"Off the zone early: {p.name.lower()} {spot}" + (f", because {intent_mech_text(mech)}" if mech else "")
    return label, mech, line


# ---------------------------------------------------------------------------
# v1.3 Part 3 (plan 3.5): college D2 is a product level. PLACEHOLDER_D2: until D2 has its own fits (run tables, outcome
# fit, spread calibration, typed batted balls, simulation constants, hitter spread, steal success, profiles, win tables),
# every level table without a college_d2 entry uses D3's, the same object (as travel uses high school's). D2_PLACEHOLDERS
# names the tables filled this way; release_guard_d2.py fails while any remain, so D2 can't ship on D3's numbers. A table
# that gains its own college_d2 entry drops off the list by itself; remove this block when the list is empty.
# ---------------------------------------------------------------------------
D2_PLACEHOLDERS = []


def _fill_d2_placeholders():
    seen = set()
    for name, t in (("LEVEL", LEVEL), ("OUTCOME_ADJ", OUTCOME_ADJ), ("RE", RE_BY_LEVEL), ("CV", CV_BY_LEVEL),
                    ("IN_PLAY", IN_PLAY_BY_LEVEL), ("LW", LW_BY_LEVEL), ("PROFILES", PROFILES), ("MOVE_RATIO", MOVE_RATIO),
                    ("A_BAR", A_BAR), ("I_BAR_UMP", I_BAR_UMP), ("SIM.A_BAR", SIM_CONST.get("A_BAR")),
                    ("SIM.I_BAR_UMP", SIM_CONST.get("I_BAR_UMP")), ("SIM.I0_GRADE", SIM_CONST.get("I0_GRADE")),
                    ("I0_GRADE", I0_GRADE), ("OUT_TABLE", OUT_TABLE), ("RUNNER_FIT", RUNNER_FIT), ("RUN_GAME", RUN_GAME),
                    ("HITTER_SPREAD", HITTER_SPREAD)):
        if t is None or id(t) in seen:
            continue
        seen.add(id(t))
        if "college_d3" in t and "college_d2" not in t:
            t["college_d2"] = t["college_d3"]          # PLACEHOLDER_D2
            D2_PLACEHOLDERS.append(name)
    if WE_LEVEL.get("college_d2") == "college_d3":     # PLACEHOLDER_D2 (the alias above)
        D2_PLACEHOLDERS.append("WE")


_fill_d2_placeholders()
