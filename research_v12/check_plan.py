"""Goal check for the v1.2 plan (Drew's final check-off, Nov 13). Exit 0 only if:
 A. every explicit file:line reference in the plan and research doc resolves at this commit to the symbol it names;
 B. the key numbers in the docs match the captured outputs in results/v12/;
 C. every decision Drew made is recorded and no question is left open;
 D. the plan has its sections and steps, and section 7 records a fresh-context review.
usage (repo root): python3 research_v12/check_plan.py"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = open(os.path.join(ROOT, "docs", "PLAN_v1.2_2026-11-13.md")).read()
RES = open(os.path.join(ROOT, "docs", "RESEARCH_location_proxies_2026-11-13.md")).read()
fails = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)
def find(base):
    for d in ("", "app", "supabase/migrations", "readthrough", "web/lib"):
        p = os.path.join(ROOT, d, base)
        if os.path.exists(p): return p
    return None
# A. references: file:line -> a token that must appear within +-2 lines
EXPECT = {"20261103000000_pitch_caller.sql:125": "doc jsonb", "20261106000000_pitchiq_teams.sql:199": "manage_opponents",
          "engine.js:208": "function landing", "engine.py:1347": "def damage", "engine.py:1560": "hbp_loc",
          "engine.py:160": "ride_up_2k", "engine.py:174": "def hot_fade", "engine.py:2164": "def _ipv_cached",
          "engine.py:356": "crowding", "engine.py:819": "def landing", "index.src.html:1416": "function locPicker",
          "learn.js:42": "PITCH_KEYS", "learner.js:272": "rows\\.push", "learner.js:45": "ACTIVE_TRAITS",
          "learner.js:767": "function seedDamage", "simulate.py:180": '"os"',
          "engine.py:1827": "no pitches", "engine.js:604": "no pitches", "index.src.html:721": "E\\.Pitch",
          "learner.js:250": "locOk", "worlds.js:63": "logZone", "simulate.py:38": "TRUE_MOVE", "calib.py:27": "wild",
          "calib.py:179": "wild", "20261103000000_pitch_caller.sql:137": "updatedAt", "learn.js:42": "PITCH_KEYS",
          "engine.py:886": "max\\(v, 0\\.01\\)"}
refs = set(re.findall(r"`([A-Za-z0-9_.\-]+\.(?:py|js|html|sql|ts)):(\d+)(?:-(\d+))?", PLAN + RES))
for base, line, end in sorted(refs):
    key = f"{base}:{line}"
    p = find(base)
    if not p: ok(False, f"A {key}: file not found"); continue
    L = open(p, encoding="utf-8").read().split("\n")
    n = int(line)
    window = "\n".join(L[max(0, n - 3):(int(end) if end else n) + 2])   # a range: the whole range
    tok = EXPECT.get(key)
    ok(tok is not None and re.search(tok, window) is not None, f"A {key} -> {tok!r}" + ("" if tok else " (no expected token listed)"))
# B. numbers: (claim in docs, results file, regex the file must match)
R = lambda f: open(os.path.join(ROOT, "results", "v12", f)).read()
NUM = [
    ("641,147", "opencommand_naive_check.txt", r"^pitches 641147"),
    ("about +3.5", "opencommand_naive_check.txt", r"CH arm/same -0\.16.*glove/opp \+8\.63"),
    ("3.73%", "engine_inside_price.txt", r"college_d3\s+up-in\s+0\.0373"),
    ("0.51%", "engine_inside_price.txt", r"mlb\s+up-in\s+0\.0051"),
    ("2.86%", "engine_inside_price.txt", r"college_d1\s+up-in\s+0\.0286"),
    ("10 **23** 13 13 1 0 0 0%", "probe_hbp_scale.txt", r"x0\.53: P1 SI:in\s+10%\s+23%\s+13%\s+13%\s+1%"),
    ("×1.94", "lean_hbp_geometry.txt", r"lean \+2\.7: 0\.0193 \(x1\.94\)"),
    ("×1.56", "lean_hbp_geometry.txt", r"lean \+2\.7: 0\.0441 \(x1\.56\)"),
    ("23% → 29%", "lean_hbp_geometry.txt", r"lean 0 0\.233, toward plate \+2\.7 0\.288"),
    ("27.6% / 28.5%", "proxies_mlb_2024.txt", r"FB\s+same\s+22250\s+0\.276"),
    ("34.9% / 34.0%", "proxies_singleA_2024_2025.txt", r"FB\s+same\s+7279\s+0\.349"),
    ("2.03% / 1.91%", "proxies_singleA_2024_2025.txt", r"HBP/PA 0\.0203"),
    ("+2.0 ± 0.5 / +2.6 ± 0.4", "proxies_mlb_2025.txt", r"SI:.*pitcher-frame \(arm\) part \+2\.61 \+- 0\.44"),
    ("+2.7", "opencommand_naive_check.txt", r"SI\s+98986\s+2\.65"),
    ("r 0.92", "hitter_persistence.txt", r"swing_tilt\s+2024->2025 r 0\.92"),
    ("0.06", "hitter_persistence.txt", r"fastball hard%\s+r 0\.06"),
    ("0.44", "hitter_persistence.txt", r"zone swing\s+r 0\.44"),
    ("−4.1 / −5.6", "grid_lean_sim.txt", r"8\s+60\s+2\.5 \|\s+-4\.09"),
]
for claim, f, rx in NUM:
    ok(claim in PLAN + RES and re.search(rx, R(f)) is not None, f"B {claim!r} in docs and {f} ~ /{rx}/")
# C. decisions
for d in ["S2", "O3", "O4"] + [f"L{i}" for i in range(1, 9)] + [f"Q{i}" for i in range(1, 9)]:
    ok(re.search(rf"^\| {d} \(Nov 1[23]", PLAN, re.M) is not None, f"C decision {d} recorded")
ok(re.search(r"^Open now: none", PLAN, re.M) is not None, "C no open questions now")
sec1 = PLAN.split("## 1. Decisions", 1)[1].split("\n## ", 1)[0]
tbl = re.search(r"^\| # \| Decision \|\n(?:^\|.*\|\n)+", sec1, re.M)
ok(tbl is not None and all(re.search(rf"^\| {d} \(", tbl.group(0), re.M) for d in ["S2", "L8", "Q1", "Q8", "O4"]),
   "C every decision is in one unbroken table (no blank line splitting it)")
# D. structure and review
for h in ["## 0. What v1.2 is", "## 1. Decisions", "## 2. Design", "### 2.8 Hitter model", "## 3. Steps", "### Part A freeze",
          "### Step B1", "### Step B4", "## 4. Evaluation suite", "## 5. Risks", "## 6. Not in v1.2", "## 7. Reviews"]:
    ok(h in PLAN, f"D section {h!r}")
sec7 = PLAN.split("## 7. Reviews", 1)[1].split("\n## ", 1)[0] if "## 7. Reviews" in PLAN else ""
ok("None yet" not in sec7 and "review" in sec7.lower() and "GO" in sec7, "D section 7 records a fresh-context review with a verdict")
print(f"\n{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
