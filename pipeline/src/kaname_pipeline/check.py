"""M1 gate checks on the written files, and validation against reference journey times."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from array import array
from dataclasses import dataclass
from pathlib import Path
from statistics import mean

from .build import U8_NONE, U16_NONE
from .config import REPO_DIR, BuildConfig
from .emit import LAYOUT, RAILWAY_MASK, SEATED_FLAG, U32, WALK_FLAG
from .graph import Network
from .profile import RouterData, origin_entries, scan
from .summary import first_after
from .timeutil import parse_hhmm

TOLERANCE_MIN = 5
REFERENCE_SETS = (
    ("M0 gate set (18:30)", REPO_DIR / "spike" / "m0" / "reference_times.csv"),
    ("M0 late set", REPO_DIR / "spike" / "m0" / "reference_times_late.csv"),
    ("M1 held-out set", REPO_DIR / "pipeline" / "validation" / "heldout_reference.csv"),
)


class ArtifactError(ValueError):
    """A data file is missing, truncated or does not match meta.json."""


@dataclass(frozen=True)
class Artifacts:
    meta: dict
    stations: dict
    arrays: dict[str, array]

    @property
    def n(self) -> int:
        return self.stations["n_stations"]

    @property
    def k(self) -> int:
        return self.stations["n_candidates"]


@dataclass(frozen=True)
class Report:
    passed: bool
    text: str


def load_artifacts(out_dir: Path) -> Artifacts:
    meta_path = out_dir / "meta.json"
    if not meta_path.exists():
        raise ArtifactError(f"{meta_path} not found. Run: uv run kaname-pipeline build")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    for name, info in meta["files"].items():
        data = (out_dir / name).read_bytes() if (out_dir / name).exists() else None
        if data is None or hashlib.sha256(data).hexdigest() != info["sha256"]:
            raise ArtifactError(f"{name} is missing or does not match meta.json")
    stations = json.loads((out_dir / "stations.json").read_text(encoding="utf-8"))
    arrays = {}
    for name, (typecode, _, _) in LAYOUT.items():
        arr = array(U32 if typecode == "I" else typecode)
        arr.frombytes((out_dir / name).read_bytes())
        if sys.byteorder != "little":
            arr.byteswap()
        expected = 1
        for d in meta["files"][name]["shape"]:
            expected *= d
        if len(arr) != expected:
            raise ArtifactError(f"{name}: {len(arr)} values, expected {expected}")
        arrays[name] = arr
    return Artifacts(meta, stations, arrays)


def decode_route(values, pos: int, start: int) -> tuple[list[tuple[int, int, int, bool]], int]:
    """One route at `pos`: ([(railway, board station, end station, seated)], position after it)."""
    count, pos = values[pos], pos + 1
    hops, prev = [], start
    for _ in range(count):
        word, pos = values[pos], pos + 1
        board = prev
        if word & WALK_FLAG:
            board, pos = values[pos], pos + 1
        end, pos = values[pos], pos + 1
        hops.append((word & RAILWAY_MASK, board, end, bool(word & SEATED_FLAG)))
        prev = end
    return hops, pos


def decode_routes(a: Artifacts, prefix: str, candidate: int) -> list[list[tuple[int, int, int, bool]]]:
    """Routes of one candidate block, one per station in index order."""
    values, idx = a.arrays[f"{prefix}_routes.u16"], a.arrays[f"{prefix}_routes_idx.u32"]
    pos, end = idx[candidate], idx[candidate + 1]
    routes = []
    for s in range(a.n):
        route, pos = decode_route(values, pos, s if prefix == "out" else candidate)
        routes.append(route)
    if pos != end:
        raise ArtifactError(f"{prefix}_routes block {candidate} has the wrong length")
    return routes


def _route_ok(a: Artifacts, route, start: int, end: int, transfers: int) -> bool:
    """The route starts at `start`, ends at `end`, every hop runs on a railway that serves both of
    its stations, and its number of changes matches the stored transfer count."""
    if not route or route[0][1] != start or route[-1][2] != end:
        return False
    st = a.stations["stations"]
    for railway, board, nxt, _ in route:
        if railway not in st[board]["railways"] or railway not in st[nxt]["railways"]:
            return False
    return sum(1 for _, _, _, seated in route[1:] if not seated) == transfers


def _candidate_gate(a: Artifacts) -> list[tuple[str, bool, str]]:
    out_min, home_min, last = a.arrays["out_min.u16"], a.arrays["home_min.u16"], a.arrays["last_dep.u16"]
    n, k = a.n, a.k
    diag = all(out_min[i * k + i] == 0 and home_min[i * n + i] == 0 for i in range(k))
    pairs = [(x, y) for x in range(k) for y in range(k) if x != y]
    unreach = [(x, y) for x, y in pairs if out_min[x * k + y] == U16_NONE or home_min[x * n + y] == U16_NONE]
    no_last = sum(1 for x, y in pairs if last[x * n + y] == U16_NONE)
    names = [f"{a.stations['stations'][x]['id']}->{a.stations['stations'][y]['id']}" for x, y in unreach[:5]]
    return [
        ("diagonal is zero for every candidate", diag, ""),
        (f"no unreachable candidate pairs ({len(pairs)} directed pairs, both windows)", not unreach,
         ", ".join(names)),
        ("every candidate pair has a last train after the home window opens", no_last == 0, f"{no_last} missing"),
    ]


def _route_gate(a: Artifacts) -> list[tuple[str, bool, str]]:
    n, k = a.n, a.k
    out_min, home_min = a.arrays["out_min.u16"], a.arrays["home_min.u16"]
    out_x, home_x = a.arrays["out_xfer.u8"], a.arrays["home_xfer.u8"]
    out_bad = home_bad = 0
    for c in range(k):
        out_routes, home_routes = decode_routes(a, "out", c), decode_routes(a, "home", c)
        for s in range(n):
            if s != c and out_min[s * k + c] != U16_NONE:
                out_bad += not _route_ok(a, out_routes[s], s, c, out_x[s * k + c])
            if s != c and home_min[c * n + s] != U16_NONE:
                home_bad += not _route_ok(a, home_routes[s], c, s, home_x[c * n + s])
    return [(f"every outbound route is complete and consistent ({out_bad} broken)", not out_bad, ""),
            (f"every home route is complete and consistent ({home_bad} broken)", not home_bad, "")]


def _info(a: Artifacts) -> list[str]:
    n, k = a.n, a.k
    out_min, home_min, xfer = a.arrays["out_min.u16"], a.arrays["home_min.u16"], a.arrays["out_xfer.u8"]
    cand = [out_min[x * k + y] for x in range(k) for y in range(k) if x != y]
    asym = sum(1 for x in range(k) for y in range(x + 1, k) if out_min[x * k + y] != out_min[y * k + x])
    unreach_out = sum(1 for s in range(n) for c in range(k) if out_min[s * k + c] == U16_NONE)
    unreach_home = sum(1 for c in range(k) for h in range(n) if home_min[c * n + h] == U16_NONE)
    xf = [xfer[x * k + y] for x in range(k) for y in range(k) if x != y and xfer[x * k + y] != U8_NONE]
    return [
        f"stations {n}, candidates {k}, railways {len(a.stations['railways'])}",
        f"candidate pairs: median {sorted(cand)[len(cand) // 2]} min, max {max(cand)} min, "
        f"mean transfers {mean(xf):.2f}",
        f"asymmetric candidate pairs (outbound a->b != b->a): {asym} of {k * (k - 1) // 2}",
        f"unreachable cells involving non-candidate stations: outbound {unreach_out}, home {unreach_home}",
    ]


def gate_report(out_dir: Path) -> Report:
    a = load_artifacts(out_dir)
    checks = _candidate_gate(a) + _route_gate(a)
    lines = ["M1 gate checks (data files verified against meta.json checksums)"]
    lines += [f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail and not ok else "")
              for name, ok, detail in checks]
    lines += ["Info"] + [f"  {x}" for x in _info(a)]
    passed = all(ok for _, ok, _ in checks)
    lines.append("GATE " + ("PASSED" if passed else "FAILED"))
    return Report(passed, "\n".join(lines))


def resolve(net: Network, name_ja: str, max_km: float) -> int:
    hits = [i for i, c in enumerate(net.complexes) if c.name_ja == name_ja and c.dist_km <= max_km]
    if len(hits) != 1:
        raise KeyError(f"station {name_ja!r} matches {len(hits)} complexes")
    return hits[0]


def router_answer(net: Network, rd: RouterData, origin: int, dest: int, t: int, horizon: int):
    res = scan(rd, frozenset(net.complexes[dest].stops), t, t + horizon)
    return first_after(origin_entries(res, net.complexes[origin].stops), t)


def _compare_set(net, rd, cfg, path: Path) -> tuple[list[str], list[int]]:
    rows, deltas = [], []
    with path.open(encoding="utf-8") as fh:
        for ref in csv.DictReader(fh):
            t = parse_hhmm(ref.get("query_time") or "18:30")
            o, d = (resolve(net, ref[x], cfg.input_radius_km) for x in ("origin", "destination"))
            e = router_answer(net, rd, o, d, t, cfg.horizon_min)
            got = e.arr - e.dep if e else None
            delta = None if got is None else got - int(ref["ref_minutes"])
            deltas.append(delta if delta is not None else 10**6)
            rows.append(f"    {ref['id']:>4} {ref['origin']}→{ref['destination']} ref {ref['ref_minutes']} "
                        f"ours {got} Δ {delta:+d}" if delta is not None else f"    {ref['id']} UNROUTABLE")
    return rows, deltas


def validation_report(net: Network, cfg: BuildConfig, sets=REFERENCE_SETS) -> str:
    rd = RouterData.from_network(net)
    lines = ["Router vs reference planner (planner-style answer at the query time)"]
    for name, path in sets:
        if not path.exists():
            lines.append(f"  {name}: {path} not found, skipped")
            continue
        rows, deltas = _compare_set(net, rd, cfg, path)
        ok = sum(abs(x) <= TOLERANCE_MIN for x in deltas)
        exact = sum(x == 0 for x in deltas)
        mae = mean(abs(x) for x in deltas)
        lines.append(f"  {name}: within ±{TOLERANCE_MIN} {ok}/{len(deltas)}, exact {exact}, MAE {mae:.2f}, "
                     f"mean signed {mean(deltas):+.2f}")
        lines.extend(rows)
    return "\n".join(lines)
