"""Put the real app on the iPad in the dugout push-in.

  python3 scripts/screen-composite.py <push.mp4> <out_dir> [hold_end_frame]   (found from the clip if left out)

Finds the iPad's screen in every frame (the brightest large pale area: the clip is generated with a plain glowing
screen and nothing crossing it), fits its four corners from the four edges, smooths them over time, and warps an app
screenshot onto it. Two clips come out, one per screenshot, each 24 frames a second:
  <out_dir>/push.mp4   public/marketing/app-call-before.png (the 1-1 call, before the coach logs the foul)
  <out_dir>/pull.mp4   public/marketing/app-call-after.png  (the engine's 1-2 call, for the pull-out, played backwards)
The app stays on the screen to the last frame; there the site swaps in the crisp screenshot on the same corners and
carries on into the app's strike zone. Also writes <out_dir>/track.json: the corners per frame and where the Foul button sits
on the held frame (as fractions of the frame), which InsideCall.tsx uses for the tap.
Then cut each with scripts/film-frames.sh <clip> inside <push|pull> 24.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = {"push": os.path.join(HERE, "../public/marketing/app-call-before.png"),
         "pull": os.path.join(HERE, "../public/marketing/app-call-after.png")}
FOUL = (0.8967, 0.6092)      # the Foul button's centre on app-call-before.png (scripts/capture-app-call.cjs prints its box)


def read(path):
    cap = cv2.VideoCapture(path)
    fr = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fr.append(f)
    return fr, cap.get(cv2.CAP_PROP_FPS) or 24


def screen_mask(f, loose=False):
    """The lit glass. The strict mask (for finding the corners) can't leak onto the lit rail or his knuckles; the loose
    one (for what the app covers, inside the found screen) keeps the dimmer edge of the glass."""
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    v, sat = (100, 100) if loose else (165, 75)
    m = ((hsv[..., 2] > v) & (hsv[..., 1] < sat)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5) if loose else (11, 11), np.uint8))
    return m


def order(q):
    q = np.asarray(q, np.float64)
    c = q.mean(0)
    a = np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0])
    q = q[np.argsort(a)]                      # clockwise from the left in image coords
    i = np.argmin(q.sum(1))                   # top-left first
    return np.roll(q, -i, 0)                  # tl, tr, br, bl


RNG = np.random.default_rng(3)


def ransac_line(pts, L):
    """The longest straight run among these points (a thumb over the edge is curved, the glass edge is straight)."""
    if len(pts) < 30:
        return None
    best, bin_ = None, None
    for _ in range(300):
        i, j = RNG.choice(len(pts), 2, replace=False)
        d = pts[j] - pts[i]
        n = np.linalg.norm(d)
        if n < 0.1 * L:
            continue
        u = d / n
        nn = np.array([-u[1], u[0]])
        inl = np.abs((pts - pts[i]) @ nn) < 1.6
        if bin_ is None or inl.sum() > bin_.sum():
            bin_, best = inl, (pts[i], u)
    if bin_ is None:
        return None
    P = pts[bin_]
    t = (P - best[0]) @ best[1]
    if len(P) < 40 or t.max() - t.min() < 0.22 * L:
        return None
    vx, vy, x0, y0 = cv2.fitLine(P.astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    return np.array([x0, y0]), np.array([vx, vy])


def corners(f):
    """The screen's four corners, from straight lines fitted to its four edges. A corner whose edges can't be seen
    (under a thumb, or off the frame) comes back NaN and is filled in from the frames around it."""
    h, w = f.shape[:2]
    m = screen_mask(f)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.01 * w * h:
        return None
    # grow the strict blob into the loose mask just around it, to reach the glass's dimmer edge (and nothing else)
    core = np.zeros_like(m)
    cv2.drawContours(core, [c], -1, 255, -1)
    r = int(max(9, 0.06 * np.sqrt(cv2.contourArea(c)))) | 1        # how far to grow scales with the screen's size
    grown = cv2.bitwise_and(screen_mask(f, loose=True), cv2.dilate(core, np.ones((2 * r + 1, 2 * r + 1), np.uint8)))
    cs2, _ = cv2.findContours(grown, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if cs2:
        c = max(cs2, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    approx = None
    for eps in np.linspace(0.01, 0.08, 15):
        a = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(a) == 4:
            approx = a.reshape(4, 2)
            break
    if approx is None:
        approx = cv2.boxPoints(cv2.minAreaRect(c))
    q = order(approx)
    pts = c.reshape(-1, 2).astype(np.float64)
    pts = pts[(pts[:, 0] > 3) & (pts[:, 0] < w - 4) & (pts[:, 1] > 3) & (pts[:, 1] < h - 4)]   # not the frame's own edge
    lines = []
    for k in range(4):
        p0, p1 = q[k], q[(k + 1) % 4]
        d = p1 - p0
        L = np.linalg.norm(d)
        u = d / L
        n = np.array([-u[1], u[0]])
        t = (pts - p0) @ u
        # where to look along each edge (tl->tr, tr->br, br->bl, bl->tl): his thumbs hold the lower half of the sides
        # and the bottom corners, so the sides are read from their upper part and the bottom from its middle
        lo, hi = [(-0.1, 1.1), (-0.05, 0.5), (0.22, 0.78), (0.5, 1.05)][k]
        sel = pts[(t > lo * L) & (t < hi * L) & (np.abs((pts - p0) @ n) < 0.06 * L + 20)]
        lines.append(ransac_line(sel, L))
    out = []
    for k in range(4):
        la, lb = lines[(k - 1) % 4], lines[k]
        if la is None or lb is None:
            out.append([np.nan, np.nan]); continue
        (a0, ua), (b0, ub) = la, lb
        A = np.array([ua, -ub]).T
        if abs(np.linalg.det(A)) < 1e-6:
            out.append([np.nan, np.nan]); continue
        s_ = np.linalg.solve(A, b0 - a0)
        out.append(a0 + s_[0] * ua)
    return np.array(out, np.float64)


def smooth(track, win=7):
    t = np.array(track, np.float64)          # n x 4 x 2, NaN where missing
    n = len(t)
    idx = np.arange(n)
    for k in range(4):
        for j in range(2):
            v = t[:, k, j]
            ok = ~np.isnan(v)
            if ok.sum() < 3:
                raise SystemExit("too few frames tracked")
            # missing frames: extrapolate with a quadratic over the nearest good ones
            v2 = v.copy()
            good = idx[ok]
            for i in idx[~ok]:
                near = good[np.argsort(np.abs(good - i))[:10]]
                v2[i] = np.polyval(np.polyfit(near, v[near], 2), i)
            pad = np.pad(v2, win, mode="edge")
            ker = np.ones(2 * win + 1) / (2 * win + 1)
            t[:, k, j] = np.convolve(pad, ker, mode="same")[win:-win]
    return t


def main():
    clip, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    frames, fps = read(clip)
    h, w = frames[0].shape[:2]
    raw = []
    for f in frames:
        q = corners(f)
        raw.append(q if q is not None else np.full((4, 2), np.nan))
    raw = np.array(raw, np.float64)
    # throw out frames whose area jumps against their neighbours (a bad fit)
    # drop corners that don't fit the smooth path of the corners around them (a bad fit in one frame), three passes
    idx = np.arange(len(raw))
    for _ in range(3):
        for k in range(4):
            for j in range(2):
                v = raw[:, k, j]
                good = ~np.isnan(v)
                bad = []
                for i in idx[good]:
                    nb = idx[good & (np.abs(idx - i) <= 10) & (idx != i)]
                    if len(nb) < 5:
                        continue
                    if abs(np.polyval(np.polyfit(nb, v[nb], 2), i) - v[i]) > 10:
                        bad.append(i)
                raw[bad, k] = np.nan
    area = np.array([cv2.contourArea(q.astype(np.float32)) if not np.isnan(q).any() else np.nan for q in raw])
    trk = smooth(raw)
    if len(sys.argv) > 3:
        hold = int(sys.argv[3])
    else:   # the held stretch: frames whose screen is the same size as at the start (within 1.5%)
        a0 = np.nanmedian(area[:5])
        hold = 0
        while hold + 1 < min(36, len(area)) and (np.isnan(area[hold + 1]) or abs(area[hold + 1] - a0) < 0.015 * a0):
            hold += 1
    if hold:   # the held stretch is one still pose: pin it
        trk[:hold + 1] = trk[:hold + 1].mean(0)
    n = len(frames)
    for name, shot in SHOTS.items():
        app = cv2.imread(shot)
        ah, aw = app.shape[:2]
        src = np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]])
        tmp = os.path.join(out_dir, f"_{name}")
        os.makedirs(tmp, exist_ok=True)
        for i, f in enumerate(frames):
            t = 0 if i <= hold else (i - hold) / max(1, n - 1 - hold)
            fade = 1.0   # the app stays to the last frame: the site takes over from there with the crisp screenshot
            # the screen's quad, pushed out a touch so the app reaches the very edge of the glass (the matte below
            # stops it at the bezel)
            qd = trk[i].astype(np.float32)
            qd = (qd - qd.mean(0)) * 1.02 + qd.mean(0)
            M = cv2.getPerspectiveTransform(src, qd)
            warped = cv2.warpPerspective(app, M, (w, h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT)
            mask = cv2.warpPerspective(np.full((ah, aw), 255, np.uint8), M, (w, h), flags=cv2.INTER_LINEAR)
            mask = mask.astype(np.float32)[..., None] / 255.0
            # his thumbs stay in front: a soft matte of the lit glass (bright, pale), with holes inside the glass (the
            # status bar) filled in
            # the glass is blue-white (blue well above red), skin is the other way round: that keeps the edge soft
            ff = f.astype(np.float32)
            matte = np.clip((ff[..., 0] - ff[..., 2]) / 20, 0, 1) * np.clip((ff.max(2) - 90) / 50, 0, 1)
            sm = ((matte > 0.5) & (mask[..., 0] > 0.5)).astype(np.uint8) * 255
            sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
            cs, _ = cv2.findContours(sm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            fill = np.zeros_like(sm)
            if cs:
                cv2.drawContours(fill, [max(cs, key=cv2.contourArea)], -1, 255, -1)
            fill = cv2.erode(fill, np.ones((9, 9), np.uint8)).astype(np.float32) / 255.0
            occ = cv2.GaussianBlur(np.maximum(matte, fill), (0, 0), 1.2)[..., None]
            mask = mask * occ
            # the screen is lit glass: a little of the footage's own glow stays on it, and a touch of softness
            warped = cv2.GaussianBlur(warped, (0, 0), 0.6).astype(np.float32)
            glow = f.astype(np.float32)
            onscreen = warped * 0.93 + glow * 0.07
            a = mask * fade
            o = glow * (1 - a) + onscreen * a
            cv2.imwrite(os.path.join(tmp, f"{i + 1:04d}.png"), np.clip(o, 0, 255).astype(np.uint8))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(tmp, "%04d.png"),
                        "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", os.path.join(out_dir, f"{name}.mp4")], check=True)
    # where the Foul button sits on the held frame
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]), trk[hold].astype(np.float32))
    p = cv2.perspectiveTransform(np.float32([[FOUL]]), M)[0, 0]
    json.dump({"fps": fps, "frames": n, "hold": hold, "size": [w, h], "touch": [float(p[0] / w), float(p[1] / h)],
               "tracked": int((~np.isnan(raw[:, :, 0])).sum()), "corners": trk.round(2).tolist()},
              open(os.path.join(out_dir, "track.json"), "w"))
    # the corners per frame, for the site (InsideCall.tsx lines its crisp screenshot up with them)
    geo = json.load(open(os.path.join(HERE, "../content/app-call-geometry.json")))
    app = {k: {kk: round(vv, 4) for kk, vv in v.items()} for k, v in geo.items() if v}
    pts = [[[round(float(x), 1), round(float(y), 1)] for x, y in q] for q in trk]
    with open(os.path.join(HERE, "../content/inside-track.ts"), "w") as fh:
        fh.write("// The dugout push-in (web/public/media/film/inside), measured by scripts/screen-composite.py: the iPad screen's four\n"
                 "// corners (top-left, top-right, bottom-right, bottom-left) in every frame, in pixels of the clip, and the frame the\n"
                 "// locked-off hold ends on. APP is where things sit on the app screenshots (fractions of the screenshot), from\n"
                 "// scripts/capture-app-call.cjs. Regenerate with those scripts; don't edit by hand.\n"
                 f"export const CLIP = {{ w: {w}, h: {h}, frames: {n}, hold: {hold} }};\n"
                 f"export const APP = {json.dumps(app)};\n"
                 f"export const SCREEN: [number, number][][] = {json.dumps(pts, separators=(',', ':'))};\n")
    print(f"{n} frames, {int((~np.isnan(raw[:, :, 0])).sum())} of {4 * n} corners seen directly, touch at {p[0] / w:.3f}, {p[1] / h:.3f}")


if __name__ == "__main__":
    main()
