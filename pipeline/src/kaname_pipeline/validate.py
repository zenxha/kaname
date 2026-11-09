"""Validation that needs the router: reference journey times and a recomputation of stored cells."""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from pathlib import Path
from statistics import mean

from .build import U8_NONE, U16_NONE
from .check import Artifacts, Report
from .config import REPO_DIR, BuildConfig
from .graph import Network
from .profile import INF, Entry, RouterData, origin_entries, reconstruct, scan
from .summary import first_after, window_median
from .timeutil import parse_hhmm

TOLERANCE_MIN = 5
MIN_SHARE_WITHIN = 0.9      # the M0 gate ratio (18 of 20)
SAMPLE_CELLS = 40
REFERENCE_SETS = (
    ("M0 gate set (18:30)", REPO_DIR / "spike" / "m0" / "reference_times.csv"),
    ("M0 late set", REPO_DIR / "spike" / "m0" / "reference_times_late.csv"),
    ("M1 held-out set", REPO_DIR / "pipeline" / "validation" / "heldout_reference.csv"),
)


class ValidationError(ValueError):
    """A reference file is missing or names a station the network does not have."""


@dataclass(frozen=True)
class SetResult:
    name: str
    deltas: tuple[int | None, ...]   # None = the router found no journey
    rows: tuple[str, ...]

    @property
    def routed(self) -> list[int]:
        return [d for d in self.deltas if d is not None]

    @property
    def within(self) -> int:
        return sum(abs(d) <= TOLERANCE_MIN for d in self.routed)

    @property
    def passed(self) -> bool:
        return bool(self.deltas) and self.within >= MIN_SHARE_WITHIN * len(self.deltas)

    def summary(self) -> str:
        r = self.routed
        stats = f", exact {sum(d == 0 for d in r)}, MAE {mean(abs(d) for d in r):.2f}, " \
                f"mean signed {mean(r):+.2f}" if r else ""
        unroutable = len(self.deltas) - len(r)
        return (f"  [{'PASS' if self.passed else 'FAIL'}] {self.name}: within ±{TOLERANCE_MIN} "
                f"{self.within}/{len(self.deltas)}{stats}" + (f", unroutable {unroutable}" if unroutable else ""))


def resolve(net: Network, name_ja: str, max_km: float) -> int:
    hits = [i for i, c in enumerate(net.complexes) if c.name_ja == name_ja and c.dist_km <= max_km]
    if len(hits) != 1:
        raise ValidationError(f"station {name_ja!r} matches {len(hits)} station complexes")
    return hits[0]


def router_answer(net: Network, rd: RouterData, origin: int, dest: int, t: int, horizon: int) -> Entry | None:
    """What a planner shows for 'depart at t': the first Pareto journey departing at or after t."""
    res = scan(rd, frozenset(net.complexes[dest].stops), t, t + horizon)
    return first_after(origin_entries(res, net.complexes[origin].stops), t)


def compare_set(net: Network, rd: RouterData, cfg: BuildConfig, name: str, path: Path) -> SetResult:
    if not path.exists():
        raise ValidationError(f"reference file {path} not found")
    rows, deltas = [], []
    with path.open(encoding="utf-8") as fh:
        for ref in csv.DictReader(fh):
            try:
                t, want = parse_hhmm(ref.get("query_time") or "18:30"), int(ref["ref_minutes"])
            except (KeyError, ValueError) as exc:
                raise ValidationError(f"{path.name} row {ref.get('id')}: {exc}") from exc
            o, d = (resolve(net, ref[x], cfg.input_radius_km) for x in ("origin", "destination"))
            e = router_answer(net, rd, o, d, t, cfg.horizon_min)
            delta = None if e is None else e.arr - e.dep - want
            deltas.append(delta)
            head = f"    {ref['id']:>4} {ref['origin']}→{ref['destination']} ref {want}"
            rows.append(f"{head} UNROUTABLE" if delta is None else f"{head} ours {want + delta} Δ {delta:+d}")
    return SetResult(name, tuple(deltas), tuple(rows))


def _expected_cell(net: Network, rd: RouterData, cfg: BuildConfig, origin: int, dest: int,
                   window: tuple[int, int], t_end: int) -> tuple[int, int, int | None]:
    """(minutes, transfers, last departure) recomputed for one pair, as the build defines them."""
    res = scan(rd, frozenset(net.complexes[dest].stops), window[0], t_end)
    entries = origin_entries(res, net.complexes[origin].stops)
    stat = window_median(entries, *window)
    last = entries[-1].dep if entries else None
    if stat.entry is None:
        return U16_NONE, U8_NONE, last
    return stat.minutes, reconstruct(rd, res, stat.entry).transfers, last


def recompute_sample(net: Network, cfg: BuildConfig, a: Artifacts, seed: int = 1) -> list[str]:
    """Recompute random stored cells from scratch. Returns a list of mismatches (empty = all match).
    Catches transposed or shifted matrices and index mix-ups that the structural gate cannot see."""
    rd = RouterData.from_network(net)
    cid = {c.id: i for i, c in enumerate(net.complexes)}
    comp = [cid[s["id"]] for s in a.stations["stations"]]
    rng = random.Random(seed)
    n, k, bad = a.n, a.k, []
    for _ in range(SAMPLE_CELLS // 2):
        s, c = rng.randrange(n), rng.randrange(k)
        if s == c:
            continue
        w = cfg.outbound_window
        got = (a.arrays["out_min.u16"][s * k + c], a.arrays["out_xfer.u8"][s * k + c])
        want = _expected_cell(net, rd, cfg, comp[s], comp[c], w, w[1] + cfg.horizon_min)[:2]
        if got != want:
            bad.append(f"out {a.stations['stations'][s]['id']}->{a.stations['stations'][c]['id']}: {got} != {want}")
        h = rng.randrange(n)
        if h == c:
            continue
        cell = c * n + h
        got = (a.arrays["home_min.u16"][cell], a.arrays["home_xfer.u8"][cell], a.arrays["last_dep.u16"][cell])
        m, x, last = _expected_cell(net, rd, cfg, comp[c], comp[h], cfg.home_window, INF)
        if got != (m, x, U16_NONE if last is None else last):
            bad.append(f"home {a.stations['stations'][c]['id']}->{a.stations['stations'][h]['id']}: {got}")
    return bad


def validation_report(net: Network, cfg: BuildConfig, a: Artifacts | None = None,
                      sets=REFERENCE_SETS) -> Report:
    rd = RouterData.from_network(net)
    lines = ["Router vs reference planner (planner-style answer at the query time; "
             f"each set must reach {MIN_SHARE_WITHIN:.0%} within ±{TOLERANCE_MIN} min)"]
    results = [compare_set(net, rd, cfg, name, path) for name, path in sets]
    for r in results:
        lines.append(r.summary())
        lines.extend(r.rows)
    passed = all(r.passed for r in results)
    if a is not None:
        bad = recompute_sample(net, cfg, a)
        lines.append(f"  [{'FAIL' if bad else 'PASS'}] {SAMPLE_CELLS} random stored cells recomputed from scratch")
        lines.extend(f"    {x}" for x in bad)
        passed = passed and not bad
    lines.append("VALIDATION " + ("PASSED" if passed else "FAILED"))
    return Report(passed, "\n".join(lines))
