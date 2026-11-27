"""Plumbing dry run of final_test.score() on 2025 ONLY (unlock stubbed, season forced to 2025, B small).
Numbers are not a test result (the core's tables contain 2025). Proves the score path runs end to end."""
import sys
import hitter_data.final_test as FT
FT._final_test_unlock = lambda season, go: (_ for _ in ()).throw(SystemExit("unexpected")) if season != 2025 else None
FT.HELDOUT_SEASON = 2025
FT.core_fit_seasons = lambda: ()
res = FT.score(None, B=20)
for lv, r in res.items():
    print(lv, r["n_games"], r["n_pitches"], r["reference"], f"{r['core_minus_ref']:+.5f}", f"{r['se']:.5f}", r["verdict"])
