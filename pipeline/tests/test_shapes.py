"""Track shapes: each pair of neighboring stations follows the operator's track from MLIT N02."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest

from kaname_pipeline import shapes
from kaname_pipeline.shapes import (
    N02Source,
    ShapeDataError,
    decode_polyline,
    encode_polyline,
    read_sections,
    shapes_doc,
    simplify,
    track_graph,
    track_path,
)

# A small area east of Tokyo Station. 0.01° is about 900 m east-west and 1,110 m north-south here.
X0, Y0 = 139.80, 35.68
CENTER = (139.76704, 35.6813)


def p(dx: float, dy: float) -> tuple[float, float]:
    return (round(X0 + dx, 6), round(Y0 + dy, 6))


def test_polyline_encoding_matches_the_published_example_and_round_trips():
    points = [(-120.2, 38.5), (-120.95, 40.7), (-126.453, 43.252)]  # (lng, lat)
    assert encode_polyline(points) == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    assert decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@") == points
    assert decode_polyline(encode_polyline([p(0, 0), p(0.00001, -0.02)])) == [p(0, 0), p(0.00001, -0.02)]
    assert encode_polyline([]) == ""


def test_simplify_drops_points_within_the_tolerance_and_keeps_the_ends_and_corners():
    wiggle = [p(0, 0), p(0.001, 0.00001), p(0.002, 0), p(0.003, -0.00001), p(0.004, 0)]
    assert simplify(wiggle, 6.0) == [p(0, 0), p(0.004, 0)]
    corner = [p(0, 0), p(0.005, 0), p(0.005, 0.005)]
    assert simplify(corner, 6.0) == corner
    assert simplify([p(0, 0)], 6.0) == [p(0, 0)]


def test_track_path_follows_the_track_round_a_corner():
    g = track_graph([[p(0, 0), p(0.01, 0), p(0.01, 0.01)]])
    assert track_path(g, p(0, 0), p(0.01, 0.01)) == [p(0, 0), p(0.01, 0), p(0.01, 0.01)]


def test_track_path_joins_sections_that_share_an_end_point():
    g = track_graph([[p(0, 0), p(0.01, 0)], [p(0.01, 0), p(0.02, 0.001)]])
    assert track_path(g, p(0, 0), p(0.02, 0.001)) == [p(0, 0), p(0.01, 0), p(0.02, 0.001)]


def test_track_path_reaches_both_stations_on_a_curve():
    # An arc that bulges 220 m north between two stations on its ends. A cheap straight link to a point
    # 290 m along the arc must not win over the track itself.
    arc = [p(0, 0), p(0.001, 0.0015), p(0.002, 0.002), p(0.003, 0.002), p(0.004, 0.0015), p(0.005, 0)]
    path = track_path(track_graph([arc]), p(0, 0), p(0.005, 0))
    assert path == arc


def test_shapes_doc_draws_a_single_shared_track_point_as_a_straight_line():
    # Two stations 145 m apart, and the only track point near either one lies between them.
    st = {"stations": [station(0, p(0, 0)), station(1, p(0.0016, 0))], "railways": [railway("Tokyu.Test", [0, 1])]}
    doc = shapes_doc(st, {"東急電鉄": [[p(-0.01, 0), p(0.0008, 0), p(0.01, 0)]]})
    assert doc["railways"] == [[""]] and doc["on_track"] == 0


def test_track_path_gives_up_on_a_long_detour():
    # Stations 900 m apart, but the only track swings 5 km away and back.
    g = track_graph([[p(0, 0), p(0, 0.05), p(0.01, 0.05), p(0.01, 0)]])
    assert track_path(g, p(0, 0), p(0.01, 0)) is None


def test_track_path_snaps_a_station_that_sits_beside_the_track():
    g = track_graph([[p(0, 0), p(0.02, 0)]])
    near = track_path(g, p(0, 0.004), p(0.02, 0))       # 440 m off: the second, wider snap finds it
    assert near == [p(0, 0), p(0.02, 0)]
    assert track_path(g, p(0, 0.008), p(0.02, 0)) is None  # 890 m off: too far to be this station


def railway(rid: str, stations: list[int], loop: bool = False) -> dict:
    return {"i": 0, "id": rid, "stations": stations, "loop": loop}


def station(i: int, at: tuple[float, float], stops: list | None = None) -> dict:
    return {"i": i, "lng": at[0], "lat": at[1], "stops": stops or []}


def test_shapes_doc_has_one_entry_per_pair_and_closes_a_loop():
    st = {"stations": [station(0, p(0, 0)), station(1, p(0.01, 0)), station(2, p(0.01, 0.01))],
          "railways": [railway("Tokyu.Test", [0, 1, 2], loop=True)]}
    track = [p(0, 0), p(0.01, 0), p(0.01, 0.01), p(0, 0)]
    doc = shapes_doc(st, {"東急電鉄": [track]})
    assert doc["format"] == 1 and doc["precision"] == 5
    entries = doc["railways"][0]
    assert len(entries) == 3                                      # 0-1, 1-2 and the loop's 2-0
    assert [decode_polyline(e) for e in entries] == [[p(0, 0), p(0.01, 0)], [p(0.01, 0), p(0.01, 0.01)],
                                                     [p(0.01, 0.01), p(0, 0)]]
    assert doc["pairs"] == 3 and doc["on_track"] == 3


def test_shapes_doc_uses_only_the_operator_s_own_track():
    st = {"stations": [station(0, p(0, 0)), station(1, p(0.01, 0))],
          "railways": [railway("Tokyu.Test", [0, 1]), railway("Nowhere.Line", [0, 1])]}
    doc = shapes_doc(st, {"京王電鉄": [[p(0, 0), p(0.01, 0)]]})
    assert doc["railways"] == [[""], [""]]                        # "" = draw a straight line
    assert doc["on_track"] == 0


def test_shapes_doc_starts_at_the_railway_s_own_platform():
    platform = p(0, 0.0004)
    st = {"stations": [station(0, p(0, 0.003), stops=[[0, platform[0], platform[1]]]), station(1, p(0.01, 0))],
          "railways": [railway("Tokyu.Test", [0, 1])]}
    doc = shapes_doc(st, {"東急電鉄": [[p(0, 0), p(0.01, 0)], [p(0, 0.003), p(0, 0.02)]]})
    assert decode_polyline(doc["railways"][0][0]) == [p(0, 0), p(0.01, 0)]


def geojson_zip(features: list[dict], member: str = "N02/UTF-8/RailroadSection.geojson") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(member, json.dumps({"type": "FeatureCollection", "features": features}))
    return buf.getvalue()


def feature(operator: str, coords: list[tuple[float, float]]) -> dict:
    return {"type": "Feature", "properties": {"N02_004": operator},
            "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]}}


SOURCE = N02Source(version="N02-test", url="https://example.org/n02.zip", sha256="",
                   member="N02/UTF-8/RailroadSection.geojson", file="n02.zip")


def test_read_sections_keeps_the_area_and_groups_by_operator():
    data = geojson_zip([feature("東急電鉄", [p(0, 0), p(0.01, 0)]),
                        feature("東急電鉄", [(135.5, 34.7), (135.51, 34.7)]),   # Osaka: outside the area
                        feature("京王電鉄", [p(0, 0.01), p(0.01, 0.01)])])
    sections = read_sections(data, SOURCE, CENTER, 60.0)
    assert sections == {"東急電鉄": [[p(0, 0), p(0.01, 0)]], "京王電鉄": [[p(0, 0.01), p(0.01, 0.01)]]}


def test_read_sections_reports_a_broken_file():
    with pytest.raises(ShapeDataError, match="N02"):
        read_sections(b"not a zip", SOURCE, CENTER, 60.0)
    with pytest.raises(ShapeDataError, match="N02"):
        read_sections(geojson_zip([], member="other.geojson"), SOURCE, CENTER, 60.0)


def test_fetch_keeps_only_a_file_with_the_pinned_checksum(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = geojson_zip([feature("東急電鉄", [p(0, 0), p(0.01, 0)])])
    monkeypatch.setattr(shapes, "_download", lambda url: data)
    with pytest.raises(ShapeDataError, match="checksum"):
        shapes.fetch(tmp_path, N02Source(**{**SOURCE.__dict__, "sha256": "0" * 64}))
    assert not (tmp_path / "n02.zip").exists()
    good = N02Source(**{**SOURCE.__dict__, "sha256": hashlib.sha256(data).hexdigest()})
    assert shapes.fetch(tmp_path, good) == tmp_path / "n02.zip"


def test_build_writes_shapes_json_and_credits_the_source(tmp_path: Path):
    data = geojson_zip([feature("東急電鉄", [p(0, 0), p(0.01, 0)])])
    source = N02Source(**{**SOURCE.__dict__, "sha256": hashlib.sha256(data).hexdigest()})
    (tmp_path / "n02.zip").write_bytes(data)
    out = tmp_path / "data"
    out.mkdir()
    st = {"stations": [station(0, p(0, 0)), station(1, p(0.01, 0))], "railways": [railway("Tokyu.Test", [0, 1])]}
    (out / "stations.json").write_text(json.dumps(st), encoding="utf-8")
    doc = shapes.build(out, CENTER, 60.0, tmp_path, source)
    assert json.loads((out / "shapes.json").read_text(encoding="utf-8")) == doc
    assert "国土数値情報" in doc["source"]["credit"] and "N02-test" in doc["source"]["credit"]
    # The app draws the shapes only for the station data they were built from.
    assert doc["stations_sha256"] == hashlib.sha256((out / "stations.json").read_bytes()).hexdigest()
    (tmp_path / "n02.zip").write_bytes(data + b"x")
    with pytest.raises(ShapeDataError, match="checksum"):
        shapes.build(out, CENTER, 60.0, tmp_path, source)
