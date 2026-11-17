"""Contact sheets, close-ups and measurements from a final_shots.js capture folder.

  python web/tests/final_sheets.py <folder> [view ...]

Writes into <folder>/_sheets:
  <view>-<group>-sheet-N.jpg   overview grids (layout only: they are JPEG thumbnails, never judge gradients from them)
  <view>-<shot>-watch.png      the middle of the frame at the capture's own pixels (lossless), for 2x views
  <view>-<shot>-boost.png      the same frame's background with contrast x6, to show banding, steps and edges
and prints, from the saved geometry: sideways overflow, elements cut off by the viewport, headline line counts over
two, and pairs of showing text blocks that overlap.
"""
import json, sys, os, glob
from PIL import Image, ImageDraw
import numpy as np

folder = sys.argv[1]
views = sys.argv[2:] or sorted({os.path.basename(p).split("-geo.json")[0] for p in glob.glob(os.path.join(folder, "*-geo.json"))})
out = os.path.join(folder, "_sheets"); os.makedirs(out, exist_ok=True)

def sheet(view, group, files, cols, tile_w):
    if not files: return
    per = cols * 3
    for n in range(0, len(files), per):
        part = files[n:n + per]
        ims = [Image.open(f).convert("RGB") for f in part]
        th = round(tile_w * ims[0].height / ims[0].width)
        rows = (len(part) + cols - 1) // cols
        S = Image.new("RGB", (cols * tile_w + (cols + 1) * 6, rows * (th + 22) + 6), (40, 40, 44))
        d = ImageDraw.Draw(S)
        for i, im in enumerate(ims):
            x = 6 + (i % cols) * (tile_w + 6); y = 6 + (i // cols) * (th + 22)
            S.paste(im.resize((tile_w, th), Image.LANCZOS), (x, y))
            d.text((x + 2, y + th + 4), os.path.basename(part[i]).replace(view + "-", "").replace(".png", ""), fill=(230, 230, 230))
        S.save(os.path.join(out, f"{view}-{group}-sheet-{n // per + 1}.jpg"), quality=88)

def boost(im, k=6.0):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    return Image.fromarray(np.clip((a - 14.0) * k + 14.0, 0, 255).astype(np.uint8))

def inter(a, b):
    x = max(a["x"], b["x"]); y = max(a["y"], b["y"]); x2 = min(a["x"] + a["w"], b["x"] + b["w"]); y2 = min(a["y"] + a["h"], b["y"] + b["h"])
    return max(0, x2 - x) * max(0, y2 - y)

TEXT = {".pq-msg", ".pq-ledger", ".pq-chip", ".pq-word", ".pq-landed", ".pq-explain", ".pq-rail", ".pq-illus", ".pq-pgtitle", ".pq-ctl", ".pq-mix", ".pq-reset", ".pq-nav-pill"}
for view in views:
    files = sorted(glob.glob(os.path.join(folder, f"{view}-*.png")))
    tall = Image.open(files[0]).height > Image.open(files[0]).width if files else False
    for group in ("film", "hand", "sec", "pg"):
        sheet(view, group, [f for f in files if os.path.basename(f).startswith(f"{view}-{group}-")], 6 if tall else 3, 250 if tall else 520)
    geo = json.load(open(os.path.join(folder, f"{view}-geo.json")))
    issues = []
    for shot, g in geo.items():
        vw, vh = g["vw"], g["vh"]
        if g["sw"] > vw: issues.append(f"{shot}: page is {g['sw']} wide in a {vw} viewport")
        els = [e for e in g["els"] if e["s"] in TEXT and e["o"] >= 0.5]
        for e in g["els"]:
            if e.get("lines") and e["lines"] > 2 and e["o"] >= 0.5: issues.append(f"{shot}: {e['s']}[{e['i']}] headline runs to {e['lines']} lines")
        if not shot.startswith("sec"):
            for e in els:
                if e["s"] == ".pq-word": continue
                if e["x"] < 0 or e["y"] < 0 or e["x"] + e["w"] > vw + 1 or e["y"] + e["h"] > vh + 1: issues.append(f"{shot}: {e['s']}[{e['i']}] leaves the viewport ({e['x']},{e['y']} {e['w']}x{e['h']}, opacity {e['o']})")
            for i in range(len(els)):
                for j in range(i + 1, len(els)):
                    a, b = els[i], els[j]
                    if a["s"] == b["s"] == ".pq-msg": pass
                    ov = inter(a, b)
                    if ov > 60: issues.append(f"{shot}: {a['s']}[{a['i']}] (o {a['o']}) overlaps {b['s']}[{b['i']}] (o {b['o']}) by {ov} px2")
    print(f"== {view}: {len(files)} shots, {len(issues)} geometry flags")
    for s in issues: print("   " + s)
    # close-ups for the 2x captures
    for f in files:
        name = os.path.basename(f)[len(view) + 1:-4]
        if not (name.startswith("film") or name.startswith("pg")): continue
        im = Image.open(f)
        scale = im.width / geo[name]["vw"] if name in geo else 1
        if scale < 1.5: continue
        W, H = im.size
        box = (0, round(H * 0.18), W, round(H * 0.86)) if tall else (round(W * 0.27), round(H * 0.04), round(W * 0.73), round(H * 0.96))
        im.crop(box).save(os.path.join(out, f"{view}-{name}-watch.png"))
        if name in ("film-010", "film-030", "film-045", "film-060", "film-070", "film-090"):
            boost(im.resize((W // 2, H // 2), Image.BOX)).save(os.path.join(out, f"{view}-{name}-boost.png"))
