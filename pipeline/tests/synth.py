"""Synthetic RawData builders for unit tests (no files, no git)."""

from __future__ import annotations

from dataclasses import replace

from kaname_pipeline.config import load_config
from kaname_pipeline.mt3d import RawData, RawRailway, RawStation, RawTrip


def st(sid: str, lon: float, lat: float, ja: str, en: str | None = None, underground: bool = False) -> RawStation:
    return RawStation(sid, sid.rsplit(".", 1)[0], lon, lat, ja, en or ja, underground)


def rw(rid: str, ja: str, stations: list[str]) -> RawRailway:
    return RawRailway(rid, ja, ja, "#000000", tuple(stations))


def tr(tid: str, railway: str, stops: list[tuple[str, str | None, str | None]], nt: tuple[str, ...] = (),
       ttype: str = "Op.Local") -> RawTrip:
    return RawTrip(tid, railway, ttype, tuple(stops), nt)


def every(prefix: str, railway: str, stops: list[str], start: int, end: int, step: int, run: int,
          nt_prefix: str | None = None) -> list[RawTrip]:
    """Trips departing stops[0] every `step` minutes in [start, end), `run` minutes per hop."""
    out = []
    for k, t0 in enumerate(range(start, end, step)):
        seq = []
        for i, s in enumerate(stops):
            t = t0 + i * run
            hhmm = f"{t // 60:02d}:{t % 60:02d}"
            seq.append((s, None if i == 0 else hhmm, None if i == len(stops) - 1 else hhmm))
        nt = (f"{nt_prefix}.{k}",) if nt_prefix else ()
        out.append(tr(f"{prefix}.{k}", railway, seq, nt))
    return out


def raw(stations, railways, groups, trips) -> RawData:
    return RawData("0" * 40, tuple(stations), tuple(railways), tuple(groups), tuple(trips))


def cfg(**changes):
    base = load_config()
    base = replace(base, stop_positions=(), transfer_overrides=(), candidate_overrides=(),
                   center=(139.70, 35.68))
    return replace(base, **changes)
