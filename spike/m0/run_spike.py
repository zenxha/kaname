"""Reproduce the M0 gate numbers.

    bash spike/m0/fetch_mt3d.sh   # once: sparse-clone Mini Tokyo 3D data at the pinned commit
    python3 -I spike/m0/run_spike.py

Writes results.csv / results_late.csv next to this file and prints the summary.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import router as r  # noqa: E402

TOL = 5


def run(net, ref_file: str, out_file: str, default_time: str = "18:30") -> list[int]:
    diffs = []
    rows = []
    for ref in csv.DictReader(open(HERE / ref_file, encoding="utf-8")):
        h, m = map(int, ref.get("query_time", default_time).split(":"))
        j = r.planner_journey(net, ref["origin"], ref["destination"], h * 60 + m)
        if j is None:
            rows.append({**ref, "our_dep": "", "our_arr": "", "our_minutes": "", "our_transfers": "",
                         "delta": "", "within_tol": "False", "our_route": "UNROUTABLE"})
            diffs.append(10**6)
            continue
        d = j.minutes - int(ref["ref_minutes"])
        diffs.append(d)
        legs = " > ".join(f"{net.trip_ids[t].split('.')[0]}.{net.trip_ids[t].split('.')[1]}" for t, *_ in j.legs)
        rows.append({**ref, "our_dep": r.fmt(j.dep), "our_arr": r.fmt(j.arr), "our_minutes": j.minutes,
                     "our_transfers": j.transfers, "delta": d, "within_tol": abs(d) <= TOL, "our_route": legs})
    with open(HERE / out_file, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return diffs


def summary(name: str, diffs: list[int]) -> None:
    n = len(diffs)
    ok = sum(abs(d) <= TOL for d in diffs)
    exact = sum(d == 0 for d in diffs)
    mae = sum(abs(d) for d in diffs) / n
    bias = sum(diffs) / n
    print(f"{name}: within ±{TOL} min {ok}/{n}, exact {exact}/{n}, MAE {mae:.2f}, mean signed {bias:+.2f}")


if __name__ == "__main__":
    net = r.load()
    print(f"network: {len(net.stops)} stops, {len(net.conns)} weekday connections, {len(net.trip_ids)} trips")
    d1 = run(net, "reference_times.csv", "results.csv")
    summary("gate set (20 pairs, 18:30)", d1)
    d2 = run(net, "reference_times_late.csv", "results_late.csv")
    summary("late-evening set (6 pairs, 22:30 / 24:10)", d2)
    summary("combined", d1 + d2)
