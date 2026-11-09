"""Turn a Pareto journey list into the numbers the matrix stores."""

from __future__ import annotations

from dataclasses import dataclass

from .profile import INF, Entry


@dataclass(frozen=True)
class WindowStat:
    minutes: int            # weighted median planner-style duration, INF if unreachable
    entry: Entry | None     # representative journey (the median one with the most weight)
    coverage: int           # minutes of the window that have a journey
    sparse: bool = False    # most of the window has no journey: the median covers only the minutes that do


def window_segments(entries: list[Entry], w0: int, w1: int) -> list[tuple[int, int, Entry | None]]:
    """(duration, weight, entry) per departure. Asking the planner at minute t in [w0, w1)
    returns the first entry departing at or after t, so each entry owns the minutes since
    the previous departure. Minutes after the last departure own an INF segment."""
    segs: list[tuple[int, int, Entry | None]] = []
    covered = w0 - 1
    for e in entries:
        if covered >= w1 - 1:
            break
        if e.dep <= covered:
            continue
        last = min(e.dep, w1 - 1)
        segs.append((e.arr - e.dep, last - covered, e))
        covered = last
    if covered < w1 - 1:
        segs.append((INF, w1 - 1 - covered, None))
    return segs


def _lower_median(segs: list[tuple[int, int, Entry | None]]) -> tuple[int, Entry | None]:
    ordered = sorted(segs, key=lambda s: (s[0], -s[1], s[2].dep if s[2] else INF))
    total = sum(w for _, w, _ in ordered)
    cum = 0
    for dur, weight, _ in ordered:
        cum += weight
        if 2 * cum >= total:
            return dur, next((e for d, _, e in ordered if d == dur), None)
    return INF, None


def window_median(entries: list[Entry], w0: int, w1: int) -> WindowStat:
    """Lower weighted median of the planner-style duration over every minute of the window.

    A minute "has a journey" when some journey departs at or after it (a later train still counts).
    If most minutes have none because the trains stop early, the median covers only the minutes
    that do, and the stat is marked sparse; the last departure then decides feasibility. Only a
    pair with no journey after the window opens is unreachable (INF)."""
    if w1 <= w0:
        raise ValueError("empty window")
    segs = window_segments(entries, w0, w1)
    coverage = sum(w for d, w, _ in segs if d < INF)
    median, rep = _lower_median(segs)
    if median < INF:
        return WindowStat(median, rep, coverage)
    covered = [s for s in segs if s[0] < INF]
    if not covered:
        return WindowStat(INF, None, 0)
    median, rep = _lower_median(covered)
    return WindowStat(median, rep, coverage, sparse=True)


def first_after(entries: list[Entry], t: int) -> Entry | None:
    """The planner's answer for 'depart at t': the first journey departing at or after t."""
    return next((e for e in entries if e.dep >= t), None)
