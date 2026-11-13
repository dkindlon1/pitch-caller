"""v1.2 research: Single-A (Florida State League, Hawk-Eye) pitch-level CSVs from Baseball Savant's minor-league search,
every 4th day Apr 5 - Sep 25, 2024 and 2025, same sampling as fetch_statcast.py. Files go to data/statcast_minors/
(not committed). usage: python3 research_v12/fetch_minors.py [LEVEL=A]"""
import datetime as dt, os, subprocess, sys, time
LEVEL = sys.argv[1] if len(sys.argv) > 1 else "A"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "statcast_minors")
os.makedirs(OUT, exist_ok=True)
URL = ("https://baseballsavant.mlb.com/statcast-search-minors/csv?all=true&hfGT=R%7C&hfSea={y}%7C&player_type=pitcher"
       "&hfLevel={lv}%7C&game_date_gt={d}&game_date_lt={d}&type=details&minors=true")
for y in (2024, 2025):
    d = dt.date(y, 4, 5)
    while d <= dt.date(y, 9, 25):
        path = os.path.join(OUT, f"{LEVEL}_{d}.csv")
        if not (os.path.exists(path) and os.path.getsize(path) > 2000):
            for attempt in range(3):
                r = subprocess.run(["curl", "-sS", "--max-time", "180", "-o", path, URL.format(y=y, d=d, lv=LEVEL)])
                if r.returncode == 0 and os.path.exists(path):
                    break
                time.sleep(10)
            print(d, os.path.getsize(path) if os.path.exists(path) else 0, flush=True)
            time.sleep(2)
        d += dt.timedelta(days=4)
print("done")
