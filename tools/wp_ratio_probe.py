"""v1.0 Phase 4c sensitivity: band B8b has to hold at off-speed:fastball wild-pitch ratios of 2:1 and 4:1, not just
at the fitted 3:1 (0.12 / 0.04).

B8b is "with a runner on 3rd, the off-speed share is at least 60% of the bases-empty share". The wild-pitch constants
are exactly what makes the engine shy away from off-speed with a runner on 3rd, so the ratio between them is the knob
that band is most exposed to. The level multiplier from 4c is kept; only the shape changes, with the off-speed and
fastball values moved apart around the same geometric mean so the overall wild-pitch rate barely moves.

The call sheet runs its grid in subprocesses, which import engine.py fresh, so the ratio has to be on disk while they
run. This script edits WP_BASE in engine.py, runs the CI call sheet, and puts the file back -- including if it fails.

usage (repo root): python3 tools/wp_ratio_probe.py [--tier ci]
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, "engine.py")
RATIOS = (2.0, 3.0, 4.0)        # 3.0 is the shipped shape, run as the control
GEOM = (0.12 * 0.04) ** 0.5     # 0.0693: hold the geometric mean, so only the ratio moves


def set_ratio(r):
    """WP_BASE with the given off-speed:fastball ratio and the shipped geometric mean."""
    os_v, fb_v = GEOM * r ** 0.5, GEOM / r ** 0.5
    src = open(ENGINE, encoding="utf-8").read()
    new = 'WP_BASE = {"OS": %.6f, "FB": %.6f}' % (os_v, fb_v)
    src2, n = re.subn(r'WP_BASE = \{"OS": [0-9.]+, "FB": [0-9.]+\}', new, src, count=1)
    if n != 1:
        sys.exit("could not find WP_BASE in engine.py")
    open(ENGINE, "w", encoding="utf-8", newline="\n").write(src2)
    return os_v, fb_v


def main():
    tier = sys.argv[sys.argv.index("--tier") + 1] if "--tier" in sys.argv else "ci"
    backup = os.path.join(tempfile.gettempdir(), "engine.wp_probe_backup.py")
    shutil.copy2(ENGINE, backup)
    rows = []
    try:
        for r in RATIOS:
            os_v, fb_v = set_ratio(r)
            tag = f"wp_ratio_{int(r)}to1"
            print(f"\n=== off-speed:fastball {r:.0f}:1  (OS {os_v:.4f}, FB {fb_v:.4f}) ===", flush=True)
            subprocess.run([sys.executable, os.path.join(ROOT, "app", "export_data.py")], cwd=ROOT, check=True,
                           stdout=subprocess.DEVNULL)
            p = subprocess.run([sys.executable, os.path.join(ROOT, "callsheet.py"), "--tier", tier, "--jobs", "8",
                                "--tag", tag], cwd=ROOT, capture_output=True, text=True)
            line = next((ln for ln in p.stdout.splitlines() if ln.strip().startswith("B8b")), "B8b not reported")
            fails = next((ln for ln in p.stdout.splitlines() if "enforced band(s) failed" in ln), "")
            print("  " + line.strip(), flush=True)
            print("  " + fails.strip(), flush=True)
            rows.append((r, line.strip(), fails.strip()))
    finally:
        shutil.copy2(backup, ENGINE)
        subprocess.run([sys.executable, os.path.join(ROOT, "app", "export_data.py")], cwd=ROOT,
                       stdout=subprocess.DEVNULL)
        print("\nengine.py and app/engine_data.json restored", flush=True)
    print("\n4c ratio sensitivity (band B8b):")
    for r, line, fails in rows:
        print(f"  {r:.0f}:1  {line}")
    print("  B8b must pass at every ratio; 3:1 is the shipped shape.")


if __name__ == "__main__":
    main()
