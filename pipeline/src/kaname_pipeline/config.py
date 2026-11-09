"""Build configuration: loaded once from config/build.toml and the reviewed CSV tables."""

from __future__ import annotations

import csv
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

from .timeutil import parse_hhmm

PIPELINE_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = PIPELINE_DIR.parent
CONFIG_DIR = PIPELINE_DIR / "config"
DEFAULT_MT3D_DIR = REPO_DIR / ".cache" / "mt3d"
DEFAULT_OUT_DIR = REPO_DIR / "data"

_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


class ConfigError(ValueError):
    """A configuration file is missing, malformed or inconsistent."""


@dataclass(frozen=True)
class TransferParams:
    same_stop_min: int
    same_subgroup_min: int
    cross_subgroup_base_min: int
    cross_subgroup_min: int
    walk_m_per_min: float
    detour: float
    same_name_link_m: float


@dataclass(frozen=True)
class StopPosition:
    stop_id: str
    lon: float
    lat: float
    extra_min: int
    basis: str


@dataclass(frozen=True)
class TransferOverride:
    station_ja: str
    railways_a: frozenset[str]
    railways_b: frozenset[str]
    minutes: int
    basis: str


@dataclass(frozen=True)
class CandidateOverride:
    station_ja: str
    include: bool
    reason: str


@dataclass(frozen=True)
class BuildConfig:
    mt3d_repo: str
    mt3d_commit: str
    calendar: str
    center: tuple[float, float]
    input_radius_km: float
    candidate_radius_km: float
    candidate_min_lines: int
    merge_radius_m: float
    transfer: TransferParams
    outbound_window: tuple[int, int]
    home_window: tuple[int, int]
    horizon_min: int
    paid_train_types: frozenset[str]
    line_count_exclude: frozenset[str]
    stop_positions: tuple[StopPosition, ...]
    transfer_overrides: tuple[TransferOverride, ...]
    candidate_overrides: tuple[CandidateOverride, ...]
    config_dir: Path = CONFIG_DIR


def _require(table: dict, key: str, kind: type, where: str):
    if key not in table:
        raise ConfigError(f"{where}: missing key '{key}'")
    value = table[key]
    if kind is float and isinstance(value, int) and not isinstance(value, bool):
        value = float(value)
    if not isinstance(value, kind) or isinstance(value, bool):
        raise ConfigError(f"{where}: '{key}' must be {kind.__name__}, got {value!r}")
    return value


def _window(table: dict, key: str) -> tuple[int, int]:
    raw = _require(table, key, list, "[windows]")
    if len(raw) != 2:
        raise ConfigError(f"[windows] {key} must be [start, end]")
    try:
        start, end = parse_hhmm(raw[0]), parse_hhmm(raw[1])
    except ValueError as exc:
        raise ConfigError(f"[windows] {key}: {exc}") from exc
    if end <= start:
        raise ConfigError(f"[windows] {key}: end {raw[1]} must be after start {raw[0]}")
    return start, end


def _read_list(path: Path) -> frozenset[str]:
    if not path.exists():
        raise ConfigError(f"missing config file {path}")
    lines = (ln.strip() for ln in path.read_text(encoding="utf-8").splitlines())
    return frozenset(ln for ln in lines if ln and not ln.startswith("#"))


def _read_csv(path: Path, columns: tuple[str, ...]) -> list[dict[str, str]]:
    if not path.exists():
        raise ConfigError(f"missing config file {path}")
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if tuple(reader.fieldnames or ()) != columns:
            raise ConfigError(f"{path.name}: header must be {','.join(columns)}")
        return [dict(row) for row in reader]


def _int_field(row: dict[str, str], key: str, where: str) -> int:
    try:
        return int(row[key])
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{where}: '{key}' must be an integer, got {row[key]!r}") from exc


def _float_field(row: dict[str, str], key: str, where: str) -> float:
    try:
        return float(row[key])
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{where}: '{key}' must be a number, got {row[key]!r}") from exc


def load_stop_positions(path: Path) -> tuple[StopPosition, ...]:
    rows = _read_csv(path, ("stop_id", "lon", "lat", "extra_min", "basis"))
    out = []
    for n, row in enumerate(rows, start=2):
        where = f"{path.name}:{n}"
        lon, lat = _float_field(row, "lon", where), _float_field(row, "lat", where)
        if not (120.0 < lon < 150.0 and 20.0 < lat < 50.0):
            raise ConfigError(f"{where}: position {lon},{lat} is outside Japan")
        extra = _int_field(row, "extra_min", where)
        if not 0 <= extra <= 15:
            raise ConfigError(f"{where}: extra_min {extra} is outside 0..15")
        out.append(StopPosition(row["stop_id"], lon, lat, extra, row["basis"]))
    return tuple(out)


def load_transfer_overrides(path: Path) -> tuple[TransferOverride, ...]:
    rows = _read_csv(path, ("station_ja", "railways_a", "railways_b", "minutes", "basis"))
    out = []
    for n, row in enumerate(rows, start=2):
        where = f"{path.name}:{n}"
        minutes = _int_field(row, "minutes", where)
        if not 0 <= minutes <= 30:
            raise ConfigError(f"{where}: minutes {minutes} is outside 0..30")
        a = frozenset(x for x in row["railways_a"].split("|") if x)
        b = frozenset(x for x in row["railways_b"].split("|") if x)
        if not a or not b or a & b:
            raise ConfigError(f"{where}: railway sets must be non-empty and disjoint")
        out.append(TransferOverride(row["station_ja"], a, b, minutes, row["basis"]))
    return tuple(out)


def load_candidate_overrides(path: Path) -> tuple[CandidateOverride, ...]:
    rows = _read_csv(path, ("station_ja", "action", "reason"))
    out = []
    for n, row in enumerate(rows, start=2):
        if row["action"] not in ("include", "exclude"):
            raise ConfigError(f"{path.name}:{n}: action must be include or exclude")
        out.append(CandidateOverride(row["station_ja"], row["action"] == "include", row["reason"]))
    return tuple(out)


def _positive(value: float, name: str) -> float:
    if not value > 0:
        raise ConfigError(f"{name} must be greater than 0, got {value}")
    return value


def _check_ranges(cfg: "BuildConfig") -> "BuildConfig":
    t = cfg.transfer
    for name, value in (("input_radius_km", cfg.input_radius_km), ("candidate_radius_km", cfg.candidate_radius_km),
                        ("merge_radius_m", cfg.merge_radius_m), ("horizon_min", cfg.horizon_min),
                        ("walk_m_per_min", t.walk_m_per_min), ("candidate_min_lines", cfg.candidate_min_lines)):
        _positive(value, name)
    if cfg.candidate_radius_km > cfg.input_radius_km:
        raise ConfigError("candidate_radius_km must not exceed input_radius_km")
    if t.detour < 1.0:
        raise ConfigError(f"detour must be at least 1.0, got {t.detour}")
    if min(t.same_stop_min, t.same_subgroup_min, t.cross_subgroup_base_min, t.cross_subgroup_min) < 0:
        raise ConfigError("[transfer] minutes must not be negative")
    if not (120.0 < cfg.center[0] < 150.0 and 20.0 < cfg.center[1] < 50.0):
        raise ConfigError(f"[area] center {cfg.center} is outside Japan")
    return cfg


def _transfer_params(table: dict) -> TransferParams:
    where = "[transfer]"
    return TransferParams(
        same_stop_min=_require(table, "same_stop_min", int, where),
        same_subgroup_min=_require(table, "same_subgroup_min", int, where),
        cross_subgroup_base_min=_require(table, "cross_subgroup_base_min", int, where),
        cross_subgroup_min=_require(table, "cross_subgroup_min", int, where),
        walk_m_per_min=_require(table, "walk_m_per_min", float, where),
        detour=_require(table, "detour", float, where),
        same_name_link_m=_require(table, "same_name_link_m", float, where),
    )


def load_config(config_dir: Path = CONFIG_DIR) -> BuildConfig:
    """Load and validate every configuration file. Raises ConfigError on any problem."""
    path = config_dir / "build.toml"
    if not path.exists():
        raise ConfigError(f"missing config file {path}")
    try:
        raw = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path.name}: {exc}") from exc
    src, area = raw.get("source", {}), raw.get("area", {})
    windows = raw.get("windows", {})
    commit = _require(src, "mt3d_commit", str, "[source]")
    if not _COMMIT_RE.match(commit):
        raise ConfigError("[source] mt3d_commit must be a full 40-character commit hash")
    center = _require(area, "center", list, "[area]")
    if len(center) != 2 or not all(isinstance(c, (int, float)) and not isinstance(c, bool) for c in center):
        raise ConfigError("[area] center must be [lon, lat]")
    return _check_ranges(BuildConfig(
        mt3d_repo=_require(src, "mt3d_repo", str, "[source]"),
        mt3d_commit=commit,
        calendar=_require(src, "calendar", str, "[source]"),
        center=(float(center[0]), float(center[1])),
        input_radius_km=_require(area, "input_radius_km", float, "[area]"),
        candidate_radius_km=_require(area, "candidate_radius_km", float, "[area]"),
        candidate_min_lines=_require(area, "candidate_min_lines", int, "[area]"),
        merge_radius_m=_require(raw.get("complex", {}), "merge_radius_m", float, "[complex]"),
        transfer=_transfer_params(raw.get("transfer", {})),
        outbound_window=_window(windows, "outbound"),
        home_window=_window(windows, "home"),
        horizon_min=_require(windows, "horizon_min", int, "[windows]"),
        paid_train_types=_read_list(config_dir / "paid_train_types.txt"),
        line_count_exclude=_read_list(config_dir / "line_count_exclude.txt"),
        stop_positions=load_stop_positions(config_dir / "stop_positions.csv"),
        transfer_overrides=load_transfer_overrides(config_dir / "transfer_overrides.csv"),
        candidate_overrides=load_candidate_overrides(config_dir / "candidate_overrides.csv"),
        config_dir=config_dir,
    ))
