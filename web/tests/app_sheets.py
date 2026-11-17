"""Contact sheets for the app v2 visual loop. Tiles every PNG in <dir>/raw that matches a suffix, name above each.
   python web/tests/app_sheets.py <dir> <suffix, e.g. __laptop__fold.png> [tile width=480] [per sheet=12] [crop height in tile px, 0 = whole]"""
import sys, os, math
from PIL import Image, ImageDraw
d, suf = sys.argv[1], sys.argv[2]
tw = int(sys.argv[3]) if len(sys.argv) > 3 else 480
per = int(sys.argv[4]) if len(sys.argv) > 4 else 12
crop = int(sys.argv[5]) if len(sys.argv) > 5 else 0
files = sorted(f for f in os.listdir(os.path.join(d, "raw")) if f.endswith(suf))
cols = 4
for n in range(0, len(files), per):
    part = files[n:n + per]; tiles = []
    for f in part:
        im = Image.open(os.path.join(d, "raw", f)).convert("RGB")
        im = im.resize((tw, max(1, round(im.height * tw / im.width))), Image.LANCZOS)
        if crop and im.height > crop: im = im.crop((0, 0, tw, crop))
        tiles.append((f[: -len(suf)], im))
    th = max(t.height for _, t in tiles) + 26
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new("RGB", (cols * (tw + 10) + 10, rows * (th + 10) + 10), (34, 34, 38)); dr = ImageDraw.Draw(sheet)
    for i, (name, t) in enumerate(tiles):
        x, y = 10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th + 10)
        dr.text((x, y + 4), name, fill=(236, 235, 230)); sheet.paste(t, (x, y + 24))
    out = os.path.join(d, f"sheet{suf[:-4].replace('__fold', '')}__{n // per + 1}.png")
    sheet.save(out, optimize=True); print(out, sheet.size)
