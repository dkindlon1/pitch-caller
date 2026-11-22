"""Markdown tables for docs/HARNESS_v13.md from a harness JSON. usage: python -m hitter_data.harness_report <json>"""
import json
import sys


def _se(se):
    return max(se.values())


def tables(path):
    R = json.load(open(path, encoding="utf-8"))
    meta, res = R["meta"], R["results"]
    out = []
    out.append(f"Assumption `{meta['assumption']}` (frozen from {meta['frozen_source_commit']}), engine {meta['engine_sha']}, "
               f"OUTCOME_ADJ sha256 {meta['outcome_adj_sha256']}, B = {meta['boot']}, fit window {meta['fit_window']} "
               f"seasons, half-life {meta['half_life']}. SE = the largest of the game / home-team / two-team bootstrap SEs.")
    out.append("")
    out.append("**Primary metric: pitch_5way log loss per pitch** (lower is better), mean (SE). v1.2 / v1.2_recal = the "
               "level's own v1.2 settings (D2: D1 settings; D3: `v1.2@D3`). Last column: raw minus recal (SE).")
    out.append("")
    out.append("| Level | Season | Games | Pitches | Plan rule | v1.2 | v1.2_recal | base_flat | base_count | base_count_bo | v1.2 - recal |")
    out.append("|---|---|---|---|---|---|---|---|---|---|---|")
    d2rows = []
    for key in sorted(res, key=lambda k: (k[:2], int(k[3:]))):
        e = res[key]
        lv, s = key.split("_")
        pr = e["scores"]["pitch_5way"]
        A = pr["adapters"]
        ref = e["refs"][0]
        raw = ref[:-len("_recal")]
        dv = pr["diff"][ref][raw]
        plan = meta["plan_rule"].get(lv, {}).get("passes")
        cell = lambda nm: f"{A[nm][0]:.4f} ({_se(A[nm][1]):.4f})"
        out.append(f"| {lv} | {s} | {e['n_games']} | {pr['n']:,} | {'pass' if plan else 'fail'} | {cell(raw)} | "
                   f"{cell(ref)} | {cell('base_flat')} | {cell('base_count')} | {cell('base_count_bo')} | "
                   f"{dv[0]:+.4f} ({_se(dv[1]):.4f}) |")
        if lv == "D2":
            d2rows.append((s, A, pr["diff"]))
    if d2rows:
        out.append("")
        out.append("**D2 at both v1.2 settings** (plan 1.5; pre-registered: \"better\" = lower 2025 pitch_5way).")
        out.append("")
        out.append("| Season | v1.2 (D1 settings) | v1.2@D3 | v1.2_recal | v1.2@D3_recal | v1.2@D3 - v1.2 (raw) |")
        out.append("|---|---|---|---|---|---|")
        for s, A, D in d2rows:
            dd = A["v1.2@D3"][0] - A["v1.2"][0]
            out.append(f"| {s} | {A['v1.2'][0]:.4f} | {A['v1.2@D3'][0]:.4f} | {A['v1.2_recal'][0]:.4f} | "
                       f"{A['v1.2@D3_recal'][0]:.4f} | {dd:+.4f} |")
    out.append("")
    out.append("**Secondary metrics** (mean per event; v1.2 / v1.2_recal / base_count). pa_5way and the BIP metrics are "
               "secondary; runs are reported only (not hitter metrics).")
    out.append("")
    out.append("| Level | Season | pa_5way | bip_type_outs | bip_result | swing/take | cs given take | result given swing | runs_pa_sq (v1.2 / base) |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for key in sorted(res, key=lambda k: (k[:2], int(k[3:]))):
        e = res[key]
        lv, s = key.split("_")
        S = e["scores"]
        ref = e["refs"][0]
        raw = ref[:-len("_recal")]
        f3 = lambda r: " / ".join(f"{r['adapters'][nm][0]:.3f}" for nm in (raw, ref, "base_count"))
        rr = S["runs_pa_sq"]["adapters"]
        out.append(f"| {lv} | {s} | {f3(S['pa_5way'])} | {f3(S['bip_type_outs'])} | {f3(S['bip_result'])} | "
                   f"{f3(S['pitch_swing_take'])} | {f3(S['pitch_cstrike_given_take'])} | {f3(S['pitch_result_given_swing'])} | "
                   f"{rr[raw][0]:.3f} / {rr['base_count'][0]:.3f} |")
    # assumption sensitivity, latest season per level
    out.append("")
    out.append("**Assumption sensitivity (2025):** pitch_5way for raw / recalibrated v1.2 under each pitcher assumption.")
    out.append("")
    out.append("| Level | single_a (primary) raw / recal | calib_world (h2, side report) raw / recal | handset raw / recal | calib_more_fb raw / recal | calib_less_fb raw / recal |")
    out.append("|---|---|---|---|---|---|")
    for lv in ("D1", "D2", "D3"):
        e = res.get(f"{lv}_2025")
        if not e:
            continue
        A = e["scores"]["pitch_5way"]["adapters"]
        base = e["refs"][0][:-len("_recal")]
        cells = []
        for an in ("", "[calib_world]", "[handset]", "[calib_more_fb]", "[calib_less_fb]"):
            nm = base + an
            if nm in A:
                cells.append(f"{A[nm][0]:.4f} / {A[nm + '_recal'][0]:.4f}")
            else:
                cells.append("-")
        out.append(f"| {lv} | " + " | ".join(cells) + " |")
    # selection check
    out.append("")
    out.append("**Selection check** (full vs other canonical games, per PA): K / BB / hit.")
    out.append("")
    out.append("| Level | Season | full games: K / BB / hit | other games: K / BB / hit |")
    out.append("|---|---|---|---|")
    for key in sorted(res, key=lambda k: (k[:2], int(k[3:]))):
        e = res[key]
        sel = e.get("selection")
        if not sel:
            continue
        lv, s = key.split("_")
        f = lambda d: f"{d['K']:.3f} / {d['BB']:.3f} / {d['hit']:.3f} ({d['games']} g)"
        out.append(f"| {lv} | {s} | {f(sel['full'])} | {f(sel['other'])} |")
    return "\n".join(out)


if __name__ == "__main__":
    print(tables(sys.argv[1]))
