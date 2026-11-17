"""Cut-out masks for the watch film, one per frame, packed into one sheet per frame set.

The light behind the watch (app/(marketing)/_components/atmosGL.ts) must fall only on the film's empty ground, never
on the watch. A per-pixel colour test cannot tell the watch's dark screen or black strap from the near-black ground, so
the mask is made here, once, from the frames themselves: the ground is one flat colour (#0c0b0e), and only ground that
is connected to the edge of the frame counts as background. Everything else, including dark areas enclosed by the
watch, is the watch. The mask is shrunk with an area filter (soft, anti-aliased edges) and packed into a grid.

Run from web/:  python3 scripts/film-masks.py
Needs: Pillow, numpy, scipy. Re-run whenever the film frames are re-rendered.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent / "public" / "media" / "film" / "watch"
GROUND = np.array([12, 11, 14], dtype=np.int16)
TOL = 7                      # lossy WebP moves the flat ground by a level or two
COLS = 10
SETS = {"wide": (320, 200), "tall": (160, 248)}   # tile size; sheets stay under 4096 px on each side


def mask_of(path: Path, tile: tuple[int, int]) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)
    near = np.abs(rgb - GROUND).max(axis=2) <= TOL
    labels, _ = ndimage.label(near, structure=np.ones((3, 3), dtype=bool))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, edge[edge > 0])
    solid = (~background).astype(np.uint8) * 255
    small = Image.fromarray(solid, "L").resize(tile, Image.BOX)
    return small.filter(ImageFilter.GaussianBlur(0.6))


def main() -> None:
    meta = {}
    for name, tile in SETS.items():
        frames = sorted((ROOT / name).glob("*.webp"))
        if not frames:
            sys.exit(f"no frames in {ROOT / name}")
        rows = (len(frames) + COLS - 1) // COLS
        sheet = Image.new("L", (tile[0] * COLS, tile[1] * rows), 0)
        for i, f in enumerate(frames):
            sheet.paste(mask_of(f, tile), ((i % COLS) * tile[0], (i // COLS) * tile[1]))
        out = ROOT / f"{name}-mask.png"
        sheet.save(out, optimize=True)
        fw, fh = Image.open(frames[0]).size
        meta[name] = {"count": len(frames), "cols": COLS, "rows": rows, "tile": list(tile), "sheet": [sheet.width, sheet.height], "frame": [fw, fh]}
        print(f"{out.name}: {len(frames)} frames, {sheet.width}x{sheet.height}, {out.stat().st_size // 1024} KB")
    (ROOT / "masks.json").write_text(json.dumps(meta, indent=1) + "\n")


if __name__ == "__main__":
    main()
