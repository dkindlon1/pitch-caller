"""A small grid maze router (A*, 0.1 mm grid, top and bottom copper, through vias) for the PitchIQ watch board.
Signals are routed pad to pad. GND and 3V0 pads get a short stub and a via into the inner planes (In1 = GND, In2 = 3V0).
It routes for connectivity and clearance only: no length matching, no impedance control (nothing on this board needs it:
the RF is inside the certified module). KiCad's DRC is the judge of the result, not this script."""
import sys, os, heapq, math
import numpy as np, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import design as D
from gen_pcb import PCB, PLACED, W, H, RAD, OX, OY, mm, V

RES = 0.1; NX = int(round(W / RES)) + 1; NY = int(round(H / RES)) + 1
TW = 0.2; CLR = 0.15; VIA_D = 0.5; VIA_DRILL = 0.25
PAD_INFL = CLR + TW / 2 + 0.01; TRK_R = TW + CLR + 0.02; VIA_MARK = VIA_D / 2 + CLR + TW / 2 + 0.02;   # +0.02: diagonal runs sit up to 5 um closer than their grid cells
VIAS = []   # (i, j) of every via, to keep drilled holes apart
_=0; EDGE = 0.25 + TW / 2 + 0.1
PLANES = {"GND": pcbnew.In1_Cu, "3V0": pcbnew.In2_Cu}
LAYERS = [pcbnew.F_Cu, pcbnew.B_Cu]
BLOCK = -2
occ = np.zeros((2, NX, NY), dtype=np.int32)      # 0 free, n = only net n may pass, BLOCK = nobody
cop = np.zeros((2, NX, NY), dtype=np.int32)      # real copper of net n (pads, tracks)
padarea = np.zeros((2, NX, NY), dtype=bool)      # inside any pad (no vias here)

def claim(l, sl, net):
    a = occ[l][sl]; a[(a != 0) & (a != net)] = BLOCK; a[a == 0] = net

def rect(l, x0, y0, x1, y1, net, infl):
    i0 = max(0, math.ceil((x0 - infl) / RES - 1e-6)); i1 = min(NX - 1, math.floor((x1 + infl) / RES + 1e-6))
    j0 = max(0, math.ceil((y0 - infl) / RES - 1e-6)); j1 = min(NY - 1, math.floor((y1 + infl) / RES + 1e-6))
    if i0 > i1 or j0 > j1: return None
    sl = (slice(i0, i1 + 1), slice(j0, j1 + 1)); claim(l, sl, net); return sl

DISC = {}
def disc_offsets(r):
    k = round(r / RES, 3)
    if k not in DISC:
        n = int(math.floor(k + 1e-6)); DISC[k] = [(a, b) for a in range(-n, n + 1) for b in range(-n, n + 1) if a * a + b * b <= k * k + 1e-6]
    return DISC[k]

def disc(l, i, j, net, r):
    for a, b in disc_offsets(r):
        x, y = i + a, j + b
        if 0 <= x < NX and 0 <= y < NY:
            v = occ[l, x, y]
            if v == 0: occ[l, x, y] = net
            elif v != net: occ[l, x, y] = BLOCK

def inside_board(x, y, inset):
    if x < inset or y < inset or x > W - inset or y > H - inset: return False
    r = RAD
    for cx, cy in ((r, r), (W - r, r), (r, H - r), (W - r, H - r)):
        if (x < r and cx == r or x > W - r and cx == W - r) and (y < r and cy == r or y > H - r and cy == H - r):
            return math.hypot(x - cx, y - cy) <= r - inset
    return True

def setup(b):
    netid = {n: k + 1 for k, n in enumerate(sorted(D.nets()))}
    for i in range(NX):
        for j in range(NY):
            if not inside_board(i * RES, j * RES, EDGE): occ[:, i, j] = BLOCK
    for z in b.Zones():   # board-level rule areas (the widened antenna keep-out)
        if z.GetIsRuleArea():
            bb = z.GetBoundingBox()
            for l in range(2): rect(l, pcbnew.ToMM(bb.GetLeft()) - OX, pcbnew.ToMM(bb.GetTop()) - OY, pcbnew.ToMM(bb.GetRight()) - OX, pcbnew.ToMM(bb.GetBottom()) - OY, BLOCK, 0.2)
    pads = {}   # net -> list of dict(ref, num, layers, cells)
    uniq = 5000
    for f in b.GetFootprints():
        for z in f.Zones():   # antenna keep-out of the module
            bb = z.GetBoundingBox()
            for l in range(2): rect(l, pcbnew.ToMM(bb.GetLeft()) - OX, pcbnew.ToMM(bb.GetTop()) - OY, pcbnew.ToMM(bb.GetRight()) - OX, pcbnew.ToMM(bb.GetBottom()) - OY, BLOCK, 0.2)
        for p in f.Pads():
            bb = p.GetBoundingBox(); x0, y0, x1, y1 = [pcbnew.ToMM(v) for v in (bb.GetLeft(), bb.GetTop(), bb.GetRight(), bb.GetBottom())]
            x0 -= OX; x1 -= OX; y0 -= OY; y1 -= OY
            if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                for l in range(2): rect(l, x0, y0, x1, y1, BLOCK, 0.3 + TW / 2)
                continue
            name = p.GetNetname(); uniq += 1
            n = netid.get(name, uniq)
            ls = [k for k, L in enumerate(LAYERS) if p.IsOnLayer(L)]
            cells = []
            for l in ls:
                rect(l, x0, y0, x1, y1, n, PAD_INFL)
                i0 = max(0, math.ceil(x0 / RES - 1e-6)); i1 = min(NX - 1, math.floor(x1 / RES + 1e-6)); j0 = max(0, math.ceil(y0 / RES - 1e-6)); j1 = min(NY - 1, math.floor(y1 / RES + 1e-6))
                cop[l, i0:i1 + 1, j0:j1 + 1] = n; padarea[l, max(0, i0 - 1):i1 + 2, max(0, j0 - 1):j1 + 2] = True
                if p.GetAttribute() == pcbnew.PAD_ATTRIB_PTH: padarea[1 - l if len(ls) == 1 else l, max(0, i0 - 1):i1 + 2, max(0, j0 - 1):j1 + 2] = True
                if p.GetShape() in (pcbnew.PAD_SHAPE_CIRCLE, pcbnew.PAD_SHAPE_OVAL):   # only the middle of a round pad is surely copper
                    cxp, cyp, rr = (x0 + x1) / 2, (y0 + y1) / 2, 0.7 * min(x1 - x0, y1 - y0) / 2
                    cc = [(l, i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if abs(i * RES - cxp) <= max(rr, (x1 - x0) / 2 - (min(x1 - x0, y1 - y0) / 2 - rr)) and abs(j * RES - cyp) <= max(rr, (y1 - y0) / 2 - (min(x1 - x0, y1 - y0) / 2 - rr)) and (p.GetShape() != pcbnew.PAD_SHAPE_CIRCLE or math.hypot(i * RES - cxp, j * RES - cyp) <= rr)]
                    cells += cc or [(l, round(cxp / RES), round(cyp / RES))]
                elif p.GetShape() == pcbnew.PAD_SHAPE_CUSTOM:   # odd outline (solder jumper halves): only the middle half is surely copper
                    cxp, cyp, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 4, (y1 - y0) / 4
                    cc = [(l, i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if abs(i * RES - cxp) <= hx and abs(j * RES - cyp) <= hy]
                    cells += cc or [(l, round(cxp / RES), round(cyp / RES))]
                else:
                    cells += [(l, i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)]
            if name: pads.setdefault(name, []).append(dict(ref=f.GetReference(), num=p.GetNumber(), cells=cells, c=((x0 + x1) / 2, (y0 + y1) / 2)))
    return netid, pads

def ok(l, i, j, n):
    v = occ[l, i, j]; return v == 0 or v == n

def via_ok(i, j, n):
    if padarea[0, i, j] or padarea[1, i, j]: return False
    for a, b in VIAS:
        if (a - i) ** 2 + (b - j) ** 2 < 81: return False      # hole centres at least 0.9 mm apart
    for a, b in disc_offsets(0.2):
        x, y = i + a, j + b
        if not (0 <= x < NX and 0 <= y < NY): return False
        if not ok(0, x, y, n) or not ok(1, x, y, n): return False
    return True

MOVES = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0), (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142)]
def astar(starts, goals, n, goalc, allow_via=True, goal_fn=None, limit=400000):
    gi, gj = goalc
    def h(i, j):
        dx, dy = abs(i - gi), abs(j - gj); return max(dx, dy) + 0.4142 * min(dx, dy) if goal_fn is None else 0.0
    best = {}; pq = []; prev = {}
    for s in starts:
        if ok(s[0], s[1], s[2], n): best[s] = 0.0; heapq.heappush(pq, (h(s[1], s[2]), 0.0, s, None))
    cnt = 0
    while pq:
        f, g, s, pm = heapq.heappop(pq)
        if g > best.get(s, 1e18): continue
        l, i, j = s
        if (goal_fn(s) if goal_fn else s in goals):
            path = [s]
            while s in prev: s = prev[s]; path.append(s)
            return path[::-1]
        cnt += 1
        if cnt > limit: return None
        for k, (a, b, c) in enumerate(MOVES):
            x, y = i + a, j + b
            if not (0 <= x < NX and 0 <= y < NY) or not ok(l, x, y, n): continue
            if a and b and not (ok(l, x, j, n) and ok(l, i, y, n)): continue
            ng = g + c + (0.3 if pm is not None and pm != k else 0.0)
            t = (l, x, y)
            if ng < best.get(t, 1e18): best[t] = ng; prev[t] = s; heapq.heappush(pq, (ng + h(x, y), ng, t, k))
        if allow_via and via_ok(i, j, n):
            t = (1 - l, i, j); ng = g + 12.0
            if ng < best.get(t, 1e18): best[t] = ng; prev[t] = s; heapq.heappush(pq, (ng + h(i, j), ng, t, None))
    return None

def commit(b, path, net, n, stats):
    code = b.GetNetcodeFromNetname(net)
    def P(i, j): return V(OX + i * RES, OY + j * RES)
    k = 0
    while k < len(path) - 1:
        l, i, j = path[k]; l2, i2, j2 = path[k + 1]
        if l2 != l:
            v = pcbnew.PCB_VIA(b); v.SetPosition(P(i, j)); v.SetWidth(mm(VIA_D)); v.SetDrill(mm(VIA_DRILL)); v.SetNetCode(code); v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu); b.Add(v)
            for ll in range(2): disc(ll, i, j, n, VIA_MARK); cop[ll, i, j] = n
            VIAS.append((i, j)); stats["vias"] += 1; k += 1; continue
        d = (i2 - i, j2 - j); e = k + 1
        while e < len(path) - 1 and path[e + 1][0] == l and (path[e + 1][1] - path[e][1], path[e + 1][2] - path[e][2]) == d: e += 1
        t = pcbnew.PCB_TRACK(b); t.SetStart(P(i, j)); t.SetEnd(P(path[e][1], path[e][2])); t.SetWidth(mm(TW)); t.SetLayer(LAYERS[l]); t.SetNetCode(code); b.Add(t)
        stats["mm"] += math.hypot(path[e][1] - i, path[e][2] - j) * RES
        k = e
    for l, i, j in path: disc(l, i, j, n, TRK_R); cop[l, i, j] = n

def plane_via(b, path_end, net, n, stats):
    l, i, j = path_end
    v = pcbnew.PCB_VIA(b); v.SetPosition(V(OX + i * RES, OY + j * RES)); v.SetWidth(mm(VIA_D)); v.SetDrill(mm(VIA_DRILL)); v.SetNetCode(b.GetNetcodeFromNetname(net)); v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu); b.Add(v)
    for ll in range(2): disc(ll, i, j, n, VIA_MARK); cop[ll, i, j] = n
    VIAS.append((i, j)); stats["vias"] += 1

def fanout(b, net, n, p, stats, fails):
    starts = set(p["cells"])
    if len({c[0] for c in starts}) == 2: return   # through-hole pad already reaches the plane
    def goal(s): return via_ok(s[1], s[2], n) or (cop[s[0], s[1], s[2]] == n and s not in starts and not padarea[s[0], s[1], s[2]])
    path = astar(starts, None, n, (0, 0), allow_via=False, goal_fn=goal, limit=60000)
    if path is None: fails.append(f"{net} plane via: {p['ref']}.{p['num']}"); return
    end = path[-1]; newvia = via_ok(end[1], end[2], n) and cop[end[0], end[1], end[2]] != n
    if len(path) > 1: commit(b, path, net, n, stats)
    if newvia: plane_via(b, end, net, n, stats)

def attempt(order, early):
    """order: signal nets in routing order (None = shortest first). early: 'REF.NUM' plane pads to fan out before signals."""
    b = pcbnew.LoadBoard(PLACED)
    netid, pads = setup(b)
    stats = dict(vias=0, mm=0.0); fails = []
    def span(net):
        xs = [p["c"][0] for p in pads[net]]; ys = [p["c"][1] for p in pads[net]]; return (max(xs) - min(xs)) + (max(ys) - min(ys))
    signals = sorted([n for n in pads if n not in PLANES], key=span)
    if order: signals = [n for n in order if n in signals] + [n for n in signals if n not in order]
    def is_early(p): return p["ref"] == "U1" or f"{p['ref']}.{p['num']}" in early
    for net in PLANES:
        for p in pads[net]:
            if is_early(p): fanout(b, net, netid[net], p, stats, fails)
    for net in signals:
        n = netid[net]; todo = list(pads[net]); first = todo.pop(0); tree = set(first["cells"])
        while todo:
            cx = sum(c[1] for c in tree) / len(tree) * RES; cy = sum(c[2] for c in tree) / len(tree) * RES
            todo.sort(key=lambda p: abs(p["c"][0] - cx) + abs(p["c"][1] - cy)); tgt = todo.pop(0)
            goals = set(tgt["cells"]); gc = (round(tgt["c"][0] / RES), round(tgt["c"][1] / RES))
            path = astar(tree, goals, n, gc)
            if path is None: fails.append(f"{net}: {first['ref']}.{first['num']} -> {tgt['ref']}.{tgt['num']}"); continue
            commit(b, path, net, n, stats); tree |= set(path) | goals
    for net in PLANES:
        for p in pads[net]:
            if not is_early(p): fanout(b, net, netid[net], p, stats, fails)
    return b, stats, fails, signals

def main():
    """Rip-up by re-ordering: a net that failed goes to the front of the next attempt; a plane pad that failed is fanned
    out before the signals. Each attempt runs in its own process (pcbnew does not like several boards in one process)."""
    import subprocess, json, shutil
    if len(sys.argv) > 2 and sys.argv[1] == "one":
        cfg = json.loads(sys.argv[2]); b, stats, fails, signals = attempt(cfg["order"], set(cfg["early"]))
        pcbnew.SaveBoard(sys.argv[3], b)
        print(json.dumps(dict(mm=round(stats["mm"]), vias=stats["vias"], fails=fails, signals=signals))); return 0
    best = None; tmp = os.path.join(os.path.dirname(PCB), "..", "out", "route_try.kicad_pcb"); keep = tmp.replace("try", "best")
    order, early = [], []
    for it in range(40):
        out = subprocess.run([sys.executable, __file__, "one", json.dumps(dict(order=order, early=early)), tmp], capture_output=True, text=True)
        r = json.loads(out.stdout.strip().splitlines()[-1]); print(f"attempt {it}: track {r['mm']} mm, vias {r['vias']}, failures {r['fails']}")
        if best is None or len(r["fails"]) < len(best["fails"]): best = r; shutil.copy(tmp, keep)
        if not r["fails"]: break
        order = order or r["signals"]
        for f in r["fails"]:
            if " plane via: " in f:
                pad = f.split(": ")[1]
                if pad not in early: early.append(pad)
            else:
                net = f.split(":")[0]; order.remove(net); order.insert(0, net)
    shutil.copy(keep, PCB)
    print(f"kept: {len(best['signals'])} signal nets, track {best['mm']} mm, vias {best['vias']}, failures {len(best['fails'])}")
    return 1 if best["fails"] else 0

if __name__ == "__main__": sys.exit(main())
