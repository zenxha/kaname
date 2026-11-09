"""Search helpers built next to the matrices: kana readings for station search, and an address index.

Neither changes a travel time, so they are a separate step (`fetch-lookup`, then `lookup`) that reads
data/stations.json and writes data/kana.json and data/addresses.json.

- Kana: Wikidata "name in kana" (P1814, CC0) of railway stations near each station with the same name.
  Readings are never guessed: a station without a match has none.
- Addresses: MLIT 大字・町丁目レベル位置参照情報 (free, credit required), one point per town or 丁目, within
  the input area. The app searches it on the device, so a typed address never leaves the phone.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path

from .config import REPO_DIR

CACHE_DIR = REPO_DIR / ".cache" / "lookup"
WIKIDATA_FILE = "wikidata-kana.json"
ISJ_DIR = "isj"
#: MLIT 位置参照情報, town and 丁目 level, 2024 data. Prefectures that reach into the input area:
#: Ibaraki, Saitama, Chiba, Tokyo, Kanagawa.
ISJ_VERSION = "18.0b"
ISJ_PREFECTURES = ("08", "11", "12", "13", "14")
ISJ_URL = "https://nlftp.mlit.go.jp/isj/dls/data/{v}/{p}000-{v}.zip"
ISJ_CREDIT = "大字・町丁目レベル位置参照情報 国土交通省"
WIKIDATA_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "kaname-pipeline/0.1 (https://github.com/zenxha/kaname)"
#: Railway stations (and subclasses such as subway stations) with a kana name, in a box around the area.
WIKIDATA_QUERY = """SELECT ?item ?label ?kana ?coord WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(138.9 35.0)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(140.6 36.4)"^^geo:wktLiteral .
  }
  ?item wdt:P31/wdt:P279* wd:Q55488 .
  ?item wdt:P1814 ?kana .
  ?item rdfs:label ?label . FILTER(lang(?label) = "ja")
}"""
#: A Wikidata station this close to ours, with the same name, is the same station.
MATCH_KM = 1.5
EARTH_KM = 6371.0
_BRACKETS = re.compile(r"[\(（〈《\[［].*?[\)）〉》\]］]")
#: What a station's name may end with, and how its reading then ends.
_SUFFIXES = (("停留場", "ていりゅうじょう"), ("停留所", "ていりゅうじょ"), ("駅", "えき"))
#: Variant kanji that NFKC keeps apart but station names use either way.
_VARIANTS = str.maketrans({"麴": "麹", "ヶ": "ケ"})
_POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


class LookupDataError(RuntimeError):
    """A download failed or a cached file is missing or malformed."""


def plain_name(name: str) -> str:
    """A station name for matching: no bracketed part, no trailing 駅 or 停留場, NFKC, ヶ = ケ, no spaces."""
    text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", _BRACKETS.sub("", name)).translate(_VARIANTS))
    for suffix, _ in _SUFFIXES:
        if text.endswith(suffix) and len(text) > len(suffix):
            return text[: -len(suffix)]
    return text


def hiragana(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def reading(kana: str, label: str) -> str:
    """The reading of a station name: hiragana, no spaces or dots, and without the reading of 駅 or 停留場
    unless the name itself ends that way (駅前 stays えきまえ)."""
    text = re.sub(r"[\s・･]", "", hiragana(unicodedata.normalize("NFKC", _BRACKETS.sub("", kana))))
    name = plain_name(label)
    for suffix, sound in _SUFFIXES:
        if text.endswith(sound) and len(text) > len(sound) and not name.endswith(suffix):
            return text[: -len(sound)]
    return text


def _km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def match_kana(stations: list[dict], rows: list[dict]) -> dict[str, list[str]]:
    """Station id -> readings, most common first, from Wikidata rows of the same name within MATCH_KM."""
    by_name: dict[str, list[tuple[float, float, str]]] = {}
    for r in rows:
        m = _POINT.match(r["coord"]["value"])
        label = r["label"]["value"]
        if m is None:
            continue
        by_name.setdefault(plain_name(label), []).append((float(m[1]), float(m[2]), reading(r["kana"]["value"], label)))
    out: dict[str, list[str]] = {}
    for s in stations:
        near = Counter(k for lng, lat, k in by_name.get(plain_name(s["ja"]), []) if k and _km(lng, lat, s["lng"], s["lat"]) <= MATCH_KM)
        if near:
            out[s["id"]] = [k for k, _ in near.most_common()]
    return out


def kana_doc(kana: dict[str, list[str]], n_stations: int, fetched: str) -> dict:
    return {
        "source": {"name": "Wikidata, name in kana (P1814)", "license": "CC0 1.0", "fetched": fetched,
                   "query": WIKIDATA_QUERY},
        "coverage": {"stations": n_stations, "with_kana": len(kana)},
        "kana": dict(sorted(kana.items())),
    }


def read_isj(data: bytes) -> list[tuple[str, str, float, float]]:
    """(prefecture + city, town, lng, lat) for every row of one prefecture's zip (Shift_JIS CSV)."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if len(names) != 1:
            raise LookupDataError(f"expected one CSV in the MLIT zip, found {names}")
        text = z.read(names[0]).decode("cp932")
    rows = csv.DictReader(io.StringIO(text))
    return [(r["都道府県名"] + r["市区町村名"], r["大字町丁目名"], float(r["経度"]), float(r["緯度"])) for r in rows]


def address_doc(towns: list[tuple[str, str, float, float]], center: tuple[float, float], radius_km: float,
                version: str, files: list[str]) -> dict:
    """Towns within radius_km of center, grouped by city, coordinates as integers of 1e-5 degrees (about 1 m)."""
    cities: dict[str, dict[str, tuple[int, int]]] = {}
    for city, town, lng, lat in towns:
        if _km(lng, lat, *center) <= radius_km:
            cities.setdefault(city, {}).setdefault(town, (round(lng * 1e5), round(lat * 1e5)))
    return {
        "source": {"credit": f"{ISJ_CREDIT}（{version}、加工: kaname）", "version": version, "files": files},
        "radius_km": radius_km,
        "cities": [[city, [[town, x, y] for town, (x, y) in towns_of.items()]] for city, towns_of in cities.items()],
    }


def _download(url: str, data: bytes | None = None) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read()
    except OSError as exc:
        raise LookupDataError(f"download failed: {url}: {exc}") from exc


def fetch(cache: Path = CACHE_DIR) -> list[Path]:
    """Downloads the Wikidata readings and the MLIT prefecture files into the cache."""
    (cache / ISJ_DIR).mkdir(parents=True, exist_ok=True)
    query = urllib.parse.urlencode({"query": WIKIDATA_QUERY}).encode()
    result = json.loads(_download(WIKIDATA_URL, query))
    wiki = cache / WIKIDATA_FILE
    wiki.write_text(json.dumps({"fetched": date.today().isoformat(), "results": result}, ensure_ascii=False), encoding="utf-8")
    written = [wiki]
    for p in ISJ_PREFECTURES:
        path = cache / ISJ_DIR / f"{p}000-{ISJ_VERSION}.zip"
        path.write_bytes(_download(ISJ_URL.format(v=ISJ_VERSION, p=p)))
        written.append(path)
    return written


def build(out_dir: Path, center: tuple[float, float], radius_km: float, cache: Path = CACHE_DIR) -> tuple[dict, dict]:
    """Writes kana.json and addresses.json from data/stations.json and the cache."""
    try:
        stations = json.loads((out_dir / "stations.json").read_text(encoding="utf-8"))["stations"]
        wiki = json.loads((cache / WIKIDATA_FILE).read_text(encoding="utf-8"))
        zips = sorted((cache / ISJ_DIR).glob(f"*-{ISJ_VERSION}.zip"))
    except (OSError, KeyError, ValueError) as exc:
        raise LookupDataError(f"run `kaname-pipeline fetch-lookup` first: {exc}") from exc
    if len(zips) != len(ISJ_PREFECTURES):
        raise LookupDataError(f"expected {len(ISJ_PREFECTURES)} MLIT files in {cache / ISJ_DIR}, found {len(zips)}")
    kana = kana_doc(match_kana(stations, wiki["results"]["results"]["bindings"]), len(stations), wiki["fetched"])
    towns = [t for z in zips for t in read_isj(z.read_bytes())]
    addresses = address_doc(towns, center, radius_km, ISJ_VERSION, [z.name for z in zips])
    for name, doc in (("kana.json", kana), ("addresses.json", addresses)):
        (out_dir / name).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return kana, addresses
