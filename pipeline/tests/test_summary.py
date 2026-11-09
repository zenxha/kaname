import pytest
from hypothesis import given
from hypothesis import strategies as hs

from kaname_pipeline.profile import INF, Entry
from kaname_pipeline.summary import first_after, window_median, window_segments


def E(dep: int, arr: int) -> Entry:
    return Entry(dep, arr, 0, 0)


def test_segments_cover_each_minute_once():
    segs = window_segments([E(98, 120), E(103, 120), E(110, 125), E(130, 140)], 100, 120)
    assert [(d, w) for d, w, _ in segs] == [(17, 4), (15, 7), (10, 9)]


def test_uncovered_tail_is_infinite():
    segs = window_segments([E(105, 115)], 100, 120)
    assert [(d, w) for d, w, _ in segs] == [(10, 6), (INF, 14)]


def test_median_picks_lower_middle_and_representative():
    stat = window_median([E(105, 125), E(110, 120), E(130, 160)], 100, 120)
    # minutes 100-105 -> 20, 106-110 -> 10, 111-119 -> 30 (weights 6, 5, 9)
    assert stat.minutes == 20 and stat.entry == E(105, 125) and stat.coverage == 20


def test_unreachable_when_most_of_window_has_no_journey():
    stat = window_median([E(100, 110)], 100, 120)
    assert stat.minutes == INF and stat.entry is None and stat.coverage == 1


def test_empty_window_rejected():
    with pytest.raises(ValueError):
        window_median([], 100, 100)


def test_first_after():
    es = [E(100, 110), E(105, 112)]
    assert first_after(es, 101) == E(105, 112)
    assert first_after(es, 106) is None


@given(hs.lists(hs.tuples(hs.integers(0, 200), hs.integers(1, 60)), max_size=12), hs.integers(0, 150),
       hs.integers(1, 80))
def test_median_equals_brute_force(raw, w0, length):
    deps = sorted({d for d, _ in raw})
    # build a Pareto list: arrival strictly increasing with departure
    entries, last = [], -1
    for d in deps:
        arr = max(d + dict(raw)[d], last + 1)
        entries.append(E(d, arr))
        last = arr
    w1 = w0 + length
    per_minute = []
    for t in range(w0, w1):
        e = first_after(entries, t)
        per_minute.append(e.arr - e.dep if e else INF)
    expected = sorted(per_minute)[(len(per_minute) - 1) // 2]
    assert window_median(entries, w0, w1).minutes == expected
