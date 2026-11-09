"""The reverse profile scan must agree with a brute-force forward search at every minute."""

from hypothesis import given, settings
from hypothesis import strategies as hs

from kaname_pipeline.mt3d import RawTrip
from kaname_pipeline.network import build_timetable
from kaname_pipeline.profile import INF, RouterData, origin_entries, reconstruct, scan


BASE = 360  # 06:00, clear of the service-day wrap at 03:00


def _hhmm(t: int) -> str:
    return f"{t // 60:02d}:{t % 60:02d}"


def make_router(n_stops: int, trips: list[RawTrip], links: dict[tuple[int, int], int]) -> RouterData:
    idx = {f"S{i}": i for i in range(n_stops)}
    tt = build_timetable(tuple(trips), idx)
    transfers = tuple(tuple([(s, 1)] + [(b, m) for (a, b), m in sorted(links.items()) if a == s])
                      for s in range(n_stops))
    return RouterData(tt.dep, tt.arr, tt.u, tt.v, tt.trip, tt.next_in_trip, tt.trip_first_conn,
                      tt.trip_next, tt.trip_railway, transfers)


def forward_ea(rd: RouterData, origins, targets, t: int) -> int:
    ready = [INF] * rd.n_stops
    for o in origins:
        ready[o] = t
    on, best = set(), INF
    for i in range(len(rd.dep)):
        if rd.dep[i] < t or rd.dep[i] >= best:
            continue
        tr = rd.trip[i]
        if tr not in on:
            if ready[rd.u[i]] > rd.dep[i]:
                continue
            on.add(tr)
        a, v = rd.arr[i], rd.v[i]
        if v in targets:
            best = min(best, a)
        for w, walk in rd.transfers[v]:
            ready[w] = min(ready[w], a + walk)
        if rd.next_in_trip[i] == -1:
            on.update(rd.trip_next[tr])
    return best


@hs.composite
def networks(draw):
    n = draw(hs.integers(4, 7))
    trips = []
    n_trips = draw(hs.integers(1, 12))
    for k in range(n_trips):
        path = draw(hs.lists(hs.integers(0, n - 1), min_size=2, max_size=4, unique=True))
        t = BASE + draw(hs.integers(0, 50))
        stops = []
        for j, s in enumerate(path):
            arr = t
            t += draw(hs.integers(0, 1)) if 0 < j < len(path) - 1 else 0
            stops.append((f"S{s}", None if j == 0 else _hhmm(arr), None if j == len(path) - 1 else _hhmm(t)))
            t += draw(hs.integers(1, 6))
        nt = (f"T{draw(hs.integers(0, n_trips - 1))}",) if draw(hs.booleans()) else ()
        trips.append(RawTrip(f"T{k}", f"R{k % 3}", "x", tuple(stops), nt))
    links = draw(hs.dictionaries(hs.tuples(hs.integers(0, n - 1), hs.integers(0, n - 1)),
                                 hs.integers(0, 5), max_size=6))
    links = {(a, b): m for (a, b), m in links.items() if a != b}
    origins = draw(hs.lists(hs.integers(0, n - 1), min_size=1, max_size=2, unique=True))
    targets = draw(hs.lists(hs.integers(0, n - 1), min_size=1, max_size=2, unique=True)
                   .filter(lambda ts: not set(ts) & set(origins)))
    return make_router(n, trips, links), tuple(origins), frozenset(targets)


@settings(max_examples=300, deadline=None)
@given(networks())
def test_profile_matches_forward_search(case):
    rd, origins, targets = case
    res = scan(rd, targets, 0, 10_000)
    entries = origin_entries(res, origins)
    for t in range(BASE - 2, BASE + 80):
        expected = forward_ea(rd, origins, targets, t)
        later = [e.arr for e in entries if e.dep >= t]
        got = min(later) if later else INF
        assert got == expected, (t, entries)
    for e in entries:
        assert forward_ea(rd, origins, targets, e.dep) == e.arr
        assert forward_ea(rd, origins, targets, e.dep + 1) > e.arr  # latest departure for that arrival


@settings(max_examples=200, deadline=None)
@given(networks())
def test_reconstructed_journeys_are_consistent(case):
    rd, origins, targets = case
    res = scan(rd, targets, 0, 10_000)
    for e in origin_entries(res, origins):
        j = reconstruct(rd, res, e)
        assert (j.dep, j.arr) == (e.dep, e.arr)
        assert j.hops[0].board_stop in origins and j.hops[-1].alight_stop in targets
        assert j.transfers <= len(j.hops) - 1
        for h1, h2 in zip(j.hops, j.hops[1:]):
            assert h2.board_time >= h1.alight_time


def test_pareto_entries_on_a_line():
    trips = [RawTrip(f"T{k}", "R", "x", (("S0", None, _hhmm(BASE + 10 * k)), ("S1", _hhmm(BASE + 10 * k + 5), None)), ())
             for k in range(3)]
    rd = make_router(2, trips, {})
    res = scan(rd, frozenset({1}), BASE, BASE + 100)
    got = [(e.dep - BASE, e.arr - BASE) for e in origin_entries(res, (0,))]
    assert got == [(0, 5), (10, 15), (20, 25)]
    res = scan(rd, frozenset({1}), BASE + 5, BASE + 15)  # the window drops the first and last trains
    assert [(e.dep - BASE, e.arr - BASE) for e in origin_entries(res, (0,))] == [(10, 15)]


def test_scan_end_bounds_whole_journeys():
    """A journey whose later leg departs after t_end is not found: callers pass window end + horizon,
    so only journeys longer than the horizon are lost."""
    trips = [RawTrip("A", "RA", "x", (("S0", None, "06:00"), ("S1", "06:05", "06:30"), ("S2", "06:35", None)), ())]
    rd = make_router(3, trips, {})
    assert origin_entries(scan(rd, frozenset({2}), BASE, BASE + 10), (0,)) == []
    (e,) = origin_entries(scan(rd, frozenset({2}), BASE, BASE + 40), (0,))
    assert (e.dep - BASE, e.arr - BASE) == (0, 35)


def test_through_running_counts_no_transfer():
    trips = [RawTrip("A", "RA", "x", (("S0", None, "06:00"), ("S1", "06:05", None)), ("B",)),
             RawTrip("B", "RB", "x", (("S2", None, "06:06"), ("S3", "06:10", None)), ())]
    rd = make_router(4, trips, {})
    res = scan(rd, frozenset({3}), BASE, BASE + 100)
    (e,) = origin_entries(res, (0,))
    j = reconstruct(rd, res, e)
    assert (j.dep - BASE, j.arr - BASE, j.transfers) == (0, 10, 0)
    assert [(h.railway, h.board_stop, h.alight_stop) for h in j.hops] == [("RA", 0, 1), ("RB", 2, 3)]


def test_transfer_needs_walk_time():
    trips = [RawTrip("A", "RA", "x", (("S0", None, "06:00"), ("S1", "06:05", None)), ()),
             RawTrip("B", "RB", "x", (("S2", None, "06:07"), ("S3", "06:10", None)), ()),
             RawTrip("C", "RB", "x", (("S2", None, "06:09"), ("S3", "06:12", None)), ())]
    rd = make_router(4, trips, {(1, 2): 3})
    res = scan(rd, frozenset({3}), BASE, BASE + 100)
    entries = origin_entries(res, (0,))
    assert [(e.dep - BASE, e.arr - BASE) for e in entries] == [(0, 12)]  # misses the 06:07, takes the 06:09
    j = reconstruct(rd, res, entries[0])
    assert j.transfers == 1 and [h.railway for h in j.hops] == ["RA", "RB"]
