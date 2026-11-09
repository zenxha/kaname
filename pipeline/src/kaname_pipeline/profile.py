"""Reverse profile Connection Scan (all origins to one target).

One scan answers, for every stop u and every departure time, "if I can board at u at
time d, what is the earliest arrival at the target?". The answer per stop is a Pareto
list of (departure, arrival) pairs, so planner-style journeys (latest departure that
still makes the earliest arrival) fall out directly.

Semantics match the M0 forward router:
  * board a connection at u if you are ready at u by its departure;
  * after arriving at v you are ready at w after transfers[v][w] minutes (v itself included);
  * through-running (`trip_next`) continues seated, without a transfer;
  * the target is reached by arriving at any target stop (no egress walk).
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass

from .graph import Network

INF = 1 << 30

NONE, ALIGHT, STAY, THROUGH, TRANSFER = 0, 1, 2, 3, 4


@dataclass(frozen=True)
class RouterData:
    """Flat, read-only arrays the scan loop reads (bound to locals for speed)."""
    dep: tuple[int, ...]
    arr: tuple[int, ...]
    u: tuple[int, ...]
    v: tuple[int, ...]
    trip: tuple[int, ...]
    next_in_trip: tuple[int, ...]
    trip_first_conn: tuple[int, ...]
    trip_next: tuple[tuple[int, ...], ...]
    trip_railway: tuple[str, ...]
    transfers: tuple[tuple[tuple[int, int], ...], ...]

    @property
    def n_stops(self) -> int:
        return len(self.transfers)

    @staticmethod
    def from_network(net: Network) -> "RouterData":
        tt = net.timetable
        return RouterData(tt.dep, tt.arr, tt.u, tt.v, tt.trip, tt.next_in_trip, tt.trip_first_conn,
                          tt.trip_next, tt.trip_railway, net.transfers)


@dataclass(frozen=True)
class Hop:
    railway: str
    board_stop: int
    alight_stop: int
    board_time: int
    alight_time: int


@dataclass(frozen=True)
class Journey:
    dep: int
    arr: int
    transfers: int
    hops: tuple[Hop, ...]

    @property
    def minutes(self) -> int:
        return self.arr - self.dep


@dataclass(frozen=True)
class Entry:
    """One Pareto-optimal journey start: board at `stop` at `dep`, arrive at `arr`."""
    dep: int
    arr: int
    stop: int
    index: int  # position in the stop's profile list


@dataclass(frozen=True)
class ScanResult:
    lo: int
    neg_dep: tuple[list[int], ...]   # per stop: -departure, ascending (departure descending)
    arrival: tuple[list[int], ...]   # per stop: arrival at target, strictly decreasing
    conn: tuple[list[int], ...]      # per stop: connection boarded
    kind: bytearray                  # per scanned connection: decision taken
    ref1: list[int]
    ref2: list[int]


def scan(rd: RouterData, targets: frozenset[int], t_start: int, t_end: int) -> ScanResult:
    """Scan connections departing in [t_start, t_end], latest first."""
    dep, arr, uu, vv, trip = rd.dep, rd.arr, rd.u, rd.v, rd.trip
    nxt, first, tnext, transfers = rd.next_in_trip, rd.trip_first_conn, rd.trip_next, rd.transfers
    lo, hi = bisect_left(dep, t_start), bisect_right(dep, t_end)
    n = hi - lo
    tau = [INF] * n
    kind, ref1, ref2 = bytearray(n), [0] * n, [0] * n
    neg = tuple([] for _ in range(rd.n_stops))
    best_arr = tuple([] for _ in range(rd.n_stops))
    conn = tuple([] for _ in range(rd.n_stops))
    is_target = bytearray(rd.n_stops)
    for t in targets:
        is_target[t] = 1
    for i in range(hi - 1, lo - 1, -1):
        k = i - lo
        a, v = arr[i], vv[i]
        if is_target[v]:
            best, kind[k] = a, ALIGHT
        else:
            best, choice, r1, r2 = INF, NONE, 0, 0
            j = nxt[i]
            if j >= 0:
                if j < hi:
                    best, choice = tau[j - lo], STAY
            else:
                for nt in tnext[trip[i]]:
                    f = first[nt]
                    if lo <= f < hi and tau[f - lo] < best:
                        best, choice, r1 = tau[f - lo], THROUGH, nt
            for w, walk in transfers[v]:
                pw = neg[w]
                if pw:
                    x = bisect_right(pw, -(a + walk)) - 1
                    if x >= 0 and best_arr[w][x] < best:
                        best, choice, r1, r2 = best_arr[w][x], TRANSFER, w, x
            if best >= INF:
                continue
            kind[k], ref1[k], ref2[k] = choice, r1, r2
        tau[k] = best
        u, d = uu[i], dep[i]
        pu, au = neg[u], best_arr[u]
        if pu and pu[-1] == -d:
            if best < au[-1]:
                au[-1] = best
                conn[u][-1] = i
        elif not pu or best < au[-1]:
            pu.append(-d)
            au.append(best)
            conn[u].append(i)
    return ScanResult(lo, neg, best_arr, conn, kind, ref1, ref2)


def origin_entries(res: ScanResult, stops: tuple[int, ...]) -> list[Entry]:
    """Pareto journeys from a set of origin stops (a station complex), ascending departure."""
    raw = [(-nd, a, s, x) for s in stops for x, (nd, a) in enumerate(zip(res.neg_dep[s], res.arrival[s]))]
    raw.sort(key=lambda e: (-e[0], e[1]))
    out, best = [], INF
    for d, a, s, x in raw:
        if a < best:
            out.append(Entry(d, a, s, x))
            best = a
    out.reverse()
    return out


def reconstruct(rd: RouterData, res: ScanResult, entry: Entry, max_steps: int = 100_000) -> Journey:
    """Follow the decisions recorded by the scan from one origin entry to the target."""
    i = res.conn[entry.stop][entry.index]
    hops: list[Hop] = []
    board, board_t, transfers = rd.u[i], rd.dep[i], 0
    for _ in range(max_steps):
        k = res.kind[i - res.lo]
        if k == STAY:
            i = rd.next_in_trip[i]
            continue
        hop = Hop(rd.trip_railway[rd.trip[i]], board, rd.v[i], board_t, rd.arr[i])
        hops.append(hop)
        if k == ALIGHT:
            return Journey(entry.dep, rd.arr[i], transfers, tuple(hops))
        if k == THROUGH:
            i = rd.trip_first_conn[res.ref1[i - res.lo]]
        elif k == TRANSFER:
            w, x = res.ref1[i - res.lo], res.ref2[i - res.lo]
            i = res.conn[w][x]
            transfers += 1
        else:
            raise RuntimeError(f"journey reconstruction hit an undecided connection {i}")
        board, board_t = rd.u[i], rd.dep[i]
    raise RuntimeError("journey reconstruction did not terminate")
