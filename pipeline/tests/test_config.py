import shutil
from pathlib import Path

import pytest

from kaname_pipeline.config import CONFIG_DIR, ConfigError, load_config


@pytest.fixture
def cfg_dir(tmp_path: Path) -> Path:
    dest = tmp_path / "config"
    shutil.copytree(CONFIG_DIR, dest)
    return dest


def test_repo_config_loads():
    cfg = load_config()
    assert cfg.outbound_window == (17 * 60 + 30, 19 * 60 + 30)
    assert cfg.home_window == (21 * 60, 23 * 60)
    assert "JR-East.LimitedExpress" in cfg.paid_train_types
    assert len(cfg.mt3d_commit) == 40
    assert any(o.station_ja == "御茶ノ水" for o in cfg.transfer_overrides)
    assert any(p.stop_id == "JR-East.Keiyo.Tokyo" and p.extra_min == 2 for p in cfg.stop_positions)


def _edit(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert old in text
    path.write_text(text.replace(old, new), encoding="utf-8")


@pytest.mark.parametrize("old,new,msg", [
    ('mt3d_commit = "fa78', 'mt3d_commit = "zz78', "40-character"),
    ('outbound = ["17:30", "19:30"]', 'outbound = ["19:30", "17:30"]', "must be after"),
    ('outbound = ["17:30", "19:30"]', 'outbound = ["17:30"]', "start, end"),
    ("horizon_min = 240", 'horizon_min = "x"', "must be int"),
    ("candidate_min_lines = 2\n", "", "missing key"),
    ("center = [139.76704, 35.6813]", "center = [139.7]", "lon, lat"),
    ("[windows]", "[windows\n", "build.toml"),
])
def test_bad_build_toml_fails_fast(cfg_dir, old, new, msg):
    _edit(cfg_dir / "build.toml", old, new)
    with pytest.raises(ConfigError, match=msg):
        load_config(cfg_dir)


def test_missing_file_fails(cfg_dir):
    (cfg_dir / "paid_train_types.txt").unlink()
    with pytest.raises(ConfigError, match="missing config file"):
        load_config(cfg_dir)


def test_missing_build_toml_fails(cfg_dir):
    (cfg_dir / "build.toml").unlink()
    with pytest.raises(ConfigError, match="missing config file"):
        load_config(cfg_dir)


@pytest.mark.parametrize("row,msg", [
    ('X.Y.Z,10.0,35.0,0,"x"', "outside Japan"),
    ('X.Y.Z,139.0,35.0,99,"x"', "extra_min"),
    ('X.Y.Z,abc,35.0,0,"x"', "must be a number"),
])
def test_bad_stop_position_rows(cfg_dir, row, msg):
    with (cfg_dir / "stop_positions.csv").open("a", encoding="utf-8") as fh:
        fh.write(row + "\n")
    with pytest.raises(ConfigError, match=msg):
        load_config(cfg_dir)


@pytest.mark.parametrize("row,msg", [
    ('駅,A,B,99,"x"', "outside 0..30"),
    ('駅,A,A,1,"x"', "disjoint"),
    ('駅,A,B,x,"x"', "integer"),
])
def test_bad_transfer_override_rows(cfg_dir, row, msg):
    with (cfg_dir / "transfer_overrides.csv").open("a", encoding="utf-8") as fh:
        fh.write(row + "\n")
    with pytest.raises(ConfigError, match=msg):
        load_config(cfg_dir)


def test_bad_header_fails(cfg_dir):
    (cfg_dir / "candidate_overrides.csv").write_text("a,b\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="header"):
        load_config(cfg_dir)


def test_candidate_override_action_validated(cfg_dir):
    with (cfg_dir / "candidate_overrides.csv").open("a", encoding="utf-8") as fh:
        fh.write("駅,maybe,x\n")
    with pytest.raises(ConfigError, match="include or exclude"):
        load_config(cfg_dir)
