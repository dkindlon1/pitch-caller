"""v0.8 step 2: download Baseball Savant pitch-level CSVs (regular season), every 4th day from Apr 5 to Sep 25,
for 2024 (train) and 2025 (test); v1.2 Step B1 adds 2026 (the hitter fits' held-out season). Files go to data/statcast/
(not committed). usage: python3 fetch_statcast.py [years, default 2024 2025 2026]"""
import datetime as dt, os, subprocess, sys, time
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "statcast")
os.makedirs(OUT, exist_ok=True)
URL = ("https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea={y}%7C&player_type=pitcher"
       "&game_date_gt={d}&game_date_lt={d}&type=details")
for y in ([int(a) for a in sys.argv[1:]] or (2024, 2025, 2026)):
    d = dt.date(y, 4, 5)
    while d <= dt.date(y, 9, 25):
        path = os.path.join(OUT, f"sc_{d}.csv")
        if not (os.path.exists(path) and os.path.getsize(path) > 100_000):
            for attempt in range(3):
                r = subprocess.run(["curl", "-sS", "--max-time", "180", "-o", path, URL.format(y=y, d=d)])
                if r.returncode == 0 and os.path.getsize(path) > 100_000:
                    break
                time.sleep(10)
            print(d, os.path.getsize(path) if os.path.exists(path) else 0, flush=True)
            time.sleep(2)
        d += dt.timedelta(days=4)
print("done")
