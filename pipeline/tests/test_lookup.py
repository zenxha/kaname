"""Search helpers built next to the matrices: kana readings and the address index."""

from __future__ import annotations

import io
import zipfile

import pytest

from kaname_pipeline.lookup import (
    LookupDataError,
    address_doc,
    hiragana,
    kana_doc,
    match_kana,
    plain_name,
    read_isj,
    reading,
)


def test_plain_name_drops_the_station_suffix_and_any_bracketed_part():
    assert plain_name("渋谷駅") == "渋谷"
    assert plain_name("押上〈スカイツリー前〉") == "押上"
    assert plain_name("中山駅 (神奈川県)") == "中山"
    assert plain_name("霞ヶ関") == plain_name("霞ケ関")
    assert plain_name("三ノ輪橋停留場") == "三ノ輪橋"  # a tram stop
    assert plain_name("麴町") == plain_name("麹町")  # a variant kanji


def test_reading_is_hiragana_without_the_word_station():
    assert hiragana("シンジュク") == "しんじゅく"
    assert reading("しぶやえき", "渋谷駅") == "しぶや"
    assert reading("トウキョウエキ", "東京駅") == "とうきょう"
    assert reading("みなみ うらわ", "南浦和") == "みなみうらわ"
    assert reading("えき", "駅") == "えき"  # never strip a reading to nothing
    assert reading("あさくさえき", "浅草") == "あさくさ"  # a label without 駅 can still have えき in its reading
    assert reading("みのわばしていりゅうじょう", "三ノ輪橋停留場") == "みのわばし"
    assert reading("えきまえ", "駅前") == "えきまえ"


STATIONS = [
    {"id": "shibuya", "ja": "渋谷", "lng": 139.7016, "lat": 35.6580},
    {"id": "nakayama", "ja": "中山", "lng": 139.5390, "lat": 35.5150},
    {"id": "nowhere", "ja": "架空", "lng": 139.7, "lat": 35.7},
]


def row(label, kana, lng, lat):
    return {"label": {"value": label}, "kana": {"value": kana}, "coord": {"value": f"Point({lng} {lat})"}}


def test_match_kana_takes_the_reading_of_a_same_named_station_close_by():
    rows = [
        row("渋谷駅", "しぶやえき", 139.7016, 35.6590),
        row("渋谷駅", "しぶやえき", 139.7020, 35.6585),  # duplicates collapse
        row("中山駅", "なかやまえき", 139.9420, 35.7200),  # 中山 in Chiba, 40 km away: not ours
        row("中山駅", "なかやまえき", 139.5392, 35.5152),
        row("恵比寿駅", "えびすえき", 139.7016, 35.6580),  # close by, but another name
    ]
    assert match_kana(STATIONS, rows) == {"shibuya": ["しぶや"], "nakayama": ["なかやま"]}


def test_kana_doc_reports_its_source_and_coverage():
    doc = kana_doc({"shibuya": ["しぶや"]}, n_stations=3, fetched="2026-11-10")
    assert doc["source"]["license"] == "CC0 1.0"
    assert doc["coverage"] == {"stations": 3, "with_kana": 1}
    assert doc["kana"] == {"shibuya": ["しぶや"]}


def isj_zip(rows: list[str]) -> bytes:
    header = '"都道府県コード","都道府県名","市区町村コード","市区町村名","大字町丁目コード","大字町丁目名","緯度","経度","原典資料コード","大字・字・丁目区分コード"'
    csv = "\r\n".join([header, *rows]).encode("cp932")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("13000-18.0b/13_2024.csv", csv)
    return buf.getvalue()


def test_read_isj_reads_the_shift_jis_rows_of_a_prefecture_file():
    data = isj_zip([
        '"13","東京都","13113","渋谷区","131130001001","神南一丁目","35.663128","139.700363","0","3"',
        '"13","東京都","13113","渋谷区","131130001002","神南二丁目","35.664000","139.698000","0","3"',
    ])
    towns = read_isj(data)
    assert towns[0] == ("東京都渋谷区", "神南一丁目", 139.700363, 35.663128)
    assert len(towns) == 2


def test_read_isj_skips_rows_without_a_position():
    data = isj_zip([
        '"13","東京都","13113","渋谷区","131130001001","神南一丁目","","139.700363","0","3"',
        '"13","東京都","13113","渋谷区","131130001002","神南二丁目","35.664000","139.698000","0","3"',
    ])
    assert [t[1] for t in read_isj(data)] == ["神南二丁目"]


def test_read_isj_reports_a_broken_file_as_a_lookup_error():
    with pytest.raises(LookupDataError, match="MLIT"):
        read_isj(b"not a zip")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("13000-18.0b/13_2024.csv", '"都道府県名","緯度"\r\n"東京都","35.6"'.encode("cp932"))
    with pytest.raises(LookupDataError, match="column"):
        read_isj(buf.getvalue())


def test_match_kana_orders_tied_readings_the_same_way_every_time():
    rows = [row("三田駅", "みたえき", 139.7484, 35.6481), row("三田駅", "さんだえき", 139.7484, 35.6481)]
    stations = [{"id": "mita", "ja": "三田", "lng": 139.7484, "lat": 35.6481}]
    assert match_kana(stations, rows) == {"mita": ["さんだ", "みた"]}
    assert match_kana(stations, list(reversed(rows))) == {"mita": ["さんだ", "みた"]}


def test_address_doc_groups_by_city_keeps_the_area_and_credits_the_source():
    towns = [
        ("東京都渋谷区", "神南一丁目", 139.700363, 35.663128),
        ("東京都渋谷区", "神南一丁目", 139.700363, 35.663128),  # a duplicate row
        ("東京都渋谷区", "神南二丁目", 139.698, 35.664),
        ("茨城県水戸市", "三の丸一丁目", 140.4740, 36.3700),  # 100 km away
    ]
    doc = address_doc(towns, center=(139.76704, 35.6813), radius_km=60, version="18.0b", files=["13000-18.0b.zip"])
    assert doc["cities"] == [["東京都渋谷区", [["神南一丁目", 13970036, 3566313], ["神南二丁目", 13969800, 3566400]]]]
    assert "大字・町丁目レベル位置参照情報 国土交通省" in doc["source"]["credit"]
    assert doc["source"]["version"] == "18.0b"
