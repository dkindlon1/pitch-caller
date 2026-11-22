"""v1.3 core (feat/hitter-v13-core): the assembled engine defaults (docs/PROMPT_hitter_v13_apply_2026-11-21.md, Task C).

- The defaults load: zone_v13 (ruling 2; flat hanger removed; quality-gated hanger H = 0), count_v13core / run_v13core
  (the D1 and HS / travel count + run candidates; HS pitch kind x velocity; D2 / D3 on v1.2's count layer), each file at
  its recorded sha256, and app/engine_data.json (and the web copy) carries them.
- Each component changes what it should and nothing else; switching it off gives back the stage before it:
    v13refit tables  = the refit tip (tests_v13_tables.py proves it bit for bit)
    + zone_v13       (count / run v13refit): run values and called-strike kappas unchanged
    + count / run    (zone_v13): only D1 and HS move; MLB, D2, D3 bit for bit
    + HS pitch kind x velocity: only HS / travel outcome mixes move, exactly by the table's multipliers
    + gb_kind (P3):  only sinkers' ball-in-play values move
    + hanger gate:   H = 0 is bit for bit the key absent; H > 0 moves only off-speed pitches over the heart with
                     wild_today > 0, by H x min(1, wild_today / 0.30), in both engines
- D2 / D3 count numbers are v1.2's (count terms), with the shared refit's called-strike kappas.
- In-play tables (out_table / runner, every level): the core's level recalibration (hitter_data.core_recal copies
  inplay_fit.py's inplay_typed_params.py into count_v13core); the count / run switch-off keeps them (count_v13refit with the
  core's in-play tables), since they belong to the recalibration, not to the count candidates.
- Python = JS on outcome cases and full calls at every level, HS / travel with entered velocities and with a missing one.

  python3 tests_v13_core.py      -> runs every check, exits non-zero on a failure
"""
import copy, hashlib, json, math, os, random, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
import tests_v13_tables as TT
import inplay_typed_params as IT

DEFAULT = {"zone": "v13", "count": "v13core", "run": "v13core"}
SHA256 = {"zone_v13.json": "4c9f98efb96a3e66a2f1367b6635caf451b2521efeb1169a707625643f253323",
          "count_v13core.json": "466ab368e688e00b2db01e6f55d142c8c4b5db22059111f1e00c930f2933c2a1",
          "run_v13core.json": "ea99383c9af5606462453a1024a5c00c934707a8fb0fd02e690fa2391bca2d98"}
REFIT = dict(TT.REFIT_ENV)
ZONE_ONLY = {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": "v13refit", "PITCH_RUN_TABLE": "v13refit"}
NON_HS = ("mlb", "college_d1", "college_d2", "college_d3")
HS_LV = ("hs", "travel")
# a high-school arsenal with entered speeds, one pitch without (the velocity terms skip it), two fastballs (relative speed)
ARS_HS = [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.75, shape="", velo=84),
          dict(name="Sinker", kind="SI", grade=3, command=3, conf=0.7, shape="", velo=80),
          dict(name="Curve", kind="CB", grade=3, command=3, conf=0.68, shape="", velo=68),
          dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.66, shape="", velo=0)]
ARS = TT.ARS + [ARS_HS]
results = TT.results
check = TT.check


def path(name):
    return os.path.join(HERE, "data_tables", name)


def load(name):
    return json.load(open(path(name), encoding="utf8"))


def scratch(tmp, kind, t, tag):
    t = copy.deepcopy(t)
    t["version"] = f"scratch-{tag}"
    p = os.path.join(tmp, f"{kind}_{tag}.json")
    with open(p, "w", encoding="utf8", newline="\n") as f:
        json.dump(t, f)
    return p


def cases(n, seed, levels=TT.LEVELS, arsenals=(0, 1, 2)):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        a = rng.choice(arsenals)
        out.append(dict(lv=rng.choice(levels), b=rng.randint(0, 3), k=rng.randint(0, 2), o=rng.randint(0, 2),
                        bases=[rng.random() < 0.35, rng.random() < 0.3, rng.random() < 0.25], same=rng.random() < 0.5,
                        pc=rng.randint(0, 110), a=a, i=rng.randrange(len(ARS[a])), q=rng.choice(TT.QUADS)))
    return out


def calls(n, seed, levels=TT.LEVELS, arsenals=(0, 1, 2)):
    rng = random.Random(seed)
    return [dict(lv=rng.choice(levels), b=rng.randint(0, 3), k=rng.randint(0, 2), o=rng.randint(0, 2),
                 bases=[rng.random() < 0.35, rng.random() < 0.3, rng.random() < 0.25], same=rng.random() < 0.5,
                 pc=rng.randint(0, 100), a=rng.choice(arsenals), inning=rng.randint(1, 9), margin=rng.randint(-3, 3))
            for _ in range(n)]


def same_case(x, y, fields=("op", "z", "ipv", "kap")):
    return all(TT.worst(x[f], y[f]) == 0.0 for f in fields)


def py_pitch(d):
    return e.Pitch(d["name"], d["kind"], d["grade"], d["command"], d["conf"], shape=d["shape"], velo=d["velo"])


# --- the gate runners (wild_today set through the simulator's truth, s.wild_true) ---------------------------------------
PY_GATE = r"""
import json, sys
import engine as e
inp = json.load(sys.stdin)
out = []
for c in inp["cases"]:
    a = [e.Pitch(d["name"], d["kind"], d["grade"], d["command"], d["conf"], shape=d["shape"], velo=d["velo"]) for d in inp["ars"][c["a"]]]
    e.resolve_speeds(a)
    p = a[c["i"]]
    s = e.Situation(c["b"], c["k"], 0, (False, False, False), level=c["lv"], wild_true=c["wild"])
    z = {}
    op = e.outcome_probs(p, c["q"], s, a, zout=z)
    out.append({"op": op, "H": {k: v["H"] for k, v in z.items()}, "gate": e.hanger_gate(p, s)})
print(json.dumps(out))
"""
JS_GATE = r"""
const E = require('./app/engine.js'); E.init(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')));
const inp = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = [];
for (const c of inp.cases) {
  const a = inp.ars[c.a].map((d) => E.Pitch(Object.assign({}, d))); E.resolveSpeeds(a);
  const p = a[c.i], s = E.Situation({ balls: c.b, strikes: c.k, outs: 0, bases: [false, false, false], level: c.lv, wild_true: c.wild });
  const z = {};
  const op = E.outcomeProbs(p, c.q, s, a, null, null, null, z);
  const H = {}; for (const k in z) H[k] = z[k].H;
  out.push({ op, H, gate: E.v13tables.hangerGate(p, s) });
}
process.stdout.write(JSON.stringify(out));
"""


def run_gate(runner, inp, env=None, data=None):
    import subprocess
    if runner == "py":
        r = subprocess.run([sys.executable, "-c", PY_GATE], cwd=HERE, input=json.dumps(inp), capture_output=True, text=True,
                           env=dict(os.environ, PYTHONUTF8="1", **(env or {})))
    else:
        r = subprocess.run(["node", "-e", JS_GATE, data], cwd=HERE, input=json.dumps(inp), capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-3000:])
    return json.loads(r.stdout)


def main():
    tmp = tempfile.mkdtemp(prefix="v13core_")
    Z, C, R = load("zone_v13.json"), load("count_v13core.json"), load("run_v13core.json")
    C12, CR, RR = load("count_v12.json"), load("count_v13refit.json"), load("run_v13refit.json")

    # 1. defaults ---------------------------------------------------------------------------------------------------------
    check("the engine's defaults are zone_v13 / count_v13core / run_v13core (no override set)",
          e.TABLE_DEFAULT == DEFAULT and e.TABLE_VERSIONS == DEFAULT and not any(os.environ.get(v) for v in e.TABLE_ENV.values()),
          f"{e.TABLE_VERSIONS}")
    for name, sha in SHA256.items():
        got = hashlib.sha256(open(path(name), "rb").read()).hexdigest()
        check(f"data_tables/{name} is the frozen file (sha256 {sha[:12]}...)", got == sha, got)
    D = json.load(open(os.path.join(HERE, "app", "engine_data.json"), encoding="utf8"))
    check("app/engine_data.json carries the core tables (versions, zone file, count layer with HS pitch kind x velocity)",
          D["TABLES"]["versions"] == DEFAULT and D["TABLES"]["zone"] == Z
          and D["TABLES"]["count"]["levels"]["hs"]["pitch_velo"] == C["levels"]["hs"]["pitch_velo"]
          and all(D["RE"][lv] == L["re"] for lv, L in R["levels"].items()))
    check("web/lib/engine_data.json is the app's copy",
          open(os.path.join(HERE, "app", "engine_data.json"), "rb").read() == open(os.path.join(HERE, "web", "lib", "engine_data.json"), "rb").read())

    # 2. zone_v13 ---------------------------------------------------------------------------------------------------------
    zc = Z["class"]
    check("zone_v13: the flat hanger and the flat off-speed chase are gone (hanger_hard 0, chase_os 0), gate H = 0",
          zc["hanger_hard"] == 0.0 and zc["chase_os"] == {"off": 0.0, "noncomp": 0.0} and zc["hanger_gate"] == 0.0
          and e.HANGER == 0.0 and e.HANGER_GATE == 0.0)
    check("zone_v13: per-level cells for college D1 / D2 / D3 and HS (travel reads HS's); P3 carried by gb_kind.SI only",
          set(Z["level_cells"]) == {"college_d1", "college_d2", "college_d3", "hs"} and set(zc["gb_kind"]) == {"SI"}
          and -0.2 < zc["gb_kind"]["SI"] < 0.2)
    other = {k: v for k, v in zc.items() if k not in ("hanger_hard", "chase_os", "hanger_gate", "gb_kind")}
    check("zone_v13: every other class term and the band base rates are v1.2's (only the fitted cells carry the table)",
          other == {k: v for k, v in load("zone_v12.json")["class"].items() if k not in ("hanger_hard", "chase_os")}
          and Z["base"] == load("zone_v12.json")["base"])

    # 3. stages and switch-offs (fresh processes, env overrides) ----------------------------------------------------------
    inp = {"ars": ARS, "cases": cases(320, 41), "calls": calls(12, 42), "levels": TT.LEVELS}
    R_core = json.loads(TT.run_py(HERE, inp))
    C_nopv = copy.deepcopy(C); C_nopv["levels"]["hs"].pop("pitch_velo")
    p_nopv = scratch(tmp, "count", C_nopv, "nopv")
    R_nopv = json.loads(TT.run_py(HERE, inp, {"PITCH_COUNT_TABLE": p_nopv}))
    CRi = copy.deepcopy(CR)                 # the refit's count layer with the core's (recalibrated) in-play tables
    for lv, L in CRi["levels"].items():
        if "out_table" in L:
            L["out_table"], L["runner"] = C["levels"][lv]["out_table"], C["levels"][lv]["runner"]
    R_zone = json.loads(TT.run_py(HERE, inp, dict(ZONE_ONLY, PITCH_COUNT_TABLE=scratch(tmp, "count", CRi, "refit_inplay"))))
    R_refit = json.loads(TT.run_py(HERE, inp, REFIT))
    lv_of = [c["lv"] for c in inp["cases"]]
    idx = lambda lvs: [i for i, lv in enumerate(lv_of) if lv in lvs]

    ok_non = all(same_case(R_core["cases"][i], R_nopv["cases"][i]) for i in idx(NON_HS))
    hs_moved = sum(TT.worst(R_core["cases"][i]["op"], R_nopv["cases"][i]["op"]) > 1e-9 for i in idx(HS_LV))
    hs_rest = all(same_case(R_core["cases"][i], R_nopv["cases"][i], ("z", "kap")) for i in idx(HS_LV))
    check("HS pitch kind x velocity off (count_v13core without pitch_velo): MLB / D1 / D2 / D3 outcomes bit for bit, "
          "HS / travel outcome mixes move (zone rows and kappas don't)", ok_non and hs_rest and hs_moved == len(idx(HS_LV)),
          f"{hs_moved} of {len(idx(HS_LV))} HS / travel cases moved")
    # exactly by the multipliers: P(y) ~ P_without(y) x factor(y), renormalised
    worst_pv = 0.0
    for i in idx(HS_LV):
        c = inp["cases"][i]
        a = [py_pitch(d) for d in ARS[c["a"]]]
        e.resolve_speeds(a)
        s = e.Situation(c["b"], c["k"], c["o"], tuple(c["bases"]), level=c["lv"], same_side=c["same"], pitch_count=c["pc"])
        f = e.pitch_velo_factors(a[c["i"]], s, a)
        m = {"ball": f[0], "wp_ball": f[0], "hbp": f[1], "cstrike": f[2], "whiff": f[3], "foul": f[4], "weak": f[5], "solid": f[5], "hard": f[5]}
        x = {k: v * m[k] for k, v in R_nopv["cases"][i]["op"].items()}
        t = sum(x.values())
        worst_pv = max(worst_pv, max(abs(x[k] / t - R_core["cases"][i]["op"][k]) for k in x))
    check("HS / travel: the outcome mix is the count layer's mix x the table's six multipliers, renormalised (as the fit)",
          worst_pv < 1e-12, f"largest difference {worst_pv:.1e}")
    ok_rest = all(same_case(R_nopv["cases"][i], R_zone["cases"][i]) for i in idx(("mlb", "college_d2", "college_d3")))
    d1hs = sum(not same_case(R_nopv["cases"][i], R_zone["cases"][i]) for i in idx(("college_d1", "hs", "travel")))
    ex_rest = all(R_nopv["extras"][lv] == R_zone["extras"][lv] for lv in ("mlb", "college_d2", "college_d3"))
    check("count / run v13core off (back to v13refit with the core's in-play tables, zone_v13 kept): MLB / D2 / D3 bit for bit (outcomes, in-play values, "
          "kappas, run scale, stakes); D1 and HS / travel move", ok_rest and ex_rest and d1hs == len(idx(("college_d1", "hs", "travel"))),
          f"{d1hs} D1 / HS cases moved")
    check("zone_v13 off (back to zone_v13refit, count / run v13refit = the refit tip): run scale, count stakes and "
          "called-strike kappas don't move; outcomes do at every level",
          R_zone["extras"] == R_refit["extras"] and all(R_zone["cases"][i]["kap"] == R_refit["cases"][i]["kap"] for i in range(len(lv_of)))
          and all(any(TT.worst(R_zone["cases"][i]["op"], R_refit["cases"][i]["op"]) > 1e-9 for i in idx((lv,))) for lv in TT.LEVELS))
    moved = {nm: sum(TT.worst(a_, b_) == float("inf") for a_, b_ in zip(ra["calls"], rb["calls"]))
             for nm, ra, rb in (("zone", R_zone, R_refit), ("count+run", R_nopv, R_zone), ("pitch_velo", R_core, R_nopv))}
    print(f"       calls whose ranking changed (of {len(inp['calls'])}): {moved}")
    # gb_kind (P3): only sinkers' ball-in-play values
    Zg = copy.deepcopy(Z); Zg["class"].pop("gb_kind")
    R_nogb = json.loads(TT.run_py(HERE, inp, {"PITCH_ZONE_TABLE": scratch(tmp, "zone", Zg, "nogb")}))
    si = [i for i, c in enumerate(inp["cases"]) if ARS[c["a"]][c["i"]]["kind"] == "SI"]
    ok_g = (all(same_case(R_core["cases"][i], R_nogb["cases"][i], ("op", "z", "kap")) for i in range(len(lv_of)))
            and all(R_core["cases"][i]["ipv"] == R_nogb["cases"][i]["ipv"] for i in range(len(lv_of)) if i not in si)
            and all(R_core["cases"][i]["ipv"] != R_nogb["cases"][i]["ipv"] for i in si))
    check("gb_kind off (P3 back to the engine's x1.67): only sinkers' ball-in-play values move", ok_g and bool(si), f"{len(si)} sinker cases")
    Zh = copy.deepcopy(Z); Zh["class"].pop("hanger_gate")
    R_noh = json.loads(TT.run_py(HERE, inp, {"PITCH_ZONE_TABLE": scratch(tmp, "zone", Zh, "nohg")}))
    check("hanger gate: H = 0 is bit for bit the key absent (outcomes, in-play values, calls)", R_noh == R_core)

    # 4. D2 / D3 keep v1.2's count layer --------------------------------------------------------------------------------
    v12_keys = ("swing", "whiff", "foul", "hard", "swing_base_out", "bip_gb")
    ok = all(C["levels"][lv][k] == C12["levels"][lv][k] for lv in ("college_d2", "college_d3") for k in v12_keys)
    ok_r = all(C["levels"][lv][k] == CR["levels"][lv][k] for lv in ("college_d2", "college_d3") for k in ("cstrike",)) \
        and all(C["levels"][lv]["out_table"] == {c: {t: list(v) for t, v in IT.OUT_TABLE[lv][c].items()} for c in IT.OUT_TABLE[lv]}
                and C["levels"][lv]["runner"] == {k: IT.RUNNER_FIT[lv][k] for k in ("p_GB", "p_FB", "S_DP")}
                for lv in C["levels"] if "out_table" in C["levels"][lv])
    lab = all("v1.2 count layer pending the coverage rule" in C["levels"][lv].get("label", "") for lv in ("college_d2", "college_d3"))
    check("D2 / D3 count numbers are v1.2's (count terms, base-out swing, ground ball by count), labelled 'v1.2 count layer "
          "pending the coverage rule'; kappas the shared refit's; every level's in-play tables the level recalibration's "
          "(inplay_typed_params.py)", ok and ok_r and lab)
    check("run_v13core: D1 and HS re / cv from the fits, D3 and MLB the refit's, no D2 entry (release_guard_d2 still trips)",
          R["levels"]["college_d3"] == RR["levels"]["college_d3"] and R["levels"]["mlb"] == RR["levels"]["mlb"]
          and "college_d2" not in R["levels"] and R["levels"]["college_d1"]["re"] != RR["levels"]["college_d1"]["re"]
          and R["levels"]["hs"]["cv"]["0-0"] == 0 and {"RE", "CV", "LW"} <= set(e.D2_PLACEHOLDERS))
    nip = lambda L: {k: v for k, v in L.items() if k not in ("out_table", "runner")}
    check("count_v13core: MLB is the refit's count layer (in-play tables the recalibration's); D1 and HS are the calibrated candidates (labelled)",
          nip(C["levels"]["mlb"]) == nip(CR["levels"]["mlb"]) and all("PROVISIONAL count candidate" in C["levels"][lv]["label"] for lv in ("college_d1", "hs")))

    # 5. the hanger gate ------------------------------------------------------------------------------------------------
    old = e.use_zone_table(dict(copy.deepcopy(Z), **{"class": dict(Z["class"], hanger_gate=0.5)}))
    try:
        a = [py_pitch(d) for d in TT.ARS[1]]
        e.resolve_speeds(a)
        sl, fb = a[2], a[0]
        bad = []
        for wt in (-0.2, 0.0, 0.06, 0.15, 0.30, 0.45, 0.6):
            for p, q in ((sl, "middle"), (sl, "down-away"), (fb, "middle")):
                s = e.Situation(1, 1, 0, (False, False, False), level="college_d1", wild_true={p.name: wt})
                z1 = {}; e.outcome_probs(p, q, s, a, zout=z1)
                e.HANGER_GATE = 0.0
                z0 = {}; e.outcome_probs(p, q, s, a, zout=z0)
                e.HANGER_GATE = 0.5
                want = (0.5 * min(1.0, wt / 0.30) if wt > 0 else 0.0) if e.is_offspeed(p.kind) else 0.0
                lg = lambda x: math.log(x / (1 - x))
                dz = lg(z1["heart"]["H"]) - lg(z0["heart"]["H"])
                if abs(dz - want) > 1e-9 or abs(e.hanger_gate(p, s) - want) > 1e-15:
                    bad.append((p.kind, q, wt, dz, want))
                for band in ("edge", "off", "noncomp"):
                    if z1[band] != z0[band]:
                        bad.append((p.kind, q, wt, band))
                if any(z1["heart"][f] != z0["heart"][f] for f in ("L", "S", "C", "W", "F")):
                    bad.append((p.kind, q, wt, "heart S/C/W/F"))
        check("hanger gate H = 0.5: an off-speed pitch over the heart gets exactly H x min(1, wild_today / 0.30) more hard-contact "
              "logit when wild_today > 0 (0.06 -> 0.1, 0.15 -> 0.25, 0.30+ -> 0.5), nothing when wild_today <= 0; the fastball, "
              "the other bands and swing / take / whiff / foul never move", not bad, f"{bad[:4]}")
    finally:
        e.use_zone_table(old)
    check("use_zone_table restores the default zone table and H = 0", e.TABLE_VERSIONS["zone"] == "v13" and e.HANGER_GATE == 0.0)
    zg = scratch(tmp, "zone", dict(copy.deepcopy(Z), **{"class": dict(Z["class"], hanger_gate=0.5)}), "gate")
    dg = os.path.join(tmp, "engine_data_gate.json")
    TT.export({"PITCH_ZONE_TABLE": zg}, dg)
    gcases = [dict(lv=lv, b=b, k=k, a=a_, i=i, q=q, wild={ARS[a_][i]["name"]: w})
              for lv in ("college_d1", "hs", "college_d3") for (b, k) in ((0, 0), (1, 1), (3, 2)) for a_ in (0, 2)
              for i in range(4) for q in ("middle", "down-away") for w in (-0.1, 0.12, 0.4)]
    gin = {"ars": ARS, "cases": gcases}
    gp, gj = run_gate("py", gin, {"PITCH_ZONE_TABLE": zg}), run_gate("js", gin, data=dg)
    g0 = run_gate("js", gin, data=os.path.join(HERE, "app", "engine_data.json"))
    w = TT.worst(gp, gj)
    moved_js = sum(TT.worst(x["H"], y["H"]) > 1e-12 for x, y in zip(gj, g0))
    want_js = sum(1 for c in gcases if ARS[c["a"]][c["i"]]["kind"] in ("SL", "CB", "CH") and list(c["wild"].values())[0] > 0)
    check(f"hanger gate H = 0.5, Python = JS on {len(gcases)} cases (off-speed / fastball, wild_today -0.1 / 0.12 / 0.4; within 1e-9), "
          "and in JS it moves exactly the off-speed cases with wild_today > 0", w <= 1e-9 and moved_js == want_js,
          f"largest difference {w:.1e}; JS moved {moved_js}, expected {want_js}")

    # 6. HS pitch kind x velocity ---------------------------------------------------------------------------------------
    T = C["levels"]["hs"]["pitch_velo"]
    src = os.path.join(os.environ.get("PITCHIQ_DATA", "C:/dev/pitchiq-data"), "fits", "hs", "pitch_velo_thru2025.json")
    if os.path.exists(src):
        check("count_v13core.levels.hs.pitch_velo is the fit's export (fits/hs/pitch_velo_thru2025.json)", T == json.load(open(src, encoding="utf8")))
    check("pitch_velo is the +0.0104 fit's stack: kind (Fastball / Curveball / Slider / Change-Up / other), velocity relative "
          "to his class mean (edges -3 / -1 / 1 / 3 mph) and absolute per class, six events each",
          T["kinds"] == ["Fastball", "Curveball", "Slider", "Change-Up", "other"] and T["vrel_edges"] == [-3.0, -1.0, 1.0, 3.0]
          and T["vabs_edges"] == {"fastball": [70.0, 75.0, 80.0, 85.0], "breaking": [60.0, 65.0, 70.0, 75.0], "offspeed": [65.0, 70.0, 75.0, 80.0]}
          and T["outcomes"] == ["ball", "hbp", "cstrike", "whiff", "foul", "inplay"] and T["seasons"] == [2022, 2023, 2024, 2025])
    a = [py_pitch(d) for d in ARS_HS]
    e.resolve_speeds(a)
    s = e.Situation(1, 2, 0, (False, False, False), level="hs")
    c_ = "1-2"
    mul = lambda *v: [v[0][i] * v[1][i] * v[2][i] for i in range(6)]
    exp_fb = mul(T["kind"][c_]["Fastball"], T["velo_rel"][c_]["fastball"][3], T["velo_abs"][c_]["fastball"][3])   # 84 vs mean 82: +2; 80 <= 84 < 85
    exp_si = mul(T["kind"][c_]["Fastball"], T["velo_rel"][c_]["fastball"][1], T["velo_abs"][c_]["fastball"][3])   # 80 vs 82: -2; 80 -> bin 3
    exp_cb = mul(T["kind"][c_]["Curveball"], T["velo_rel"][c_]["breaking"][2], T["velo_abs"][c_]["breaking"][2])  # alone in class: 0; 65 <= 68 < 70
    exp_ch = T["kind"][c_]["Change-Up"]                                                                          # no speed: kind only
    got = [e.pitch_velo_factors(x, s, a) for x in a]
    p85 = py_pitch(dict(ARS_HS[0], velo=85))
    a85 = [p85] + a[1:]
    e.resolve_speeds(a85)
    f85 = e.pitch_velo_factors(p85, s, a85)
    exp85 = mul(T["kind"][c_]["Fastball"], T["velo_rel"][c_]["fastball"][3], T["velo_abs"][c_]["fastball"][4])     # +2.5; 85 = edge -> top bin
    check("pitch_velo_factors: kind x relative bin x absolute bin from the arsenal's entered speeds (relative to his class "
          "mean; an edge belongs to the bin above, as np.digitize); a pitch with no entered speed gets the kind term only",
          got == [exp_fb, exp_si, exp_cb, exp_ch] and f85 == exp85)
    check("pitch kind x velocity applies at HS and travel only (none at MLB / D1 / D2 / D3), and the mix still sums to 1",
          all(e.pitch_velo_factors(a[0], e.Situation(0, 0, 0, (False, False, False), level=lv), a) is None for lv in NON_HS)
          and e.pitch_velo_factors(a[0], e.Situation(0, 0, 0, (False, False, False), level="travel"), a) is not None
          and abs(sum(e.outcome_probs(a[3], "down-away", s, a).values()) - 1) < 1e-12)
    bad_t = copy.deepcopy(C); bad_t["levels"]["college_d1"]["pitch_velo"] = T
    try:
        e.check_table(bad_t, "count_bad.json"); refused = False
    except ValueError:
        refused = True
    check("a pitch_velo table at a level other than hs is refused by the format check", refused)

    # 7. Python = JS on the defaults --------------------------------------------------------------------------------------
    R_js = json.loads(TT.run_js(HERE, inp))
    w = TT.worst(R_core, R_js)
    check(f"Python = JS on the core defaults: {len(inp['cases'])} outcome cases at every level (HS / travel with entered "
          f"speeds and a missing one), {len(inp['calls'])} full calls, run scale and stakes (within 1e-9)", w <= 1e-9,
          f"largest difference {w:.1e}")
    inp_hs = {"ars": ARS, "cases": cases(160, 43, HS_LV, (2,)), "calls": calls(10, 44, HS_LV, (0, 1, 2)), "levels": list(HS_LV)}
    w = TT.worst(json.loads(TT.run_py(HERE, inp_hs)), json.loads(TT.run_js(HERE, inp_hs)))
    check("Python = JS at HS / travel: 160 outcome cases on the HS arsenal (two fastballs, a curve, a changeup with no speed) "
          "and 10 full calls (within 1e-9)", w <= 1e-9, f"largest difference {w:.1e}")

    n_bad = sum(1 for _, ok in results if not ok)
    print(f"\n{len(results) - n_bad}/{len(results)} checks passed")
    sys.exit(1 if n_bad else 0)


if __name__ == "__main__":
    main()
