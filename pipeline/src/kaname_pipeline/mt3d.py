"""Load and validate the Mini Tokyo 3D data folder (third-party input: trust nothing)."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


class SourceDataError(ValueError):
    """The Mini Tokyo 3D data is missing, at the wrong commit, or malformed."""


@dataclass(frozen=True)
class RawStation:
    id: str
    railway: str
    lon: float
    lat: float
    title_ja: str
    title_en: str
    underground: bool


@dataclass(frozen=True)
class RawRailway:
    id: str
    title_ja: str
    title_en: str
    color: str
    stations: tuple[str, ...]


@dataclass(frozen=True)
class RawTrip:
    id: str
    railway: str
    train_type: str
    stops: tuple[tuple[str, str | None, str | None], ...]  # (stop id, arrival, departure)
    next_trips: tuple[str, ...]


@dataclass(frozen=True)
class RawData:
    commit: str
    stations: tuple[RawStation, ...]
    railways: tuple[RawRailway, ...]
    groups: tuple[tuple[tuple[str, ...], ...], ...]
    trips: tuple[RawTrip, ...]


def _load_json(path: Path) -> list:
    """Every Mini Tokyo 3D file this pipeline reads is a JSON list of objects."""
    if not path.exists():
        raise SourceDataError(f"missing {path}. Run: bash pipeline/fetch_mt3d.sh")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SourceDataError(f"{path.name}: invalid JSON ({exc})") from exc
    if not isinstance(data, list):
        raise SourceDataError(f"{path.name}: expected a JSON list")
    return data


def _objects(items: list, name: str) -> list[dict]:
    if not all(isinstance(x, dict) for x in items):
        raise SourceDataError(f"{name}: every entry must be a JSON object")
    return items


def _str(obj: dict, key: str, where: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value:
        raise SourceDataError(f"{where}: '{key}' must be a non-empty string")
    return value


def _title(obj: dict, where: str) -> tuple[str, str]:
    title = obj.get("title")
    if not isinstance(title, dict):
        raise SourceDataError(f"{where}: missing title")
    ja = _str(title, "ja", where)
    en = title.get("en") if isinstance(title.get("en"), str) else ja
    return ja, en


def parse_station(obj: dict) -> RawStation | None:
    """Return None for stations without coordinates (they cannot be routed)."""
    where = f"station {obj.get('id')!r}"
    sid = _str(obj, "id", where)
    coord = obj.get("coord")
    if coord is None or "railway" not in obj:
        return None
    if not (isinstance(coord, list) and len(coord) == 2 and all(isinstance(c, (int, float)) for c in coord)):
        raise SourceDataError(f"{where}: bad coord {coord!r}")
    ja, en = _title(obj, where)
    altitude = obj.get("altitude", 0)
    underground = isinstance(altitude, (int, float)) and altitude < 0
    return RawStation(sid, _str(obj, "railway", where), float(coord[0]), float(coord[1]), ja, en, underground)


def parse_railway(obj: dict) -> RawRailway:
    where = f"railway {obj.get('id')!r}"
    stations = obj.get("stations")
    if not isinstance(stations, list) or not all(isinstance(s, str) for s in stations):
        raise SourceDataError(f"{where}: bad stations list")
    ja, en = _title(obj, where)
    color = obj.get("color") if isinstance(obj.get("color"), str) else "#888888"
    return RawRailway(_str(obj, "id", where), ja, en, color, tuple(stations))


def parse_trip(obj: dict) -> RawTrip:
    where = f"trip {obj.get('id')!r}"
    tt = obj.get("tt")
    if not isinstance(tt, list) or len(tt) < 1:
        raise SourceDataError(f"{where}: missing timetable")
    stops = []
    for entry in tt:
        if not isinstance(entry, dict):
            raise SourceDataError(f"{where}: bad timetable entry")
        arr, dep = entry.get("a"), entry.get("d")
        if arr is None and dep is None:
            raise SourceDataError(f"{where}: stop without arrival or departure")
        stops.append((_str(entry, "s", where), arr, dep))
    nt = obj.get("nt", [])
    if not isinstance(nt, list) or not all(isinstance(x, str) for x in nt):
        raise SourceDataError(f"{where}: bad next-trip list")
    return RawTrip(_str(obj, "id", where), _str(obj, "r", where), _str(obj, "y", where),
                   tuple(stops), tuple(nt))


def parse_groups(raw) -> tuple[tuple[tuple[str, ...], ...], ...]:
    if not isinstance(raw, list):
        raise SourceDataError("station-groups.json: expected a list")
    out = []
    for group in raw:
        if not isinstance(group, list) or not all(
            isinstance(sub, list) and all(isinstance(s, str) for s in sub) for sub in group
        ):
            raise SourceDataError("station-groups.json: bad group entry")
        out.append(tuple(tuple(sub) for sub in group))
    return tuple(out)


def _git(repo_dir: Path, *args: str) -> str:
    try:
        res = subprocess.run(["git", "-C", str(repo_dir), *args], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SourceDataError(f"{repo_dir} is not a git checkout. Run: bash pipeline/fetch_mt3d.sh") from exc
    return res.stdout.strip()


def git_commit(repo_dir: Path) -> str:
    """The checked-out commit. Local changes under data/ are an error: the build must match the pin."""
    commit = _git(repo_dir, "rev-parse", "HEAD")
    if _git(repo_dir, "status", "--porcelain", "--", "data"):
        raise SourceDataError(f"{repo_dir / 'data'} has local changes. Run: bash pipeline/fetch_mt3d.sh")
    return commit


def load(repo_dir: Path, expected_commit: str, calendar: str, excluded_types: frozenset[str]) -> RawData:
    """Load the data folder at the pinned commit. Only trips of `calendar` are kept,
    and trips whose train type is in `excluded_types` are dropped."""
    commit = git_commit(repo_dir)
    if commit != expected_commit:
        raise SourceDataError(f"Mini Tokyo 3D checkout is at {commit}, config pins {expected_commit}. "
                              "Run: bash pipeline/fetch_mt3d.sh")
    data = repo_dir / "data"
    stations = tuple(s for s in map(parse_station, _objects(_load_json(data / "stations.json"), "stations.json"))
                     if s is not None)
    railways = tuple(parse_railway(r) for r in _objects(_load_json(data / "railways.json"), "railways.json"))
    groups = parse_groups(_load_json(data / "station-groups.json"))
    files = sorted((data / "train-timetables").glob("*.json"))
    if not files:
        raise SourceDataError(f"no timetables in {data / 'train-timetables'}")
    suffix = "." + calendar
    trips = tuple(
        parse_trip(t)
        for f in files
        for t in _objects(_load_json(f), f.name)
        if str(t.get("id", "")).endswith(suffix) and str(t.get("y")) not in excluded_types
    )
    if not trips:
        raise SourceDataError(f"no trips for calendar {calendar!r}")
    return RawData(commit, stations, railways, groups, trips)
