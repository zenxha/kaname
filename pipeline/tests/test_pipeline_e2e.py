"""End to end on a synthetic Mini Tokyo 3D folder: build, gate check, validation, CLI errors."""

import csv
import json
import re
import shutil
from pathlib import Path

import pytest

from fakedata import railway, station, write
from kaname_pipeline.__main__ import main
from kaname_pipeline.check import ArtifactError, decode_route, gate_report, load_artifacts
from kaname_pipeline.validate import ValidationError, recompute_sample, validation_report
from kaname_pipeline.config import CONFIG_DIR, load_config
from kaname_pipeline import mt3d
from kaname_pipeline.graph import build_network

# Line A: 甲 - 乙 - 丙 ; line B: 丁 - 乙 - 戊 ; line C: 戊 - 己 (B runs through into C)
LINES = {
    "Op.A": [("Op.A.Ko", 139.700, "甲", "Ko"), ("Op.A.Otsu", 139.710, "乙", "Otsu"), ("Op.A.Hei", 139.720, "丙", "Hei")],
    "Op.B": [("Op.B.Tei", 139.710, "丁", "Tei"), ("Op.B.Otsu", 139.7102, "乙", "Otsu"), ("Op.B.Bo", 139.730, "戊", "Bo")],
    "Op.C": [("Op.C.Bo", 139.7302, "戊", "Bo"), ("Op.C.Ki", 139.740, "己", "Ki")],
}
LAT = {"Op.B.Tei": 35.690}


def _hhmm(t: int) -> str:
    return f"{t // 60:02d}:{t % 60:02d}"


def _trips(rail: str, stops: list[str], tag: str, nt_rail: str | None = None) -> list[dict]:
    out = []
    for k, t0 in enumerate(range(17 * 60, 24 * 60 + 40, 10)):
        tt = []
        for i, s in enumerate(stops):
            t = t0 + 3 * i
            e = {"s": s}
            if i:
                e["a"] = _hhmm(t)
            if i < len(stops) - 1:
                e["d"] = _hhmm(t)
            tt.append(e)
        obj = {"id": f"{rail}.{tag}{k}.Weekday", "r": rail, "y": "Op.Local", "tt": tt}
        if nt_rail:
            obj["nt"] = [f"{nt_rail}.{tag}{k}.Weekday"]
        out.append(obj)
    return out


def _fake_mt3d(root: Path) -> str:
    stations = [station(sid, lon, LAT.get(sid, 35.680), ja, en) for stops in LINES.values() for sid, lon, ja, en in stops]
    railways = [railway(r, f"{r}線", [s[0] for s in stops]) for r, stops in LINES.items()]
    ids = {r: [s[0] for s in stops] for r, stops in LINES.items()}
    c_start = 9  # C trips leave 戊 at the minute B trips arrive (B: 2 hops of 3 min, then 3 more)
    trips = {
        "a": _trips("Op.A", ids["Op.A"], "f") + _trips("Op.A", ids["Op.A"][::-1], "r"),
        "b": _trips("Op.B", ids["Op.B"], "f", nt_rail="Op.C") + _trips("Op.B", ids["Op.B"][::-1], "r"),
        "c": _trips("Op.C", ids["Op.C"], "f") + _trips("Op.C", ids["Op.C"][::-1], "r"),
    }
    for t in trips["c"][: len(trips["c"]) // 2]:  # shift forward C trips so B->C through-running is seated
        for e in t["tt"]:
            for key in ("a", "d"):
                if key in e:
                    h, m = map(int, e[key].split(":"))
                    e[key] = _hhmm(h * 60 + m + c_start - 3)
    groups = [[["Op.A.Otsu"], ["Op.B.Otsu"]], [["Op.B.Bo", "Op.C.Bo"]]]
    return write(root, stations, railways, groups, trips)


def _config(tmp: Path, commit: str) -> Path:
    dest = tmp / "config"
    shutil.copytree(CONFIG_DIR, dest)
    toml = (dest / "build.toml").read_text(encoding="utf-8")
    toml = re.sub(r'mt3d_commit = "[0-9a-f]+"', f'mt3d_commit = "{commit}"', toml)
    toml = toml.replace("center = [139.76704, 35.6813]", "center = [139.700, 35.680]")
    (dest / "build.toml").write_text(toml, encoding="utf-8")
    (dest / "stop_positions.csv").write_text("stop_id,lon,lat,extra_min,basis\n", encoding="utf-8")
    (dest / "transfer_overrides.csv").write_text(
        "station_ja,railways_a,railways_b,minutes,basis\n乙,Op.A,Op.B,1,test\n", encoding="utf-8")
    (dest / "candidate_overrides.csv").write_text("station_ja,action,reason\n甲,include,test terminus\n",
                                                   encoding="utf-8")
    return dest


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("e2e")
    commit = _fake_mt3d(tmp / "mt3d")
    cfg_dir = _config(tmp, commit)
    out = tmp / "data"
    args = ["--mt3d", str(tmp / "mt3d"), "--out", str(out), "--config", str(cfg_dir)]
    assert main(args + ["build", "--workers", "2"]) == 0
    return tmp, args, out, cfg_dir


def test_build_writes_consistent_files(built):
    _, _, out, _ = built
    a = load_artifacts(out)
    names = [s["ja"] for s in a.stations["stations"]]
    assert a.k == 3 and names[:3] == ["戊", "甲", "乙"]  # candidates first (by id): two hubs plus the override
    assert a.meta["counts"]["stations"] == 6
    rows = list(csv.DictReader((out / "candidates.csv").open(encoding="utf-8")))
    assert [r["reason"] for r in rows] == ["rule", "test terminus", "rule"]


def test_gate_passes_and_cli_check(built):
    _, args, out, _ = built
    report = gate_report(out)
    assert report.passed, report.text
    assert main(args + ["check"]) == 0


def test_minutes_and_routes(built):
    _, _, out, _ = built
    a = load_artifacts(out)
    idx = {s["ja"]: s["i"] for s in a.stations["stations"]}
    k, n = a.k, a.n
    om, ox = a.arrays["out_min.u16"], a.arrays["out_xfer.u8"]
    # 丁 -> 戊: B line, two 3-minute hops, no transfer
    assert om[idx["丁"] * k + idx["戊"]] == 6 and ox[idx["丁"] * k + idx["戊"]] == 0
    # 甲 -> 戊: A to 乙 (3), cross-platform change (1 min, next B train), B to 戊 (3)
    assert ox[idx["甲"] * k + idx["戊"]] == 1
    blk = a.arrays["out_routes_idx.u32"][idx["戊"]]
    values = a.arrays["out_routes.u16"]
    pos = blk
    for s in range(idx["甲"]):
        _, pos = decode_route(values, pos, s)
    route, _ = decode_route(values, pos, idx["甲"])
    assert [(a.stations["railways"][r]["id"], end) for r, _, end, _ in route] == [
        ("Op.A", idx["乙"]), ("Op.B", idx["戊"])]
    # last departures exist and are after the home window opens
    last = a.arrays["last_dep.u16"][idx["乙"] * n + idx["己"]]
    assert 21 * 60 <= last <= 25 * 60


def _net(built):
    tmp, _, _, cfg_dir = built
    cfg = load_config(cfg_dir)
    return cfg, build_network(mt3d.load(tmp / "mt3d", cfg.mt3d_commit, cfg.calendar, cfg.paid_train_types), cfg)


def test_validation_report_on_synthetic_refs(built, tmp_path):
    cfg, net = _net(built)
    good = tmp_path / "good.csv"
    good.write_text("id,origin,destination,query_time,ref_minutes\nx1,丁,戊,18:30,6\n", encoding="utf-8")
    report = validation_report(net, cfg, load_artifacts(built[2]), (("good", good),))
    assert report.passed and "within ±5 1/1" in report.text and "recomputed from scratch" in report.text
    bad = tmp_path / "bad.csv"
    bad.write_text("id,origin,destination,query_time,ref_minutes\nx1,丁,戊,18:30,6\nx2,甲,己,18:30,30\n",
                   encoding="utf-8")
    assert not validation_report(net, cfg, None, (("bad", bad),)).passed


def test_validation_errors_are_clean(built, tmp_path):
    cfg, net = _net(built)
    with pytest.raises(ValidationError, match="not found"):
        validation_report(net, cfg, None, (("missing", tmp_path / "none.csv"),))
    ref = tmp_path / "ref.csv"
    ref.write_text("id,origin,destination,query_time,ref_minutes\nx1,無,戊,18:30,6\n", encoding="utf-8")
    with pytest.raises(ValidationError, match="matches 0"):
        validation_report(net, cfg, None, (("unknown", ref),))
    ref.write_text("id,origin,destination,query_time,ref_minutes\nx1,丁,戊,18:30,six\n", encoding="utf-8")
    with pytest.raises(ValidationError, match="x1"):
        validation_report(net, cfg, None, (("badrow", ref),))


def test_recompute_sample_detects_tampering(built, tmp_path):
    cfg, net = _net(built)
    a = load_artifacts(built[2])
    assert recompute_sample(net, cfg, a) == []
    shifted = type(a)(a.meta, a.stations, {**a.arrays, "out_min.u16": type(a.arrays["out_min.u16"])(
        "H", [v + 1 if v not in (0, 65535) else v for v in a.arrays["out_min.u16"]])})
    assert recompute_sample(net, cfg, shifted, seed=3)


def test_cli_validate_runs(built):
    _, args, _, _ = built
    assert main(args + ["validate"]) == 2  # the repo reference sets name stations the synthetic network lacks


def test_malformed_meta_is_an_artifact_error(built, tmp_path):
    copy = tmp_path / "data"
    shutil.copytree(built[2], copy)
    (copy / "meta.json").write_text("{}", encoding="utf-8")
    with pytest.raises(ArtifactError, match="cannot read"):
        load_artifacts(copy)


def test_tampered_file_fails_check(built, tmp_path):
    _, args, out, _ = built
    copy = tmp_path / "data"
    shutil.copytree(out, copy)
    (copy / "out_min.u16").write_bytes(b"\0\0")
    assert main(["--out", str(copy), "check"]) == 2


def test_wrong_commit_is_a_clean_error(built, tmp_path):
    tmp, _, _, cfg_dir = built
    bad = tmp_path / "cfg"
    shutil.copytree(cfg_dir, bad)
    toml = (bad / "build.toml").read_text(encoding="utf-8")
    (bad / "build.toml").write_text(re.sub(r'mt3d_commit = "[0-9a-f]+"', f'mt3d_commit = "{"1" * 40}"', toml),
                                    encoding="utf-8")
    assert main(["--mt3d", str(tmp / "mt3d"), "--config", str(bad), "build"]) == 2


def test_meta_documents_layout(built):
    _, _, out, _ = built
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["files"]["out_min.u16"]["shape"] == [6, 3]
    assert meta["windows"] == {"outbound": ["17:30", "19:30"], "home": ["21:00", "23:00"], "horizon_min": 240}
