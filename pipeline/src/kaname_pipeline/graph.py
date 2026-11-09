"""Assemble the routable network from raw data and the build configuration."""

from __future__ import annotations

from dataclasses import dataclass

from .config import BuildConfig
from .mt3d import RawData, RawRailway
from .network import Complex, Stop, Timetable, build_complexes, build_stops, build_timetable, served_stops
from .transfers import build_transfers


@dataclass(frozen=True)
class Network:
    commit: str
    stops: tuple[Stop, ...]
    stop_complex: tuple[int, ...]
    complexes: tuple[Complex, ...]
    railways: tuple[RawRailway, ...]
    timetable: Timetable
    transfers: tuple[tuple[tuple[int, int], ...], ...]


def build_network(raw: RawData, cfg: BuildConfig) -> Network:
    stops = build_stops(raw.stations, cfg.stop_positions)
    stop_index = {s.id: i for i, s in enumerate(stops)}
    timetable = build_timetable(raw.trips, stop_index)
    served = served_stops(timetable)
    complexes, stop_complex = build_complexes(stops, served, raw.railways, cfg)
    transfers = build_transfers(stops, served, complexes, raw.groups, cfg.transfer_overrides, cfg.transfer)
    return Network(raw.commit, stops, stop_complex, complexes, raw.railways, timetable, transfers)
