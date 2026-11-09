"""Write the derived data files that the app ships (no raw timetables, ever)."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
from array import array
from pathlib import Path

from .build import U8_NONE, U16_NONE, U16_SAME, Matrices
from .config import CONFIG_DIR, BuildConfig
from .graph import Network
from .timeutil import fmt_hhmm
from .universe import Universe

FORMAT_VERSION = 1

SEATED_FLAG = 0x8000   # the train runs through from the previous hop: no change of train
WALK_FLAG = 0x4000     # the hop boards at another station than the previous hop ended at
RAILWAY_MASK = 0x3FFF

# name -> (typecode, shape keys, description). Every file is little-endian and row-major.
# "length" is the number of values of a variable-length file.
LAYOUT = {
    "out_min.u16": ("H", ("stations", "candidates"), "Outbound median minutes, origin station -> candidate"),
    "out_xfer.u8": ("B", ("stations", "candidates"), "Outbound transfers of the representative journey"),
    "out_routes.u16": ("H", ("out_routes_len",),
                       "Outbound routes, one block per candidate (see out_routes_idx.u32), one route per "
                       "origin station in index order: [hop count, then per hop: railway | flags, "
                       "boarding station only if flags has 0x4000 (walk from the previous hop's end), "
                       "station where the hop ends]. 0x8000 = seated through-running, no change of train"),
    "out_routes_idx.u32": ("I", ("candidates_plus_1",), "Start of each candidate's block in out_routes.u16"),
    "home_min.u16": ("H", ("candidates", "stations"), "Home median minutes, candidate -> home station"),
    "home_xfer.u8": ("B", ("candidates", "stations"), "Home transfers of the representative journey"),
    "home_routes.u16": ("H", ("home_routes_len",),
                        "Home routes, one block per candidate (see home_routes_idx.u32), one route per home "
                        "station in index order, same encoding as out_routes.u16"),
    "home_routes_idx.u32": ("I", ("candidates_plus_1",), "Start of each candidate's block in home_routes.u16"),
    "last_dep.u16": ("H", ("candidates", "stations"),
                     "Latest departure from the candidate that still reaches the home station, "
                     "minutes after 00:00 of the service day (may exceed 1440)"),
}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def config_digest(config_dir: Path = CONFIG_DIR) -> str:
    h = hashlib.sha256()
    for p in sorted(config_dir.iterdir()):
        if p.is_file():
            h.update(p.name.encode() + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()


U32 = "I" if array("I").itemsize == 4 else "L"


def _pack(typecode: str, values) -> bytes:
    arr = array(U32 if typecode == "I" else typecode, values)
    if sys.byteorder != "little":
        arr.byteswap()
    return arr.tobytes()


def encode_route(route, start: int, station_of: dict[int, int]) -> list[int]:
    """[count, (railway|flags, [board], end) per hop]. `start` is the complex the route leaves from."""
    out = [len(route)]
    prev = start
    for railway, board, end, seated in route:
        if railway > RAILWAY_MASK:
            raise ValueError(f"railway index {railway} does not fit the route encoding")
        walk = board != prev
        out.append(railway | (SEATED_FLAG if seated else 0) | (WALK_FLAG if walk else 0))
        if walk:
            out.append(station_of[board])
        out.append(station_of[end])
        prev = end
    return out


def _route_blocks(m: Matrices, outbound: bool) -> tuple[list[int], list[int]]:
    """Encode routes block by block (one block per candidate). Returns (values, block starts + length)."""
    uni = m.universe
    station_of = uni.station_of()
    values: list[int] = []
    starts: list[int] = []
    for c in range(m.n_candidates):
        starts.append(len(values))
        for s in range(m.n_stations):
            cell = m.outbound[s][c] if outbound else m.home[c][s]
            values.extend(encode_route(cell.route, uni.complexes[s if outbound else c], station_of))
    starts.append(len(values))
    return values, starts


def binary_payloads(m: Matrices) -> dict[str, bytes]:
    out_cells = [c for row in m.outbound for c in row]
    home_cells = [c for row in m.home for c in row]
    out_routes, out_idx = _route_blocks(m, outbound=True)
    home_routes, home_idx = _route_blocks(m, outbound=False)
    return {
        "out_min.u16": _pack("H", (c.minutes for c in out_cells)),
        "out_xfer.u8": _pack("B", (c.transfers for c in out_cells)),
        "out_routes.u16": _pack("H", out_routes),
        "out_routes_idx.u32": _pack("I", out_idx),
        "home_min.u16": _pack("H", (c.minutes for c in home_cells)),
        "home_xfer.u8": _pack("B", (c.transfers for c in home_cells)),
        "home_routes.u16": _pack("H", home_routes),
        "home_routes_idx.u32": _pack("I", home_idx),
        "last_dep.u16": _pack("H", (c.last_dep for c in home_cells)),
    }


def stations_doc(net: Network, uni: Universe) -> dict:
    railway_index = {r.id: i for i, r in enumerate(net.railways)}
    stations = []
    for i, ci in enumerate(uni.complexes):
        c = net.complexes[ci]
        stops = [[railway_index[net.stops[s].railway], round(net.stops[s].lon, 6), round(net.stops[s].lat, 6)]
                 for s in c.stops]
        stations.append({"i": i, "id": c.id, "ja": c.name_ja, "en": c.name_en, "aliases": list(c.aliases),
                         "lng": c.lon, "lat": c.lat, "lines": c.line_count, "candidate": i < uni.n_candidates,
                         "railways": sorted({railway_index[r] for r in c.railways}), "stops": stops,
                         "dist_km": c.dist_km})
    railways = [{"i": i, "id": r.id, "ja": r.title_ja, "en": r.title_en, "color": r.color}
                for i, r in enumerate(net.railways)]
    return {"format": FORMAT_VERSION, "n_stations": len(stations), "n_candidates": uni.n_candidates,
            "stations": stations, "railways": railways}


def candidates_csv(net: Network, uni: Universe) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["index", "id", "ja", "en", "lines", "dist_km", "reason"])
    for i in range(uni.n_candidates):
        c = net.complexes[uni.complexes[i]]
        w.writerow([i, c.id, c.name_ja, c.name_en, c.line_count, f"{c.dist_km:.1f}", uni.reasons[i]])
    return buf.getvalue()


def meta_doc(net: Network, uni: Universe, m: Matrices, cfg: BuildConfig, payloads: dict[str, bytes],
             texts: dict[str, bytes]) -> dict:
    dims = {"stations": m.n_stations, "candidates": m.n_candidates, "candidates_plus_1": m.n_candidates + 1,
            "out_routes_len": len(payloads["out_routes.u16"]) // 2,
            "home_routes_len": len(payloads["home_routes.u16"]) // 2}
    files = {name: {"dtype": {"H": "uint16", "B": "uint8", "I": "uint32"}[tc],
                    "shape": [dims.get(x, x) for x in shape],
                    "description": desc, "sha256": _sha256(payloads[name])}
             for name, (tc, shape, desc) in LAYOUT.items()}
    files.update({name: {"sha256": _sha256(data)} for name, data in texts.items()})
    return {
        "format": FORMAT_VERSION,
        "source": {"name": "Mini Tokyo 3D", "repo": cfg.mt3d_repo, "commit": net.commit, "calendar": cfg.calendar},
        "config_sha256": config_digest(cfg.config_dir),
        "windows": {"outbound": [fmt_hhmm(x) for x in cfg.outbound_window],
                    "home": [fmt_hhmm(x) for x in cfg.home_window], "horizon_min": cfg.horizon_min},
        "minutes": "median planner-style duration (first boarding to arrival) over a query at every minute "
                   "of the window; paid limited expresses excluded; station complexes as endpoints, no walk",
        "counts": {"stations": m.n_stations, "candidates": m.n_candidates, "railways": len(net.railways),
                   "stations_outside_input_radius": m.n_stations - sum(
                       1 for c in uni.complexes if net.complexes[c].dist_km <= cfg.input_radius_km)},
        "sentinels": {"uint16_none": U16_NONE, "last_dep_same_station": U16_SAME, "uint8_none": U8_NONE,
                      "route_seated_flag": SEATED_FLAG, "route_walk_flag": WALK_FLAG},
        "files": files,
    }


def write_outputs(out_dir: Path, net: Network, uni: Universe, m: Matrices, cfg: BuildConfig) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    payloads = binary_payloads(m)
    texts = {
        "stations.json": json.dumps(stations_doc(net, uni), ensure_ascii=False, separators=(",", ":")).encode(),
        "candidates.csv": candidates_csv(net, uni).encode(),
    }
    meta = meta_doc(net, uni, m, cfg, payloads, texts)
    for name, data in {**payloads, **texts}.items():
        (out_dir / name).write_bytes(data)
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return meta
