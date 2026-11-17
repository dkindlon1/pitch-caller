"""Contrast of the film's overlaid text against what is actually behind it, from a final_shots.js capture folder.

  python web/tests/final_contrast.py <folder> [view ...]

axe cannot judge text that sits over a picture, so this does: for every film shot and every showing block of copy
(the stop's paragraph, the explanation under the call, the illustration note) it takes the pixels inside the block's box,
sets aside the ones that are the text itself (close to the text colour, and the anti-aliased edge round each letter), and compares the text colour with the
brightest 5% of what is left. That is the worst case a reader meets. WCAG AA wants 4.5:1 for this size of text.
"""
import json, sys, os, glob
from PIL import Image
import numpy as np
from scipy import ndimage

folder = sys.argv[1]
views = sys.argv[2:] or sorted({os.path.basename(p).split("-geo.json")[0] for p in glob.glob(os.path.join(folder, "*-geo.json"))})
TEXT = {".pq-msg p": (197, 199, 207), ".pq-explain": (197, 199, 207), ".pq-illus": (182, 184, 193)}

def lum(c):
    c = np.asarray(c, dtype=np.float64) / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]

for view in views:
    geo = json.load(open(os.path.join(folder, f"{view}-geo.json")))
    worst = []
    for shot, g in geo.items():
        if not shot.startswith("film"): continue
        f = os.path.join(folder, f"{view}-{shot}.png")
        if not os.path.exists(f): continue
        im = np.asarray(Image.open(f).convert("RGB")); k = im.shape[1] / g["vw"]
        for e in g["els"]:
            if e["s"] not in TEXT or e["o"] < 0.95: continue
            x0, y0, x1, y1 = [int(round(v * k)) for v in (max(0, e["x"]), max(0, e["y"]), min(g["vw"], e["x"] + e["w"]), min(g["vh"], e["y"] + e["h"]))]
            box = im[y0:y1, x0:x1].astype(np.int32)
            if box.size < 150: continue
            col = np.array(TEXT[e["s"]])
            ink = np.abs(box - col).max(axis=2) <= 60                 # the text itself (nearly its colour)...
            ink = ndimage.binary_dilation(ink, iterations=max(2, round(1.5 * k)))   # ...and the soft edge round each letter
            bg = box[~ink]
            if len(bg) < 50: continue
            lb = np.percentile(lum(bg), 95); lt = lum(col)
            ratio = (max(lt, lb) + 0.05) / (min(lt, lb) + 0.05)
            worst.append((ratio, shot, e["s"], e["i"]))
    worst.sort()
    bad = [w for w in worst if w[0] < 4.5]
    print(f"== {view}: {len(worst)} blocks of film copy measured, {len(bad)} under 4.5:1; lowest {worst[0][0]:.2f}:1" if worst else f"== {view}: nothing measured")
    for r, shot, s, i in worst[:6]: print(f"   {r:5.2f}:1  {shot}  {s}[{i}]")
