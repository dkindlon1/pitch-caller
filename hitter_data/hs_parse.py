"""v1.3 Part 1 (HS / travel): Perfect Game DiamondKast pitch logs -> pitches and plate appearances with game state.

Pure functions; no database, no files. parse_game(game, rows, lineups, rosters, line) takes one game's rows of the
archive CSVs (dicts keyed by the CSV headers) and returns (pas, pitches, info).

The source (see docs/HS_ARCHIVE_v13.md): one row per logged pitch or event, grouped by batter ("batter_group"), with
the published outcome ("Ball", "Strike Called", "Single", ...), pitch type, velocity, the count AFTER the pitch (blank
on the pitch that ends the plate appearance), the outs after the play (shown only when an out was made) and the play
text ("Single Line to RF Andrew Pauldin scored Logan Cohn advanced to 2nd Base").

Pitch letters are the college ones (hitter_data/parse.py): B ball, K called strike, S swinging strike, F foul,
H hit by pitch, plus X for the pitch put in play (college leaves it unlettered; a plate appearance's `pitches` string
here also leaves it out, so the strings compare), U a strike of unknown kind (a stolen-base / wild-pitch row whose
count shows one more strike), I interference (catcher's or batter's; ends the plate appearance).

Game state is replayed: outs from the shown outs (else inferred from the text), bases from runner names in the text
(runners are matched to the batters who reached; courtesy runners and tie-breaker placements are applied), score from
"scored" mentions. No bat-type field is read or kept (Drew, Nov 21: wood and BBCOR are treated the same)."""
import re

LETTER = {"ball": "B", "strike called": "K", "strike swinging": "S", "foul": "F", "foul tip": "S", "foul bunt": "F"}
# terminal outcomes -> (letter, PA result before refinement from the play text)
TERMINAL = {
    "walk": ("B", "BB"), "hit by pitch": ("H", "HBP"), "strike out looking": ("K", "K_L"),
    "strike out swinging": ("S", "K_S"), "strikeout swinging": ("S", "K_S"), "strikeout called": ("K", "K_L"),
    "dropped third strike": (None, "K_D"), "strike 3 swinging dropped": ("S", "K_S"),
    "single": ("X", "1B"), "double": ("X", "2B"), "triple": ("X", "3B"), "homerun": ("X", "HR"),
    "home run": ("X", "HR"), "ground rule double": ("X", "2B"), "reached on error": ("X", "E"),
    "fielder's choice": ("X", "FC"), "out": ("X", "OUT"), "infield fly": ("X", "IF"), "ground out": ("X", "GO"),
    "batted ball batter's interference": ("X", "BINT"), "batter's interference": ("I", "BINT"),
    "catcher's interference": ("I", "CI"), "interference": ("I", "CI"),
}
# rows the exporter marks as pitches because they carry a pitch number; the pitch (if any) shows only in the count
RUNNER_OUTCOMES = {"stolen base", "caught stealing", "wild pitch", "passed ball", "illegal pitch",
                   "umpire interference ui", "umpire interference"}

PITCH_CLASS = {"fastball": "fastball", "sinker": "fastball", "cutter": "fastball", "curveball": "breaking",
               "slider": "breaking", "sweeper": "breaking", "slurve": "breaking", "change-up": "offspeed",
               "changeup": "offspeed", "change up": "offspeed", "splitter": "offspeed", "forkball": "offspeed",
               "screwball": "offspeed", "knuckle": "other", "knuckleball": "other", "other": "other",
               "pitchout": "other"}

OUT_RESULTS = {"K_L", "K_S", "GO", "FO", "LO", "PO", "SF", "SH", "IF", "BINT", "OUT", "DP", "TP"}
HIT_DEST = {"1B": 1, "2B": 2, "3B": 3, "HR": 4}
ON_FIRST = {"BB", "IBB", "HBP", "CI", "E", "FC", "K_L_reached", "K_S_reached"}

MENTION = re.compile(r"(scored|advanced to (1st|2nd|3rd) Base|steals (2nd|3rd) Base|steals Home|"
                     r"caught stealing|was picked off|reached 1st base|out at (1st|2nd|3rd|home))", re.I)
BASE_N = {"1st": 1, "2nd": 2, "3rd": 3, "home": 4}
RUNS_ANON = re.compile(r"(\d+) runs?\s*$", re.I)
PCHANGE = re.compile(r"^(.+?) P entered the game for (.+?) P\s*$")
ENTERED = re.compile(r"^(.+?) (\w+) entered the game for (.+?) (\w+)\s*$")
COURTESY = re.compile(r"^(?:Courtesy Substitution )?(.+?) running for (.+?) on (1st|2nd|3rd) base\.?\s*$", re.I)
PLACED = re.compile(r"(.+?) at (1st|2nd|3rd) base", re.I)
TIEBREAK = re.compile(r"^Tie Breaker(?: Automatic Out)?\s*", re.I)
KNOWN_EVENT = re.compile(
    r"(entered the game for|running for|^PlayerEdit|^LineupUpdate|was picked off|advanced to|scored|^Balk|"
    r"^Pick Off Attempt|^Advanced On Throw|^Tie Breaker|IBB|^Intentional Walk|steals|caught stealing|"
    r"^Stolen Base|^Caught Stealing|^Wild Pitch|^Passed Ball|^\S.* to (?:P|C|1B|2B|3B|SS|LF|CF|RF|DH|EH|PH|PR|PDH)\b)",
    re.I)
POSITIONS = r"(?:P|C|1B|2B|3B|SS|LF|CF|RF|DH|EH|PH|PR|PDH|DP|FLEX)"


def norm(name):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", (name or "").lower().replace("-", " "))).strip()


def pitch_class(pt):
    p = (pt or "").strip().lower()
    if not p:
        return "unknown"
    return PITCH_CLASS.get(p, "other")


def to_int(s):
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def bip_type(text):
    t = text.lower()
    if "bunt" in t:
        return "bunt"
    if re.search(r"\bground", t):
        return "ground"
    if re.search(r"\bline\b", t):
        return "line"
    if re.search(r"\bpop\b|\binf\b|infield fly", t):
        return "pop"
    if re.search(r"\bfly\b|sacfly", t):
        return "fly"
    return "unknown"


def bip_dir(text):
    m = re.search(r"\bto (LF|CF|RF|SS|3B|2B|1B|Pitcher|Catcher)\b", text)
    if not m:
        return ""
    return {"LF": "L", "3B": "L", "SS": "L", "CF": "C", "Pitcher": "C", "Catcher": "C", "RF": "R", "1B": "R",
            "2B": "R"}[m[1]]


def refine_result(base, text):
    """PA result from the outcome and the play text."""
    t = text
    if base == "2B" and re.match(r"^Double Play\b", t):
        base = "DP"
    elif base == "3B" and re.match(r"^Triple Play\b", t):
        base = "TP"
    if base == "K_D":                                      # Dropped Third Strike (Called|Swinging) K-2-3 / reached
        kind = "K_L" if "(Called)" in t else "K_S"
        return kind + ("_reached" if re.search(r"reached 1st base|Reached on Error", t, re.I) else "")
    if base in ("K_L", "K_S") and re.search(r"reached 1st base|Reached on Error", t, re.I):
        return base + "_reached"
    if base == "OUT":
        if re.search(r"SacFly|\bSF-", t):
            return "SF"
        if re.search(r"SacBunt|Sac Bunt|Sacrifice", t):
            return "SH"
        bt = bip_type(t)
        return {"ground": "GO", "bunt": "GO", "line": "LO", "pop": "PO", "fly": "FO"}.get(bt, "OUT")
    return base


def inferred_outs(result, text):
    """outs the text implies on this row (used when no outs are shown, and as a cross-check)."""
    n = 0
    if result in ("K_L", "K_S", "GO", "FO", "LO", "PO", "SF", "SH", "IF", "BINT", "OUT"):
        n = 1
    elif result == "DP":
        n = 2
    elif result == "TP":
        n = 3
    elif result == "FC" and re.search(r"\bFC-\d", text):
        n = 1                                     # FC-6-4 / FC-4: a runner put out; a bare "FC" = everyone safe
    elif result in ("1B", "2B", "3B") and re.search(r"(?<![\w-])(?:[1-9U]-)+[1-9U](?![\w-])|(?<![\w-])\dU\b",
                                                         text):
        n = 1                                     # "Single Ground ball to RF 9U", "Double ... 8-5": thrown out
    n += len(re.findall(r"caught stealing|was picked off|\bout at (?:1st|2nd|3rd|home)", text, re.I))
    if TIEBREAK.match(text) and "Automatic Out" in text:
        n += 1
    if re.search(r"Batter out on play", text):
        n += 1
    return n


class State:
    def __init__(self):
        self.outs = 0
        self.bases = {1: None, 2: None, 3: None}
        self.flags = []
        self.ghosts = []

    def code(self):
        return "".join("1" if self.bases[b] else "0" for b in (1, 2, 3))


DESC = re.compile(
    r"^(?:\s*(?:Wild Pitch|Passed Ball|Balk|Advanced On Throw|Stolen Base|Pick Off Attempt|Obstruction|"
    r"Caught Stealing|Double Play|Triple Play|Play|Ground ball|GroundBunt|PopBunt|SacBunt|SacFly|Ground|Fly|Line|"
    r"Pop|Bunt|to (?:LF|CF|RF|SS|3B|2B|1B|Pitcher|Catcher)|HR|INF|BI|CI|IA|\((?:Called|Swinging)\)|Dropped|"
    r"Line Out|Fly Out|Pop Out|Out|Batter out on play|[A-Z]{1,3}(?:-[0-9U]+)+|FC|K|[0-9U]+(?:-[0-9U]+)+|"
    r"[0-9]U|[0-9]+|\.|,|on an error|tagged up and)(?=\s|$|\.|,))*")
TAIL = re.compile(r"\s*(?:tagged up and|on an error)\s*$", re.I)


def seg_name(seg):
    """the runner's name in a segment: strip the play descriptor in front and connective words behind."""
    s = DESC.sub("", seg.strip())
    s = TAIL.sub("", s).strip(" .,")
    return s


def resolve(seg, cands):
    s = norm(TAIL.sub("", seg))
    if not s:
        return None
    best = None
    for c in cands:
        cn = norm(c)
        if cn and (s == cn or s.endswith(" " + cn)) and (best is None or len(cn) > len(norm(best))):
            best = c
    if best:
        return best
    last = s.split()[-1]
    hits = [c for c in cands if norm(c) and norm(c).split()[-1] == last]
    if len(hits) == 1:
        return hits[0]
    return None


def mentions(text):
    """-> list of (segment_before, dest) where dest is 1-3, 4 (scored) or 0 (out); segments carry the name."""
    out, prev = [], 0
    for m in MENTION.finditer(text):
        seg = text[prev:m.start()]
        v = m[1].lower()
        if v == "scored" or v == "steals home":
            d = 4
        elif v.startswith("advanced to"):
            d = BASE_N[m[2].lower()]
        elif v.startswith("steals"):
            d = BASE_N[m[3].lower()]
        elif v == "reached 1st base":
            d = 1
        elif v.startswith("out at"):
            d = 0
        else:
            d = 0
        out.append((seg, d))
        prev = m.end()
        # "scored on an error" / "advanced to 3rd Base on an error": skip the tail
        tail = re.match(r"\s*on an error\.?", text[prev:])
        if tail:
            prev += tail.end()
    return out


def apply_play(st, text, batter, result, outs_after, unparsed):
    """Moves runners for one row. result: PA result if the row ends the plate appearance, else None.
    Returns runs scored on the row."""
    cands = [n for n in st.bases.values() if n] + ([batter] if batter else [])
    moves, unknown, runs, explicit_outs = {}, [], 0, 0
    for seg, d in mentions(text):
        m = RUNS_ANON.search(seg.strip())
        if m and d == 4:
            unknown += [(4, "")] * int(m[1])
            continue
        who = resolve(seg, cands)
        if who is None and st.ghosts:
            # an earlier batter of this half whose log ends without a result turns up as a runner: he reached
            # (the row that put him on base is missing, e.g. ball four on a wild pitch). Put him on first.
            g = resolve(seg, st.ghosts)
            if g is not None:
                st.ghosts.remove(g)
                st.flags.append("ghost_runner")
                free = next((b for b in (1, 2, 3) if not st.bases[b]), None)
                if free:
                    st.bases[free] = g
                    cands.append(g)
                    who = g
        if who is None:
            unknown.append((d, seg_name(seg)))
        else:
            moves[who] = d
    batter_key = batter or "(unknown batter)"
    pos = {st.bases[b]: b for b in (1, 2, 3) if st.bases[b]}     # runners on base at the start
    dest = {r: moves.pop(r) for r in list(moves) if r in pos}       # named runner moves: 1-3, 4 scored, 0 out
    rename = {}

    def unmoved():
        return sorted((r for r in pos if r not in dest), key=lambda r: -pos[r])      # lead runner first

    # a name we can't match (a pinch / courtesy runner whose entry wasn't logged, a misspelling): the mention is
    # applied to the lead unnamed runner who could make that move, and that runner takes the printed name
    homer_batter_unmatched = result == "HR" and batter not in moves
    for d, nm in unknown:
        um = unmoved()
        if d == 4 and homer_batter_unmatched and not um:
            homer_batter_unmatched = False                # the batter's own run, printed under another name
            moves[batter] = 4
            continue
        cand = um if d in (0, 4) else [r for r in um if pos[r] < d]
        if cand:
            dest[cand[0]] = d
            if nm and d in (1, 2, 3):
                rename[cand[0]] = nm
            st.flags.append("runner_renamed")
        else:
            unparsed.append(("unresolved runner: " + {4: "scored", 0: "out", 1: "to 1st", 2: "to 2nd",
                                                      3: "to 3rd"}[d], text))
            runs += d == 4
            explicit_outs += d == 0
    # batter
    bdest = None
    if batter in moves:
        bdest = moves.pop(batter)
    elif result is not None:
        bdest = HIT_DEST.get(result) or (1 if result in ON_FIRST else 0)
    batter_out = 1 if (result is not None and bdest == 0) else 0
    # outs not explained by the batter or a named runner: take unnamed runners, the ones the fielding chain points
    # at first (a throw to 2B / SS = the runner from first, to 3B = from second, home = the lead runner), else the
    # forced runner from first
    if outs_after is not None:
        need = outs_after - st.outs - batter_out - explicit_outs - sum(1 for r in dest if dest[r] == 0)
        for b in out_preference(text) + [1, 2, 3]:
            if need <= 0:
                break
            hit = [r for r in unmoved() if pos[r] == b]
            if hit:
                dest[hit[0]] = 0
                need -= 1
    # runners in the batter's way who weren't named as moving: forced along one base at a time (walk, HBP, single),
    # or pushed one base past the batter on an extra-base hit
    if bdest in (1, 2, 3):
        taken = {dest[r]: r for r in dest if dest[r] in (1, 2, 3)}
        if bdest == 1:
            b = 1
            while True:
                r = next((x for x in unmoved() if pos[x] == b), None)
                if r is None:
                    break
                dest[r] = b + 1 if b < 3 else 4
                if b == 3:
                    st.flags.append("forced_run_inferred")
                if b + 1 in taken:
                    break
                b += 1
        else:
            for r in unmoved():
                if pos[r] <= bdest:
                    dest[r] = min(4, bdest + 1) if (bdest + 1) not in taken else 4
                    st.flags.append("runner_pushed")
    newb = {1: None, 2: None, 3: None}
    for r, d in dest.items():
        if d == 4:
            runs += 1
        elif d == 0:
            explicit_outs += 1
        else:
            if newb[d]:
                st.flags.append("base_conflict")
            newb[d] = rename.get(r, r)
    for r in unmoved():                              # unnamed runners stay; one overrun by a named runner goes on
        b = pos[r]
        while b <= 3 and newb[b]:
            b += 1
        if b != pos[r]:
            st.flags.append("base_conflict")
        if b <= 3:
            newb[b] = r
    if bdest == 4:
        runs += 1
    if bdest in (1, 2, 3):
        if newb[bdest]:
            st.flags.append("base_conflict")
        newb[bdest] = batter_key
    st.bases = newb
    return runs, batter_out, explicit_outs


FIELD_CHAIN = re.compile(r"(?<![\w-])(?:[A-Z]{1,3}-)?([1-9U](?:-[1-9U])+)(?![\w-])")
RECEIVER_BASE = {"4": [1], "6": [1], "5": [2], "2": [3, 2, 1]}


def out_preference(text):
    """bases (1-3) of runners the fielding chain says were put out, in order."""
    m = None
    for m in FIELD_CHAIN.finditer(text):
        pass
    if not m:
        return []
    out = []
    for f in m[1].split("-")[1:]:
        for b in RECEIVER_BASE.get(f, []):
            if b not in out:
                out.append(b)
            if f != "2":
                break
    return out




def lineup_slots(lineups):
    slots = {}
    for r in lineups:
        bo = to_int(r.get("batting_order"))
        if bo is not None:
            slots.setdefault(r["side"], {})[norm(r["player"])] = bo
    return slots


def roster_maps(rosters):
    by_id, by_name = {}, {}
    names = {}
    for r in rosters:
        side = r["side"]
        bt = ((r.get("bats") or "").strip()[:1].upper() or None, (r.get("throws") or "").strip()[:1].upper() or None)
        if r.get("player_id"):
            by_id.setdefault(side, {})[r["player_id"]] = bt
        k = norm(r["player"])
        names.setdefault((side, k), []).append(bt)
    for (side, k), v in names.items():
        if len(set(v)) == 1:
            by_name.setdefault(side, {})[k] = v[0]
    return by_id, by_name


def hand(by_id, by_name, side, pid, name):
    if pid and pid in by_id.get(side, {}):
        return by_id[side][pid], "id"
    v = by_name.get(side, {}).get(norm(name))
    if v:
        return v, "name"
    return (None, None), None


def group_rows(rows):
    """rows in sequence order -> list of groups (list of rows). A group with no inning (the exporter could not read
    its label) is merged into the next group."""
    groups, cur, key, pending = [], [], None, []
    for r in rows:
        k = r["batter_group"]
        if k != key:
            if cur:
                groups.append(cur)
            cur, key = [], k
        cur.append(r)
    if cur:
        groups.append(cur)
    out, orphan = [], []
    for g in groups:
        if not g[0]["inning"] or not g[0]["inning_half"]:
            orphan += g
            continue
        if orphan:
            g =[dict(r, _orphan=1) for r in orphan] + g
            orphan = []
        out.append(g)
    return out, len(orphan)


def parse_game(game, rows, lineups=(), rosters=(), line=None):
    """game: dict (games.csv row); rows: pitch_by_pitch rows of this game; line: {'away': [runs per inning as str],
    'home': [...]} or None. Returns (pas, pitches, info)."""
    rows = sorted(rows, key=lambda r: int(r["sequence"]))
    groups, dropped = group_rows(rows)
    slots = lineup_slots(lineups)
    by_id, by_name = roster_maps(rosters)
    st = State()
    score = {"away": 0, "home": 0}
    half_key = None
    halves = []                       # dicts: inning, half, side, runs, outs_final, pas
    pas, pitches, unparsed = [], [], []
    other = {"away": "home", "home": "away"}
    tie_breaker = False
    outs_check = [0, 0]               # rows with outs shown and an inference: agree, total
    for g in groups:
        g0 = g[-1]
        inning, half = to_int(g0["inning"]), g0["inning_half"]
        side = g0["batting_side"] or ("away" if half == "top" else "home")
        fld = other.get(side, "")
        if (inning, half) != half_key:
            if halves:
                halves[-1]["outs_final"] = st.outs
            half_key = (inning, half)
            st.outs, st.bases, st.ghosts = 0, {1: None, 2: None, 3: None}, []
            halves.append(dict(inning=inning, half=half, side=side, runs=0, outs_final=None, pas=0,
                               runs_start=score[side]))
        H = halves[-1]
        batter, batter_id = g0["batter"], g0["batter_id"]
        # pitcher per row: the group's pitcher, or the one replaced by a mid-group pitching change
        pit = [None] * len(g)
        cur = (g0["pitcher"], g0["pitcher_id"])
        for i in range(len(g) - 1, -1, -1):
            pit[i] = cur
            m = PCHANGE.match(g[i]["play_text"] or "") if g[i]["record_type"] != "pitch" else None
            if m:
                cur = (m[2].strip(), "")
        (bats, _), bsrc = hand(by_id, by_name, side, batter_id, batter)
        slot = slots.get(side, {}).get(norm(batter))
        pa = dict(game_id=game["game_id"], idx=len(pas), inning=inning, half=half, bat_side=side, batter=batter,
                  batter_id=batter_id, pitcher=None, pitcher_id=None, slot=slot, bats=bats, throws=None,
                  outs_before=st.outs, bases_before=st.code(), bat_score_before=score[side],
                  fld_score_before=score.get(fld, 0), balls=0, strikes=0, letters="", result=None, in_play=0,
                  bip_type=None, bip_dir=None, outs_on_play=0, runs_on_play=0, runs_rest_inning=None, flags=[],
                  text="", seq0=int(g[0]["sequence"]), half_idx=len(halves) - 1, runs_half_before=H["runs"],
                  bat_hand_src=bsrc, pit_hand_src=None, last_pitch_type=None, last_velo=None)
        if any(r.get("_orphan") for r in g):
            pa["flags"].append("orphan_rows_merged")
        if not slot and batter:
            pa["flags"].append("no_slot")
        b, s = 0, 0
        done = False
        first_pitch = len(pitches)
        for i, r in enumerate(g):
            text = (r["play_text"] or "").strip()
            outc = (r["pitch_outcome"] or "").strip()
            ol = outc.lower()
            rt = r["record_type"]
            pname, pid = pit[i]
            letter, result = None, None
            if rt == "event" and text.lower().startswith("strikeout called"):
                rt, ol, outc = "pitch", "strikeout called", "Strikeout Called"
            if rt == "event" and re.match(r"^Intentional Walk\b", text):
                result = "IBB"
            elif rt == "pitch":
                if ol in LETTER:
                    letter = LETTER[ol]
                elif ol in TERMINAL or ol.startswith("strike 3 swinging dropped"):
                    key = ol if ol in TERMINAL else "strike 3 swinging dropped"
                    letter, base = TERMINAL[key]
                    result = refine_result(base, text)
                    if letter is None:
                        letter = "K" if result.startswith("K_L") else "S"
                    if key == "strike 3 swinging dropped":
                        result = "K_S_reached" if re.search(r"Reached on Error|reached", text, re.I) else "K_S"
                else:
                    # runner-event rows with a pitch number: a pitch only if the shown count moved
                    cb, cs = to_int(r["balls_after"]), to_int(r["strikes_after"])
                    if cb is not None and cs is not None and (cb, cs) != (b, s):
                        if (cb, cs) == (b + 1, s):
                            letter = "B"
                        elif (cb, cs) == (b, s + 1):
                            letter = "U"
                        else:
                            pa["flags"].append("count_jump")
                    if ol not in RUNNER_OUTCOMES and not MENTION.search(text):
                        unparsed.append(("outcome: " + re.sub(r"\d", "#", outc)[:40], text))
            else:
                if not KNOWN_EVENT.search(text):
                    unparsed.append(("event: " + " ".join(re.sub(r"\d", "#", text).split()[:3]), text))
            # event bookkeeping before the play: courtesy runners, pinch runners, tie-breaker placements
            if rt == "event":
                m = COURTESY.match(text)
                if m:
                    new, old, base = m[1].strip(), m[2].strip(), BASE_N[m[3].lower()]
                    if st.bases[base] and norm(st.bases[base]) == norm(old):
                        st.bases[base] = new
                    else:
                        hit = [k for k in (1, 2, 3) if st.bases[k] and norm(st.bases[k]) == norm(old)]
                        st.bases[hit[0] if hit else base] = new
                        if not hit:
                            st.flags.append("courtesy_runner_unmatched")
                m = ENTERED.match(text)
                if m and not PCHANGE.match(text):
                    new, old = m[1].strip(), m[3].strip()
                    for k in (1, 2, 3):
                        if st.bases[k] and norm(st.bases[k]) == norm(old):
                            st.bases[k] = new
                    sd = side if m[2] in ("PH", "PR", "DH", "EH") else None
                    for sd2 in ([sd] if sd else ["away", "home"]):
                        sl = slots.get(sd2, {})
                        if norm(old) in sl and norm(new) not in sl:
                            sl[norm(new)] = sl[norm(old)]
                if TIEBREAK.match(text):
                    tie_breaker = True
                    for nm, base in PLACED.findall(TIEBREAK.sub("", text)):
                        st.bases[BASE_N[base.lower()]] = nm.strip()
                    text_for_moves = ""
                else:
                    text_for_moves = text
            else:
                text_for_moves = text[len(outc):] if outc and text.startswith(outc) else text
            outs_before_row, bases_before_row = st.outs, st.code()
            score_before_row = score[side]
            shown = to_int(r["outs_shown"])
            inf = inferred_outs(result, text)
            if shown is not None:
                outs_check[1] += 1
                outs_check[0] += (shown - outs_before_row) == inf
                outs_after = shown
            else:
                outs_after = min(3, outs_before_row + inf) if inf else None
            flags_before = len(st.flags)
            if rt == "event" and TIEBREAK.match(text):
                runs, batter_out, xouts = 0, 0, 0             # runners placed and the automatic out: no movement
            else:
                runs, batter_out, xouts = apply_play(st, text_for_moves, batter, result, outs_after, unparsed)
            st.outs = outs_after if outs_after is not None else min(3, st.outs + batter_out + xouts)
            pa["flags"] += st.flags[flags_before:]
            if runs:
                score[side] += runs
                H["runs"] += runs
            if letter:
                velo = r["velocity_mph"]
                cb, cs = to_int(r["balls_after"]), to_int(r["strikes_after"])
                if letter in "BKSFU" and result is None:
                    rb, rs = b + (letter == "B"), s + (letter in "KSU" or (letter == "F" and s < 2))
                    ok = None if cb is None else int((cb, cs) == (rb, rs))
                elif result is not None:
                    # the pitch that ends the PA: walk needs 3 balls before it, a strikeout 2 strikes
                    if result == "BB":
                        ok = int(b == 3)
                    elif result.startswith("K_"):
                        ok = int(s == 2)
                    else:
                        ok = None
                else:
                    ok = None
                pitches.append(dict(
                    game_id=game["game_id"], seq=int(r["sequence"]), pa_idx=pa["idx"], pitch_no=len(pa["letters"]) + 1,
                    inning=inning, half=half, bat_side=side, batter=batter, batter_id=batter_id, pitcher=pname,
                    pitcher_id=pid, slot=pa["slot"], bats=bats, throws=None, outs_before=outs_before_row,
                    bases_before=bases_before_row, bat_score_before=score_before_row,
                    fld_score_before=score.get(fld, 0),
                    balls=b, strikes=s, letter=letter, outcome=outc, result=result,
                    pitch_type=(r["pitch_type"] or None), pitch_class=pitch_class(r["pitch_type"]),
                    velo=float(velo) if velo else None, balls_after=cb, strikes_after=cs, count_ok=ok,
                    runs_on_row=runs, half_idx=len(halves) - 1, runs_half_before=H["runs"] - runs))
                if result is None:
                    if cb is not None and cs is not None:
                        b, s = cb, cs                      # re-sync to the shown count
                    else:
                        b, s = min(3, b + (letter == "B")), min(2, s + (letter in "KSU" or (letter == "F" and s < 2)))
                pa["letters"] += letter
                pa["last_pitch_type"], pa["last_velo"] = r["pitch_type"] or None, pitches[-1]["velo"]
                pa["pitcher"], pa["pitcher_id"] = pname, pid
            if result is not None:
                if done:
                    pa["flags"].append("two_results")
                done = True
                pa.update(result=result, balls=b, strikes=s, text=text,
                          in_play=int(letter == "X" and result not in ("BINT",)),
                          outs_on_play=st.outs - outs_before_row, runs_on_play=runs)
                if pa["in_play"]:
                    pa["bip_type"] = bip_type(text_for_moves)
                    pa["bip_dir"] = bip_dir(text_for_moves)
                if pa["pitcher"] is None:
                    pa["pitcher"], pa["pitcher_id"] = pname, pid
        if pa["pitcher"] is None:
            pa["pitcher"], pa["pitcher_id"] = cur if not g0["pitcher"] else (g0["pitcher"], g0["pitcher_id"])
        (_, throws), psrc = hand(by_id, by_name, fld, pa["pitcher_id"], pa["pitcher"])
        pa["throws"], pa["pit_hand_src"] = throws, psrc
        for p in pitches[first_pitch:]:
            p["throws"] = hand(by_id, by_name, fld, p["pitcher_id"], p["pitcher"])[0][1]
        if not done:
            pa["flags"].append("no_result")              # inning / game ended during the PA, or a log gap
            pa["balls"], pa["strikes"] = b, s
            if batter and st.outs < 3 and batter not in st.bases.values():
                st.ghosts.append(batter)
        pa["pitches"] = pa["letters"].replace("X", "")
        pa["n_pitches"] = len(pa["letters"])
        H["pas"] += 1
        pas.append(pa)
    if halves:
        halves[-1]["outs_final"] = st.outs
    # runs in the rest of the inning, bases at each pitch
    for p in pitches:
        p["runs_rest_inning"] = halves[p["half_idx"]]["runs"] - p["runs_half_before"]
    for pa in pas:
        pa["runs_rest_inning"] = halves[pa["half_idx"]]["runs"] - pa["runs_half_before"]
    innings = max((h["inning"] or 0 for h in halves), default=0)
    info = dict(halves=halves, final=score, unparsed=unparsed, dropped_orphans=dropped, tie_breaker=tie_breaker,
                innings=innings, outs_check=outs_check, rows=len(rows))
    if line:
        info["line"] = line
    return pas, pitches, info
