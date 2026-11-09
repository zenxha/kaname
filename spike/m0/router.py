"""M0 spike: timetable router over the Mini Tokyo 3D static timetables.

Throwaway code. It exists to answer one question: do the timetables, routed with a
simple transfer model, reproduce journey-planner times within +-5 minutes?

Model (fixed BEFORE comparing against reference times, see DECISIONS.md):
  * Weekday calendar only. Paid / reserved-seat trains excluded (PAID_TYPES).
  * Connection Scan Algorithm (CSA), earliest arrival, then a reverse scan for the
    latest departure that still makes that arrival (planner-style "duration from
    first boarding to arrival", which is what Yahoo!/Jorudan/NAVITIME display).
  * Through-running (mt3d `nt` links) = stay seated, no transfer.
  * Transfers:
      same stop id (same line), different train : 1 min
      same sub-group (shared concourse)           : 3 min
      different sub-group in the same group       : max(5, 3 + 1.3 * dist_m / 80)
      same ja name, ungrouped, < 600 m            : treated like different sub-group
  * Endpoints: every stop whose station name matches is a valid origin/destination,
    with no access/egress walking (a planner treats the station complex as one place).
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

DATA = Path(__file__).parent / ".cache" / "mt3d" / "data"

# Train types needing a surcharge or reserved-seat ticket. Excluded so the
# comparison matches a planner run with "有料特急 off".
PAID_TYPES = {
    "JR-East.LimitedExpress", "JR-Central.LimitedExpress", "Fujikyu.LimitedExpress",
    "Izukyu.LimitedExpress", "IzuHakone.LimitedExpress", "Chichibu.Express",
    "Keikyu.MorningWing", "Keikyu.EveningWing", "Keio.KeioLiner",
    "Keisei.Skyliner", "Keisei.Morningliner", "Keisei.Eveningliner",
    "Odakyu.LimitedExpress", "OdakyuHakone.LimitedExpress", "TokyoMetro.LimitedExpress",
    "Seibu.LimitedExpress", "Seibu.HaijimaLiner", "Seibu.S-TRAIN",
    "TokyoMetro.S-TRAIN", "Tokyu.S-TRAIN", "Minatomirai.S-TRAIN",
    "Tobu.LimitedExpress", "Tobu.TH-LINER", "TokyoMetro.TH-LINER", "Tobu.TJ-Liner",
    "Tobu.SL-Taiju", "Moka.SL-Moka",
}

SAME_STOP_CHANGE = 1
SAME_SUBGROUP_CHANGE = 3
CROSS_SUBGROUP_BASE = 3
CROSS_SUBGROUP_MIN = 5
WALK_M_PER_MIN = 80.0
DETOUR = 1.3

INF = 10**9


def hhmm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def dist_m(a, b) -> float:
    (x1, y1), (x2, y2) = a, b
    dx = (x2 - x1) * math.cos(math.radians((y1 + y2) / 2)) * 111_320
    dy = (y2 - y1) * 110_540
    return math.hypot(dx, dy)


def base_name(ja: str) -> str:
    """'押上(スカイツリー前)' / '押上〈スカイツリー前〉' -> '押上'."""
    return re.split(r"[（(〈<]", unicodedata.normalize("NFKC", ja))[0].strip()


@dataclass
class Network:
    stops: list[str] = field(default_factory=list)
    stop_idx: dict[str, int] = field(default_factory=dict)
    stop_name: list[str] = field(default_factory=list)
    stop_coord: list = field(default_factory=list)
    # connections sorted by departure: (dep, arr, from, to, trip)
    conns: list[tuple[int, int, int, int, int]] = field(default_factory=list)
    trip_ids: list[str] = field(default_factory=list)
    trip_type: list[str] = field(default_factory=list)
    trip_next: dict[int, list[int]] = field(default_factory=dict)
    trip_last_conn: dict[int, int] = field(default_factory=dict)
    footpaths: dict[int, list[tuple[int, int]]] = field(default_factory=dict)
    name_to_stops: dict[str, list[int]] = field(default_factory=dict)


def load(calendar: str = "Weekday", exclude_paid: bool = True) -> Network:
    net = Network()
    stations = json.loads((DATA / "stations.json").read_text())
    for s in stations:
        if "coord" not in s:
            continue
        net.stop_idx[s["id"]] = len(net.stops)
        net.stops.append(s["id"])
        net.stop_name.append(base_name(s["title"]["ja"]))
        net.stop_coord.append(s["coord"])

    trips_raw = []
    for f in sorted((DATA / "train-timetables").glob("*.json")):
        for t in json.loads(f.read_text()):
            if not t["id"].endswith("." + calendar):
                continue
            if exclude_paid and t["y"] in PAID_TYPES:
                continue
            trips_raw.append(t)

    tid = {t["id"]: i for i, t in enumerate(trips_raw)}
    net.trip_ids = [t["id"] for t in trips_raw]
    net.trip_type = [t["y"] for t in trips_raw]

    conns = []
    for i, t in enumerate(trips_raw):
        prev_time = None
        times = []
        for stp in t["tt"]:
            a = stp.get("a") or stp.get("d")
            d = stp.get("d") or stp.get("a")
            ta, td = hhmm(a), hhmm(d)
            # service-day wrap: keep times monotonic, early-morning starts are +24h
            if prev_time is None and ta < 180:
                ta += 1440
                td += 1440
            while prev_time is not None and ta < prev_time:
                ta += 1440
            while td < ta:
                td += 1440
            prev_time = td
            times.append((stp["s"], ta, td))
        for (s1, _, d1), (s2, a2, _) in zip(times, times[1:]):
            if s1 not in net.stop_idx or s2 not in net.stop_idx:
                continue
            conns.append((d1, a2, net.stop_idx[s1], net.stop_idx[s2], i))
        nts = [tid[n] for n in t.get("nt", []) if n in tid]
        if nts:
            net.trip_next[i] = nts

    conns.sort()
    net.conns = conns
    for ci, c in enumerate(conns):
        net.trip_last_conn[c[4]] = ci  # last connection index per trip (sorted order)

    _build_footpaths(net)

    for i, n in enumerate(net.stop_name):
        net.name_to_stops.setdefault(n, []).append(i)
    return net


def _build_footpaths(net: Network) -> None:
    groups = json.loads((DATA / "station-groups.json").read_text())
    fp: dict[int, dict[int, int]] = defaultdict(dict)

    def add(a: int, b: int, t: int) -> None:
        if a == b:
            return
        if b not in fp[a] or fp[a][b] > t:
            fp[a][b] = t

    def cross(a: int, b: int) -> int:
        d = dist_m(net.stop_coord[a], net.stop_coord[b])
        return max(CROSS_SUBGROUP_MIN, math.ceil(CROSS_SUBGROUP_BASE + DETOUR * d / WALK_M_PER_MIN))

    grouped = set()
    for g in groups:
        subs = [[net.stop_idx[s] for s in sub if s in net.stop_idx] for sub in g]
        for sub in subs:
            grouped.update(sub)
            for a in sub:
                for b in sub:
                    add(a, b, SAME_SUBGROUP_CHANGE)
        for i, s1 in enumerate(subs):
            for j, s2 in enumerate(subs):
                if i == j:
                    continue
                for a in s1:
                    for b in s2:
                        add(a, b, cross(a, b))

    # fallback: same name, close, not linked by groups (e.g. one operator, two lines)
    by_name = defaultdict(list)
    for i, n in enumerate(net.stop_name):
        by_name[n].append(i)
    for n, idxs in by_name.items():
        for a in idxs:
            for b in idxs:
                if a != b and b not in fp[a] and dist_m(net.stop_coord[a], net.stop_coord[b]) < 600:
                    add(a, b, cross(a, b))

    net.footpaths = {a: list(d.items()) for a, d in fp.items()}


@dataclass
class Journey:
    dep: int
    arr: int
    legs: list  # (trip_index, board_stop, alight_stop, board_time, alight_time)

    @property
    def minutes(self) -> int:
        return self.arr - self.dep

    @property
    def transfers(self) -> int:
        return max(0, len(self.legs) - 1)


def earliest_arrival(net: Network, origins, targets: set, t0: int, horizon: int = 360):
    """Forward Connection Scan. Returns (arrival, Journey|None)."""
    n = len(net.stops)
    ready = [INF] * n        # earliest time a NEW train can be boarded at stop
    arr_at = [INF] * n       # earliest arrival at stop
    arr_leg = {}             # stop -> (trip, board_stop, board_time, alight_time)
    ready_via = {}           # stop -> stop whose arrival produced ready[stop] (None = origin)
    on_trip = {}             # trip -> (board_stop, board_time) of the leg (survives through-running)

    for o in origins:
        ready[o] = t0
        ready_via[o] = None

    best, best_stop = INF, None
    conns = net.conns
    lo, hi = 0, len(conns)
    while lo < hi:
        mid = (lo + hi) // 2
        if conns[mid][0] < t0:
            lo = mid + 1
        else:
            hi = mid
    last_conn = net.trip_last_conn
    trip_next = net.trip_next
    fps = net.footpaths
    for ci in range(lo, len(conns)):
        dep, arr, u, v, trip = conns[ci]
        if dep >= best or dep > t0 + horizon:
            break
        if trip not in on_trip:
            if ready[u] > dep:
                continue
            on_trip[trip] = (u, dep)
        if arr < arr_at[v]:
            arr_at[v] = arr
            bstop, btime = on_trip[trip]
            arr_leg[v] = (trip, bstop, btime, arr)
            if v in targets and arr < best:
                best, best_stop = arr, v
            if arr + SAME_STOP_CHANGE < ready[v]:
                ready[v] = arr + SAME_STOP_CHANGE
                ready_via[v] = v
            for w, tt in fps.get(v, ()):
                if arr + tt < ready[w]:
                    ready[w] = arr + tt
                    ready_via[w] = v
        if last_conn.get(trip) == ci:          # through-running: stay seated
            for nt in trip_next.get(trip, ()):
                if nt not in on_trip:
                    on_trip[nt] = on_trip[trip]
    if best_stop is None:
        return INF, None
    legs = []
    s = best_stop
    guard = 0
    while True:
        trip, bstop, btime, atime = arr_leg[s]
        legs.append((trip, bstop, s, btime, atime))
        via = ready_via.get(bstop)
        if via is None:
            break
        s = via
        guard += 1
        if guard > 50:
            raise RuntimeError("journey reconstruction loop")
    legs.reverse()
    return best, Journey(legs[0][3], best, legs)


def planner_journey(net: Network, origin_name: str, dest_name: str, t0: int):
    """Planner-style answer for 'depart at t0': the earliest arrival A, using the latest
    departure that still makes A. EA(s) is monotone in s, so binary-search s."""
    origins = net.name_to_stops[origin_name]
    targets = set(net.name_to_stops[dest_name])
    a, j = earliest_arrival(net, origins, targets, t0)
    if j is None:
        return None
    lo, hi = j.dep, a
    while lo < hi:
        mid = (lo + hi + 1) // 2
        am, jm = earliest_arrival(net, origins, targets, mid)
        if am <= a:
            lo, j = mid, jm
        else:
            hi = mid - 1
    return j


def fmt(t: int) -> str:
    return f"{t // 60 % 24:02d}:{t % 60:02d}"


def describe(net: Network, j: Journey) -> str:
    out = []
    for trip, b, a, tb, ta in j.legs:
        out.append(f"{fmt(tb)} {net.stops[b]} -> {fmt(ta)} {net.stops[a]} [{net.trip_ids[trip]} {net.trip_type[trip]}]")
    return "\n    ".join(out)
