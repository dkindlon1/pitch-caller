"""v1.3 Part 1: college play-by-play text -> plate appearances with pitch strings, results, ball in play and game state.

Pure functions; no database. parse_game(plays, lineups) takes the archive rows of one game and returns
(pas, lines, game_info). Sources: Sidearm ("S. Pace singled to left field (1-2 BKF)."), PrestoSports
("Callahan fouled out to 1b. (1 out)") and StatCrew (whole half-innings in one paragraph, sometimes wrapped
over several rows; the paragraph is re-split into plays here).

Pitch letters (verified on the archive by the letter check in quality.py): B ball, K called strike, S swinging
strike, F foul, H hit by pitch; the ball put in play is not lettered. Others (N, P, J, U) are rare and counted."""
import re

POS = r"(?:p|c|1b|2b|3b|ss|lf|cf|rf|dh|ph|pr|eh)"
COUNT_RE = re.compile(r"\((\d)\s*-\s*(\d)(?:\s+([A-Z]+))?\s*\)")
OUTS_RE = re.compile(r"\((\d) outs?\)")
SUMMARY_RE = re.compile(r"\s*\d+ runs?, \d+ hits?, \d+ errors?, \d+ LOB\.?\s*$", re.I)
GROUP_PREFIX_RE = re.compile(r"^.{1,60}? (?:\d+(?:st|nd|rd|th)) - ")

# verbs that end a plate appearance, longest first
PA_VERBS = [
    ("struck out looking", "K_L"), ("struck out swinging", "K_S"), ("struck out", "K"),
    ("intentionally walked", "IBB"), ("walked", "BB"), ("hit by pitch", "HBP"), ("hit by a pitch", "HBP"),
    ("infield singled", "1B"), ("bunt singled", "1B"), ("singled", "1B"), ("doubled", "2B"), ("tripled", "3B"), ("homered", "HR"), ("hit a home run", "HR"),
    ("grounded into double play", "GDP"), ("grounded into triple play", "GTP"), ("hit into double play", "GDP"),
    ("hit into triple play", "GTP"), ("lined into double play", "LDP"), ("lined into triple play", "LTP"),
    ("flied into double play", "FDP"), ("flied into triple play", "FTP"), ("popped into double play", "PDP"),
    ("fouled into double play", "FODP"), ("bunted into double play", "BDP"),
    ("grounded out", "GO"), ("flied out", "FO"), ("lined out", "LO"), ("popped up", "PO"), ("popped out", "PO"),
    ("fouled out", "FOUL_O"), ("infield fly", "IF"), ("out on infield fly", "IF"),
    ("reached first on catcher's interference", "CI"), ("reached on catcher's interference", "CI"),
    ("reached first on an error", "E"), ("reached on an error", "E"), ("reached on a fielding error", "E"),
    ("reached on a throwing error", "E"), ("reached first on a fielding error", "E"),
    ("reached first on a throwing error", "E"), ("reached on a muffed throw", "E"), ("reached first on a muffed", "E"),
    ("reached on a dropped fly", "E"), ("reached first on a dropped fly", "E"),
    ("reached on a fielder's choice", "FC"), ("reached first on a fielder's choice", "FC"),
    ("reached on a fielders choice", "FC"), ("reached first on a fielders choice", "FC"),
    ("out at first", "OUT1"), ("bunted out", "GO"), ("sacrificed", "SAC"), ("sacrifice fly", "SF_V"),
    ("hit a sacrifice fly", "SF_V"), ("sacrifice bunt", "SH_V"), ("hit a sacrifice bunt", "SH_V"),
    ("reached first", "REACH"), ("reached", "REACH"), ("out on batter's interference", "BINT"),
    ("out on batters interference", "BINT"), ("awarded base on catcher's interference", "CI"),
    ("awarded first on catcher's interference", "CI"),
    # present-tense feed ("Alt walks, Gendron pitching")
    ("strikes out looking", "K_L"), ("strikes out swinging", "K_S"), ("strikes out", "K"), ("walks", "BB"),
    ("singles", "1B"), ("doubles", "2B"), ("triples", "3B"), ("homers", "HR"), ("grounds out", "GO"),
    ("flies out", "FO"), ("lines out", "LO"), ("pops out", "PO"), ("pops up", "PO"), ("is hit by pitch", "HBP"),
]
PA_VERB_RE = re.compile(r"^(?P<name>.+?) (?P<verb>" + "|".join(re.escape(v) for v, _ in PA_VERBS) + r")\b")
VERB_CODE = dict(PA_VERBS)

SUB_RE = re.compile(r"^(?P<new>.+?) (?:(?P<to>to (?P<pos>" + POS + r"|p\b|pitcher))|(?P<ph>pinch hit)|(?P<pr>pinch ran))"
                    r"(?: for (?P<old>.+?))?\.*$", re.I)
SUB2_RE = re.compile(r"^(?P<new>.+?) (?:in for|replaces|subbed for|substituted for) (?P<old>.+?)\.*$", re.I)
SUB3_RE = re.compile(r"^(?:\S+ )?substitution: (?P<new>.+?) (?:(?P<ph>pinch hitting)|(?P<pr>pinch running)|"
                     r"(?P<to>(?:now )?(?:pitching|playing (?P<pos>\w+))))(?: for (?P<old>.+?))?\.*$", re.I)
SLASH_FOR_RE = re.compile(r"^/ for (?P<old>.+?)\.*$")
PITCH_CHANGE_RE = re.compile(r"^(?:\S+ )?pitching change: (?P<new>.+?) (?:replaces|for) (?P<old>.+?)\.*$", re.I)
RUNNER_VERB_RE = re.compile(r"^(?P<name>.+?) (?P<verb>stole|advanced|scored|picked off|caught stealing|out at|"
                            r"was picked off|was caught stealing|out on|failed pickoff|placed on|steals|"
                            r"to (?:first|second|third))\b")
NONPLAY_RE = re.compile(r"^(?:no play|.*\bno play\.?$|dropped foul|.*\bfailed pickoff attempt\.?$|.*\btimeout\b|"
                        r".*\bvisits mound\b|.*\bpitch count\b|.*\bposition change:|distance:|.*\bexit velo|\W*$|"
                        r"defensive indifference\.?$|.*\bfoul ball error\b|.*\bdefensive (?:sub|change)\b|"
                        r".*\bpitching change\b|.*\bmound visit\b|.*\bchallenge\b|.*\bumpire\b|.*\bdelay\b|"
                        r".*\bwarning\b|.*\bejected\b|.*\binjur)", re.I)

BASE_WORD = {"first": 1, "second": 2, "third": 3, "home": 4}
OUT_TYPES = {"K_L", "K_S", "K", "GO", "FO", "LO", "PO", "FOUL_O", "IF", "OUT1", "SAC", "BINT", "SF_V", "SH_V",
             "GDP", "GTP", "LDP", "LTP", "FDP", "FTP", "PDP", "FODP", "BDP"}
HITS = {"1B": 1, "2B": 2, "3B": 3, "HR": 4}
DP = {"GDP": 2, "LDP": 2, "FDP": 2, "PDP": 2, "FODP": 2, "BDP": 2, "GTP": 3, "LTP": 3, "FTP": 3}

LEFT = re.compile(r"\b(lf|left field|left center|left side|lf line|3b|third base|ss|shortstop|left)\b")
RIGHT = re.compile(r"\b(rf|right field|right center|right side|rf line|1b|first base|2b|second base|right)\b")
CENTER = re.compile(r"\b(cf|center field|center|up the middle|middle|p|pitcher|c|catcher)\b")


# ---------- splitting grouped paragraphs ----------
def split_group(text):
    """One StatCrew paragraph (a half-inning) -> list of play sentences."""
    t = GROUP_PREFIX_RE.sub("", text.strip(), count=1)
    t = SUMMARY_RE.sub("", t)
    parts = re.split(r"(?<=[.)])\s+(?=[A-Z])", t)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # a lone initial ("J.") or a fragment with no verb belongs to its neighbour
        if out and re.fullmatch(r"[A-Z][a-z]?\.", out[-1]):
            out[-1] = out[-1] + " " + p
        elif out and not re.search(r"\b(singled|doubled|tripled|homered|walked|struck|grounded|flied|lined|popped|"
                                   r"fouled|reached|out|stole|advanced|scored|pinch|to (?:p|c|1b|2b|3b|ss|lf|cf|rf|dh)|"
                                   r"hit|picked|caught|sacrificed|bunted|infield|interference)\b", p):
            out[-1] = out[-1] + " " + p
        else:
            out.append(p)
    return out


def half_lines(rows):
    """rows of one half-inning (inning_label shared) -> list of (seq, text). Grouped/wrapped StatCrew rows are joined
    and re-split; normal rows pass through."""
    grouped = any(GROUP_PREFIX_RE.match(r[1] or "") for r in rows[:1]) or (
        len(rows) > 0 and any(SUMMARY_RE.search(r[1] or "") for r in rows) and len(rows) <= 3 and
        sum(len(COUNT_RE.findall(r[1] or "")) for r in rows) > len(rows))
    if not grouped:
        return [(r[0], (r[1] or "").strip()) for r in rows]
    joined = " ".join((r[1] or "").strip() for r in rows)
    return [(rows[0][0] + k / 1000.0, s) for k, s in enumerate(split_group(joined))]


# ---------- names ----------
def name_key(n):
    """'S. Pace' / 'Pace, Sawyer' / 'PACE' / 'Sawyer Pace' / 'Pace, S.' -> ('pace', 's' or '')"""
    n = re.sub(r"^(?:" + POS + r")\s+", "", (n or "").strip(), flags=re.I)
    n = re.sub(r"\s+(jr|sr|ii|iii|iv)\.?$", "", n, flags=re.I).strip(" .")
    if "," in n:
        last, first = n.split(",", 1)
    else:
        w = n.split()
        if not w:
            return ("", "")
        if len(w) == 1:
            last, first = w[0], ""
        else:
            last, first = w[-1], w[0]
    last = re.sub(r"[^a-z' -]", "", last.lower()).strip()
    first = re.sub(r"[^a-z]", "", first.lower())[:1]
    return (last, first)


def same_person(a, b):
    ka, kb = name_key(a), name_key(b)
    if not ka[0] or ka[0] != kb[0]:
        return False
    return not ka[1] or not kb[1] or ka[1] == kb[1]


# ---------- pieces of one play ----------
def count_info(text):
    """last parenthesised count in the batter clause: (balls, strikes, letters or None)"""
    ms = list(COUNT_RE.finditer(text))
    if not ms:
        return None
    m = ms[-1]
    return int(m[1]), int(m[2]), m[3]


def replay(letters):
    b = s = 0
    for ch in letters:
        if ch == "B":
            b += 1
        elif ch in "KS":
            s += 1
        elif ch == "F":
            s += s < 2
    return b, s


def count_consistent(balls, strikes, letters, result):
    """True if the string reaches the shown count (in-play / HBP without H), or reaches it before a terminal last
    letter (walk: last B at 3 balls; strikeout: last K/S at 2 strikes; HBP: last H)."""
    if letters is None:
        return None
    if replay(letters) == (balls, strikes):
        return True
    if letters and replay(letters[:-1]) == (balls, strikes):
        last = letters[-1]
        return (last == "B" and balls == 3) or (last in "KS" and strikes == 2) or last == "H"
    return False


def bip_type(code, text):
    t = text.lower()
    if "bunt" in t:
        return "bunt"
    if code in ("GO", "GDP", "GTP", "OUT1") or "grounded" in t or "ground ball" in t:
        return "ground"
    if code in ("LO", "LDP", "LTP") or "lined" in t or "line drive" in t:
        return "line"
    if code in ("PO", "PDP", "IF") or "popped" in t or "infield fly" in t:
        return "pop"
    if code in ("FO", "FDP", "FTP", "SF_V") or "flied" in t or "fly ball" in t or ", sf" in t:
        return "fly"
    if code in ("FOUL_O", "FODP"):
        return "pop" if re.search(r"\bto (?:p|c|1b|2b|3b|ss)\b", t) else "fly"
    if code == "HR":
        return "fly"
    if code in HITS or code in ("E", "FC", "REACH"):
        if re.search(r"through the (?:left|right) side|up the middle|to (?:shortstop|second base|third base|first base|"
                     r"pitcher|catcher|ss|2b|3b|1b|p|c)\b", t):
            return "ground"
    return "unknown"


def bip_dir(text):
    t = text.lower()
    t = t.split(";")[0]
    t = re.sub(r"\(.*?\)", "", t)
    t = re.sub(r"error by", "", t)
    m = re.search(r"\b(?:to|down the|through the|up the|into|over the)\b(.*)", t)
    seg = m[1] if m else t
    seg = seg.split(",")[0]
    if re.search(r"left center|left-center", seg):
        return "LC"
    if re.search(r"right center|right-center", seg):
        return "RC"
    if LEFT.search(seg):
        return "L"
    if RIGHT.search(seg):
        return "R"
    if CENTER.search(seg):
        return "C"
    return ""


def clause_dest(clause):
    """final fate of the runner/batter named in a clause: 1-3 base, 4 scored, 0 out, None no movement stated"""
    c = clause.lower()
    fate = None
    m0 = re.search(r"placed on (first|second|third)", c)          # extra-inning runner
    if m0:
        return BASE_WORD[m0[1]]
    m0 = re.search(r"\bsteals (2b|2nd|second|3b|3rd|third|home)\b", c)
    if m0:
        return {"2b": 2, "2nd": 2, "second": 2, "3b": 3, "3rd": 3, "third": 3, "home": 4}[m0[1]]
    for m in re.finditer(r"(advanced to (first|second|third|home)|stole (second|third|home)|scored|"
                         r"out at (first|second|third|home)|out on the play|caught stealing|picked off|"
                         r"out on (?:a|the)? ?(?:double|triple) play|was out|thrown out|^\S.{0,30}? to (first|second|third)\b(?! base)|"
                         r"advanced from (?:first|second|third)(?: base)? to (second|third|home))", c):
        s = m.group(0)
        if m[6]:
            fate = BASE_WORD[m[6]]
        elif s.startswith("advanced to"):
            fate = BASE_WORD[m[2]]
        elif s.startswith("stole"):
            fate = BASE_WORD[m[3]]
        elif s == "scored":
            fate = 4
        elif m[5]:
            fate = BASE_WORD[m[5]]
        else:
            fate = 0
    if fate is None and re.search(r"\bout\b", c) and "out at" not in c:
        fate = 0 if re.search(r"\b(out on|was out|is out)\b", c) else None
    return fate


def clause_name(clause):
    m = re.match(r"^(?P<name>.+?) (?:advanced|stole|steals|scored|out|caught|picked|was|placed|to (?:first|second|third)|failed|"
                 r"remained|held|returned)\b", clause.strip())
    return m["name"].strip() if m else None


# ---------- the game ----------
class State:
    def __init__(self):
        self.outs = 0
        self.bases = {1: None, 2: None, 3: None}
        self.score = [0, 0]          # away, home


def find_runner(state, name, prefer=None):
    for b in (3, 2, 1):
        r = state.bases[b]
        if r is not None and name and same_person(r, name):
            return b
    if prefer:
        for b in prefer:
            if state.bases[b] is not None:
                return b
    return None


def apply_runner_clauses(state, clauses, batter_dest, flags, batter_name=None):
    """Move runners named in clauses; place the batter. Returns (outs_added, runs_added, scorers)."""
    outs = runs = 0
    moved = {}
    for cl in clauses:
        nm = clause_name(cl)
        fate = clause_dest(cl)
        if fate is None or nm is None:
            if cl.strip():
                flags.add("runner_clause_unparsed")
            continue
        b = find_runner(state, nm)
        if b is None and "placed on" in cl.lower() and 1 <= fate <= 3:
            state.bases[fate] = nm                     # extra-inning runner: appears from nowhere
            continue
        if b is None:
            occupied = [x for x in (3, 2, 1) if state.bases[x] is not None and x not in moved]
            cand = [x for x in occupied if fate == 0 or fate > x]
            if cand:
                b = cand[0]
                flags.add("runner_name_guessed")
            else:
                flags.add("runner_not_on_base")
                if fate == 4:
                    runs += 1
                elif fate == 0:
                    outs += 1
                continue
        moved[b] = fate
    newb = {1: None, 2: None, 3: None}
    for b in (1, 2, 3):
        if state.bases[b] is not None and b not in moved:
            newb[b] = state.bases[b]
    for b, fate in moved.items():
        r = state.bases[b]
        if fate == 0:
            outs += 1
        elif fate == 4:
            runs += 1
        else:
            if newb[fate] is not None and newb[fate] != r:
                flags.add("base_collision")
            newb[fate] = r
    if batter_dest is not None:
        if batter_dest == 4:
            runs += 1
        elif batter_dest == 0:
            outs += 1
        else:
            # force unmentioned runners ahead of the batter (walk / HBP / single with a silent runner)
            b = batter_dest
            carry = batter_name or "batter"
            while b <= 3 and carry is not None:
                prev = newb[b]
                newb[b] = carry
                if prev is None:
                    break
                flags.add("forced_implicit")
                carry, b = prev, b + 1
            if b == 4 and carry is not None:
                runs += 1
    state.bases = newb
    return outs, runs


def split_clauses(text):
    t = OUTS_RE.sub("", text)
    t = COUNT_RE.sub("", t)
    parts = [p.strip(" .") for p in t.split(";")]
    return parts[0], [p for p in parts[1:] if p]


def batter_dest_of(code, after_verb):
    """after_verb: the batter's own clause from just after the verb, e.g. ' to third base, bunt, advanced to second'
    (never the batter's name: 'Potvin, C.' has a comma of its own)"""
    c = after_verb.lower()
    if code in OUT_TYPES and code not in ("K", "K_L", "K_S"):
        dest = 0
    elif code in ("K", "K_L", "K_S"):
        dest = 1 if re.search(r"reached (?:first )?on|reached first|safe at first|wild pitch|passed ball|dropped", c) \
            and not re.search(r"out at first", c) else 0
    elif code in HITS:
        dest = HITS[code]
    else:
        dest = 1
    # later movement of the batter inside his own clause: ", advanced to second on the throw", ", out at third ..."
    rest = re.split(r",", c, maxsplit=1)
    if len(rest) > 1:
        f = clause_dest("x " + rest[1])
        if f is not None and code not in OUT_TYPES:
            dest = f
        elif f is not None and code in ("K", "K_L", "K_S") and dest == 1 and f == 0:
            dest = 0
    if code in ("FC", "E") and re.search(r"\bout at (?:first)\b", c):
        dest = 0
    return dest


def classify(text, state, batting_names=None):
    """'pa' / 'sub' / 'runner' / 'nonplay' / 'unparsed' with the match."""
    s = text.strip()
    if not s:
        return "nonplay", None
    m = PITCH_CHANGE_RE.match(s)
    if m:
        return "pitch_change", m
    if NONPLAY_RE.match(s):
        return "nonplay", None
    m = SLASH_FOR_RE.match(s)
    if m:
        return "sub_cont", m
    m = SUB3_RE.match(s)
    if m:
        return "sub", m
    m = SUB_RE.match(s) or SUB2_RE.match(s)
    if m and not PA_VERB_RE.match(s) and len(m["new"].split()) <= 4:
        return "sub", m
    m = PA_VERB_RE.match(s)
    if m and len(m["name"].split()) <= 5:
        nm = m["name"]
        code = VERB_CODE[m["verb"]]
        # 'X out at first ...' / 'X reached ...' by a runner already on base is a runner event, not a PA
        if code in ("OUT1", "REACH") and find_runner(state, nm) is not None:
            return "runner", RUNNER_VERB_RE.match(s)
        return "pa", m
    m = RUNNER_VERB_RE.match(s)
    if m and len(m["name"].split()) <= 4:
        return "runner", m
    return "unparsed", None


def pattern_of(text):
    """mask a line for the unparsed-pattern table: names -> N, positions kept, counts -> (c)"""
    t = COUNT_RE.sub("(c)", text)
    t = OUTS_RE.sub("(o)", t)
    t = re.sub(r"\b[A-Z][a-zA-Z'\-]+,? ?(?:[A-Z]\.?)?\b", "N", t)
    t = re.sub(r"\b[A-Z]\. ?N\b", "N", t)
    t = re.sub(r"(N[ ,.]*){2,}", "N ", t)
    t = re.sub(r"\d+", "#", t)
    return re.sub(r"\s+", " ", t).strip()[:90]


def half_of(label, away, home):
    """inning label -> (inning, 'top'/'bottom' or None, batting team text)"""
    lab = label or ""
    m = re.search(r"(\d+)(?:st|nd|rd|th)", lab)
    inning = int(m[1]) if m else None
    half = "top" if re.search(r"\btop\b", lab, re.I) else "bottom" if re.search(r"\bbot", lab, re.I) else None
    team = re.split(r" - | (?:Top|Bottom) of | \d+(?:st|nd|rd|th)", lab)[0].strip()
    if half is None and team:
        from .ingest import same_team
        if same_team(team, away) and not same_team(team, home):
            half = "top"
        elif same_team(team, home) and not same_team(team, away):
            half = "bottom"
    return inning, half, team


def lineup_starters(lineups):
    """side -> starting pitcher name (first 'p' row that isn't a substitute) and starting nine names in order"""
    out = {}
    for side in ("away", "home"):
        rows = sorted([r for r in lineups if r[0] == side], key=lambda r: r[2])
        sp = None
        nine = []
        for (_, team, order, player, pos) in rows:
            sub = bool(re.match(r"^(?:" + POS + r")\s+\S", player or "", re.I))
            if not sub and (pos or "").lower().startswith("p") and sp is None:
                sp = player
            if not sub and not (pos or "").lower().startswith("p") and len(nine) < 9:
                nine.append(player)
        out[side] = {"sp": sp, "nine": nine, "team": rows[0][1] if rows else ""}
    return out


def parse_game(plays, lineups=(), away="", home="", away_runs=None, home_runs=None):
    """plays: [(sequence, inning_label, play_text, away_score, home_score)] ; lineups: [(side, team, order, player, pos)]
    -> (pas, lines, info)"""
    halves = []
    for row in sorted(plays, key=lambda r: r[0]):
        if halves and halves[-1][0] == row[1]:
            halves[-1][1].append(row)
        else:
            halves.append((row[1], [row]))
    st = lineup_starters(lineups)
    pitcher = {"away": st["away"]["sp"], "home": st["home"]["sp"]}       # pitcher of each FIELDING side
    pa_count = {"away": 0, "home": 0}
    pas, lines = [], []
    info = {"halves": [], "pas": 0, "lines": 0, "parsed_lines": 0}
    state = State()
    prev_key = None
    last_sub = {}
    for label, rows in halves:
        inning, half, team = half_of(label, away, home)
        bat = "away" if half == "top" else "home" if half == "bottom" else None
        fld = {"away": "home", "home": "away"}.get(bat)
        key = (inning, half)
        if key != prev_key:
            state.outs, state.bases = 0, {1: None, 2: None, 3: None}
        prev_key = key
        hinfo = {"inning": inning, "half": half, "outs": 0, "runs": 0, "stated_outs": None, "pa_idx": [],
                 "score_runs": None, "start_score": list(state.score)}
        score_cols = [(r[3], r[4]) for r in rows if (r[3] or "").strip() != "" or (r[4] or "").strip() != ""]
        pending_mid = []           # runner events since the last PA (they happen during the next PA)
        before = None
        for seq, text in half_lines([(r[0], r[2]) for r in rows]):
            info["lines"] += 1
            kind, m = classify(text, state)
            flags = set()
            lrec = {"seq": seq, "kind": kind, "text": text}
            stated = OUTS_RE.search(text)
            if before is None:
                before = (state.outs, dict(state.bases), list(state.score))
            if kind == "sub_cont":                           # "McKenzie to p." then "/ for Lincoln."
                info["parsed_lines"] += 1
                old = m["old"].strip(" .")
                side = last_sub.get("pitch_side")
                if side and last_sub.get("was_unknown"):
                    for p in pas:
                        if p["fld_side"] == side and p["pitcher"] is None:
                            p["pitcher"] = old
            elif kind in ("sub", "pitch_change"):
                info["parsed_lines"] += 1
                d = m.groupdict()
                pos = "p" if kind == "pitch_change" else (d.get("pos") or "").lower()
                to = (d.get("to") or "").lower()
                if to in ("pitching", "now pitching"):
                    pos = "p"
                last_sub = {"pitch_side": fld if pos in ("p", "pitcher") else None,
                            "was_unknown": bool(fld) and pitcher.get(fld) is None}
                if pos in ("p", "pitcher") and fld:
                    old = d.get("old")
                    if pitcher[fld] is None and old:
                        for p in pas:                         # retro-fill the starter on earlier PAs
                            if p["fld_side"] == fld and p["pitcher"] is None:
                                p["pitcher"] = old.strip(" .")
                    pitcher[fld] = d["new"].strip(" .")
                if d.get("pr") and d.get("old"):
                    b = find_runner(state, d["old"].strip(" ."))
                    if b:
                        state.bases[b] = d["new"].strip(" .")
            elif kind == "runner":
                info["parsed_lines"] += 1
                first, rest = split_clauses(text)
                o, r = apply_runner_clauses(state, [first] + rest, None, flags)
                state.outs += o
                side_i = 0 if bat == "away" else 1
                state.score[side_i] += r
                hinfo["outs"] += o; hinfo["runs"] += r
                if "placed on" in text.lower():
                    before = None                      # the extra-inning runner is there before the first pitch
                else:
                    pending_mid.append(text)
                lrec["flags"] = sorted(flags)
            elif kind == "pa":
                info["parsed_lines"] += 1
                code = VERB_CODE[m["verb"]]
                batter = re.sub(r"\s+(?:infield|bunt)$", "", m["name"].strip())
                first, rest = split_clauses(text)
                after = first[m.end("verb"):] if len(first) >= m.end("verb") else ""
                ci = count_info(text)
                tl = text.lower()
                if code == "GO" and ", sac" in tl:
                    code = "SAC"
                sac = ", sac" in tl or "sacrifice" in tl
                sf = ", sf" in tl or "sacrifice fly" in tl
                dest = batter_dest_of(code, after)
                pre_outs, pre_bases, pre_score = state.outs, dict(state.bases), list(state.score)
                mid_outs = pre_outs
                o, r = apply_runner_clauses(state, rest, dest, flags, batter)
                if code in DP and o < DP[code]:
                    # "grounded into double play" with the runner's out not written: take the lead forced runner
                    need = DP[code] - o
                    for b in (1, 2, 3):
                        if need and state.bases[b] is not None and state.bases[b] != batter:
                            state.bases[b] = None; need -= 1; o += 1
                    if need:
                        o += need; flags.add("dp_outs_inferred")
                state.outs += o
                side_i = 0 if bat == "away" else 1
                state.score[side_i] += r
                hinfo["outs"] += o; hinfo["runs"] += r
                if stated:
                    if int(stated[1]) != state.outs:
                        flags.add("outs_differ_from_stated")
                        state.outs = int(stated[1])
                    hinfo["stated_outs"] = int(stated[1])
                slot = (pa_count[bat] % 9) + 1 if bat else None
                if bat:
                    pa_count[bat] += 1
                letters = ci[2] if ci else None
                result = code
                if code == "REACH":
                    result = "E" if "error" in tl else "FC" if "fielder" in tl else "REACH"
                if code in ("K", "K_L", "K_S") and dest != 0:
                    result = code + "_reached"
                if code == "SF_V":
                    result = "SF"
                elif code == "SH_V":
                    result = "SH"
                elif sf and result in ("FO", "LO", "PO", "FOUL_O"):
                    result = "SF"
                elif sac and result in ("GO", "OUT1", "PO", "FOUL_O", "LO", "FO") and "bunt" in tl:
                    result = "SH"
                in_play = result not in ("K", "K_L", "K_S", "K_reached", "K_L_reached", "K_S_reached", "BB", "IBB",
                                         "HBP", "CI", "BINT")
                pas.append({
                    "seq": seq, "inning": inning, "half": half, "bat_side": bat, "fld_side": fld,
                    "batter": batter, "pitcher": pitcher.get(fld) if fld else None, "slot": slot,
                    "outs_before": before[0], "bases_before": "".join("1" if before[1][b] else "0" for b in (1, 2, 3)),
                    "outs_at_pitch_start": mid_outs,
                    "bases_at_last_pitch": "".join("1" if pre_bases[b] else "0" for b in (1, 2, 3)),
                    "bat_score_before": before[2][side_i] if bat else None,
                    "fld_score_before": before[2][1 - side_i] if bat else None,
                    "balls": ci[0] if ci else None, "strikes": ci[1] if ci else None, "pitches": letters,
                    "count_ok": count_consistent(ci[0], ci[1], letters, result) if ci and letters else None,
                    "result": result, "in_play": int(in_play),
                    "bip_type": bip_type(code, first) if in_play else None,
                    "bip_dir": bip_dir(first) if in_play else None,
                    "outs_on_play": o, "runs_on_play": r, "mid_pa_events": len(pending_mid),
                    "flags": sorted(flags), "text": text,
                })
                hinfo["pa_idx"].append(len(pas) - 1)
                pending_mid = []
                before = None
            else:
                if kind == "unparsed":
                    lrec["pattern"] = pattern_of(text)
                else:
                    info["parsed_lines"] += 1
            if kind != "pa" and stated and kind != "nonplay":
                if int(stated[1]) != state.outs:
                    state.outs = int(stated[1])
                hinfo["stated_outs"] = int(stated[1])
            if kind in ("sub", "nonplay", "pitch_change", "sub_cont"):
                before = None if not pending_mid else before
            lrec["flags"] = sorted(flags)
            lines.append(lrec)
        # runs in the rest of the half-inning, from every PA's start
        end_score = state.score[0 if bat == "away" else 1] if bat else 0
        for i in hinfo["pa_idx"]:
            p = pas[i]
            p["runs_rest_inning"] = end_score - p["bat_score_before"] if p["bat_score_before"] is not None else None
        # the site's own running score for this half (Sidearm): runs = last score - score before
        if score_cols and bat:
            try:
                col = 0 if bat == "away" else 1
                last = int(score_cols[-1][col])
                hinfo["score_runs"] = last - hinfo["start_score"][col] if False else last
            except ValueError:
                pass
        hinfo["outs_final"] = state.outs
        info["halves"].append(hinfo)
    info["pas"] = len(pas)
    info["final_parsed"] = list(state.score)
    return pas, lines, info
