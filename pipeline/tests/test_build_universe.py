import pytest

from kaname_pipeline.build import U16_NONE, U16_SAME, build_closed, build_matrices
from kaname_pipeline.config import CandidateOverride, ConfigError
from kaname_pipeline.emit import encode_route
from kaname_pipeline.check import decode_route
from kaname_pipeline.graph import build_network
from kaname_pipeline.universe import Universe, select_universe
from synth import cfg, every, raw, rw, st

# 甲 -A- 乙 -A- 丙 ; 丁 -B- 乙 -B- 戊 ; trips both ways every 10 minutes, 17:00-25:00
STATIONS = [st("Op.A.Ko", 139.700, 35.680, "甲", "Ko"), st("Op.A.Otsu", 139.710, 35.680, "乙", "Otsu"),
            st("Op.A.Hei", 139.720, 35.680, "丙", "Hei"), st("Op.B.Tei", 139.710, 35.690, "丁", "Tei"),
            st("Op.B.Otsu", 139.7101, 35.680, "乙", "Otsu"), st("Op.B.Bo", 139.710, 35.670, "戊", "Bo")]
RAILWAYS = [rw("Op.A", "A線", ["Op.A.Ko", "Op.A.Otsu", "Op.A.Hei"]),
            rw("Op.B", "B線", ["Op.B.Tei", "Op.B.Otsu", "Op.B.Bo"])]
A, B = ["Op.A.Ko", "Op.A.Otsu", "Op.A.Hei"], ["Op.B.Tei", "Op.B.Otsu", "Op.B.Bo"]
TRIPS = (every("A.f", "Op.A", A, 1020, 1500, 10, 3) + every("A.r", "Op.A", A[::-1], 1020, 1500, 10, 3)
         + every("B.f", "Op.B", B, 1025, 1500, 10, 3) + every("B.r", "Op.B", B[::-1], 1025, 1500, 10, 3))


@pytest.fixture(scope="module")
def net():
    return build_network(raw(STATIONS, RAILWAYS, [(("Op.A.Otsu",), ("Op.B.Otsu",))], TRIPS), cfg())


def _cid(net, name):
    return next(i for i, c in enumerate(net.complexes) if c.name_ja == name)


def test_select_universe_rule_and_overrides(net):
    uni = select_universe(net, cfg())
    assert [net.complexes[c].name_ja for c in uni.complexes[: uni.n_candidates]] == ["乙"]
    ov = (CandidateOverride("甲", True, "terminus"), CandidateOverride("乙", False, "no"))
    uni = select_universe(net, cfg(candidate_overrides=ov))
    assert [net.complexes[c].name_ja for c in uni.complexes[: uni.n_candidates]] == ["甲"]
    assert uni.reasons == ("terminus",) and len(uni.complexes) == 5


def test_override_must_match_one_station(net):
    with pytest.raises(ConfigError, match="exactly one"):
        select_universe(net, cfg(candidate_overrides=(CandidateOverride("無", True, "x"),)))


def test_build_matrices_in_process(net):
    uni = select_universe(net, cfg())
    m = build_matrices(net, uni, cfg(), workers=1)
    so = uni.station_of()
    ko = m.outbound[so[_cid(net, "甲")]][0]
    assert (ko.minutes, ko.transfers) == (3, 0)
    tei_to_otsu = m.outbound[so[_cid(net, "丁")]][0]
    assert tei_to_otsu.minutes == 3
    home_bo = m.home[0][so[_cid(net, "戊")]]
    assert home_bo.minutes == 3 and 21 * 60 < home_bo.last_dep < U16_SAME
    assert m.home[0][0].last_dep == U16_SAME
    assert not m.outside_complexes()


def test_closure_adds_transfer_station(net):
    uni = Universe((_cid(net, "甲"), _cid(net, "丁")), 1, ("x",))
    m = build_closed(net, uni, cfg(), workers=1)
    assert m.n_stations == 3 and m.universe.complexes[2] == _cid(net, "乙")
    cell = m.outbound[1][0]  # 丁 -> 甲 changes at 乙
    assert cell.transfers == 1 and [end for _, _, end, _ in cell.route] == [_cid(net, "乙"), _cid(net, "甲")]


def test_unreachable_when_window_has_no_service(net):
    late = cfg(outbound_window=(25 * 60 + 30, 26 * 60))
    m = build_matrices(net, select_universe(net, late), late, workers=1)
    assert m.outbound[1][0].minutes == U16_NONE


def test_route_encoding_round_trip():
    station_of = {10: 0, 11: 1, 12: 2, 13: 3}
    route = ((5, 10, 11, False), (7, 12, 13, False), (8, 13, 11, True))
    values = encode_route(route, 10, station_of)
    assert values == [3, 5, 1, 7 | 0x4000, 2, 3, 8 | 0x8000, 1]
    hops, pos = decode_route(values, 0, 0)
    assert pos == len(values)
    assert hops == [(5, 0, 1, False), (7, 2, 3, False), (8, 3, 1, True)]
    with pytest.raises(ValueError):
        encode_route(((0x4000, 10, 11, False),), 10, station_of)
