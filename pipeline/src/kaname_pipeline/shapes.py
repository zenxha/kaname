"""Track shapes for the map: the line between each pair of neighboring stations follows the real track.

A separate step after the build (`fetch-shapes`, then `shapes`). It reads data/stations.json and the MLIT
国土数値情報 railway sections (N02, CC BY 4.0) and writes data/shapes.json. No travel time changes.

For each railway and each pair of neighboring stations, the step searches the track of the railway's own
operator, from the track near one station to the track near the next. A pair with no sensible track path
gets an empty entry, and the app draws a straight line for it.
"""

from __future__ import annotations

import hashlib
import heapq
import http.client
import io
import json
import math
import urllib.request
import zipfile
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from .config import REPO_DIR
from .geo import distance_m

Point = tuple[float, float]  # (lng, lat)

FORMAT_VERSION = 1
PRECISION = 5                     # encoded polylines keep 5 decimals, about 1 m
CACHE_DIR = REPO_DIR / ".cache" / "n02"
USER_AGENT = "kaname-pipeline/0.1 (https://github.com/zenxha/kaname)"
CREDIT = "国土数値情報（鉄道データ）国土交通省"

#: The search looks for track within the first radius of a station, then within the second. Mini Tokyo 3D
#: puts a few platforms several hundred meters off (Keisei at 日暮里 is about 350 m off).
SNAP_M = (300.0, 600.0)
#: A track path longer than this is not the line between the two stations (a branch the data lacks).
DETOUR_FACTOR = 1.6
DETOUR_EXTRA_M = 1500.0
#: A straight link between a station and the track counts this many times its length in the search.
LINK_WEIGHT = 5.0
#: Points closer than this to the simplified line are dropped.
SIMPLIFY_M = 6.0
#: Grid cells for the nearby search, in degrees. A cell is wider than the larger snap radius.
CELL_DEG = 0.01

#: The N02 operator names (N02_004) whose track each railway may use, by the railway id prefix.
#: Keisei trains also run on the Hokuso, Narita Rapid Railway Access and Shibayama tracks.
OPERATORS: Mapping[str, tuple[str, ...]] = MappingProxyType({
    "JR-East": ("東日本旅客鉄道",), "JR-Central": ("東海旅客鉄道",), "TokyoMetro": ("東京地下鉄",),
    "Toei": ("東京都",), "Tokyu": ("東急電鉄",), "Keio": ("京王電鉄",), "Odakyu": ("小田急電鉄",),
    "Seibu": ("西武鉄道",), "Tobu": ("東武鉄道",), "Keikyu": ("京浜急行電鉄",), "Sotetsu": ("相模鉄道",),
    "Keisei": ("京成電鉄", "北総鉄道", "成田高速鉄道アクセス", "芝山鉄道", "新京成電鉄"),
    "Hokuso": ("北総鉄道",), "Shibayama": ("芝山鉄道",), "TWR": ("東京臨海高速鉄道",),
    "Minatomirai": ("横浜高速鉄道",), "YokohamaMunicipal": ("横浜市",), "SaitamaRailway": ("埼玉高速鉄道",),
    "MIR": ("首都圏新都市鉄道",), "ToyoRapid": ("東葉高速鉄道",), "Yurikamome": ("ゆりかもめ",),
    "TokyoMonorail": ("東京モノレール",), "TamaMonorail": ("多摩都市モノレール",),
    "ChibaMonorail": ("千葉都市モノレール",), "ShonanMonorail": ("湘南モノレール",),
    "YokohamaSeaside": ("横浜シーサイドライン",), "SaitamaTransit": ("埼玉新都市交通",), "Yamaman": ("山万",),
    "KantoRailway": ("関東鉄道",), "Ryutetsu": ("流鉄",), "Kominato": ("小湊鐵道",), "Isumi": ("いすみ鉄道",),
    "Enoden": ("江ノ島電鉄",), "Chichibu": ("秩父鉄道",),
})


class ShapeDataError(ValueError):
    """The N02 file or the station data cannot be read, or the download is not the pinned file."""


@dataclass(frozen=True)
class N02Source:
    version: str
    url: str
    sha256: str
    member: str      # the GeoJSON file inside the zip
    file: str        # the zip's name in the cache


N02 = N02Source(
    version="N02-25",
    url="https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip",
    sha256="aaf76af133b2e771e538fabc4646d2e443dc1d5a67b221382a28d744e706cc9f",
    member="N02-25_GML/UTF-8/N02-25_RailroadSection.geojson",
    file="N02-25_GML.zip",
)


def _metres(a: Point, b: Point) -> float:
    return distance_m(a[0], a[1], b[0], b[1])


# --- encoded polylines (the published algorithm: latitude first, 5 decimals) ---

def _encode_value(v: int) -> str:
    v = ~(v << 1) if v < 0 else v << 1
    out = []
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1F)) + 63))
        v >>= 5
    out.append(chr(v + 63))
    return "".join(out)


def encode_polyline(points: Sequence[Point]) -> str:
    out, last_x, last_y = [], 0, 0
    for lng, lat in points:
        x, y = round(lng * 10**PRECISION), round(lat * 10**PRECISION)
        out.append(_encode_value(y - last_y) + _encode_value(x - last_x))
        last_x, last_y = x, y
    return "".join(out)


def decode_polyline(text: str) -> list[Point]:
    values, shift, acc = [], 0, 0
    for ch in text:
        b = ord(ch) - 63
        acc |= (b & 0x1F) << shift
        shift += 5
        if b < 0x20:
            values.append(~(acc >> 1) if acc & 1 else acc >> 1)
            shift, acc = 0, 0
    points, x, y = [], 0, 0
    for dy, dx in zip(values[0::2], values[1::2]):
        x, y = x + dx, y + dy
        points.append((x / 10**PRECISION, y / 10**PRECISION))
    return points


# --- simplification (Douglas-Peucker in local metres) ---

def _offset_m(p: Point, a: Point, b: Point) -> float:
    """Distance from p to the straight line through a and b."""
    kx = 111_320.0 * math.cos(math.radians(a[1]))
    ax, ay, bx, by, px, py = a[0] * kx, a[1] * 110_540.0, b[0] * kx, b[1] * 110_540.0, p[0] * kx, p[1] * 110_540.0
    length = math.hypot(bx - ax, by - ay)
    if length == 0:
        return math.hypot(px - ax, py - ay)
    return abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length


def simplify(points: Sequence[Point], tolerance_m: float) -> list[Point]:
    if len(points) < 3:
        return list(points)
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        k, worst = max(((k, _offset_m(points[k], points[i], points[j])) for k in range(i + 1, j)), key=lambda t: t[1])
        if worst > tolerance_m:
            keep.add(k)
            stack.extend(((i, k), (k, j)))
    return [points[k] for k in sorted(keep)]


# --- the track graph and the search ---

@dataclass(frozen=True)
class TrackGraph:
    edges: Mapping[Point, Mapping[Point, float]]
    cells: Mapping[tuple[int, int], tuple[Point, ...]]


def _cell(pt: Point) -> tuple[int, int]:
    return (math.floor(pt[0] / CELL_DEG), math.floor(pt[1] / CELL_DEG))


def track_graph(lines: Iterable[Sequence[Point]]) -> TrackGraph:
    """Vertices are track points. Sections join where they share a point."""
    edges: dict[Point, dict[Point, float]] = defaultdict(dict)
    for line in lines:
        for a, b in zip(line, line[1:]):
            if a != b:
                edges[a][b] = edges[b][a] = _metres(a, b)
    cells: dict[tuple[int, int], list[Point]] = defaultdict(list)
    for v in sorted(edges):
        cells[_cell(v)].append(v)
    return TrackGraph(MappingProxyType(dict(edges)), MappingProxyType({k: tuple(v) for k, v in cells.items()}))


#: The search's virtual end node, behind the second station.
_END: Point = (math.inf, math.inf)


def _near(g: TrackGraph, pt: Point, radius_m: float) -> list[Point]:
    cx, cy = _cell(pt)
    return [v for dx in (-1, 0, 1) for dy in (-1, 0, 1) for v in g.cells.get((cx + dx, cy + dy), ())
            if _metres(v, pt) <= radius_m]


def _search(g: TrackGraph, a: Point, b: Point, radius_m: float) -> list[Point] | None:
    """A* from station a over the track to station b. The straight links between a station and the track
    count LINK_WEIGHT times their length, so the path joins the track as close to each station as it can.
    A virtual end node behind b holds the weighted last link, so the first time it leaves the queue the
    path is the best one."""
    starts, ends = _near(g, a, radius_m), _near(g, b, radius_m)
    if not starts or not ends:
        return None
    end_link = {v: LINK_WEIGHT * _metres(v, b) for v in ends}
    limit = DETOUR_FACTOR * _metres(a, b) + DETOUR_EXTRA_M
    bound = limit + 2 * LINK_WEIGHT * radius_m
    cost: dict[Point, float] = {v: LINK_WEIGHT * _metres(a, v) for v in starts}
    came: dict[Point, Point | None] = {v: None for v in starts}
    queue = [(cost[v] + _metres(v, b), cost[v], v) for v in starts]
    heapq.heapify(queue)
    while queue:
        f, c, v = heapq.heappop(queue)
        if c > cost[v]:
            continue
        if f > bound:
            return None
        if v == _END:
            path = [came[_END]]
            while (prev := came[path[-1]]) is not None:
                path.append(prev)
            path = path[::-1]
            length = _metres(a, path[0]) + sum(_metres(x, y) for x, y in zip(path, path[1:])) + _metres(path[-1], b)
            return path if length <= limit else None
        steps = list(g.edges[v].items()) + ([(_END, end_link[v])] if v in end_link else [])
        for u, w in steps:
            if c + w < cost.get(u, math.inf):
                cost[u], came[u] = c + w, v
                heapq.heappush(queue, (c + w + (0.0 if u == _END else _metres(u, b)), c + w, u))
    return None


def track_path(g: TrackGraph, a: Point, b: Point) -> list[Point] | None:
    """The track points from station a to station b, or None. A path of one shared point is no track
    shape. A wider snap is tried only when a station has no track close by at all."""
    for radius in SNAP_M:
        if _near(g, a, radius) and _near(g, b, radius):
            path = _search(g, a, b, radius)
            return path if path is not None and len(path) >= 2 else None
    return None


# --- the document ---

def _platform(stations: Sequence[dict], s: int, railway: int) -> Point:
    st = stations[s]
    stop = next((x for x in st.get("stops", []) if x[0] == railway), None)
    return (stop[1], stop[2]) if stop else (st["lng"], st["lat"])


def _pairs(seq: Sequence[int], loop: bool) -> list[tuple[int, int]]:
    pairs = list(zip(seq, seq[1:]))
    return pairs + [(seq[-1], seq[0])] if loop and len(seq) > 2 else pairs


def shapes_doc(stations_doc: dict, sections: Mapping[str, Sequence[Sequence[Point]]]) -> dict:
    """One encoded polyline per pair of neighboring stations, in each railway's running order. A loop line
    has one more entry, from its last station back to its first. "" means no track path: draw it straight."""
    stations = stations_doc["stations"]
    graphs: dict[str, TrackGraph] = {}

    def graph_for(prefix: str) -> TrackGraph:
        if prefix not in graphs:
            graphs[prefix] = track_graph(line for op in OPERATORS.get(prefix, ()) for line in sections.get(op, ()))
        return graphs[prefix]

    railways, pairs, on_track = [], 0, 0
    for rw in stations_doc["railways"]:
        g = graph_for(rw["id"].split(".")[0])
        entries = []
        for s, t in _pairs(rw["stations"], rw.get("loop", False)):
            path = track_path(g, _platform(stations, s, rw["i"]), _platform(stations, t, rw["i"])) if g.edges else None
            entries.append(encode_polyline(simplify(path, SIMPLIFY_M)) if path else "")
            pairs, on_track = pairs + 1, on_track + (path is not None)
        railways.append(entries)
    return {"format": FORMAT_VERSION, "precision": PRECISION, "pairs": pairs, "on_track": on_track,
            "railways": railways}


# --- files ---

def read_sections(data: bytes, source: N02Source, center: Point, radius_km: float) -> dict[str, list[list[Point]]]:
    """Track sections with a point within the area (plus 10 km), grouped by operator."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            doc = json.loads(z.read(source.member))
        features = doc["features"]
    except (zipfile.BadZipFile, KeyError, ValueError, TypeError) as exc:
        raise ShapeDataError(f"the N02 file {source.file} cannot be read: {exc!r}") from exc
    limit_m = (radius_km + 10.0) * 1000.0
    out: dict[str, list[list[Point]]] = {}
    for f in features:
        geom, props = f.get("geometry") or {}, f.get("properties") or {}
        if geom.get("type") != "LineString":
            continue
        line = [(round(x, 6), round(y, 6)) for x, y in geom["coordinates"]]
        if any(_metres(pt, center) <= limit_m for pt in line):
            out.setdefault(props.get("N02_004", ""), []).append(line)
    return out


def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/zip"})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return res.read()
    except (OSError, http.client.HTTPException) as exc:
        raise ShapeDataError(f"download failed: {url}: {exc}") from exc


def _check(data: bytes, source: N02Source) -> None:
    digest = hashlib.sha256(data).hexdigest()
    if digest != source.sha256:
        raise ShapeDataError(f"{source.file} has checksum {digest}, not the pinned {source.sha256}. "
                             "MLIT may have issued a new file: check it, then update N02 in shapes.py")


def fetch(cache: Path = CACHE_DIR, source: N02Source = N02) -> Path:
    """Downloads the pinned N02 zip into the cache. A file with another checksum is not kept."""
    data = _download(source.url)
    _check(data, source)
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / source.file
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(data)
    tmp.replace(path)
    return path


def build(out_dir: Path, center: Point, radius_km: float, cache: Path = CACHE_DIR, source: N02Source = N02) -> dict:
    """Writes shapes.json next to stations.json."""
    try:
        stations_raw = (out_dir / "stations.json").read_bytes()
        stations_doc = json.loads(stations_raw)
    except (OSError, ValueError) as exc:
        raise ShapeDataError(f"run `kaname-pipeline build` first: {exc}") from exc
    try:
        data = (cache / source.file).read_bytes()
    except OSError as exc:
        raise ShapeDataError(f"run `kaname-pipeline fetch-shapes` first: {exc}") from exc
    _check(data, source)
    doc = {"source": {"credit": f"{CREDIT}（{source.version}、加工: kaname）", "version": source.version},
           "stations_sha256": hashlib.sha256(stations_raw).hexdigest(),
           **shapes_doc(stations_doc, read_sections(data, source, center, radius_km))}
    (out_dir / "shapes.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return doc
