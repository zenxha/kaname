"""Transfer model: minutes needed to change trains between two stops.

Rules (fixed in M0, extended in M1 with reviewed tables, see DECISIONS.md):
  * same stop, different train ............ same_stop_min
  * same sub-group (shared concourse) ...... same_subgroup_min
  * different sub-group, same group ........ max(cross_min, ceil(base + detour * d / speed))
                                             + extra_min of both stops (deep platforms)
  * same name, not grouped, d < link_m ..... as a different sub-group
  * transfer_overrides.csv ................. replaces the value for the listed railway pairs
`d` is the straight-line distance between the stops, using stop_positions.csv where it
corrects a shared Mini Tokyo 3D coordinate.
"""

from __future__ import annotations

import math
from collections import defaultdict

from .config import ConfigError, TransferOverride, TransferParams
from .geo import distance_m
from .network import Complex, Stop


def walk_minutes(a: Stop, b: Stop, p: TransferParams) -> int:
    d = distance_m(a.lon, a.lat, b.lon, b.lat)
    walk = math.ceil(p.cross_subgroup_base_min + p.detour * d / p.walk_m_per_min)
    return max(p.cross_subgroup_min, walk) + a.extra_min + b.extra_min


def _group_links(stops, stop_index, groups, p) -> dict[tuple[int, int], int]:
    links: dict[tuple[int, int], int] = {}

    def add(a: int, b: int, t: int) -> None:
        if a != b and t < links.get((a, b), 1 << 30):
            links[(a, b)] = t

    for group in groups:
        subs = [[stop_index[s] for s in sub if s in stop_index] for sub in group]
        for i, sa in enumerate(subs):
            for j, sb in enumerate(subs):
                for a in sa:
                    for b in sb:
                        add(a, b, p.same_subgroup_min if i == j else walk_minutes(stops[a], stops[b], p))
    return links


def _same_name_links(stops, served, links, p) -> dict[tuple[int, int], int]:
    """Links between same-named stops that no station group connects."""
    found: dict[tuple[int, int], int] = {}
    by_name: dict[str, list[int]] = defaultdict(list)
    for i in sorted(served):
        by_name[stops[i].name_key].append(i)
    for idxs in by_name.values():
        for a in idxs:
            for b in idxs:
                if a == b or (a, b) in links:
                    continue
                if distance_m(stops[a].lon, stops[a].lat, stops[b].lon, stops[b].lat) < p.same_name_link_m:
                    found[(a, b)] = walk_minutes(stops[a], stops[b], p)
    return found


def _override_links(stops, complexes, overrides: tuple[TransferOverride, ...]) -> dict[tuple[int, int], int]:
    """Links set by transfer_overrides.csv. Every row must match at least one stop pair."""
    found: dict[tuple[int, int], int] = {}
    by_name: dict[str, list[Complex]] = defaultdict(list)
    for c in complexes:
        by_name[c.name_ja].append(c)
    for o in overrides:
        hits = 0
        for c in by_name.get(o.station_ja, []):
            side_a = [s for s in c.stops if stops[s].railway in o.railways_a]
            side_b = [s for s in c.stops if stops[s].railway in o.railways_b]
            for a in side_a:
                for b in side_b:
                    found[(a, b)] = found[(b, a)] = o.minutes
                    hits += 1
        if hits == 0:
            raise ConfigError(f"transfer override at {o.station_ja} "
                              f"({'|'.join(sorted(o.railways_a))} / {'|'.join(sorted(o.railways_b))}) matches no stops")
    return found


def build_transfers(stops: tuple[Stop, ...], served: frozenset[int], complexes: tuple[Complex, ...],
                    groups, overrides: tuple[TransferOverride, ...],
                    p: TransferParams) -> tuple[tuple[tuple[int, int], ...], ...]:
    """Per stop: ((stop, minutes), ...) reachable by a change of train, itself included."""
    stop_index = {s.id: i for i, s in enumerate(stops)}
    grouped = _group_links(stops, stop_index, groups, p)
    links = {**grouped, **_same_name_links(stops, served, grouped, p)}
    links = {**links, **_override_links(stops, complexes, overrides)}
    out: list[list[tuple[int, int]]] = [[(i, p.same_stop_min)] for i in range(len(stops))]
    for (a, b), t in sorted(links.items()):
        out[a].append((b, t))
    return tuple(tuple(x) for x in out)
