"""v1.3 hitter data: college archive ingest + parser, MLB / MiLB pulls, coverage and quality reports.
Data lives outside git under PITCHIQ_DATA (default C:/dev/pitchiq-data). See docs/BUILD_v13_prework_REPORT.md."""
import os

DATA = os.environ.get("PITCHIQ_DATA", "C:/dev/pitchiq-data")
ARCHIVE = os.environ.get("PITCHIQ_ARCHIVE", os.path.expanduser(
    "~/.codex/.chatgpt-projects/g-p-6afe5c22285081919c8aea9c52b5f187/collection/archive.sqlite3"))

HELDOUT_SEASON = 2026      # plan 5.1: scored once at Step 6; may be parsed and counted, never fit / tuned / scored


class HeldOutSeasonError(RuntimeError):
    pass


def assert_not_heldout(season):
    """Every fit, tuning and scoring path calls this on each season it touches (plan 5.1)."""
    try:
        s = int(season)
    except (TypeError, ValueError):
        raise HeldOutSeasonError(f"season {season!r} is not a year; refusing (an unknown season could be the held-out one)")
    if s >= HELDOUT_SEASON:
        raise HeldOutSeasonError(f"season {s} is held out (>= {HELDOUT_SEASON}): no fit, tuning or scoring may use it")
    return s


def fit_seasons(seasons):
    """Returns the seasons as ints, raising if any is the held-out season or later."""
    return [assert_not_heldout(s) for s in seasons]
