"""Part 13 ruling 49: 2025 effect per level (core vs raw v1.2, pitch_5way nats per pitch) against MIN_EFFECT 0.002.
  python results/v13p13/effect_sizes.py C:/dev/pitchiq-data-final/p13/score_tip/scores.json
Reads only the 2025 scores.json written by score_core. MLB is not a level of the h3 harness (no MLB season is scored)."""
import json, sys
MIN = 0.002
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d["season"] == 2025 and not d.get("heldout_touched"), (d["season"], d.get("heldout_touched"))
print("| level | games / pitches | reference | improvement (nats/pitch) | SE | z | > 2 SE | >= 0.002 |")
print("|---|---|---|---|---|---|---|---|")
allc = True
for lv in ("HS", "D3", "D2", "D1"):
    r = d["levels"][lv]
    s = r["scores"]["summary"] if "summary" in r.get("scores", {}) else r["summary"]
    diff, se = s["core_minus_ref"]
    imp = -diff
    ok = imp >= MIN
    allc &= ok
    print(f"| {lv} | {r['n_games']:,} / {r['n_pitches']:,} | {s['pass_ref']} | {imp:.5f} | {se:.5f} | {diff / se:+.1f} | "
          f"{'yes' if diff < -2 * se else 'no'} | {'yes' if ok else 'NO'} (margin {imp - MIN:+.5f}) |")
print(f"\nALL FOUR >= {MIN}: {allc}")
