"""
Pitch Caller - scoring engine, v0.7c (3-0 mixes tightest, travel ball uses the high school tables, clear errors on
impossible input). Earlier: v0.6e prototype (v0.6c stakes-scaled randomness; v0.6d pitches not landing today miss more; v0.6e two-way wildness, timing affects contact, hitter damage scaled to real pitch values).

Cost(p, q | s) = sum_e P(e | p, q, s) * [R(e) + V(s'_e)]
Calls are drawn at random, weighted toward low cost, at a game-theory balance point.

v0.2 adds the eight research-backed philosophy changes (tagged [R1]..[R8] below):
  R1 mix, don't script            -> call_mixed (weighted random pick + equilibrium loop)
  R2 think in at-bats             -> at_bat_values(): count values solved from this matchup
  R3 no hard-coded count rules    -> pitcher-side choices come only from run values
  R4 expand, don't waste          -> chase target aims just off the zone
  R5 avoid strengths > hunt holes -> hitter_damage with asymmetric shrinkage
  R6 repeat after a whiff         -> pairing bonus for same pitch/spot after a swing and miss
  R7 perceived speed (EV)         -> sequencing uses location-adjusted speed
  R8 no third-time-through cliff  -> continuous decline by batters faced
  + learning mode                 -> grade_call(): how the engine rates the catcher's call

All numbers are PLACEHOLDERS (MLB-based run values, hand-set odds). They exist to
check that the structure produces sensible baseball calls, not to be trusted in a game.
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
# v0.8 compatibility flags (docs/SPEC_v0.8.md section 1). FLAGS_V07 = every flag in its v0.7c position, which must
# reproduce v0.7c exactly (golden/golden.py check). FLAGS_V08 = the v0.8 engine.
# ---------------------------------------------------------------------------
FLAGS_V07 = dict(pairing_v07=True, bf_term_v07=True, ev_full=True, expect_v07=True, look_state=False, timing_B=False,
                 objective_win=False, inplay_typed=False, running_game=False, umpire_learn=False, fatigue_v08=False,
                 hitter_grades=False, hs_pitch_cost=False, temp_unc=False)
FLAGS_V08 = dict(pairing_v07=False, bf_term_v07=False, ev_full=False, expect_v07=False, look_state=True, timing_B=True,
                 objective_win=True, inplay_typed=True, running_game=True, umpire_learn=True, fatigue_v08=True,
                 hitter_grades=True, hs_pitch_cost=True, temp_unc=True)
FLAGS = dict(FLAGS_V07)


def set_flags(**kw):
    """Set flags by name; unknown names are an error. Returns the previous flags so a caller can restore them."""
    prev = dict(FLAGS)
    for k, v in kw.items():
        if k not in FLAGS:
            raise KeyError(f"unknown flag {k!r}")
        FLAGS[k] = bool(v)
    return prev


class flags:
    """Context manager: `with flags(**FLAGS_V08): ...` runs with those flags and restores the old ones after."""
    def __init__(self, **kw):
        self.kw = kw

    def __enter__(self):
        self.prev = set_flags(**self.kw)
        return FLAGS

    def __exit__(self, *a):
        FLAGS.clear(); FLAGS.update(self.prev)


# v0.8 parameters (docs/SPEC_v0.8.md). Starting values; perturb.py samples them and seq_fit.py can replace some.
P08 = dict(
    sit_tW=1.5, sit_hW=0.75, sit_tH=1.0, sit_hH=0.5, sit_tS=0.3, sit_hS=0.15,     # 2.2 sit effects (type, height)
    alpha=0.4, lam=0.6,                                                            # 2.6 look
    beta_T=0.5, gamma_T=0.3, dead=0.03, ramp=0.05, ch_hi=0.12, ch_decay=0.08, fast_mult=0.6,   # 3.1-3.2 timing
    capW=1.6, capH=1.2,                                                            # 3.4
    beta_E=0.25, dstar_E=1.5, beta_tun=0.15, kappa_brk=1.5,                        # 4.1-4.2
    rep_whiff_same=0.16, rep_whiff_other=0.12, rep_same_spot=-0.32,                # 4.3
    phi_FB=0.058, phi_OS=0.116, fam_cap=0.5,                                       # 5
    crowd=0.3,                                                                     # 2.8
    kv=0.5, kv_cap=4.0, kg=0.25, kg_cap=1.0,                                       # 8.1
    g_c=0.25, g_w=0.25, g_d=0.25,                                                  # 8.2
)
TYPED = dict(beta_y=-0.8, gamma={"weak": 0.3, "solid": 0.0, "hard": -0.3},       # 7.3 batted-ball types
             nongb={"weak": (0.10, 0.40, 0.50), "solid": (0.45, 0.45, 0.10), "hard": (0.45, 0.55, 0.0)},
             dp={"weak": 0.30, "solid": 0.20, "hard": 0.10}, gb_infield_in=0.10, r2_to_3rd={"GB": 0.50, "FB": 0.25})
RHO_L = {"hs": 0.6, "travel": 0.6}            # 3.2 level scaling of MLB-fitted timing effects (others 1.0)
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
    """The targets the engine may call in this count."""
    return [q for q in QUADS if q != "chase"] if (balls, strikes) in NO_CHASE else QUADS
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
    strike_rate: float = None  # his expected strike rate with this pitch; "landing today" and confidence measure against it
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
    level: str = "college"
    same_side: bool = True          # pitcher and hitter same handedness
    last: tuple = None              # (pitch name, quad[, result]) of previous pitch this AB
    hitter_seen: dict = field(default_factory=dict)       # pitch name -> times seen
    usage_this_count: dict = field(default_factory=dict)  # pitch name -> times thrown in this count today
    timing: dict = field(default_factory=dict)            # "FB"/"OS" -> -1 early .. +1 late
    hitter_damage: dict = field(default_factory=dict)     # [R5] key ("FB"/"OS" or quad) -> (score -1..+1, n pitches)
    catcher_block: int = 3
    landing_today: dict = field(default_factory=dict)     # v0.6d: pitch name -> (strikes, thrown) today, this pitcher
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
    if p.strike_rate is not None:       # v0.7: news is measured against HIS usual strike rate, so a pitcher who is
        c = LAND_CENTER["OS" if is_offspeed(p.kind) else "FB"]     # always wild doesn't sink all game, and the drift
        q = min(0.95, max(0.05, p.strike_rate))                     # from his normal mix matches an average pitcher's
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
    return s.inning >= 7 and abs(s.margin) <= 2 and (s.bases[1] or s.bases[2])


# ---------------------------------------------------------------------------
# Stage 1: command -> landing zone shares
# ---------------------------------------------------------------------------

# v0.6d: "if the off-speed gets it over, then get it over" (Drew). Each pitch's strike rate today, shrunk toward a
# typical rate (worth LAND_K pitches), makes it miss more when it's below that rate. One-sided: a pitch landing well
# keeps its normal model. Applied to every target alike, so the engine reaches for a pitch that IS landing.
LAND_CENTER = {"FB": 0.66, "OS": 0.58}     # typical strike rate by pitch class (simulated college games)
LAND_K = 5.0
LAND_GAIN = 4.0
LAND_MAX = 0.6


def landing_estimate(p: Pitch, s: Situation):
    ev = s.landing_today.get(p.name) if s.landing_today else None
    center = p.strike_rate if p.strike_rate is not None else LAND_CENTER["OS" if is_offspeed(p.kind) else "FB"]
    if not ev:
        return center, center, 0
    st, n = ev
    return (center * LAND_K + st) / (LAND_K + n), center, n


def wild_today(p: Pitch, s: Situation):
    if s.wild_true:                        # the simulated world: how off the pitch really is today, not an estimate
        return s.wild_true.get(p.name, 0.0)
    est, center, n = landing_estimate(p, s)
    return min(LAND_MAX, max(0.0, LAND_GAIN * (center - est))) if n else 0.0


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
    wt = wild_today(p, s)                    # v0.6d: this pitch isn't landing today
    if wt:                                   # v0.6e: misses go both ways, so a wild pitch also leaves more over the plate
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


def expectation(p: Pitch, arsenal, s: Situation, policy=None):
    """E_p: chance the hitter is sitting on p. Count prior + our own mix + what we've shown."""
    m = len(arsenal)
    hitters_count = s.balls > s.strikes and s.strikes < 2
    fb = [x for x in arsenal if x.kind == "FB"]
    os_ = [x for x in arsenal if x.kind != "FB"]
    prior = {}
    if fb and os_:
        fb_share = 0.65 if hitters_count else (0.35 if s.strikes == 2 else 0.5)
        for x in fb:
            prior[x.name] = fb_share / len(fb)
        for x in os_:
            prior[x.name] = (1 - fb_share) / len(os_)
    else:
        prior = {x.name: 1 / m for x in arsenal}
    if policy:   # [R1] a smart hitter anticipates our own tendencies in this spot
        lam = 0.6
        prior = {x.name: (1 - lam) * prior[x.name] + lam * policy.get(x.name, 0.0) for x in arsenal}
    n = sum(s.usage_this_count.values())   # what a dugout could pick up today, k = 4
    k = 4.0
    e = {x.name: (k * prior[x.name] + s.usage_this_count.get(x.name, 0)) / (k + n) for x in arsenal}
    return e[p.name], 1 / m


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


def perceived(p: Pitch, q: str):
    """[R7] Location-adjusted speed: how fast the pitch looks to the hitter."""
    return p.mph() + EV_ADJ[q]


def pairing(p: Pitch, q: str, s: Situation, arsenal):
    """T: one sequencing term from the last pitch, -1..+1.
    Type and eye-level pattern, plus [R7] perceived-speed gap, plus [R6] repeat-after-whiff."""
    if not s.last:
        return 0.0
    last_name, last_q = s.last[0], s.last[1]
    last_result = s.last[2] if len(s.last) > 2 else None
    last = next((x for x in arsenal if x.name == last_name), None)
    if last is None:      # the last pitch came from someone else (a pitching change mid at-bat): no sequencing read
        return 0.0
    up_last, up_now = last_q.startswith("up"), q.startswith("up")

    # [R6] if he can't hit it, make him prove it
    if last.name == p.name:
        if last_result == "whiff":
            return 0.4 if last_q == q else 0.3
        if last_q == q:
            return -0.8                      # same pitch, same spot, and he didn't miss it

    if last.kind == "FB":
        base = (1.0 if (up_last and not up_now) else 0.6) if is_offspeed(p.kind) else (0.3 if up_last != up_now else -0.2)
    elif p.kind == "FB":
        base = 0.6 if up_now else 0.3
    else:
        base = -0.3 if last.name == p.name else 0.2

    # [R7] perceived-speed gap: a big gap as the hitter sees it disrupts timing
    gap = abs(perceived(p, q) - perceived(last, last_q))
    speed = min(gap / 16.0, 1.0) * 0.6 - 0.2
    # v0.4 tunnel: looks the same at the decision point, finishes somewhere else
    # tunneling is about two different pitches; same pitch, new spot is an eye-level change (above)
    tun = tunnel_score(last, last_q, p, q, s.same_side)[0] if last.name != p.name else 0.0
    return max(-1.0, min(1.0, 0.30 * base + speed + 0.50 * tun))


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
        f -= 0.3
    return f


# v0.6e: hitter damage scaled so a strong masher (0.8, well established) is worth about +0.03 runs per pitch at MLB,
# the range of the best fastball hitters' pitch values (FanGraphs 2021: +2.5 to +3.7 runs per 100 four-seamers).
DMG_SCALE = 3.0


def damage(p: Pitch, q: str, s: Situation):
    """[R5] Hitter's damage read for this pitch class and location, shrunk toward 0.
    Strengths (+) count fully; holes (-) count half until well established (20+ pitches)."""
    total = 0.0
    for key in ("OS" if is_offspeed(p.kind) else "FB", q):
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
    if FLAGS["fatigue_v08"]:
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
    vp = speed_today(p, s) + 0.5 * EV_ADJ[q]
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
    w = P08["beta_E"] * ey
    sw = P08["beta_E"] * ey
    if s.last:
        last = next((x for x in arsenal if x.name == s.last[0]), None)
        lq = s.last[1]
        res = s.last[2] if len(s.last) > 2 else None
        if last is not None:
            if last.name == p.name:
                if res == "whiff":
                    w += P08["rep_whiff_same"] if lq == q else P08["rep_whiff_other"]
                elif lq == q:
                    w += P08["rep_same_spot"]
            else:
                _, d_tun, _, d_plate = tunnel_score(last, lq, p, q, s.same_side)
                d_rel = ((last.release_offset_in[0] - p.release_offset_in[0]) ** 2 +
                         (last.release_offset_in[1] - p.release_offset_in[1]) ** 2) ** 0.5
                tun = max(-1.0, min(1.0, exp(-d_tun / 6) * g_mod(d_plate, 18) - d_rel / 8))
                kap = P08["kappa_brk"] if p.kind in ("SL", "CB") else 1.0
                w += kap * P08["beta_tun"] * tun
                sw += kap * P08["beta_tun"] * tun
    if is_big_spot(s):
        w, sw = 0.5 * w, 0.5 * sw
    return w, sw


def outcome_probs(p: Pitch, q: str, s: Situation, arsenal, policy=None, stats=None, sit=None, zout=None):
    L = LEVEL[s.level]
    A = OUTCOME_ADJ[s.level]
    big = is_big_spot(s)
    cL = L["cL"] * (1.5 if big else 1.0)
    bT = 0.4 * (0.5 if big else 1.0)
    v08x = sit is not None or not FLAGS["expect_v07"]       # v0.8 sit terms replace the v0.7c expectation E
    if v08x:
        if sit is None:
            sit = ("mix", s.sit_sigma if s.sit_sigma is not None else sit_prior(arsenal, s))
        m_t, m_h, v_sit = sit_shift(p, q, arsenal, s, sit)
    else:
        E, neutral = expectation(p, arsenal, s, policy)
    if FLAGS["pairing_v07"]:
        T = pairing(p, q, s, arsenal)
    else:
        pw, ps = pair_terms(p, q, s, arsenal)
    tB = 0.0
    if FLAGS["timing_B"]:
        if not v08x:
            v_sit = sum(v * speed_today(next(x for x in arsenal if x.name == n), s) for (n, j), v in sit_prior(arsenal, s).items())
        tB = RHO_L.get(s.level, 1.0) * timing_B(p, q, s, v_sit)
    capped = not FLAGS["expect_v07"]
    hL = L["hL"]
    gr = s.grades if (FLAGS["hitter_grades"] and s.grades) else None
    f = shape_fit(p, q, s)
    dmg = damage(p, q, s)
    tau = s.timing.get("OS" if is_offspeed(p.kind) else "FB", 0.0)
    tau_eff = tau if p.kind == "FB" else -tau        # late (+) helps fastballs, early (-) helps off-speed

    hitters_count = s.balls > s.strikes and s.strikes < 2
    land = landing(p, q, s)
    command, grade = effective(p, s)
    if FLAGS["fatigue_v08"]:
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
        if v08x:
            sl += hL * (P08["sit_tS"] * m_t + P08["sit_hS"] * m_h)
        if not FLAGS["pairing_v07"] and offz:
            sl += ps
        if gr and offz:
            sl -= P08["g_d"] * (gr.get("d", 3) - 3)
        S = sig(sl) if S0[z] > 0 else 0
        if FLAGS["umpire_learn"] and z in ("edge", "off"):
            C = sig(logit(C0[z]) + A["cs"] + count_kappa(s.balls, s.strikes, s.level) + s.ump_u)
        else:
            C = sig(logit(C0[z]) + A["cs"]) if z in ("edge", "off") else C0[z]
        # whiff
        wl = logit(W0[z]) + KIND_W[p.kind] + gs * (grade - 3) + cL * 1.5 * (p.conf - 0.6)
        if not v08x:
            wl += L["hL"] * (-1.5 * (E - neutral) + 0.6 * tau_eff - 0.4 * DMG_SCALE * dmg)
        else:
            ex = -hL * (P08["sit_tW"] * m_t + P08["sit_hW"] * m_h) + hL * 0.6 * tau_eff + P08["beta_T"] * tB
            if capped:
                ex = max(-P08["capW"] * hL, min(P08["capW"] * hL, ex))
            wl += ex - hL * 0.4 * DMG_SCALE * dmg
        if FLAGS["timing_B"] and not v08x:
            wl += P08["beta_T"] * tB
        if FLAGS["pairing_v07"]:
            wl += bT * T + 0.25 * f
        else:
            wl += pw + 0.25 * f
        wl += wz_ * A["wz"] + (1 - wz_) * A["wo"]
        if cw:
            wl -= cw
        if gr:
            wl -= P08["g_c"] * (gr.get("c", 3) - 3)
        W = sig(wl)
        F = sig(logit(F0[z]) + (0.3 if s.strikes == 2 else 0))
        # contact quality: shift hard share
        if not v08x:
            hl = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6) + L["hL"] * (1.0 * (E - neutral) + 0.8 * DMG_SCALE * dmg) - 0.3 * f
        else:
            hx = hL * (P08["sit_tH"] * m_t + P08["sit_hH"] * m_h) - hL * 0.5 * tau_eff - P08["gamma_T"] * tB
            if capped:
                hx = max(-P08["capH"] * hL, min(P08["capH"] * hL, hx))
            hl = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6) + hx + hL * 0.8 * DMG_SCALE * dmg - 0.3 * f
        if FLAGS["bf_term_v07"]:
            hl += 0.012 * s.batters_faced                  # [R8] steady decline, no cliff
        else:
            c_ = "OS" if is_offspeed(p.kind) else "FB"
            hl += min(P08["fam_cap"], P08["phi_" + c_] * s.familiar.get(c_, 0))
        if not v08x:
            hl -= L["hL"] * 0.5 * tau_eff                  # v0.6e: off-time swings make weaker contact too
        if FLAGS["timing_B"] and not v08x:
            hl -= P08["gamma_T"] * tB
        if gr:
            hl += P08["g_w"] * (gr.get("w", 3) - 3)
        if s.crowding and q in ("up-in", "down-in"):
            hl -= P08["crowd"]
        if p.kind == "CH" and s.same_side:
            hl += 0.2
        if z == "heart" and is_offspeed(p.kind):
            hl += 0.5          # hanger: off-speed over the middle gets hit hard
        if is_offspeed(p.kind) and (q.startswith("up") or q == "middle"):
            hl += 0.4          # v0.3: aiming off-speed up or at the middle leaves it up
        weak, solid, hard = Q0[z]
        hard2 = sig(logit(hard) + hl)
        if zout is not None:
            zout[z] = dict(L=pz, S=S, C=C, W=W, F=F, H=hard2, offz=offz, cz=z in ("edge", "off"))
        scale = (1 - hard2) / (weak + solid)
        weak2, solid2 = weak * scale, solid * scale

        take = 1 - S
        ball_p = pz * take * (1 - C)
        if z in ("noncomp", "off") and A["hbp"] > 0:   # v0.6: hit by pitch
            hb = min(0.9, A["hbp"] * HBP_LOC[q] * (1.0 if z == "noncomp" else 0.1))
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

IN_PLAY = {  # out, 1B, 2B, 3B, HR, error  (amateur-ish placeholder)
    "weak": (0.80, 0.14, 0.02, 0.00, 0.00, 0.04),
    "solid": (0.52, 0.28, 0.12, 0.02, 0.02, 0.04),
    "hard": (0.28, 0.30, 0.22, 0.04, 0.13, 0.03),
}


def end_pa_value(outs, bases, runs, level="mlb"):
    return runs + re(outs, bases, level)


def in_play_value(contact, outs, bases, level="mlb"):
    b1, b2, b3 = bases
    po, p1, p2, p3, phr, pe = IN_PLAY_BY_LEVEL[level][contact]
    def end_pa_value(o_, b_, r_):
        return r_ + re(o_, b_, level)
    total = 0.0
    if outs + 1 >= 3:
        v_out = 0.0
    else:
        dp = 0.20 if (b1 and contact == "weak" and outs < 2) else 0.0
        v_dp = 0.0 if outs + 2 >= 3 else end_pa_value(outs + 2, (False, b2, b3), 0)
        if b3:   # runner on 3rd scores 40% of the time on an out with <2 outs
            v_reg = 0.4 * end_pa_value(outs + 1, (b1, b2, False), 1) + 0.6 * end_pa_value(outs + 1, bases, 0)
        else:
            v_reg = end_pa_value(outs + 1, bases, 0)
        v_out = dp * v_dp + (1 - dp) * v_reg
    total += po * v_out

    runs = 1 if b3 else 0           # single / error
    if b2:
        v1 = 0.55 * end_pa_value(outs, (True, b1, False), runs + 1) + 0.45 * end_pa_value(outs, (True, b1, True), runs)
    else:
        v1 = end_pa_value(outs, (True, b1, False), runs)
    total += (p1 + pe) * v1

    runs = (1 if b2 else 0) + (1 if b3 else 0)   # double
    if b1:
        v2 = 0.4 * end_pa_value(outs, (False, True, False), runs + 1) + 0.6 * end_pa_value(outs, (False, True, True), runs)
    else:
        v2 = end_pa_value(outs, (False, True, False), runs)
    total += p2 * v2
    total += p3 * end_pa_value(outs, (False, False, True), b1 + b2 + b3)
    total += phr * end_pa_value(outs, (False, False, False), b1 + b2 + b3 + 1)
    return total


try:   # v0.8 typed batted-ball tables (inplay_fit.py); absent = flag can't be turned on
    from inplay_typed_params import OUT_TABLE, RUNNER_FIT
except ImportError:
    OUT_TABLE, RUNNER_FIT = {}, {}
B_TYPES = ("GB", "LD", "FB", "PU")


def gb_rate(p):
    """7.3 MLB ground-ball rate by pitch (sinker and cutter by fastball shape)."""
    if p.kind == "FB":
        return {"sink": 0.495, "cut": 0.430}.get(p.shape, 0.379)
    return {"SL": 0.439, "CB": 0.487, "CH": 0.478}[p.kind]


def type_mix(p, q, c):
    g = sig(logit(gb_rate(p)) + TYPED["beta_y"] * (y_target(q, p.kind) - 2.5) + TYPED["gamma"][c])
    lfp = TYPED["nongb"][c]
    return {"GB": g, "LD": (1 - g) * lfp[0], "FB": (1 - g) * lfp[1], "PU": (1 - g) * lfp[2]}


def v_end(s, o, bases, r):
    """7.2 end-of-plate-appearance value (runs, or run-equivalents with the win blend fixed at the PA start)."""
    base = r + re(o, bases, s.level)
    w = s.win
    if not (FLAGS["objective_win"] and w and w["omega"] > 0):
        return base
    we = w["we"](o, bases, w["margin0"] - r)
    return (1 - w["omega"]) * base + w["omega"] * (w["WE0"] - we) / w["m0"]


def in_play_value_typed(c, p, q, s):
    """7.3 value of contact quality c on call (p, q), by batted-ball type and its runner rules."""
    o, (b1, b2, b3), L = s.outs, s.bases, s.level
    tab, rf = OUT_TABLE[L][c], RUNNER_FIT[L]
    ev = lambda o_, b_, r_: v_end(s, o_, b_, r_)
    tm = type_mix(p, q, c)
    total = 0.0
    for t in B_TYPES:
        po, p1, p2, p3, phr, pe = tab[t]
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


def cost(p: Pitch, q: str, s: Situation, arsenal, policy=None, cv=None, sit=None):
    P = outcome_probs(p, q, s, arsenal, policy, sit=sit)
    b, k, o, B, L = s.balls, s.strikes, s.outs, s.bases, s.level

    def after_ball(bases, runs):
        if b + 1 == 4:
            return runs + walk_value(o, bases, L)
        return runs + V(b + 1, k, o, bases, cv, L)

    def after_strike():
        if k + 1 == 3:
            return re(o + 1, B, L)
        return V(b, k + 1, o, B, cv, L)

    v = 0.0
    v += P["ball"] * after_ball(B, 0)
    nb, r = advance_all(B)
    v += P["wp_ball"] * after_ball(nb, r)
    v += P["hbp"] * walk_value(o, B, L)
    v += (P["cstrike"] + P["whiff"]) * after_strike()
    v += P["foul"] * (V(b, k + 1, o, B, cv, L) if k < 2 else V(b, k, o, B, cv, L))
    if FLAGS["inplay_typed"]:
        for c in ("weak", "solid", "hard"):
            v += P[c] * in_play_value_typed(c, p, q, s)
    else:
        for c in ("weak", "solid", "hard"):
            v += P[c] * in_play_value(c, o, B, L)
    return v, P


# ---------------------------------------------------------------------------
# Decision rule: [R1] weighted random pick at a game-theory balance point
# ---------------------------------------------------------------------------

def _softmax(costs, temp, window, best=None):
    best = min(costs.values()) if best is None else best
    keep = {k: c for k, c in costs.items() if c - best <= window}
    if not keep:
        return {}
    w = {k: exp(-(c - min(keep.values())) / temp) for k, c in keep.items()}
    t = sum(w.values())
    return {k: v / t for k, v in w.items()}


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


def count_kappa(b, k, level):
    return log(zone_area(b, k) / A_BAR.get(level, 3.0))


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
    avg = sum(count_stakes(b_, k_, level) for (b_, k_) in COUNTS) / len(COUNTS)
    return min(1.5, max(0.5, avg / count_stakes(b, k, level)))


def mixed_policy(arsenal, s, T=0.010, window=0.030, forced=None, iters=8, cv=None):
    """Returns (pitch policy, cost table). Policy is the equilibrium mix over pitch types."""
    cands = candidates(arsenal, s, forced)
    k = run_scale(s.level)
    f = stakes_factor(s.balls, s.strikes, s.level)
    T, window = T * k, window * k * min(1.0, f)        # big counts: tighter never-pick window too
    temp = T * (0.5 if is_big_spot(s) else 1.0) * f
    policy = None
    tq = targets(s.balls, s.strikes)
    for _ in range(iters):
        costs = {(p.name, q): cost(p, q, s, arsenal, policy, cv)[0] for p in cands for q in QUADS}
        best_by_pitch = {p.name: min(costs[(p.name, q)] for q in tq) for p in cands}
        p_pitch = _softmax(best_by_pitch, temp, window)
        new = {x.name: p_pitch.get(x.name, 0.0) for x in arsenal}
        policy = new if policy is None else {k: 0.5 * policy[k] + 0.5 * new[k] for k in new}
    return policy, costs, temp


def at_bat_values(arsenal, s, T=0.010, window=0.030, sweeps=10, iters=4):
    """[R2] Solve every count's value for THIS pitcher, hitter and base-out state.
    Value iteration over the 12 counts: each count's value is the expected cost of the
    engine's own mixed policy there, which depends on the values of the counts after it.
    Returns cv: hitter's runs relative to the base-out run expectancy, per count."""
    cv = dict(CV_BY_LEVEL[s.level])        # start from this level's average count values
    base = re(s.outs, s.bases, s.level)
    order = sorted(COUNTS, key=lambda c: -(c[0] + c[1]))   # deep counts first
    for _ in range(sweeps):
        delta = 0.0
        for (b, k) in order:
            sc = replace(s, balls=b, strikes=k, last=None if (b, k) != (s.balls, s.strikes) else s.last,
                         usage_this_count={} if (b, k) != (s.balls, s.strikes) else s.usage_this_count)
            policy, costs, temp = mixed_policy(arsenal, sc, T, window, iters=iters, cv=cv)
            ev = 0.0
            tq = targets(b, k)
            best_ok = min(c for (_, q), c in costs.items() if q in tq)
            for name, pp in policy.items():
                if pp <= 0:
                    continue
                loc = _softmax({q: costs[(name, q)] for q in tq}, temp, LOC_WINDOW * run_scale(s.level) * min(1.0, stakes_factor(b, k, s.level)), best_ok) \
                      or {min(tq, key=lambda q: costs[(name, q)]): 1.0}
                ev += pp * sum(pq * costs[(name, q)] for q, pq in loc.items())
            new = ev - base
            delta = max(delta, abs(new - cv[(b, k)]))
            cv[(b, k)] = new
        if delta < 0.001:
            break
    # express relative to 0-0, like the MLB table
    zero = cv[(0, 0)]
    return {c: v - zero for c, v in cv.items()}, cv


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


def call_mixed(arsenal, s: Situation, T=0.010, window=0.030, forced=None, rng=None, iters=8, at_bat=True, exclude=None):
    """
    Probabilistic call, in two stages, at a game-theory balance point.
      Stage A - pitch type:  P(p) ~ exp(-(best cost of p - best overall) / T)
      Stage B - location:    P(q | p) ~ exp(-(cost(p,q) - best cost of p) / T)
    Options more than `window` runs worse than the best are never picked; big spot halves T.
    at_bat=True uses count values solved for this matchup [R2] instead of MLB averages.
    Returns (pick, dist) with dist = list of (prob, cost, pitch, quad), for logging.
    """
    check_inputs(arsenal, s)
    rng = rng or _random
    cv = at_bat_values(arsenal, s, T, window)[1] if at_bat else None
    policy, costs, temp = mixed_policy(arsenal, s, T, window, forced, iters, cv)
    p_pitch = {k: v for k, v in policy.items() if v > 0.005}
    t = sum(p_pitch.values())
    p_pitch = {k: v / t for k, v in p_pitch.items()}
    dist = []
    tq = targets(s.balls, s.strikes)
    overall_best = min(c for (_, q), c in costs.items() if q in tq)
    for name, pp in p_pitch.items():
        loc = _softmax({q: costs[(name, q)] for q in tq}, temp,
                       LOC_WINDOW * run_scale(s.level) * min(1.0, stakes_factor(s.balls, s.strikes, s.level)), overall_best)
        if not loc:   # pitch made the mix but none of its spots are close: use its best spot
            bq = min(tq, key=lambda q: costs[(name, q)])
            loc = {bq: 1.0}
        p = next(x for x in arsenal if x.name == name)
        for q, pq in loc.items():
            dist.append((pp * pq, costs[(name, q)], p, q))
    if exclude:   # v0.6f: never re-call what he just shook off (unless nothing else is left)
        kept = [d for d in dist if (d[2].name, d[3]) not in exclude]
        if kept:
            t_ = sum(d[0] for d in kept)
            dist = [(d[0] / t_,) + tuple(d[1:]) for d in kept]
    dist.sort(key=lambda t: -t[0])
    r, acc = rng.random(), 0.0
    for prob, c, p, q in dist:
        acc += prob
        if r <= acc:
            return (p, q, prob, c), dist
    prob, c, p, q = dist[-1]
    return (p, q, prob, c), dist


def call(arsenal, s: Situation, forced=None):
    """Single best option (lowest cost). Kept for inspection and tests."""
    check_inputs(arsenal, s)
    scored = []
    for p in candidates(arsenal, s, forced):
        for q in QUADS:
            c, P = cost(p, q, s, arsenal)
            scored.append((c, p, q, P))
    scored.sort(key=lambda t: t[0])
    dropped = [x.name for x in arsenal if x not in candidates(arsenal, s, forced)]
    return scored, dropped


# ---------------------------------------------------------------------------
# Learning mode: grade the catcher's (or coach's) call
# ---------------------------------------------------------------------------

def grade_call(arsenal, s: Situation, pitch_name: str, quad: str, **kw):
    """How the engine rates a human call: its pick probability, run cost vs the best,
    and the engine's own top calls. Used to teach, not to overrule."""
    _, dist = call_mixed(arsenal, s, **kw)
    # v0.7c: scored the way the call is made: count values solved for this matchup, and only the targets allowed here
    cv = at_bat_values(arsenal, s)[1] if kw.get("at_bat", True) else None
    policy, costs, _ = mixed_policy(arsenal, s, cv=cv)
    p = next(x for x in arsenal if x.name == pitch_name)
    c_human = costs.get((pitch_name, quad), cost(p, quad, s, arsenal, policy, cv)[0])
    tq = targets(s.balls, s.strikes)
    best = min(c for (_, q), c in costs.items() if q in tq)
    prob = sum(pr for pr, _, pp, q in dist if pp.name == pitch_name and q == quad)
    allowed = quad in tq
    return {
        "call": f"{pitch_name} {quad}",
        "engine_prob": prob,
        "runs_vs_best": c_human - best,
        "allowed": allowed,
        "verdict": "costly" if not allowed else "in the engine's mix" if prob >= 0.02 else
                   ("close" if c_human - best <= 0.03 * run_scale(s.level) else "costly"),
        "engine_top": [(pp.name, q, pr) for pr, _, pp, q in dist[:3]],
    }


# ---------------------------------------------------------------------------
# v0.8 sit game (docs/SPEC_v0.8.md 2.3): pure-sit costs, the hitter's response, exploitability
# ---------------------------------------------------------------------------

def sit_matrix(arsenal, s, calls, cv=None):
    """M[(name, q)][k] = C(a | pure sit k), runs to the pitcher."""
    ks = sit_options(arsenal)
    by = {x.name: x for x in arsenal}
    return {a: {k: cost(by[a[0]], a[1], s, arsenal, cv=cv, sit=("pure",) + k)[0] for k in ks} for a in calls}, ks


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


def call_costs(arsenal, s, cv=None):
    """Cost of every allowed call (candidate pitch x allowed target) at this count, as the engine ranks them.
    v0.7c path: costs under the solved count values. (v0.8 replaces this with the planning solve's root costs.)"""
    if cv is None:
        cv = at_bat_values(arsenal, s)[1]
    pol, costs, temp = mixed_policy(arsenal, s, cv=cv)
    tq = targets(s.balls, s.strikes)
    return {a: c for a, c in costs.items() if a[1] in tq}


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
    """7.5 one-step Newton estimate of today's umpire from takes [(s_i, p_i, d_i)] stored at u = u0."""
    ib = I_BAR_UMP.get(level, 0.05)
    num = sum((si - pi) * di / (pi * (1 - pi)) for si, pi, di in takes if 0 < pi < 1)
    den = a0 * ib + sum(di * di / (pi * (1 - pi)) for si, pi, di in takes if 0 < pi < 1)
    return max(-1.5, min(1.5, u0 + (num / den if den > 0 else 0.0)))
