"""Cut-out masks for the watch film, one per frame, packed into one sheet per frame set.

The light behind the watch (app/(marketing)/_components/atmosGL.ts) must fall only on the film's empty ground, never
on the watch. A per-pixel colour test cannot tell the watch's dark screen or black strap from the near-black ground, so
the mask is made here, once, from the frames themselves: the ground is one flat colour (#0c0b0e), and only ground that
is connected to the edge of the frame counts as background. Everything else, including dark areas enclosed by the
watch, is the watch.

What is stored is not the cut-out itself but the distance to its edge (a signed distance field): mid-grey on the
silhouette, lighter going into the watch, darker going out, over SPREAD film pixels each way. A small tile of distances
gives back an edge far sharper than a small tile of coverage can, so the shader can end the light exactly at the
silhouette and draw the backlit rim a couple of pixels wide. (A coverage mask at this size had edges 7 px soft on a
laptop screen, and the rim drawn from it read as a wide pale halo round the whole watch.)

Run from web/:  python3 scripts/film-masks.py
Needs: Pillow, numpy, scipy. Re-run whenever the film frames are re-rendered.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent / "public" / "media" / "film" / "watch"
GROUND = np.array([12, 11, 14], dtype=np.int16)
TOL = 7                      # lossy WebP moves the flat ground by a level or two
SPREAD = 12                  # film pixels of distance kept each side of the edge (masks.json carries it to the shader)
COLS = 10
SETS = {"wide": (320, 200), "tall": (160, 248)}   # tile size; sheets stay under 4096 px on each side


def mask_of(path: Path, tile: tuple[int, int]) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)
    near = np.abs(rgb - GROUND).max(axis=2) <= TOL
    labels, _ = ndimage.label(near, structure=np.ones((3, 3), dtype=bool))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, edge[edge > 0])
    solid = ~background
    # distance to the silhouette in film pixels: positive inside the watch, negative outside
    d = ndimage.distance_transform_edt(solid) - ndimage.distance_transform_edt(~solid)
    d = np.where(solid, d - 0.5, d + 0.5)
    field = np.clip(0.5 + d / (2 * SPREAD), 0, 1).astype(np.float32)
    small = Image.fromarray(field, "F").resize(tile, Image.BOX)
    return Image.fromarray(np.round(np.asarray(small) * 255).astype(np.uint8), "L")


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
        meta[name] = {"count": len(frames), "cols": COLS, "rows": rows, "tile": list(tile), "sheet": [sheet.width, sheet.height], "frame": [fw, fh], "spread": SPREAD}
        print(f"{out.name}: {len(frames)} frames, {sheet.width}x{sheet.height}, {out.stat().st_size // 1024} KB")
    (ROOT / "masks.json").write_text(json.dumps(meta, indent=1) + "\n")


if __name__ == "__main__":
    main()
