"""Route every needed pair and collect the matrices (parallel over targets)."""

from __future__ import annotations

import multiprocessing as mp
import os
from dataclasses import dataclass

from .config import BuildConfig
from .graph import Network
from .profile import INF, Journey, RouterData, origin_entries, reconstruct, scan
from .summary import window_median
from .universe import Universe

U16_NONE = 0xFFFF       # unreachable / no value
U16_SAME = 0xFFFE       # last_dep: origin and destination are the same station
U8_NONE = 0xFF
MAX_MINUTES = 0xFFF0

# One route hop: (railway index, complex where it boards, complex where it ends, seated through-running)
RouteHop = tuple[int, int, int, bool]


@dataclass(frozen=True)
class Cell:
    minutes: int
    transfers: int
    route: tuple[RouteHop, ...] = ()    # the representative journey, hop by hop
    last_dep: int = U16_NONE


@dataclass(frozen=True)
class Matrices:
    outbound: tuple[tuple[Cell, ...], ...]  # [station][candidate]
    home: tuple[tuple[Cell, ...], ...]      # [candidate][station]
    universe: Universe                      # the (closed) universe the matrices index

    @property
    def n_stations(self) -> int:
        return len(self.universe.complexes)

    @property
    def n_candidates(self) -> int:
        return self.universe.n_candidates

    def outside_complexes(self) -> frozenset[int]:
        """Route hop ends that have no station index, so a route could not be written."""
        inside = set(self.universe.complexes)
        return frozenset(x for row in self.outbound + self.home for c in row
                         for _, board, end, _ in c.route for x in (board, end) if x not in inside)


_CTX: dict = {}
SAME = Cell(0, 0, (), U16_SAME)
UNREACHABLE = Cell(U16_NONE, U8_NONE)


def _setup(net: Network, uni: Universe, cfg: BuildConfig) -> None:
    _CTX.update(net=net, uni=uni, cfg=cfg, rd=RouterData.from_network(net),
                railway_index={r.id: i for i, r in enumerate(net.railways)})


def _route(j: Journey) -> tuple[RouteHop, ...]:
    complex_of, railway_index = _CTX["net"].stop_complex, _CTX["railway_index"]
    return tuple((railway_index[h.railway], complex_of[h.board_stop], complex_of[h.alight_stop], h.seated)
                 for h in j.hops)


def _cell(minutes: int, j: Journey, last_dep: int) -> Cell:
    return Cell(min(minutes, MAX_MINUTES), min(j.transfers, U8_NONE - 1), _route(j), last_dep)


def outbound_row(k: int) -> tuple[int, tuple[Cell, ...]]:
    """Every input station -> candidate k, in the outbound window."""
    net, uni, cfg, rd = _CTX["net"], _CTX["uni"], _CTX["cfg"], _CTX["rd"]
    w0, w1 = cfg.outbound_window
    res = scan(rd, frozenset(net.complexes[uni.complexes[k]].stops), w0, w1 + cfg.horizon_min)
    cells = []
    for s, c in enumerate(uni.complexes):
        if s == k:
            cells.append(SAME)
            continue
        stat = window_median(origin_entries(res, net.complexes[c].stops), w0, w1)
        if stat.entry is None:
            cells.append(UNREACHABLE)
            continue
        cells.append(_cell(stat.minutes, reconstruct(rd, res, stat.entry), U16_NONE))
    return k, tuple(cells)


def home_column(h: int) -> tuple[int, tuple[Cell, ...]]:
    """Every candidate -> input station h, in the home window, plus the last departure."""
    net, uni, cfg, rd = _CTX["net"], _CTX["uni"], _CTX["cfg"], _CTX["rd"]
    w0, w1 = cfg.home_window
    res = scan(rd, frozenset(net.complexes[uni.complexes[h]].stops), w0, INF)
    cells = []
    for k in range(uni.n_candidates):
        if k == h:
            cells.append(SAME)
            continue
        entries = origin_entries(res, net.complexes[uni.complexes[k]].stops)
        last_dep = min(entries[-1].dep, U16_SAME - 1) if entries else U16_NONE
        stat = window_median(entries, w0, w1)
        if stat.entry is None:
            cells.append(Cell(U16_NONE, U8_NONE, (), last_dep))
            continue
        cells.append(_cell(stat.minutes, reconstruct(rd, res, stat.entry), last_dep))
    return h, tuple(cells)


def _run(fn, items: range, workers: int) -> dict[int, tuple[Cell, ...]]:
    if workers <= 1:
        return dict(map(fn, items))
    with mp.get_context("fork").Pool(workers) as pool:
        return dict(pool.imap_unordered(fn, items, chunksize=4))


def build_matrices(net: Network, uni: Universe, cfg: BuildConfig, workers: int | None = None) -> Matrices:
    workers = workers if workers is not None else max(1, (os.cpu_count() or 2) - 1)
    _setup(net, uni, cfg)
    try:
        out_rows = _run(outbound_row, range(uni.n_candidates), workers)
        home_cols = _run(home_column, range(len(uni.complexes)), workers)
    finally:
        _CTX.clear()
    n, k = len(uni.complexes), uni.n_candidates
    outbound = tuple(tuple(out_rows[c][s] for c in range(k)) for s in range(n))
    home = tuple(tuple(home_cols[s][c] for s in range(n)) for c in range(k))
    return Matrices(outbound, home, uni)


def build_closed(net: Network, uni: Universe, cfg: BuildConfig, workers: int | None = None,
                 max_rounds: int = 5) -> Matrices:
    """Build, then add any station a route passes through but that has no index, and rebuild,
    until every route can be written with station indexes."""
    for _ in range(max_rounds):
        mats = build_matrices(net, uni, cfg, workers)
        missing = mats.outside_complexes()
        if not missing:
            return mats
        uni = uni.extended(sorted(missing, key=lambda c: net.complexes[c].id))
    raise RuntimeError(f"routes still leave the station set after {max_rounds} rounds")
