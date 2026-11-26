"""v1.3 Part 8 task 5: 2025 scoring is unchanged by the learning weight (W = 4 vs 32).
  python -m hitter_data.score_w_check <score dir A> <score dir B>
Compares every array of every tables_<cfg>.npz (count-layer / outcome-probability tables: P6, BIP, RE, CV per adapter and
level) byte for byte, and scores.json with the engine-identity fields (_engine dir / file / fingerprint) left out.
Prints one JSON line; exit 0 only if everything is identical."""
import hashlib
import json
import os
import sys

import numpy as np


def strip(o):
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if k not in ("seconds", "elapsed", "elapsed_s", "dir", "file", "fingerprint", "t", "time_s")}
    if isinstance(o, list):
        return [strip(v) for v in o]
    return o


def main(a, b):
    res, ok = {"arrays": 0, "array_diffs": [], "npz": {}}, True
    for fn in sorted(f for f in os.listdir(a) if f.endswith(".npz")):
        A, B = np.load(os.path.join(a, fn)), np.load(os.path.join(b, fn))
        if sorted(A.files) != sorted(B.files):
            res["array_diffs"].append(f"{fn}: keys differ")
            ok = False
            continue
        h = hashlib.sha256()
        for k in sorted(A.files):
            res["arrays"] += 1
            x, y = A[k], B[k]
            if x.dtype != y.dtype or x.shape != y.shape or x.tobytes() != y.tobytes():
                res["array_diffs"].append(f"{fn}:{k}")
                ok = False
            h.update(k.encode() + x.tobytes())
        res["npz"][fn] = h.hexdigest()[:16]
    for fn in ("scores.json",) + tuple(sorted(f for f in os.listdir(a) if f.startswith("tables_") and f.endswith(".json"))):
        sa = strip(json.load(open(os.path.join(a, fn), encoding="utf-8")))
        sb = strip(json.load(open(os.path.join(b, fn), encoding="utf-8")))
        same = json.dumps(sa, sort_keys=True) == json.dumps(sb, sort_keys=True)
        res[fn] = "identical" if same else "DIFFERS"
        ok &= same
    res["identical"] = ok
    print(json.dumps(res))
    return ok


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1], sys.argv[2]) else 1)
