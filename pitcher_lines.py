"""
Collect every pitcher's 2026 line for the teams behind the run values (college_rates.py): D3 Liberty League, Empire 8,
NESCAC, UAA; D1 Big East, America East, Ivy. Source: each school's Sidearm stats page, table "Individual Overall
Pitching Statistics". Batters faced = AB + BB + HBP + SFA + SHA. Writes data/pitcher_lines_2026.csv and a fetch log.
Usage: python3 pitcher_lines.py [team ...]      (re-fetches only the named teams when given)
"""
import csv, html, json, os, re, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
SITES = {
 # D3
 "Ithaca": "athletics.ithaca.edu", "Union": "unionathletics.com", "St. Lawrence": "saintsathletics.com", "Hobart": "hwsathletics.com",
 "RIT": "ritathletics.com", "Skidmore": "skidmoreathletics.com", "RPI": "rpiathletics.com", "Rochester": "uofrathletics.com",
 "Clarkson": "clarksonathletics.com", "Bard": "bardathletics.com", "Vassar": "vassarathletics.com", "Russell Sage": "sagegators.com",
 "St. John Fisher": "sjfcathletics.com", "Utica": "uticapioneers.com", "Brockport": "gobrockport.com", "Poly": "sunypolywildcats.com",
 "Houghton": "athletics.houghton.edu", "Elmira": "elmiraathletics.com", "Keuka": "keukaathletics.com", "Alfred": "gosaxons.com",
 "Middlebury": "athletics.middlebury.edu", "Amherst": "athletics.amherst.edu", "Tufts": "gotuftsjumbos.com", "Trinity": "bantamsports.com",
 "Bates": "gobatesbobcats.com", "Colby": "colbymules.com", "Williams": "ephsports.williams.edu", "Wesleyan": "athletics.wesleyan.edu",
 "Hamilton": "athletics.hamilton.edu", "Bowdoin": "athletics.bowdoin.edu", "WashU": "washubears.com", "Chicago": "athletics.uchicago.edu",
 "NYU": "gonyuathletics.com", "Brandeis": "brandeisjudges.com", "Emory": "emoryathletics.com", "Case Western": "athletics.case.edu",
 # D1
 "UConn": "uconnhuskies.com", "Creighton": "gocreighton.com", "St. John's": "redstormsports.com", "Georgetown": "guhoyas.com",
 "Xavier": "goxavier.com", "Villanova": "villanova.com", "Butler": "butlersports.com", "Seton Hall": "shupirates.com",
 "UMBC": "umbcretrievers.com", "Bryant": "bryantbulldogs.com", "UMass Lowell": "goriverhawks.com", "Binghamton": "bubearcats.com",
 "Maine": "goblackbears.com", "UAlbany": "ualbanysports.com", "NJIT": "njithighlanders.com", "Yale": "yalebulldogs.com",
 "Columbia": "gocolumbialions.com", "Penn": "pennathletics.com", "Brown": "brownbears.com", "Cornell": "cornellbigred.com",
 "Princeton": "goprincetontigers.com", "Harvard": "gocrimson.com", "Dartmouth": "dartmouthsports.com",
}
D1 = {"UConn", "Creighton", "St. John's", "Georgetown", "Xavier", "Villanova", "Butler", "Seton Hall", "UMBC", "Bryant", "UMass Lowell",
      "Binghamton", "Maine", "UAlbany", "NJIT", "Yale", "Columbia", "Penn", "Brown", "Cornell", "Princeton", "Harvard", "Dartmouth"}
OVERRIDE = json.load(open(os.path.join(HERE, "data", "site_overrides.json"))) if os.path.exists(os.path.join(HERE, "data", "site_overrides.json")) else {}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (pitch-caller research)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.geturl(), r.read().decode("utf-8", "ignore")

def nuxt_data(page):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m: return None
    arr = json.loads(m.group(1)); memo = {}
    def dec(i, depth=0):
        if i < 0: return None          # devalue codes: -1 undefined, -2 hole, -3 NaN, ...
        if i in memo: return memo[i]
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in ("Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef"):
                r = dec(v[1]) if len(v) > 1 and isinstance(v[1], int) else None
            elif v and isinstance(v[0], str) and v[0] in ("Set", "Map", "Date", "RegExp", "BigInt", "null", "undefined", "NaN"):
                r = None
            else:
                r = []; memo[i] = r; r.extend(dec(x) if isinstance(x, int) else x for x in v); return r
        elif isinstance(v, dict):
            r = {}; memo[i] = r
            for k, x in v.items(): r[k] = dec(x) if isinstance(x, int) else x
            return r
        else: r = v
        memo[i] = r; return r
    return dec(0)


def parse_nuxt(page):
    """Newer Sidearm pages ship the stats as page data instead of an HTML table."""
    d = nuxt_data(page)
    try:
        c = list(d["pinia"]["statsSeason"]["cumulativeStats"].values())[0]
        ps = c["overallIndividualStats"]["individualStats"]["individualPitchingStats"]
    except Exception:
        return None
    rows = []
    for x in ps:
        if x.get("isAFooterStat"):
            continue
        rows.append({"Player": x.get("playerName", ""), "IP": x.get("inningsPitched") or "0", "H": x.get("hitsAllowed"), "BB": x.get("walksAllowed"),
                     "SO": x.get("strikeouts"), "HR": x.get("homeRunsAllowed"), "2B": x.get("doublesAllowed"), "3B": x.get("triplesAllowed"),
                     "AB": x.get("opponentsAtBats"), "HBP": x.get("hitBatters"), "SFA": x.get("sacrificeFliesAllowed"), "SHA": x.get("sacrificeHitsAllowed"),
                     "WP": x.get("wildPitches")})
    return rows


def cell(x):
    x = re.sub(r"<[^>]+>", " ", x)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()

def parse(page):
    for t in re.findall(r"<table.*?</table>", page, re.S):
        cap = re.search(r"<caption[^>]*>(.*?)</caption>", t, re.S)
        if not cap or "Individual Overall Pitching" not in cell(cap.group(1)):
            continue
        thead = re.search(r"<thead.*?</thead>", t, re.S)
        heads = [cell(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", thead.group(0), re.S)]
        rows = []
        for tr in re.findall(r"<tr.*?</tr>", re.search(r"<tbody.*?</tbody>", t, re.S).group(0), re.S):
            cells = [cell(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
            if len(cells) < len(heads) - 1:
                continue
            rows.append(dict(zip(heads, cells)))
        return heads, rows
    return None, None

def num(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def ip_outs(ip):   # 12.2 innings = 12 innings and 2 outs
    w, _, f = str(ip).partition(".")
    return int(num(w)) * 3 + (int(f) if f.isdigit() else 0)

def main():
    teams = sys.argv[1:] or list(SITES)
    out_path = os.path.join(HERE, "data", "pitcher_lines_2026.csv")
    keep = []
    if sys.argv[1:] and os.path.exists(out_path):
        keep = [r for r in csv.DictReader(open(out_path)) if r["team"] not in teams]
    log, rows = [], list(keep)
    for team in teams:
        url = OVERRIDE.get(team) or f"https://{SITES[team]}/sports/baseball/stats/2026"
        try:
            final, page = fetch(url)
            heads, prow = parse(page)
            if not prow:
                prow = parse_nuxt(page)
            if not prow:
                log.append({"team": team, "url": url, "ok": False, "why": "no 'Individual Overall Pitching Statistics' table"}); continue
            n = 0
            for p in prow:
                name = p.get("Player", "")
                if not name or name.lower().startswith(("total", "opponent")):
                    continue
                name = re.sub(r"^\d+\s*", "", name).strip()
                ab, bb, hbp = num(p.get("AB")), num(p.get("BB")), num(p.get("HBP"))
                sf, sh = num(p.get("SFA")), num(p.get("SHA"))
                rows.append({"team": team, "level": "college_d1" if team in D1 else "college_d3", "player": name,
                             "outs": ip_outs(p.get("IP", "0")), "bf": int(ab + bb + hbp + sf + sh), "ab": int(ab), "h": int(num(p.get("H"))),
                             "bb": int(bb), "hbp": int(hbp), "so": int(num(p.get("SO"))), "hr": int(num(p.get("HR"))),
                             "2b": int(num(p.get("2B"))), "3b": int(num(p.get("3B"))), "wp": int(num(p.get("WP"))), "source": final})
                n += 1
            log.append({"team": team, "url": final, "ok": n > 0, "pitchers": n})
        except Exception as e:
            log.append({"team": team, "url": url, "ok": False, "why": str(e)[:120]})
        time.sleep(0.6)
    rows.sort(key=lambda r: (r["level"], r["team"], -int(r["bf"])))
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    json.dump({"fetched": time.strftime("%Y-%m-%d %H:%M"), "log": log}, open(os.path.join(HERE, "data", "pitcher_lines_log.json"), "w"), indent=1)
    bad = [l for l in log if not l["ok"]]
    print(f"{len(rows)} pitcher lines; {len(log) - len(bad)} of {len(log)} teams ok")
    for b in bad: print("  FAILED", b["team"], b["url"], b.get("why"))

if __name__ == "__main__":
    main()
