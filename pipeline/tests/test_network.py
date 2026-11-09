import pytest

from kaname_pipeline.config import ConfigError, StopPosition, TransferOverride
from kaname_pipeline.graph import build_network
from kaname_pipeline.network import NetworkError, build_stops, display_name, name_key, slugify
from kaname_pipeline.transfers import walk_minutes
from synth import cfg, raw, rw, st, tr

# A line: 甲 - 乙 - 丙 ; B line: 丙(15 m away from A's) - 丁 ; C line: a far-away 丙 - 戊
STATIONS = [
    st("Op.A.Ko", 139.700, 35.680, "甲", "Ko"),
    st("Op.A.Otsu", 139.710, 35.680, "乙", "Otsu"),
    st("Op.A.Hei", 139.720, 35.680, "丙", "Hei"),
    st("Op.B.Hei", 139.72015, 35.680, "丙〈東口〉", "Hei (East)", underground=True),
    st("Op.B.Tei", 139.730, 35.690, "丁", "Tei"),
    st("Far.C.Hei", 140.500, 35.000, "丙", "Hei"),
    st("Far.C.Bo", 140.510, 35.000, "戊", "Bo"),
]
RAILWAYS = [rw("Op.A", "A線", ["Op.A.Ko", "Op.A.Otsu", "Op.A.Hei"]),
            rw("Op.B", "B線", ["Op.B.Hei", "Op.B.Tei"]),
            rw("Far.C", "C線", ["Far.C.Hei", "Far.C.Bo"])]
GROUPS = [(("Op.A.Hei",), ("Op.B.Hei",))]
TRIPS = [
    tr("A.2", "Op.A", [("Op.A.Ko", None, "18:10"), ("Op.A.Otsu", "18:12", "18:13"), ("Op.A.Hei", "18:15", None)]),
    tr("A.1", "Op.A", [("Op.A.Ko", None, "18:00"), ("Op.A.Otsu", "18:02", "18:03"), ("Op.A.Hei", "18:05", None)],
       nt=("B.1", "Missing.1")),
    tr("B.1", "Op.B", [("Op.B.Hei", None, "18:06"), ("Op.B.Tei", "18:09", None)]),
    tr("C.1", "Far.C", [("Far.C.Hei", None, "18:00"), ("Far.C.Bo", "18:04", None)]),
]


@pytest.fixture
def net():
    return build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS), cfg())


def test_names():
    assert display_name("押上〈スカイツリー前〉") == "押上"
    assert display_name("Oshiage (Skytree)") == "Oshiage"
    assert name_key("市ヶ谷") == name_key("市ケ谷")
    assert slugify("Kasumigaseki / Tōkyō") == "kasumigaseki-tokyo"


def test_timetable_sorted_with_trip_links(net):
    tt = net.timetable
    assert list(tt.dep) == sorted(tt.dep)
    assert len(tt.dep) == 6
    a1 = tt.trip_ids.index("A.1")
    first = tt.trip_first_conn[a1]
    second = tt.next_in_trip[first]
    assert (tt.dep[first], tt.arr[first]) == (1080, 1082)
    assert (tt.dep[second], tt.arr[second]) == (1083, 1085)
    assert tt.next_in_trip[second] == -1
    assert tt.trip_next[a1] == (tt.trip_ids.index("B.1"),)  # the missing trip is dropped


def test_through_link_dropped_when_next_trip_leaves_too_early():
    trips = [tr("A.1", "Op.A", [("Op.A.Ko", None, "18:00"), ("Op.A.Hei", "18:05", None)], nt=("B.1",)),
             tr("B.1", "Op.B", [("Op.B.Hei", None, "18:04"), ("Op.B.Tei", "18:09", None)])]
    n = build_network(raw(STATIONS, RAILWAYS, GROUPS, trips), cfg())
    assert n.timetable.trip_next == ((), ())


def test_stop_without_coordinates_is_bridged():
    stations = [s for s in STATIONS if s.id != "Op.A.Otsu"]
    n = build_network(raw(stations, RAILWAYS, GROUPS, TRIPS[:2]), cfg())
    tt = n.timetable
    pairs = {(n.stops[u].id, n.stops[v].id, d, a) for u, v, d, a in zip(tt.u, tt.v, tt.dep, tt.arr)}
    assert ("Op.A.Ko", "Op.A.Hei", 1080, 1085) in pairs


def test_bad_trip_time_raises():
    bad = [tr("X.1", "Op.A", [("Op.A.Ko", None, "25:99"), ("Op.A.Hei", "18:05", None)])]
    with pytest.raises(NetworkError, match="X.1"):
        build_network(raw(STATIONS, RAILWAYS, GROUPS, bad), cfg())


def test_duplicate_trip_ids_raise():
    with pytest.raises(NetworkError, match="duplicate"):
        build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS + TRIPS[:1]), cfg())


def test_complexes_merge_same_name_nearby_only(net):
    by_id = {c.id: c for c in net.complexes}
    assert set(by_id) == {"ko", "otsu", "hei-op", "hei-far", "tei", "bo"}
    hei = by_id["hei-op"]
    assert {net.stops[s].id for s in hei.stops} == {"Op.A.Hei", "Op.B.Hei"}
    assert hei.name_ja == "丙" and hei.line_count == 2
    assert hei.railways == ("Op.A", "Op.B")
    assert by_id["ko"].dist_km == 0.0
    assert net.stop_complex[1] == [c.id for c in net.complexes].index("otsu")


def test_line_count_ignores_excluded_railways():
    n = build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS), cfg(line_count_exclude=frozenset({"Op.B"})))
    assert next(c for c in n.complexes if c.id == "hei-op").line_count == 1


def test_transfer_rules(net):
    a_hei, b_hei = 2, 3
    links = dict(net.transfers[a_hei])
    assert links[a_hei] == 1  # same stop
    expected = walk_minutes(net.stops[a_hei], net.stops[b_hei], cfg().transfer)
    assert links[b_hei] == expected == 5  # 15 m apart -> the 5-minute floor
    assert dict(net.transfers[5]) == {5: 1}  # far-away 丙 is not linked


def test_walk_minutes_grows_with_distance_and_depth(net):
    p = cfg().transfer
    a = net.stops[0]
    far = build_stops((st("Op.Z.Z", 139.7044, 35.680, "Z"),), ())[0]  # ~400 m east
    assert walk_minutes(a, far, p) == 10  # ceil(3 + 1.3 * 401 / 80)
    deep = build_stops((st("Op.Z.Z", 139.7044, 35.680, "Z"),),
                       (StopPosition("Op.Z.Z", 139.7044, 35.680, 2, "x"),))[0]
    assert walk_minutes(a, deep, p) == 12


def test_same_name_link_without_group():
    n = build_network(raw(STATIONS, RAILWAYS, [], TRIPS), cfg())
    assert dict(n.transfers[2])[3] == 5


def test_override_replaces_and_must_match():
    ov = TransferOverride("丙", frozenset({"Op.A"}), frozenset({"Op.B"}), 1, "cross-platform")
    n = build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS), cfg(transfer_overrides=(ov,)))
    assert dict(n.transfers[2])[3] == 1 and dict(n.transfers[3])[2] == 1
    bad = TransferOverride("丙", frozenset({"Op.A"}), frozenset({"Op.Q"}), 1, "x")
    with pytest.raises(ConfigError, match="matches no stops"):
        build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS), cfg(transfer_overrides=(bad,)))


def test_stop_positions_override_and_reject_unknown():
    pos = (StopPosition("Op.B.Hei", 139.7244, 35.680, 0, "moved"),)
    n = build_network(raw(STATIONS, RAILWAYS, GROUPS, TRIPS), cfg(stop_positions=pos))
    assert dict(n.transfers[2])[3] == 10
    with pytest.raises(NetworkError, match="unknown stops"):
        build_stops(tuple(STATIONS), (StopPosition("No.Such.Stop", 139.7, 35.6, 0, "x"),))


def test_slug_collisions_get_suffixes():
    stations = STATIONS + [st("Op.D.Hei", 139.900, 35.680, "丙", "Hei")]
    railways = RAILWAYS + [rw("Op.D", "D線", ["Op.D.Hei", "Op.D.X"])]
    trips = TRIPS + [tr("D.1", "Op.D", [("Op.D.Hei", None, "18:00"), ("Op.A.Ko", "18:30", None)])]
    n = build_network(raw(stations, railways, GROUPS, trips), cfg())
    ids = sorted(c.id for c in n.complexes if c.name_en == "Hei")
    assert ids == ["hei-far", "hei-op", "hei-op-2"]
