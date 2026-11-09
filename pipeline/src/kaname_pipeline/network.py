"""Routable network: stops, station complexes, the sorted connection timetable and transfers."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass

from .config import BuildConfig, StopPosition
from .geo import distance_m
from .mt3d import RawData, RawRailway, RawStation, RawTrip
from .timeutil import unwrap_trip_times

_SUFFIX = re.compile(r"[（(〈<].*$")
_SLUG = re.compile(r"[^a-z0-9]+")
_BRANCH = re.compile(r"^(.+?線).*支線$")


class NetworkError(ValueError):
    """The source data cannot form a consistent network."""


@dataclass(frozen=True)
class Stop:
    id: str
    railway: str
    lon: float
    lat: float
    name_key: str
    name_ja: str
    name_en: str
    underground: bool
    extra_min: int


@dataclass(frozen=True)
class Complex:
    id: str
    name_ja: str
    name_en: str
    aliases: tuple[str, ...]
    lon: float
    lat: float
    stops: tuple[int, ...]
    railways: tuple[str, ...]
    line_count: int
    dist_km: float


@dataclass(frozen=True)
class Timetable:
    """Connections sorted by (dep, arr, trip, seq). Index i describes one hop of one trip."""
    dep: tuple[int, ...]
    arr: tuple[int, ...]
    u: tuple[int, ...]
    v: tuple[int, ...]
    trip: tuple[int, ...]
    next_in_trip: tuple[int, ...]       # next connection of the same trip, -1 at the end
    trip_first_conn: tuple[int, ...]    # first connection of each trip
    trip_next: tuple[tuple[int, ...], ...]  # through-running successors (stay seated)
    trip_railway: tuple[str, ...]
    trip_ids: tuple[str, ...]


def display_name(text: str) -> str:
    """'押上〈スカイツリー前〉' -> '押上'; 'Oshiage (Skytree)' -> 'Oshiage'."""
    return _SUFFIX.sub("", unicodedata.normalize("NFKC", text)).strip()


def name_key(ja: str) -> str:
    """Key under which same-named stops are merged: ヶ and ケ count as the same kana."""
    return display_name(ja).replace("ヶ", "ケ").replace("ヵ", "カ")


def line_family(title_ja: str) -> str:
    """'鶴見線大川支線' -> '鶴見線'; '川越線(川越-高麗川間)' -> '川越線'. A branch is not a separate line."""
    base = display_name(title_ja)
    m = _BRANCH.match(base)
    return m.group(1) if m else base


def slugify(text: str) -> str:
    return _SLUG.sub("-", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()).strip("-")


def build_stops(stations: tuple[RawStation, ...], positions: tuple[StopPosition, ...]) -> tuple[Stop, ...]:
    by_id = {p.stop_id: p for p in positions}
    known = {s.id for s in stations}
    unknown = sorted(set(by_id) - known)
    if unknown:
        raise NetworkError(f"stop_positions.csv names unknown stops: {', '.join(unknown)}")
    out = []
    for s in stations:
        pos = by_id.get(s.id)
        lon, lat, extra = (pos.lon, pos.lat, pos.extra_min) if pos else (s.lon, s.lat, 0)
        out.append(Stop(s.id, s.railway, lon, lat, name_key(s.title_ja), display_name(s.title_ja),
                        display_name(s.title_en), s.underground, extra))
    return tuple(out)


def _trip_connections(t: RawTrip, ti: int, stop_index: dict[str, int]) -> list[tuple[int, int, int, int, int, int]]:
    """(dep, arr, trip, seq, u, v) for one trip. Stops without coordinates are skipped,
    so the train runs straight from the previous routable stop to the next one."""
    times = unwrap_trip_times([(a, d) for _, a, d in t.stops])
    seq = [(stop_index[s], tm) for (s, _, _), tm in zip(t.stops, times) if s in stop_index]
    conns = []
    for k, ((u, (_, dep)), (v, (arr, _))) in enumerate(zip(seq, seq[1:])):
        if u != v:
            conns.append((dep, arr, ti, k, u, v))
    return conns


def build_timetable(trips: tuple[RawTrip, ...], stop_index: dict[str, int]) -> Timetable:
    ordered = sorted(trips, key=lambda t: t.id)
    trip_pos = {t.id: i for i, t in enumerate(ordered)}
    if len(trip_pos) != len(ordered):
        raise NetworkError("duplicate trip ids in the timetable")
    rows = []
    for ti, t in enumerate(ordered):
        try:
            rows.extend(_trip_connections(t, ti, stop_index))
        except ValueError as exc:
            raise NetworkError(f"trip {t.id}: {exc}") from exc
    rows.sort()
    n_trips = len(ordered)
    nxt = [-1] * len(rows)
    first = [-1] * n_trips
    last_seen: dict[int, int] = {}
    for i in sorted(range(len(rows)), key=lambda i: (rows[i][2], rows[i][3])):
        trip = rows[i][2]
        if trip in last_seen:
            nxt[last_seen[trip]] = i
        else:
            first[trip] = i
        last_seen[trip] = i
    trip_next = tuple(_through_links(ordered, trip_pos, rows, first, last_seen))
    return Timetable(
        dep=tuple(r[0] for r in rows), arr=tuple(r[1] for r in rows), u=tuple(r[4] for r in rows),
        v=tuple(r[5] for r in rows), trip=tuple(r[2] for r in rows), next_in_trip=tuple(nxt),
        trip_first_conn=tuple(first), trip_next=trip_next,
        trip_railway=tuple(t.railway for t in ordered), trip_ids=tuple(t.id for t in ordered))


def _through_links(ordered, trip_pos, rows, first, last) -> list[tuple[int, ...]]:
    """Keep a through-running link only if the next trip departs after this one arrives."""
    out = []
    for ti, t in enumerate(ordered):
        links = []
        for nid in t.next_trips:
            nj = trip_pos.get(nid)
            if nj is None or ti not in last or first[nj] < 0:
                continue
            if rows[first[nj]][0] >= rows[last[ti]][1]:
                links.append(nj)
        out.append(tuple(links))
    return out


def served_stops(tt: Timetable) -> frozenset[int]:
    return frozenset(tt.u) | frozenset(tt.v)


def _components(stops: tuple[Stop, ...], members: list[int], radius_m: float) -> list[list[int]]:
    """Single-linkage clusters of same-named stops within radius_m."""
    parent = {i: i for i in members}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a in members:
        for b in members:
            if a < b and distance_m(stops[a].lon, stops[a].lat, stops[b].lon, stops[b].lat) < radius_m:
                parent[find(a)] = find(b)
    clusters: dict[int, list[int]] = defaultdict(list)
    for i in members:
        clusters[find(i)].append(i)
    return [sorted(c) for c in clusters.values()]


def _most_common(values: list[str]) -> str:
    counts = Counter(values)
    return min(counts, key=lambda v: (-counts[v], len(v), v))


def _make_complex(stops, members, railways_by_id, line_exclude, center) -> Complex:
    ss = [stops[i] for i in members]
    lon = sum(s.lon for s in ss) / len(ss)
    lat = sum(s.lat for s in ss) / len(ss)
    railways = tuple(sorted({s.railway for s in ss}))
    titles = {line_family(railways_by_id[r].title_ja) for r in railways
              if r in railways_by_id and r not in line_exclude}
    aliases = tuple(sorted({s.name_ja for s in ss} | {s.name_en for s in ss}))
    return Complex(id="", name_ja=_most_common([s.name_ja for s in ss]), name_en=_most_common([s.name_en for s in ss]),
                   aliases=aliases, lon=round(lon, 6), lat=round(lat, 6), stops=tuple(members),
                   railways=railways, line_count=len(titles),
                   dist_km=round(distance_m(center[0], center[1], lon, lat) / 1000, 3))


def _assign_ids(stops: tuple[Stop, ...], items: list[Complex]) -> list[Complex]:
    by_slug: dict[str, list[Complex]] = defaultdict(list)
    for c in items:
        by_slug[slugify(c.name_en) or "station"].append(c)
    out = []
    for slug, group in by_slug.items():
        if len(group) == 1:
            out.append(_with_id(group[0], slug))
            continue
        taken: Counter = Counter()
        for c in sorted(group, key=lambda c: (c.dist_km, c.lon)):
            operator = slugify(stops[c.stops[0]].id.split(".")[0])
            cid = f"{slug}-{operator}"
            taken[cid] += 1
            out.append(_with_id(c, cid if taken[cid] == 1 else f"{cid}-{taken[cid]}"))
    return sorted(out, key=lambda c: c.id)


def _with_id(c: Complex, cid: str) -> Complex:
    return Complex(cid, c.name_ja, c.name_en, c.aliases, c.lon, c.lat, c.stops, c.railways, c.line_count, c.dist_km)


def build_complexes(stops: tuple[Stop, ...], served: frozenset[int], railways: tuple[RawRailway, ...],
                    cfg: BuildConfig) -> tuple[tuple[Complex, ...], tuple[int, ...]]:
    """Group served stops into station complexes. Returns (complexes, complex index per stop or -1)."""
    by_name: dict[str, list[int]] = defaultdict(list)
    for i in sorted(served):
        by_name[stops[i].name_key].append(i)
    railways_by_id = {r.id: r for r in railways}
    items = [_make_complex(stops, members, railways_by_id, cfg.line_count_exclude, cfg.center)
             for idxs in by_name.values() for members in _components(stops, idxs, cfg.merge_radius_m)]
    complexes = tuple(_assign_ids(stops, items))
    stop_complex = [-1] * len(stops)
    for ci, c in enumerate(complexes):
        for s in c.stops:
            stop_complex[s] = ci
    return complexes, tuple(stop_complex)
