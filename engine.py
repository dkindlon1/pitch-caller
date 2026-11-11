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
Coach rules, each a named constant: no chase at 3-0 / 3-1; a pitch not landing today gives way (LAND_BLOCK_*); mashed
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
from run_tables import RE_BY_LEVEL, CV_BY_LEVEL, IN_PLAY_BY_LEVEL   # v0.5: run values by level
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
# v0.9 item 6, fitted in Step 3 (readthrough/step3_fits.py, results/step3): whiff | swing on a pitch class
# rises with the whiffs and called strikes that class got from this hitter in earlier trips today (M1, capped at 4), and
# falls after he hit that class hard at that spot in an earlier trip (M2, capped at 2), scaled by RHO_L. Their hard-contact
# effects did not ship. v1.0 #7 (readthrough/v10_memory_fit.py, results/v10/memory_fit.txt): MM is the one owner of
# in-game hitter memory. Refit with R5's in-game damage as a control, both still ship (M1 +0.079, +4.4 sd; M2 -0.240,
# +2.6 sd) and damage adds nothing that ships on top of them, so R5 damage reads only the cross-game seed (no in-game
# updates feed the engine) and MM keeps its values fitted without that control (0.107, -0.346: the effect MM carries
# alone). Each part has its own cap; the shared familiarity clip on their sum is gone. M2's earlier hard hits are
# keyed on the logged landing spot when the catcher logged one (as fitted), else the called target.
MM = dict(succ=0.107, succ_cap=4, hard=-0.346, hard_cap=2)

# v0.9 item 3, widened, fitted in Step 5 (readthrough/step5_inside_fit.py, results/step5): on and near the
# plate (heart and edge), MLB pitches on the inner half play differently from the outer half at the same height: an
# elevated fastball inside gets far less hard contact, fewer whiffs and more swings, and so on by class, height and
# platoon side. Each value is the fitted inside-minus-away logit difference (0 where it did not ship); a target on the
# inner half gets +half of it and one on the outer half -half, so the in/away average the outcome model was calibrated
# on is unchanged. Scaled by RHO_L (HS and travel 0.6) like the other MLB-fitted terms.
SIDE = {"hard": {"FB|up|same": -0.818, "FB|up|opp": -0.989, "FB|down|same": 0.0, "FB|down|opp": 0.0, "OS|up|same": -0.212, "OS|up|opp": -0.465, "OS|down|same": 0.596, "OS|down|opp": 0.388}, "whiff": {"FB|up|same": -0.435, "FB|up|opp": -0.329, "FB|down|same": -0.852, "FB|down|opp": -0.635, "OS|up|same": -0.856, "OS|up|opp": -0.853, "OS|down|same": -0.251, "OS|down|opp": 0.276}, "swing": {"FB|up|same": 1.077, "FB|up|opp": 0.56, "FB|down|same": 0.551, "FB|down|opp": -0.128, "OS|up|same": -0.394, "OS|up|opp": -0.436, "OS|down|same": 0.257, "OS|down|opp": 0.343}}


# v0.9 item 8, fitted in Step 4b (readthrough/step4b_power_hr.py, results/step4b/power_hr.txt): a power
# hitter's hard contact leaves the park more often, +0.112 logits on HR | hard ball in play per SD of power (P3; power x
# zone and the HR effect x heart did not ship). v1.0 #11/#28: one power-grade point = one SD of hitters' hard-hit share
# (0.0518, fit_hitter_spread.py's g_w target), so the fitted per-SD effect applies as is. The extra home runs come out of
# that type's outs.
POWER_HR = 0.112


def power_hr_shift(s, gr):
    """Logit shift on HR given hard contact for the hitter's power grade (0 at grade 3)."""
    return RHO_L.get(s.level, 1.0) * POWER_HR * (gr.get("w", 3) - 3)


def side_shift(p, q, s, z, what):
    """Logit shift for 'swing' / 'whiff' / 'hard' at target q, landing band z (heart and edge only)."""
    if z not in ("heart", "edge") or q in ("middle", "chase"):
        return 0.0
    h, side = q.split("-")
    b = SIDE[what][("OS" if is_offspeed(p.kind) else "FB") + "|" + h + "|" + ("same" if s.same_side else "opp")]
    return RHO_L.get(s.level, 1.0) * (0.5 if side == "in" else -0.5) * b


def matchup_whiff(p, q, s):
    """Logit shift on whiff | swing from earlier trips (s.matchup: 'succ|KIND' and 'hard|KIND|target' -> counts)."""
    m = s.matchup
    if not m:
        return 0.0
    x = MM["succ"] * min(MM["succ_cap"], m.get("succ|" + p.kind, 0)) + \
        MM["hard"] * min(MM["hard_cap"], m.get("hard|" + p.kind + "|" + q, 0))      # v1.0 #7: separate caps, no shared clip
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
    return "up" if (q.startswith("up") or (q == "chase" and kind == "FB")) else "down"


def mashed(p, q, s):
    """D3: his earlier trips today put this pitch type in play hard MASHED_N+ times at this target's height."""
    m = s.matchup
    if not m:
        return False
    h = target_height(q, p.kind)
    return sum(m.get("hard|" + p.kind + "|" + x, 0) for x in QUADS if target_height(x, p.kind) == h) >= MASHED_N


Y_TARGET = {"up-in": 3.2, "up-away": 3.2, "middle": 2.5, "down-in": 1.8, "down-away": 1.8}
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
    elif q.startswith("up") or (q == "chase" and kind == "FB"):
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


def run_scale(level):
    """How big runs are at this level vs MLB (runs per inning from scratch). Randomness settings scale with it."""
    return RE_BY_LEVEL[level][(0, "000")] / RE_BY_LEVEL["mlb"][(0, "000")]


def V(balls, strikes, outs, bases, cv=None, level="mlb"):
    return re(outs, bases, level) + (cv or CV_BY_LEVEL[level])[(balls, strikes)]


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle"]
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
               for lvl in ("hs", "college", "college_d1", "college_d3", "mlb")}
HBP_LOC = {"up-in": 1.6, "down-in": 1.6, "chase": 0.8, "middle": 0.5, "up-away": 0.3, "down-away": 0.3}
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

DEFAULT_VELO = {"FB": 85, "SL": 77, "CB": 71, "CH": 77}   # mph, placeholder college-ish

# [R7] Effective velocity: how much faster (+) or slower (-) a pitch looks by location.
# Up and in plays fastest, down and away slowest (Husband: ~3 mph per 6 in. lateral).
EV_ADJ = {"up-in": 3.0, "up-away": 0.0, "down-in": 0.0, "down-away": -3.0,
          "middle": 0.0, "chase": -3.0}


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
    kind: str          # FB, SL, CB, CH
    grade: int         # 1-5 stuff
    command: int       # 1-5
    conf: float        # 0-1 confidence today
    shape: str = ""    # e.g. "ride", "sweeper", "loopy"
    velo: float = 0.0  # mph; 0 = use DEFAULT_VELO
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

    def __post_init__(self):
        if self.base_conf < 0:
            self.base_conf = self.conf

    def mph(self):
        return self.velo or DEFAULT_VELO[self.kind]


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


# ---------------------------------------------------------------------------
# Confidence model (v0.3): good results can't run a pitch away from its bullpen feel
# ---------------------------------------------------------------------------

CONF_DELTA = {"ball": -0.02, "cstrike": 0.03, "whiff": 0.05, "hard": -0.08, "shakeoff": -0.20}
CONF_CAP_ABOVE = 0.10      # at most +0.10 above bullpen feel
CONF_REGRESS = 0.15        # 15% back toward bullpen feel each new batter


def update_confidence(p, event):
    d = CONF_DELTA[event]
    if event == "whiff" and p.kind == "FB":
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
LAND_GAIN = 2.0
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


def landing(p: Pitch, q: str, s: Situation):
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
    z = {k: max(v, 0.01) for k, v in z.items()}
    t = sum(z.values())
    return {k: v / t for k, v in z.items()}


# ---------------------------------------------------------------------------
# Stage 2: hitter vs pitch, per landing zone
# ---------------------------------------------------------------------------

S0 = {"heart": 0.72, "edge": 0.50, "off": 0.28, "noncomp": 0.05}
C0 = {"heart": 0.98, "edge": 0.55, "off": 0.08, "noncomp": 0.0}
W0 = {"heart": 0.12, "edge": 0.20, "off": 0.34, "noncomp": 0.50}
F0 = {"heart": 0.40, "edge": 0.50, "off": 0.50, "noncomp": 0.45}
Q0 = {"heart": (0.30, 0.38, 0.32), "edge": (0.48, 0.34, 0.18),
      "off": (0.60, 0.30, 0.10), "noncomp": (0.75, 0.20, 0.05)}
ZONE_IN = {"heart": 1.0, "edge": 0.5, "off": 0.0, "noncomp": 0.0}   # edge straddles the border
KIND_W = {"FB": -0.20, "SL": 0.25, "CB": 0.20, "CH": 0.25}


# ---------------------------------------------------------------------------
# Tunneling (v0.4): pitch flight paths from movement + release
# ---------------------------------------------------------------------------
# Typical movement for a right-hander by shape tag: (induced vertical break, horizontal break), inches.
# Horizontal break + = arm side. Placeholder values in the range public tracking data shows.
SHAPES = {
    ("FB", "ride"): (18, 8), ("FB", "run"): (13, 15), ("FB", "sink"): (8, 16), ("FB", "cut"): (12, -3),
    ("FB", ""): (15, 10),
    ("SL", "tight"): (3, -5), ("SL", "sweeper"): (0, -15), ("SL", ""): (2, -7),
    ("CB", "loopy"): (-14, -5), ("CB", "sharp"): (-8, -9), ("CB", ""): (-10, -7),
    ("CH", "fade"): (7, 15), ("CH", "drop"): (3, 10), ("CH", ""): (6, 13),
}
# Release point by arm slot, as (height as share of body height, side in ft toward arm side)
SLOTS = {"over the top": (1.05, 1.0), "high three-quarter": (0.95, 1.6), "three-quarter": (0.88, 2.0),
         "low three-quarter": (0.78, 2.5), "sidearm": (0.62, 3.0), "submarine": (0.35, 3.2)}
FLIGHT_FT = 54.0            # release to plate, ~6 ft extension
DECISION_S = 0.175          # hitter's decision point: 175 ms before the plate (Baseball Prospectus)
G_IN = 32.17 * 12           # gravity, in/s^2


def movement(p: Pitch):
    ivb, hb = SHAPES.get((p.kind, p.shape), SHAPES[(p.kind, "")])
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
         "down-away": (-7 * inside, 22), "middle": (0, 30),
         "chase": ((-10 * inside, 14) if offspeed else (0, 46))}[q]
    return t


def path_at(p: Pitch, q: str, same_side: bool, secs_before_plate: float):
    """Where the pitch is (x, z inches) `secs_before_plate` before it reaches the plate."""
    tf = flight_time(p)
    u = max(0.0, 1 - secs_before_plate / tf)
    h_ratio, side = SLOTS.get(p.slot, SLOTS["three-quarter"])
    rx = side * 12 + p.release_offset_in[0]
    rz = h_ratio * p.height_ft * 12 + p.release_offset_in[1]
    ivb, hb = movement(p)
    mx, mz = hb, ivb - 0.5 * G_IN * tf ** 2           # total deviation from a straight line, incl. gravity
    tx, tz = target_xy(q, same_side, is_offspeed(p.kind))
    ax, az = tx - mx, tz - mz                          # aim point that lands on target
    return (rx + (ax - rx) * u + mx * u * u, rz + (az - rz) * u + mz * u * u)


def _remaining_break(p: Pitch, secs_before_plate: float):
    """Movement (incl. gravity) still to come after the decision point, inches (x, z)."""
    tf = flight_time(p)
    u = max(0.0, 1 - secs_before_plate / tf)
    ivb, hb = movement(p)
    mx, mz = hb, ivb - 0.5 * G_IN * tf ** 2
    return mx * (1 - u * u), mz * (1 - u * u)


def tunnel_score(p1: Pitch, q1: str, p2: Pitch, q2: str, same_side: bool):
    """-1..+1. High when two pitches look alike at the hitter's decision point and then
    split: by different late movement (break differential) and/or different finishing spots.
    Returns (score, inches apart at decision point, inches of break difference after it, inches apart at plate)."""
    a1, a2 = path_at(p1, q1, same_side, DECISION_S), path_at(p2, q2, same_side, DECISION_S)
    b1, b2 = path_at(p1, q1, same_side, 0.0), path_at(p2, q2, same_side, 0.0)
    r1, r2 = _remaining_break(p1, DECISION_S), _remaining_break(p2, DECISION_S)
    d_tunnel = ((a1[0] - a2[0]) ** 2 + (a1[1] - a2[1]) ** 2) ** 0.5
    d_plate = ((b1[0] - b2[0]) ** 2 + (b1[1] - b2[1]) ** 2) ** 0.5
    d_break = ((r1[0] - r2[0]) ** 2 + (r1[1] - r2[1]) ** 2) ** 0.5
    # a different release point tips the pitch out of the hand, before the decision point matters
    d_release = ((p1.release_offset_in[0] - p2.release_offset_in[0]) ** 2 +
                 (p1.release_offset_in[1] - p2.release_offset_in[1]) ** 2) ** 0.5
    score = 0.6 * min(d_break, 18) / 18 + 0.4 * min(d_plate, 24) / 24 - d_tunnel / 10 - d_release / 8
    return max(-1.0, min(1.0, score)), d_tunnel, d_break, d_plate


def shape_fit(p: Pitch, q: str, s: Situation):
    f = 0.0
    up = q.startswith("up")
    if p.kind == "FB":
        if p.shape == "ride":
            f += 0.5 if up else -0.2
        if p.shape == "sink":
            f += 0.5 if not up else -0.3
    else:
        f += 0.4 if (not up or q == "chase") else -1.0   # hanging off-speed up is bad
        if p.kind == "SL" and s.same_side and ("away" in q or q == "chase"):
            f += 0.3
    if p.kind == "CH" and s.same_side:
        f -= 0.3        # the one same-side changeup term (v1.0 #22: outcome_probs' separate +0.2 hard was a duplicate)
    return f


# v0.6e: hitter damage scaled so a strong masher (0.8, well established) is worth about +0.03 runs per pitch at MLB,
# the range of the best fastball hitters' pitch values (FanGraphs 2021: +2.5 to +3.7 runs per 100 four-seamers).
DMG_SCALE = 3.0


def damage(p: Pitch, q: str, s: Situation):
    """[R5] Hitter's damage read for this pitch class and location, shrunk toward 0.
    Strengths (+) count fully; holes (-) count half until well established (20+ pitches)."""
    total = 0.0
    for key in ("OS" if is_offspeed(p.kind) else "FB", p.kind + "|" + q):     # v1.0 #21: spot read per pitch kind
        if key in s.hitter_damage:
            score, n = s.hitter_damage[key]
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
    fb = [x for x in arsenal if x.kind == "FB"]
    os_ = [x for x in arsenal if x.kind != "FB"]
    if fb and os_:
        fb_share = 0.65 if hitters_count else (0.35 if s.strikes == 2 else 0.5)
        pr = {x.name: (fb_share / len(fb) if x.kind == "FB" else (1 - fb_share) / len(os_)) for x in arsenal}
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
    ey = g_mod((1 if p.kind == "FB" else -1) * (y_target(q, p.kind) - y_hat), P08["dstar_E"])
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
                _, d_tun, _, d_plate = tunnel_score(last, lq, p, q, s.same_side)
                d_rel = ((last.release_offset_in[0] - p.release_offset_in[0]) ** 2 +
                         (last.release_offset_in[1] - p.release_offset_in[1]) ** 2) ** 0.5
                tun = max(-1.0, min(1.0, exp(-d_tun / 6) * g_mod(d_plate, 18) - d_rel / 8))
                kap = P08["kappa_brk"] if p.kind in ("SL", "CB") else 1.0
                w += rho * (kap * P08["beta_tun_whiff"] * tun)     # v1.0 D5: whiff and chase-swing tunneling, each from its fit
                sw += rho * (kap * P08["beta_tun_chase"] * tun)
    if is_big_spot(s):
        w, sw = 0.5 * w, 0.5 * sw
    return w, sw


def outcome_probs(p: Pitch, q: str, s: Situation, arsenal, policy=None, stats=None, sit=None, zout=None):
    L = LEVEL[s.level]
    A = OUTCOME_ADJ[s.level]
    big = is_big_spot(s)
    cL = L["cL"] * (1.5 if big else 1.0)
    if sit is None:
        sit = ("mix", s.sit_sigma if s.sit_sigma is not None else sit_prior(arsenal, s))
    m_t, m_h, v_sit = sit_shift(p, q, arsenal, s, sit)          # 2.2 what he's sitting on
    pw, ps = pair_terms(p, q, s, arsenal)
    tB = RHO_L.get(s.level, 1.0) * timing_B(p, q, s, v_sit) * (0.5 if big else 1.0)   # 4: pair terms halved in a big spot
    hL = L["hL"]
    gr = s.grades or GRADES_OVERRIDE    # 8.2 (override: fit hook)
    f = shape_fit(p, q, s)
    dmg = damage(p, q, s)
    tau = s.timing.get("OS" if is_offspeed(p.kind) else "FB", 0.0)
    tau_eff = tau if p.kind == "FB" else -tau        # late (+) helps fastballs, early (-) helps off-speed

    hitters_count = s.balls > s.strikes and s.strikes < 2
    land = landing(p, q, s)
    command, grade = effective(p, s)
    grade = grade - min(P08["kg_cap"], P08["kg"] * max(0, s.pitch_count - LEVEL[s.level]["fatigue"]) / 20)
    gs = 0.25 * L.get("stuff_scale", 1.0)        # v0.7: one grade point of stuff = one SD of real pitchers (fit_spread.py)
    # v0.7b command and swing-and-miss: real pitchers' walk and strikeout rates are nearly independent (correlation about
    # -0.1 in 2026 D3 and D1 lines), so better command must not also buy many more strikeouts. Precise pitchers work in
    # and around the zone, where hitters make more contact; this term sets how much (fit_spread.py). 0 = off.
    cw = L.get("cmd_whiff", 0.0) * (command - 3)
    out = {"ball": 0, "cstrike": 0, "whiff": 0, "foul": 0, "weak": 0, "solid": 0, "hard": 0, "wp_ball": 0, "hbp": 0}

    for z, pz in land.items():
        # swing (hitter behavior by count: modeled, not a pitcher rule)
        sl = logit(S0[z])
        if s.strikes == 2:
            sl += 0.9
        if s.balls == 0 and s.strikes == 0:
            sl -= 0.4
        if (s.balls, s.strikes) == (3, 0):
            sl -= 2.0
        elif hitters_count:
            sl += 0.3 if z in ("heart", "edge") else -0.4
        if z == "off" and is_offspeed(p.kind):
            sl += 0.2
        wz_ = ZONE_IN[z]            # v0.6: share of this landing band inside the rulebook zone
        sl += wz_ * A["zsw"] + (1 - wz_) * A["osw"]
        offz = z in ("off", "noncomp")
        sl += hL * (P08["sit_tS"] * m_t + P08["sit_hS"] * m_h)
        if offz:
            sl += ps
        if gr and offz:
            sl -= gval("g_d", s.level) * (gr.get("d", 3) - 3)
        sl += side_shift(p, q, s, z, "swing")
        S = sig(sl) if S0[z] > 0 else 0
        if z in ("edge", "off"):
            C = sig(logit(C0[z]) + A["cs"] + count_kappa(s.balls, s.strikes, s.level) + s.ump_u)
        else:
            C = C0[z]
        # whiff
        wl = logit(W0[z]) + KIND_W[p.kind] + gs * (grade - 3) + cL * 1.5 * (p.conf - 0.6)
        ex = -hL * (P08["sit_tW"] * m_t + P08["sit_hW"] * m_h) + hL * 0.6 * tau_eff + P08["beta_T"] * tB
        ex = max(-P08["capW"] * hL, min(P08["capW"] * hL, ex))
        wl += ex - hL * 0.4 * DMG_SCALE * dmg
        wl += pw + 0.25 * f
        wl += wz_ * A["wz"] + (1 - wz_) * A["wo"]
        if cw:
            wl -= cw
        if gr:
            wl -= gval("g_c", s.level) * (gr.get("c", 3) - 3)
        if s.matchup:
            wl += matchup_whiff(p, q, s)
        wl += side_shift(p, q, s, z, "whiff")
        W = sig(wl)
        F = sig(logit(F0[z]) + (0.3 if s.strikes == 2 else 0))
        # contact quality: shift hard share
        hx = hL * (P08["sit_tH"] * m_t + P08["sit_hH"] * m_h) - hL * 0.5 * tau_eff - P08["gamma_T"] * tB
        hx = max(-P08["capH"] * hL, min(P08["capH"] * hL, hx))
        hl = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6) + hx + hL * 0.8 * DMG_SCALE * dmg - 0.3 * f
        c_ = "OS" if is_offspeed(p.kind) else "FB"
        hl += RHO_L.get(s.level, 1.0) * min(P08["fam_cap"], P08["phi_" + c_] * s.familiar.get(c_, 0))     # familiarity within the game (#19: x RHO_L)
        if gr:
            hl += gval("g_w", s.level) * (gr.get("w", 3) - 3)
        if s.crowding and q in ("up-in", "down-in"):
            hl -= P08["crowd"]
        if z == "heart" and is_offspeed(p.kind):
            hl += 0.5          # hanger: off-speed over the middle gets hit hard
        if is_offspeed(p.kind) and (q.startswith("up") or q == "middle"):
            hl += 0.4          # v0.3: aiming off-speed up or at the middle leaves it up
        hl += side_shift(p, q, s, z, "hard")
        weak, solid, hard = Q0[z]
        hard2 = sig(logit(hard) + hl)
        if zout is not None:
            zout[z] = dict(L=pz, S=S, C=C, W=W, F=F, H=hard2, offz=offz, cz=z in ("edge", "off"))
        scale = (1 - hard2) / (weak + solid)
        weak2, solid2 = weak * scale, solid * scale

        take = 1 - S
        ball_p = pz * take * (1 - C)
        if z in ("noncomp", "off") and A["hbp"] > 0:   # v0.6: hit by pitch
            hb = min(0.9, A["hbp"] * hbp_loc(p, q) * (1.0 if z == "noncomp" else 0.1))
            out["hbp"] += ball_p * hb
            ball_p *= (1 - hb)
        if z == "noncomp" and any(s.bases):   # wild pitch risk with runners on
            wp = (0.12 if is_offspeed(p.kind) else 0.04) * (1 - 0.15 * (s.catcher_block - 3))
            out["wp_ball"] += ball_p * wp
            ball_p *= (1 - wp)
        out["ball"] += ball_p
        out["cstrike"] += pz * take * C
        out["whiff"] += pz * S * W
        out["foul"] += pz * S * (1 - W) * F
        contact = pz * S * (1 - W) * (1 - F)
        out["weak"] += contact * weak2
        out["solid"] += contact * solid2
        out["hard"] += contact * hard2
        if stats is not None:
            stats["pitches"] += pz
            stats["zone"] += pz * wz_
            stats["zswing"] += pz * S * wz_
            stats["oswing"] += pz * S * (1 - wz_)
            stats["zcontact"] += pz * S * (1 - W) * wz_
            stats["ocontact"] += pz * S * (1 - W) * (1 - wz_)
    return out


# ---------------------------------------------------------------------------
# Situation terms: what each outcome does to the game
# ---------------------------------------------------------------------------


def end_pa_value(outs, bases, runs, level="mlb"):
    return runs + re(outs, bases, level)


try:   # v0.8 typed batted-ball tables (inplay_fit.py); absent = flag can't be turned on
    from inplay_typed_params import OUT_TABLE, RUNNER_FIT
except ImportError:
    OUT_TABLE, RUNNER_FIT = {}, {}
B_TYPES = ("GB", "LD", "FB", "PU")


def gb_rate(p):
    """7.3 MLB ground-ball rate by pitch (sinker and cutter by fastball shape); v1.0 #16: fitted, TYPED["gb"]."""
    g = TYPED["gb"]
    if p.kind == "FB":
        return g[p.shape] if p.shape in ("sink", "cut") else g["4-seam"]
    return g[p.kind]


def type_mix(p, q, c):
    g = sig(logit(gb_rate(p)) + TYPED["beta_y"] * (y_target(q, p.kind) - 2.5) + TYPED["gamma"][c])
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
    tm = type_mix(p, q, c)
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

def candidates(arsenal, s, forced=None):
    cutoff = LEVEL[s.level]["cutoff"]
    c = [x for x in arsenal if x.conf >= cutoff or (forced and x.name == forced)]
    if not c:
        # v0.4: he trusts nothing right now. Fall back to his most-trusted pitch;
        # the app should flag this to the coach as a sign it may be time for a change.
        c = [max(arsenal, key=lambda x: x.conf)]
    return c


import json as _json, os as _os
try:   # walk and strikeout run values by level (college_rates.py / hs_rates.py)
    _RVJ = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "college_run_values.json")))
    LW_BY_LEVEL = {"mlb": (_RVJ["mlb_check"]["_lw_bb"], _RVJ["mlb_check"]["_lw_k"]),
                   "college_d1": (_RVJ["college_d1"]["_lw_bb"], _RVJ["college_d1"]["_lw_k"]),
                   "college_d3": (_RVJ["college_d3"]["_lw_bb"], _RVJ["college_d3"]["_lw_k"]),
                   "hs": (_RVJ["hs"]["_lw_bb"], _RVJ["hs"]["_lw_k"])}
    LW_BY_LEVEL["college"] = LW_BY_LEVEL["college_d1"]
except Exception:
    LW_BY_LEVEL = {}

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
KAPPA_FIT = {}   # seq_fit.py: count-zone logit shifts (fitted, centered on the simulated take mix); empty = area rule


def count_kappa(b, k, level):
    if KAPPA_FIT:
        return KAPPA_FIT[(b, k)]
    return log(zone_area(b, k) / A_BAR.get(level, 3.0))


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
    if sh.get("kappa"):
        raw = {(0, 0): 0.0}
        raw.update({tuple(int(x) for x in c.split("-")): v for c, v in sh["kappa"].items()})
        w = SIM_CONST.get("TAKE_W")
        if w:
            mean = sum(w.get(f"{b}-{k}", 0.0) * v for (b, k), v in raw.items()) / sum(w.values())
        else:
            mean = sum(raw.values()) / len(raw)
        KAPPA_FIT.update({c: v - mean for c, v in raw.items()})


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


KINDS = ("FB", "SL", "CB", "CH")


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
    if s.level not in LEVEL or s.level not in RE_BY_LEVEL:
        raise ValueError(f"unknown level {s.level!r}")
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


def ump_estimate(takes, level, u0=0.0, a0=20.0):
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
    fbs = [x for x in arsenal if x.kind == "FB"]
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
    if (r == 4 and kind != "FB") or (r == 0 and kind == "FB"):
        return "chase"
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
        tot = 0.0
        for iv, wv in _interp_axis(look[0] / self.vfb, V_CENTERS):
            for iy, wy in _interp_axis(look[1], Y_CENTERS):
                tot += wv * wy * tab[(iv, iy)]
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


def policy_from_costs(costs, s, temp):
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
    return pi


def solve_sit_game(M, ks, s, temp, b_h=None, usage=None):
    """2.3 (A2) the quantal-response balance point. pi = Phi(M sigma) exactly at every step, so the residual is
    ||sigma - sigma*(pi~)||_inf; sigma moves by a damped step w (0.3, halved whenever the residual grows, floor 0.002)
    until the residual < QRE_TOL or QRE_ITERS steps. Deterministic. Returns (pi, sigma, residual)."""
    calls = list(M)
    usage = {a: v for a, v in (usage or {}).items() if a in M}
    n_u = sum(usage.values())

    def tilde(p_):
        return {a: (4 * p_.get(a, 0.0) + usage.get(a, 0)) / (4 + n_u) for a in calls} if n_u else p_

    def phi(sg):
        return policy_from_costs({a: sum(sg[k] * M[a][k] for k in ks) for a in calls}, s, temp)

    sg = {k: 1.0 / len(ks) for k in ks}
    w, last = 0.3, None
    for t in range(QRE_ITERS):
        pi = phi(sg)
        f = sit_response(M, ks, tilde(pi), temp, b_h)
        res = max(abs(sg[k] - f[k]) for k in ks)
        if res < QRE_TOL:
            return pi, sg, res
        if last is not None and res > last:
            w = max(QRE_WMIN, w / 2)
        last = res
        sg = {k: (1 - w) * sg[k] + w * f[k] for k in ks}
    pi = phi(sg)
    f = sit_response(M, ks, tilde(pi), temp, b_h)
    return pi, sg, max(abs(sg[k] - f[k]) for k in ks)


# v0.9 item 9: a pitch that isn't landing today (at least LAND_BLOCK_N thrown and its shrunk strike rate
# at or below LAND_BLOCK_EST) gives way to the pitches that are. With two strikes and fewer than three balls it may still
# be called as a chase; otherwise it is left out. If nothing is landing, or the rule would leave nothing to call, the
# filter stands down (there is no landing pitch to give way to). v1.0 Step 3: measured as a deviation from his own
# expectation, so a pitch with a low normal strike rate isn't blocked for being itself.
# v1.0 Step 5: the block is a coaching rule, so it keeps its own shrinkage (LAND_BLOCK_K = the Step 3 K of 5) and does
# not move when the fitted LAND_K does (rules and fits don't share a parameter).
LAND_BLOCK_N = 4
LAND_BLOCK_EST = -0.15
LAND_BLOCK_K = 5.0


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


def allowed_calls(arsenal, s, exclude=None):
    tq = targets(s.balls, s.strikes)
    ex = shaken_names(exclude)
    out = [(p.name, q) for p in candidates(arsenal, s) if p.name not in ex for q in tq]
    if s.landing_today and out:
        names = {a[0] for a in out}
        bad = {p.name for p in arsenal if p.name in names and not_landing(p, s)}
        if bad and bad != names:
            chase_ok = s.strikes == 2 and s.balls < 3
            kept = [a for a in out if a[0] not in bad or (chase_ok and a[1] == "chase")]
            if kept:
                out = kept
    return out


def cost08(p, q, s, arsenal, tab, look, sit, myopic=False):
    """Cost of call (p, q) in the v0.8 solve: outcome probabilities at this look and sit, next counts read from the
    table at the look this pitch leaves (myopic: at the PA's starting look), every PA end through v_end."""
    s_ = s if s.look is look else replace(s, look=look)
    P = outcome_probs(p, q, s_, arsenal, sit=sit)
    b, k, o, B = s.balls, s.strikes, s.outs, s.bases
    nl = tab.h0 if myopic else look_update(look, p, q, s)
    base_end = v_end(s, o, B, 0)

    def tv(b_, k_):
        return tab.value(b_, k_, nl)

    def walk_end(bases, runs):
        b1, b2, b3 = bases
        r_ = 1 if (b1 and b2 and b3) else 0
        return v_end(s, o, (True, b1 or b2, b3 or (b1 and b2)), runs + r_)

    v = 0.0
    v += P["ball"] * (walk_end(B, 0) if b + 1 == 4 else tv(b + 1, k))
    nb, r = advance_all(B)
    v += P["wp_ball"] * (walk_end(nb, r) if b + 1 == 4 else tv(b + 1, k) + v_end(s, o, nb, r) - base_end)
    v += P["hbp"] * walk_end(B, 0)
    v += (P["cstrike"] + P["whiff"]) * (v_end(s, o + 1, B, 0) if k + 1 == 3 else tv(b, k + 1))
    v += P["foul"] * (tv(b, k + 1) if k < 2 else tv(b, k))
    ipv = _ipv_cached(tab, p, q, s)
    for j, c in enumerate(("weak", "solid", "hard")):
        v += P[c] * ipv[j]
    if s.steal and s.steal.get("a", 0) > 0:
        v += steal_cost(p, q, s, tab, nl)
    if s.matchup and mashed(p, q, s):
        v += MASHED_PENALTY * run_scale(s.level)     # v1.0 D3: mashed twice at this height today
    if s.level in ("hs", "travel"):
        w_ = min(1.0, max(0.0, (s.pitch_count - (s.pitch_cap - 20)) / 20))
        if w_ > 0:
            nxt = P["ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N")) + \
                  (P["cstrike"] + P["whiff"]) * (0 if k + 1 == 3 else tab.value(b, k + 1, nl, "N")) + \
                  P["foul"] * tab.value(b, min(k + 1, 2), nl, "N") + P["wp_ball"] * (0 if b + 1 == 4 else tab.value(b + 1, k, nl, "N"))
            v += 0.002 * run_scale(s.level) * w_ * (1 + nxt)
    return v, P


def _ipv_cached(tab, p, q, s):
    """Speed only: the ball-in-play values of (p, q) don't depend on the count, look or sit; cached per base-out state and
    objective on the table (same numbers)."""
    w = s.win
    key = (p.name, q, s.outs, s.bases, s.infield_in, s.level,
           (w["omega"], w["WE0"], w["m0"], w["margin0"]) if (w and w["omega"] > 0) else None,
           ((s.grades or GRADES_OVERRIDE) or {}).get("w", 3))
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
    tab = Table(arsenal, s)
    order = sorted(COUNTS, key=lambda c: -(c[0] + c[1]))
    ks = sit_options(arsenal)
    by = {x.name: x for x in arsenal}
    # start: v0.7c count values on top of the base-out value, flat across looks; N from a rough 4 pitches
    for (b, k) in COUNTS:
        v0 = v_end(s, s.outs, s.bases, 0) + CV_BY_LEVEL[s.level][(b, k)]
        tab.V[(b, k)] = {bn: v0 for bn in tab.bins}
        tab.N[(b, k)] = {bn: 2.0 for bn in tab.bins}
    prior = sit_prior(arsenal, replace(s, balls=0, strikes=0))
    tab.h0 = (sum(v * speed_today(by[n], s) for (n, j), v in prior.items()), 2.5)
    for sw in range(sweeps):
        delta = 0.0
        for (b, k) in order:
            sc = replace(s, balls=b, strikes=k, last=None, usage_this_count={}, usage_by_call={},
                         b_h=dict(s.b_h))
            temp = temperature(arsenal, sc)
            calls = allowed_calls(arsenal, sc)
            # sit game at the PA's starting look
            scH = replace(sc, look=tab.h0)
            M = {a: {kk: cost08(by[a[0]], a[1], scH, arsenal, tab, tab.h0, ("pure",) + kk)[0] for kk in ks} for a in calls}
            pi, sg, res = solve_sit_game(M, ks, sc, temp, sc.b_h)
            tab.sigma[(b, k)] = sg
            tab.residuals.append(res)
            for bn in tab.bins:
                look = tab.bin_look(bn)
                cs, Ps = {}, {}
                scL = replace(sc, look=look)
                for a in calls:
                    cs[a], Ps[a] = cost08(by[a[0]], a[1], scL, arsenal, tab, look, ("mix", sg))
                pol = policy_from_costs(cs, sc, temp)
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
    call, so the root and the table (solve_table) use one operator. Three-ball counts rank by myopic cost (no setups)."""
    by = {x.name: x for x in arsenal}
    ks = sit_options(arsenal)
    look = s.look or tab.h0
    temp = temperature(arsenal, s)
    calls = allowed_calls(arsenal, s, exclude)
    if not calls:
        calls = allowed_calls(arsenal, s)
    sL = replace(s, look=look)
    my = s.balls == 3 or not look_value     # three-ball counts rank by myopic cost (no setups); test switch
    M = {a: {kk: cost08(by[a[0]], a[1], sL, arsenal, tab, look, ("pure",) + kk, myopic=my)[0] for kk in ks} for a in calls}
    usage = s.usage_by_call
    pi, sg, res = solve_sit_game(M, ks, s, temp, s.b_h, usage)
    full = {a: sum(sg[kk] * M[a][kk] for kk in ks) for a in M}
    return pi, sg, full, res, M


def call_v08(arsenal, s, rng=None, exclude=None, tab=None):
    """v0.8 call: solve (or reuse) the PA table, then the root. Returns ((p, q, prob, cost), dist, tab, info)."""
    check_inputs(arsenal, s)      # v1.0 #9: the live entry point validates like callV08 does
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
        c = "FB" if p.kind == "FB" else "OS"
        v = sum(log(1.3) for fc in fooled if fc != c)
        if v:
            out[(n, j)] = v
    return out


def frozen_inputs(arsenal, s):
    """6.2 the inputs a plate-appearance table is solved with, for the re-solve triggers."""
    return dict(conf={x.name: x.conf for x in arsenal}, wild={x.name: wild_today(x, s) for x in arsenal}, ump=s.ump_u,
                names=tuple(x.name for x in arsenal), outs=s.outs, bases=tuple(bool(b) for b in s.bases),
                infield_in=bool(s.infield_in))


def needs_resolve(frozen, arsenal, s):
    """6.2 re-solve mid at-bat when the pitcher changes, the outs, bases or infield-in setting change (v1.0 #2: the
    table's count values are priced at the base-out state it was solved at), a confidence or wild-today value moves by
    > 0.10, or the umpire shift moves by > 0.20 logits."""
    if frozen is None or frozen["names"] != tuple(x.name for x in arsenal):
        return True
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
WE_LEVEL = {"travel": "hs", "college": "college_d1"}
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
}


def _root_cost_pair(arsenal, s, tab, a, b, sigma, myopic=False):
    by = {x.name: x for x in arsenal}
    look = s.look or tab.h0
    ks = sit_options(arsenal)

    def c(x):
        return sum(sigma[k] * cost08(by[x[0]], x[1], s, arsenal, tab, look, ("pure",) + k, myopic=myopic)[0]
                   for k in ks if sigma[k] > 1e-4)
    return c(a), c(b)


def next_count_top(arsenal, s, tab, pick, info, exclude=None):
    """v1.0 Step 4 (#3): the engine's own top call at the count this pitch leads to if it goes for a strike: (b, k+1), the
    look moved by look_update, this pitch as the last one (its most likely count-keeping strike: taken, missed or fouled),
    one more sighting of it, and, on a non-chase target, one more strike in its landing record. Per-count usage at the new
    count is not known here and is left empty. Read by the "Sets up the X" lines only; it changes no call."""
    p, q = pick[0], pick[1]
    look = s.look or tab.h0
    P = outcome_probs(p, q, replace(s, look=look), arsenal, sit=("mix", info["sigma"]))
    res = "cstrike"
    for r in ("whiff", "foul"):
        if P[r] > P[res]:
            res = r
    seen = dict(s.hitter_seen or {})
    seen[p.name] = seen.get(p.name, 0) + 1
    land = dict(s.landing_today or {})
    if q != "chase":
        land[p.name] = landing_record(landing_triple(p, land.get(p.name)), True, expected_strike(p, q, s, arsenal))
    sn = replace(s, strikes=min(2, s.strikes + 1), look=look_update(look, p, q, s), last=(p.name, q, res),
                 hitter_seen=seen, landing_today=land, usage_this_count={}, usage_by_call={})
    pi = root_call(arsenal, sn, tab, exclude)[0]
    top = None
    for x, v in pi.items():
        if top is None or v > pi[top]:
            top = x
    return top


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
            try:
                for n in names:
                    P08[n] = 0.0
                ca, cb = _root_cost_pair(arsenal, s, tab, a, comp, sigma, myopic=my)
            finally:
                P08.update(saved)
            deltas[term] = base - (ca - cb)
        if not my:      # three-ball counts are ranked without look value, so it explains nothing there
            deltas["look value"] = base - (cmy[a] - cmy[comp])
        for term, s_off in (("situation", replace(s, win=None)), ("umpire", replace(s, ump_u=0.0)),
                            ("running game", replace(s, steal=None)), ("grades", replace(s, grades=None))):
            ca, cb = _root_cost_pair(arsenal, s_off, tab, a, comp, sigma, myopic=my)
            deltas[term] = base - (ca - cb)
    nxt = next_count_top(arsenal, s, tab, pick, info, exclude) if label == "Setup" else None
    out = dict(a=a, bstar=bstar, comp=comp, cmy=cmy, cful=cful, label=label, deltas=deltas, next=nxt)
    cache[key] = out
    return out


def why_line(arsenal, s, tab, pick, info, exclude=None):
    """9 / v1.0 Step 4: the term that most favors the drawn call a over the comparator (see _explain). "Sets up" exactly
    when the intent label is Setup, naming the engine's top call at the next count; otherwise look value is not eligible.
    Delta values rank only. Returns (line, {term: Delta}, comparator)."""
    X = _explain(arsenal, s, tab, pick, info, exclude)
    deltas, b = X["deltas"], X["comp"]
    if b is None:
        return "Only call allowed here", {}, None
    if X["label"] == "Setup":
        term = "look value"
    else:
        elig = [t for t in deltas if t != "look value"]
        term = min(elig, key=lambda t: deltas[t])
        if deltas[term] >= -1e-6:
            if X["cful"][X["a"]] <= X["cful"][b] + 1e-9:
                return "Best call on its own merits", deltas, b
            return "Mixed in so he can't sit on one pitch", deltas, b
    p, q = pick[0], pick[1]
    look = s.look or tab.h0
    sigma = info["sigma"]
    if term == "timing":
        vs = sum(v * speed_today(next(x for x in arsenal if x.name == n), s) for (n, j), v in sigma.items())
        vt = (1 - P08["alpha"]) * look[0] + P08["alpha"] * vs
        vp = speed_today(p, s) + 0.5 * ev_adj(p, q)
        line = f"He's timed for {vt:.0f} mph; this plays {abs(vt - vp):.0f} mph {'slower' if vt > vp else 'faster'}"
    elif term == "look value":
        nxt = X["next"]
        line = f"Sets up the {nxt[0].lower()} {nxt[1]}"
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
            top_h = max((j for j in by_h if not (q.startswith(j) or (j == "middle" and q == "middle"))), key=lambda j: by_h[j])
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
    """The label rule (plan item 4), first match wins. c_my = myopic cost, c = full cost (with look value); *_best are for b*,
    the allowed call with the lowest myopic cost."""
    if balls == 3 and strikes < 2:
        return "Get it over"
    if strikes == 2:
        return "Expand" if quad == "chase" else "Finish"
    if c_my_a > c_my_best + e and c_a < c_best:
        return "Setup"
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
    if label in ("Setup", "Early off-zone") and X["bstar"] != X["a"]:
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
    elif label == "Setup":
        nxt = X["next"]
        line = f"Sets up the {nxt[0].lower()} {nxt[1]}, because {intent_mech_text(mech)}"
    elif label == "Expand":
        line = f"Two strikes: {p.name.lower()} {spot}, off the zone"
    elif label == "Finish":
        line = f"Put-away: {p.name.lower()} {spot}"
    else:
        line = f"Off the zone early: {p.name.lower()} {spot}" + (f", because {intent_mech_text(mech)}" if mech else "")
    return label, mech, line
