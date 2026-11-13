"""v1.2 research: HBP per pitch for an inside target as the lateral miss lean changes. Lateral miss ~ Normal(target + lean,
sigma) in inches toward the batter; HBP given the crossing point = MLB 2024-25 measured rate by 3-in. band
(location_proxies.py). Heart share for an away target as the lean pulls toward the plate. usage: python3 lean_hbp_geometry.py"""
import math
BAND = {12: 0.003, 15: 0.0165, 18: 0.041, 21: 0.104, 24: 0.20, 27: 0.345, 30: 0.57}   # MLB 2024/2025 averaged
def hbp_at(x):
    if x < 12: return 0.0
    return BAND[min(30, int(x // 3) * 3)]
def Phi(z): return 0.5 * (1 + math.erf(z / math.sqrt(2)))
def p_hbp(t, lean, sigma, step=0.25):
    tot, x = 0.0, -40.0
    while x < 60:
        dens = math.exp(-0.5 * ((x - t - lean) / sigma) ** 2) / (sigma * math.sqrt(2 * math.pi))
        tot += dens * hbp_at(x) * step; x += step
    return tot
for sigma in (8.0, 11.0):
    base = p_hbp(20 / 3, 0, sigma)
    row = " ".join(f"lean {d:+.1f}: {p_hbp(20/3, d, sigma):.4f} (x{p_hbp(20/3, d, sigma)/base:.2f})" for d in (-2.7, -1.5, 0, 1.5, 2.7))
    # away target (-6.67 toward the batter = outer third); share crossing the middle third (|x| < 3.33)
    hb = lambda d: Phi((10/3 - (-20/3 + d)) / sigma) - Phi((-10/3 - (-20/3 + d)) / sigma)
    print(f"sigma {sigma}: inside-third target HBP/pitch  {row}")
    print(f"          away-third target, share over the middle third: lean 0 {hb(0):.3f}, toward plate +2.7 {hb(2.7):.3f}, off plate -2.7 {hb(-2.7):.3f}")
