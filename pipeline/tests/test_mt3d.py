import json

import pytest

from fakedata import railway, station, trip, write
from kaname_pipeline import mt3d
from kaname_pipeline.mt3d import SourceDataError


def _basic(tmp_path):
    stations = [station("Op.A.S1", 139.70, 35.68, "駅一", "One"),
                station("Op.A.S2", 139.71, 35.68, "駅二", "Two", altitude=-1),
                {"id": "Op.A.Ghost", "title": {"ja": "幽霊"}}]
    railways = [railway("Op.A", "A線", ["Op.A.S1", "Op.A.S2"])]
    trips = {"op-a": [
        trip("Op.A.1", "Op.A", [("Op.A.S1", None, "18:00"), ("Op.A.S2", "18:05", None)]),
        trip("Op.A.2", "Op.A", [("Op.A.S1", None, "18:10"), ("Op.A.S2", "18:15", None)], ttype="Op.Paid"),
        trip("Op.A.3", "Op.A", [("Op.A.S1", None, "18:20"), ("Op.A.S2", "18:25", None)], calendar="Holiday"),
    ]}
    commit = write(tmp_path, stations, railways, [[["Op.A.S1"]]], trips)
    return commit


def test_load_filters_calendar_and_paid_types(tmp_path):
    commit = _basic(tmp_path)
    raw = mt3d.load(tmp_path, commit, "Weekday", frozenset({"Op.Paid"}))
    assert raw.commit == commit
    assert [t.id for t in raw.trips] == ["Op.A.1.Weekday"]
    assert [s.id for s in raw.stations] == ["Op.A.S1", "Op.A.S2"]  # ghost has no coord
    assert raw.stations[1].underground and not raw.stations[0].underground
    assert raw.trips[0].stops == (("Op.A.S1", None, "18:00"), ("Op.A.S2", "18:05", None))
    assert raw.groups == ((("Op.A.S1",),),)


def test_wrong_commit_fails(tmp_path):
    _basic(tmp_path)
    with pytest.raises(SourceDataError, match="config pins"):
        mt3d.load(tmp_path, "0" * 40, "Weekday", frozenset())


def test_not_a_checkout_fails(tmp_path):
    with pytest.raises(SourceDataError, match="not a git checkout"):
        mt3d.load(tmp_path / "nope", "0" * 40, "Weekday", frozenset())


def test_no_trips_for_calendar_fails(tmp_path):
    commit = _basic(tmp_path)
    with pytest.raises(SourceDataError, match="no trips"):
        mt3d.load(tmp_path, commit, "Sunday", frozenset())


@pytest.mark.parametrize("obj,msg", [
    ({"id": "X", "railway": "R", "coord": [1], "title": {"ja": "a"}}, "bad coord"),
    ({"id": "X", "railway": "R", "coord": [1, 2]}, "missing title"),
    ({"id": "", "railway": "R", "coord": [1, 2], "title": {"ja": "a"}}, "non-empty"),
])
def test_parse_station_rejects_bad_input(obj, msg):
    with pytest.raises(SourceDataError, match=msg):
        mt3d.parse_station(obj)


@pytest.mark.parametrize("obj,msg", [
    ({"id": "T", "r": "R", "y": "Y", "tt": []}, "missing timetable"),
    ({"id": "T", "r": "R", "y": "Y", "tt": [{"s": "A"}]}, "without arrival"),
    ({"id": "T", "r": "R", "y": "Y", "tt": ["x"]}, "bad timetable entry"),
    ({"id": "T", "r": "R", "y": "Y", "tt": [{"s": "A", "d": "10:00"}], "nt": "x"}, "next-trip"),
])
def test_parse_trip_rejects_bad_input(obj, msg):
    with pytest.raises(SourceDataError, match=msg):
        mt3d.parse_trip(obj)


def test_parse_railway_and_groups_reject_bad_input():
    with pytest.raises(SourceDataError, match="stations list"):
        mt3d.parse_railway({"id": "R", "title": {"ja": "r"}, "stations": "x"})
    with pytest.raises(SourceDataError, match="expected a list"):
        mt3d.parse_groups({})
    with pytest.raises(SourceDataError, match="bad group"):
        mt3d.parse_groups([["x"]])


def test_invalid_json_fails(tmp_path):
    commit = _basic(tmp_path)
    (tmp_path / "data" / "railways.json").write_text("{", encoding="utf-8")
    with pytest.raises(SourceDataError, match="invalid JSON"):
        mt3d.load(tmp_path, commit, "Weekday", frozenset())


def test_missing_file_fails(tmp_path):
    commit = _basic(tmp_path)
    (tmp_path / "data" / "railways.json").unlink()
    with pytest.raises(SourceDataError, match="missing"):
        mt3d.load(tmp_path, commit, "Weekday", frozenset())


def test_missing_timetables_fails(tmp_path):
    commit = _basic(tmp_path)
    (tmp_path / "data" / "train-timetables" / "op-a.json").unlink()
    with pytest.raises(SourceDataError, match="no timetables"):
        mt3d.load(tmp_path, commit, "Weekday", frozenset())
