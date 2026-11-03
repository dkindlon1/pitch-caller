"""
"Time for a change" flag (v0.6). Tells the coach when the pitcher may be done.
The engine never makes the change; it tells the coach why it's worried.

Signals (all from things the app already tracks):
  trust      how many pitches he still trusts (confidence at or above the level's cutoff)
  slide      how far his confidence has fallen below his bullpen feel, on average
  fatigue    pitches past the level's fatigue point
  traffic    walks + HBP + hard contact in his last 6 batters (logged results)
Levels: "ok", "watch" (keep an eye on him / get someone loose), "change" (strong case to go get him).
"""
from engine import LEVEL


def pitcher_status(arsenal, level, pitch_count, recent=None):
    """recent: list of the last batters' outcomes for this pitcher, newest last, each one of
    "out", "k", "hit", "hard", "walk", "hbp" (hard = logged hard contact or extra-base hit)."""
    L = LEVEL[level]
    cutoff, fat = L["cutoff"], L["fatigue"]
    trusted = [p for p in arsenal if p.conf >= cutoff]
    slide = sum(max(0.0, p.base_conf - p.conf) for p in arsenal) / len(arsenal)
    over = pitch_count - fat
    last6 = (recent or [])[-6:]
    traffic = sum(1 for r in last6 if r in ("walk", "hbp", "hard"))
    reasons, score = [], 0
    if not trusted:
        reasons.append("he trusts none of his pitches right now")
        score += 3
    elif len(trusted) == 1 and len(arsenal) > 1:
        reasons.append(f"he's down to one pitch he trusts ({trusted[0].name})")
        score += 1
    if slide >= 0.15:
        reasons.append(f"confidence is down {slide:.2f} from his bullpen on average")
        score += 1
    if over >= 20:
        reasons.append(f"{over} pitches past his usual fatigue point")
        score += 2
    elif over >= 0:
        reasons.append(f"at his fatigue point ({pitch_count} pitches)")
        score += 1
    if traffic >= 4:
        reasons.append(f"{traffic} of his last {len(last6)} batters walked, were hit, or hit it hard")
        score += 2
    elif traffic >= 3:
        reasons.append(f"{traffic} of his last {len(last6)} batters walked, were hit, or hit it hard")
        score += 1
    status = "change" if score >= 3 else ("watch" if score >= 1 else "ok")
    return {"status": status, "reasons": reasons, "trusted": [p.name for p in trusted], "score": score}
