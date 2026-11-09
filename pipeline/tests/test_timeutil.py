import pytest

from kaname_pipeline.timeutil import fmt_hhmm, parse_hhmm, unwrap_trip_times


def test_parse_and_format_round_trip():
    assert parse_hhmm("18:30") == 1110
    assert parse_hhmm("0:05") == 5
    assert fmt_hhmm(1470) == "24:30"
    assert fmt_hhmm(parse_hhmm("23:59")) == "23:59"


@pytest.mark.parametrize("bad", ["", "1830", "18:3", "18:60", "48:00", "ab:cd", None, 1110])
def test_parse_rejects_malformed(bad):
    with pytest.raises(ValueError):
        parse_hhmm(bad)


def test_unwrap_fills_missing_side():
    assert unwrap_trip_times([(None, "18:00"), ("18:05", None)]) == [(1080, 1080), (1085, 1085)]


def test_unwrap_crosses_midnight():
    assert unwrap_trip_times([(None, "23:58"), ("00:03", "00:04"), ("00:10", None)]) == [
        (1438, 1438), (1443, 1444), (1450, 1450)]


def test_unwrap_moves_after_midnight_start_to_previous_service_day():
    assert unwrap_trip_times([(None, "00:15"), ("00:20", None)]) == [(1455, 1455), (1460, 1460)]


def test_unwrap_keeps_early_morning_trips():
    assert unwrap_trip_times([(None, "04:30"), ("04:40", None)]) == [(270, 270), (280, 280)]


def test_unwrap_rejects_stop_without_times():
    with pytest.raises(ValueError):
        unwrap_trip_times([(None, None)])
