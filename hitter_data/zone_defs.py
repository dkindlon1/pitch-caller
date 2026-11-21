"""v1.3 zone seed (plan 3.2): the engine's own zone bands, pitch classes / profiles and count groups, applied to Savant rows.

Every definition mirrors engine.py so the fitted table maps onto the engine cell for cell (tests_zone_seed.py checks the
numbers against engine.py):
- bands: engine.py GEO_HEART / GEO_ZONE / GEO_EXT (Savant attack zones: heart inside 67% of the strike zone, edge to 133%,
  off to 200%, way-off beyond; half-width 10 in. with the ball, half-height = half the batter's zone);
- height thirds: engine.py HEIGHTS (up / middle / down), thirds of the batter's zone height;
- classes: engine.py FASTBALL_KINDS (FB, SI, FC) vs off-speed (SL, CB, CH); profiles: engine kinds plus the two Savant labels
  that carry an engine tag (ST = SL|sweeper, FS / FO = CH|split, engine.py PROFILE_NAMES);
- count groups: the engine's own count terms in outcome_probs (0-0, hitter's count = balls > strikes with < 2 strikes,
  two strikes) plus the two remaining kinds of count: even (1-1) and hitter behind (0-1).
"""
import numpy as np

# engine.py GEO_*: (half-width in., half-height in.) of each band for a 10 x 12 in. half-zone -> fractions of the half-zone
ZONE_HALF_W_IN = 10.0                      # engine comment: half-width 10 in. with the ball
GEO_HEART_FRAC, GEO_ZONE_FRAC, GEO_EXT_FRAC = 0.67, 1.33, 2.0
BANDS = ("heart", "edge", "off", "noncomp")          # engine.py ZONES
BAND_LABEL = {"heart": "over the heart", "edge": "on the edge", "off": "just off the plate (chase band)",
              "noncomp": "way off (waste)"}
IN_ZONE_BANDS = ("heart", "edge")
OUT_BANDS = ("off", "noncomp")
HEIGHTS = ("up", "mid", "down")                      # engine.py HEIGHTS (up / middle / down)

# Savant pitch_type -> engine profile. Classes follow engine.py FASTBALL_KINDS.
PITCH_PROFILE = {"FF": "FB", "FA": "FB", "SI": "SI", "FC": "FC", "SL": "SL", "SV": "SL", "ST": "SW",
                 "CU": "CB", "KC": "CB", "CS": "CB", "CH": "CH", "FS": "SP", "FO": "SP", "SC": "CH"}
PROFILES = ("FB", "SI", "FC", "SL", "SW", "CB", "CH", "SP")
PROFILE_ENGINE = {"FB": ("FB", ""), "SI": ("SI", ""), "FC": ("FC", ""), "SL": ("SL", ""), "SW": ("SL", "sweeper"),
                  "CB": ("CB", ""), "CH": ("CH", ""), "SP": ("CH", "split")}
PROFILE_LABEL = {"FB": "four-seam", "SI": "sinker", "FC": "cutter", "SL": "slider", "SW": "sweeper", "CB": "curveball",
                 "CH": "changeup", "SP": "splitter"}
FASTBALL_PROFILES = ("FB", "SI", "FC")
CLASSES = ("FB", "OS")
CLASS_LABEL = {"FB": "fastball", "OS": "off-speed pitch"}


def pclass(prof):
    return "FB" if prof in FASTBALL_PROFILES else "OS"


COUNT_GROUPS = ("first", "ahead", "even", "behind", "two")
CG_LABEL = {"first": "on the first pitch (0-0)", "ahead": "in hitter's counts (1-0, 2-0, 3-0, 2-1, 3-1)",
            "even": "at 1-1", "behind": "at 0-1", "two": "with two strikes", "all": "in any count"}
COUNTS = tuple((b, s) for s in range(3) for b in range(4))


def count_group(b, s):
    """engine.py outcome_probs count terms: strikes == 2; 0-0; hitters_count = balls > strikes and strikes < 2."""
    if s == 2:
        return "two"
    if b == 0 and s == 0:
        return "first"
    if b > s:
        return "ahead"
    return "even" if b == s else "behind"


# Savant descriptions (same sets as seq_fit.py / profile_terms_fit.py: a foul tip is a swing with contact, not a whiff)
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "hit_into_play_no_out",
         "hit_into_play_score"}
WHIFF = {"swinging_strike", "swinging_strike_blocked"}
FOUL = {"foul", "foul_tip"}
IN_PLAY = {"hit_into_play", "hit_into_play_no_out", "hit_into_play_score"}
CALLED = {"called_strike"}
DROP = {"pitchout", "intent_ball", "automatic_ball", "automatic_strike", "foul_bunt", "missed_bunt", "bunt_foul_tip",
        "foul_pitchout", "swinging_pitchout"}
HARD_EV = 95.0                                       # hard-hit: launch_speed >= 95 mph (engine PT hard = 95+)
BB_TYPES = {"ground_ball": "gb", "line_drive": "ld", "fly_ball": "fb", "popup": "pu"}


def bands_from_location(plate_x, plate_z, sz_top, sz_bot):
    """(band, height) arrays from Savant location (feet). The batter's own zone sets the height; the width is fixed."""
    hw = ZONE_HALF_W_IN / 12.0
    mid = 0.5 * (sz_top + sz_bot)
    hh = 0.5 * (sz_top - sz_bot)
    u = np.abs(plate_x) / hw
    v = (plate_z - mid) / hh
    m = np.maximum(u, np.abs(v))
    band = np.where(m < GEO_HEART_FRAC, "heart", np.where(m < GEO_ZONE_FRAC, "edge",
                    np.where(m < GEO_EXT_FRAC, "off", "noncomp")))
    ht = np.where(v > 1.0 / 3.0, "up", np.where(v < -1.0 / 3.0, "down", "mid"))
    return band, ht


STAT_COLS = ("n", "sw", "wh", "ft", "bip", "evn", "hard", "btn", "gb", "ld", "fb", "pu", "take", "cs")
KEY_COLS = ("season", "game_pk", "b", "s", "band", "ht", "prof", "same")
