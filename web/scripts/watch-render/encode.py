# Encode the rendered film for the site and check it.
#   python encode.py [--quality 80]
#   python encode.py --lo-only     only rebuild the small sheets, from the encoded frames (no rendered masters needed)
# Reads frames/{wide,tall}/f_0000.png ... and frames/cut-{wide,tall}/f_0149.png (rendered with --alpha), writes
#   public/media/film/watch/{wide,tall}/0001.webp ...   the film
#   public/media/film/watch/{wide,tall}-lo-{1,2,3}.webp  every frame at an eighth of the size, 50 to a sheet (what the
#                                                        scrub shows until a sharp frame is in: _components/filmFrames.ts)
#   public/media/film/watch/poster.jpg, tall-poster.jpg  the last frame (reduced motion)
#   public/media/film/watch/first.jpg, tall-first.jpg    the first frame (what the canvas shows until its frames load)
#   public/media/film/watch/cut-{wide,tall}.webp         the watch lifted off the last frame (transparent ground)
#   public/media/film/watch/head.webp                    the watch head, cropped from the wide cut-out
# and prints: the four corner colors of every encoded frame (they must be the page's ground, #0c0b0e), where the
# watch's screen sits in the last frame (Film.tsx SCREEN), and the total weight of each set.
import os, sys, glob, collections
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "media", "film", "watch"))
Q = int(sys.argv[sys.argv.index("--quality") + 1]) if "--quality" in sys.argv else 80
GROUND = (0x0c, 0x0b, 0x0e)

def screen_rect(im):
    # the lit screen is the only large near-white area in the last frame
    w, h = im.size; L = np.asarray(im.convert("L")); cy, cx = h // 2, w // 2
    row = np.where(L[cy] > 225)[0]; col = np.where(L[:, cx] > 225)[0]
    return [round(row.min() / w, 4), round(col.min() / h, 4), round((row.max() + 1) / w, 4), round((col.max() + 1) / h, 4)]

def flatten(im):
    """The renderer leaves the empty ground within a level or two of #0c0b0e (16-bit rounding, the denoiser). Snap every
    such pixel to exactly the ground color, so the master frames are flat where nothing is drawn."""
    a = np.asarray(im).astype(np.int16); g = np.array(GROUND, dtype=np.int16)
    near = (np.abs(a - g).max(axis=2) <= 3)
    a[near] = g
    return Image.fromarray(a.astype(np.uint8), "RGB"), float(near.mean())

LO_PER, LO_COLS, LO_DIV = 50, 10, 8      # as in _components/filmFrames.ts

def lo_sheets(name):
    files = sorted(glob.glob(os.path.join(OUT, name, "[0-9]*.webp")))
    for old in glob.glob(os.path.join(OUT, f"{name}-lo-*.webp")): os.remove(old)
    w, h = Image.open(files[0]).size; cw, ch = w // LO_DIV, h // LO_DIV; total = 0
    for s in range(0, len(files), LO_PER):
        part = files[s:s + LO_PER]
        sheet = Image.new("RGB", (LO_COLS * cw, -(-len(part) // LO_COLS) * ch), GROUND)
        for i, f in enumerate(part):
            sheet.paste(Image.open(f).convert("RGB").resize((cw, ch), Image.LANCZOS), ((i % LO_COLS) * cw, (i // LO_COLS) * ch))
        p = os.path.join(OUT, f"{name}-lo-{s // LO_PER + 1}.webp")
        sheet.save(p, "WEBP", quality=55, method=6); total += os.path.getsize(p)
    print(f"{name}: small copies {cw}x{ch}, {-(-len(files) // LO_PER)} sheets, {total / 1e3:.0f} KB")

if "--lo-only" in sys.argv:
    for name in ("wide", "tall"): lo_sheets(name)
    sys.exit(0)

for name in ("wide", "tall"):
    files = sorted(glob.glob(os.path.join(HERE, "frames", name, "f_*.png")))
    dst = os.path.join(OUT, name); os.makedirs(dst, exist_ok=True)
    for old in glob.glob(os.path.join(dst, "*.webp")): os.remove(old)
    total, worst, bad, seen, flat = 0, 0, 0, collections.Counter(), 0.0
    for i, f in enumerate(files):
        im, share = flatten(Image.open(f).convert("RGB")); flat += share
        p = os.path.join(dst, f"{i + 1:04d}.webp")
        im.save(p, "WEBP", quality=Q, method=6)
        total += os.path.getsize(p)
        back = Image.open(p).convert("RGB"); w, h = back.size
        for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
            c = back.getpixel(xy); d = max(abs(a - b) for a, b in zip(c, GROUND))
            # a part of the watch can cross an edge mid-flight; only count a point as ground if the render had ground there
            if im.getpixel(xy) == GROUND:
                worst = max(worst, d); bad += d > 0; seen[c] += 1
    last = flatten(Image.open(files[-1]).convert("RGB"))[0]
    last.save(os.path.join(OUT, "poster.jpg" if name == "wide" else "tall-poster.jpg"), "JPEG", quality=88, optimize=True, progressive=True)
    flatten(Image.open(files[0]).convert("RGB"))[0].save(os.path.join(OUT, "first.jpg" if name == "wide" else "tall-first.jpg"), "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{name}: {len(files)} frames {last.size}, {total / 1e6:.2f} MB, avg {total / len(files) / 1e3:.0f} KB; ground is {flat / len(files):.0%} of the picture; edge points that are ground in the master decode from WebP as {dict(seen)} (worst channel difference from #0c0b0e: {worst}); screen {screen_rect(last)}")
    lo_sheets(name)
    cut = Image.open(os.path.join(HERE, "frames", f"cut-{name}", f"f_{len(files) - 1:04d}.png")).convert("RGBA")
    cut.save(os.path.join(OUT, f"cut-{name}.webp"), "WEBP", quality=86, method=6)
    if name == "wide":
        w, h = cut.size
        head = cut.crop((round(w * 0.36), round(h * 0.22), round(w * 0.64), round(h * 0.78)))
        head.save(os.path.join(OUT, "head.webp"), "WEBP", quality=86, method=6)
        print("head", head.size, os.path.getsize(os.path.join(OUT, "head.webp")) // 1000, "KB; cut-wide", os.path.getsize(os.path.join(OUT, "cut-wide.webp")) // 1000, "KB")
