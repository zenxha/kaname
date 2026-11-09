"""Tiny synthetic Mini Tokyo 3D data folders for tests."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def station(sid: str, lon: float, lat: float, ja: str, en: str | None = None, **extra) -> dict:
    railway = sid.rsplit(".", 1)[0]
    return {"id": sid, "railway": railway, "coord": [lon, lat], "title": {"ja": ja, "en": en or ja}, **extra}


def railway(rid: str, ja: str, stations: list[str], en: str | None = None) -> dict:
    return {"id": rid, "title": {"ja": ja, "en": en or ja}, "stations": stations, "color": "#123456"}


def trip(tid: str, rail: str, stops: list[tuple[str, str | None, str | None]], ttype: str = "Op.Local",
         nt: list[str] | None = None, calendar: str = "Weekday") -> dict:
    tt = []
    for s, a, d in stops:
        e = {"s": s}
        if a is not None:
            e["a"] = a
        if d is not None:
            e["d"] = d
        tt.append(e)
    obj = {"id": f"{tid}.{calendar}", "r": rail, "y": ttype, "tt": tt}
    if nt:
        obj["nt"] = [f"{n}.{calendar}" for n in nt]
    return obj


def write(root: Path, stations: list, railways: list, groups: list, trips: dict[str, list]) -> str:
    """Write a data folder under root/data, commit it, and return the commit hash."""
    data = root / "data"
    (data / "train-timetables").mkdir(parents=True, exist_ok=True)
    (data / "stations.json").write_text(json.dumps(stations, ensure_ascii=False), encoding="utf-8")
    (data / "railways.json").write_text(json.dumps(railways, ensure_ascii=False), encoding="utf-8")
    (data / "station-groups.json").write_text(json.dumps(groups, ensure_ascii=False), encoding="utf-8")
    for name, items in trips.items():
        (data / "train-timetables" / f"{name}.json").write_text(json.dumps(items), encoding="utf-8")
    env = ["-c", "user.name=t", "-c", "user.email=t@example.invalid"]
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), *env, "commit", "-q", "-m", "data"], check=True)
    out = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
    return out.stdout.strip()
