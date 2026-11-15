"""Put new app screenshots into the finished dugout footage, without the source clip.

  python3 scripts/screen-repatch.py <old_before.png> <old_after.png> [--check]

screen-composite.py laid the app onto the iPad linearly (o = glow*(1-a) + (0.93*app + 0.07*glow)*a, a = the screen's
quad times a matte that keeps his thumbs in front), and film-frames.sh / film-phone.sh then applied ffmpeg's eq grade,
which is affine per pixel. So in the graded frames the app's part is linear too:

  new = old + G * 0.93 * a * (app_new - app_old)      (G: eq's linear part, contrast on luma, saturation on chroma)

The corners are content/inside-track.ts SCREEN (the same track screen-composite.py wrote). a is rebuilt from the
quad, with the thumbs found as the pixels inside it where the old frame doesn't look like the old app (skin is far
brighter than the app's dark glass). Works on public/media/film/inside/{push,pull}/ (1920x1080) and the phone strips
{push,pull}-phone/ (x 627, 720 wide, film-phone.sh), in place. --check only reports how well the old app explains each
frame (the median difference on the screen, 8-bit levels).
"""
import json
import os
import re
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
FILM = os.path.join(WEB, "public/media/film/inside")
NEW = {"push": os.path.join(WEB, "public/marketing/app-call-before.png"),
       "pull": os.path.join(WEB, "public/marketing/app-call-after.png")}
CROP_X = 627
CON, SAT = 1.04, 0.86                          # film-frames.sh: eq=saturation=0.86:brightness=-0.025:contrast=1.04

# BGR -> YCbCr (BT.601) and back, for eq's linear part on a difference
_M = np.array([[0.114, 0.587, 0.299], [0.5, -0.331264, -0.168736], [-0.081312, -0.418688, 0.5]], np.float32)   # rows: Y, Cb, Cr from B, G, R
G = np.linalg.inv(_M) @ np.diag([CON, SAT, SAT]).astype(np.float32) @ _M


def screens():
    s = open(os.path.join(WEB, "content/inside-track.ts")).read()
    return json.loads(re.search(r"export const SCREEN: \[number, number\]\[\]\[\] = (\[.*\]);", s).group(1))


def grade_abs(img):
    """eq applied to an image (for predicting what the old app looks like in the graded frame)."""
    f = img.astype(np.float32)
    ycc = f @ _M.T
    ycc[..., 0] = (ycc[..., 0] - 128) * CON + 128 - 0.025 * 255
    ycc[..., 1:] *= SAT
    return ycc @ np.linalg.inv(_M).T


def warp(app, quad, w, h):
    ah, aw = app.shape[:2]
    src = np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]])
    q = np.float32(quad)
    q = (q - q.mean(0)) * 1.02 + q.mean(0)                        # screen-composite.py pushes the quad out by 2%
    M = cv2.getPerspectiveTransform(src, q)
    wa = cv2.warpPerspective(app, M, (w, h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT)
    m = cv2.warpPerspective(np.full((ah, aw), 255, np.uint8), M, (w, h), flags=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(wa, (0, 0), 0.6).astype(np.float32), m.astype(np.float32) / 255.0


def main():
    old = {"push": cv2.imread(sys.argv[1]), "pull": cv2.imread(sys.argv[2])}
    new = {k: cv2.imread(v) for k, v in NEW.items()}
    for k in old:
        if old[k].shape != new[k].shape:
            new[k] = cv2.resize(new[k], (old[k].shape[1], old[k].shape[0]), interpolation=cv2.INTER_AREA)
    check = "--check" in sys.argv
    S = screens()
    for clip in ("push", "pull"):
        files = sorted(f for f in os.listdir(os.path.join(FILM, clip)) if f.endswith(".webp"))
        stats = []
        for i, fn in enumerate(files):
            path = os.path.join(FILM, clip, fn)
            fr = cv2.imread(path).astype(np.float32)
            h, w = fr.shape[:2]
            wo, m = warp(old[clip], S[i], w, h)
            wn, _ = warp(new[clip], S[i], w, h)
            inside = cv2.erode((m > 0.99).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            # what the old app should look like here: graded, on the glowing glass (0.07 of the glow; the glow is the
            # frame's own brightest screen level, close to white)
            pred = grade_abs(wo * 0.93 + 0.07 * 235)
            res = np.abs(fr - pred).max(2)
            med = float(np.median(res[inside])) if inside.any() else 0.0
            stats.append(med)
            if check:
                continue
            # thumbs: much brighter than the app predicts, or skin-coloured where the app is neutral
            thumb = ((res > 38) & inside).astype(np.uint8)
            thumb = cv2.morphologyEx(thumb, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
            thumb = cv2.dilate(thumb, np.ones((7, 7), np.uint8))
            keep = cv2.GaussianBlur(thumb.astype(np.float32), (0, 0), 1.5)
            a = m * (1 - keep)
            d = (wn - wo) * 0.93 * a[..., None]
            out = fr + d @ G.T
            cv2.imwrite(path, np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 64])
            # the phone strip is the same frame, cropped
            pp = os.path.join(FILM, clip + "-phone", fn)
            if os.path.exists(pp):
                ph = cv2.imread(pp).astype(np.float32)
                ph2 = ph + (d @ G.T)[:, CROP_X:CROP_X + ph.shape[1]]
                cv2.imwrite(pp, np.clip(ph2, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 64])
        print(f"{clip}: {len(files)} frames, old app vs frame on the screen: median {np.median(stats):.1f}, worst {max(stats):.1f} levels"
              + ("" if check else " (patched)"))
    if not check:   # the posters are frame 1
        for clip in ("push", "pull"):
            cv2.imwrite(os.path.join(FILM, clip + "-poster.jpg"), cv2.imread(os.path.join(FILM, clip, "0001.webp")), [cv2.IMWRITE_JPEG_QUALITY, 88])


if __name__ == "__main__":
    main()
