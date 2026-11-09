"""Which station complexes get matrix rows (inputs) and which are meeting candidates."""

from __future__ import annotations

from dataclasses import dataclass

from .config import BuildConfig, ConfigError
from .graph import Network


@dataclass(frozen=True)
class Universe:
    complexes: tuple[int, ...]      # station index -> complex index (candidates first)
    n_candidates: int
    reasons: tuple[str, ...]        # per candidate: why it is one

    def station_of(self) -> dict[int, int]:
        return {c: s for s, c in enumerate(self.complexes)}

    def extended(self, extra: list[int]) -> "Universe":
        """A new universe with `extra` complexes appended as non-candidate stations."""
        known = set(self.complexes)
        return Universe(self.complexes + tuple(c for c in extra if c not in known), self.n_candidates, self.reasons)


def _override_targets(net: Network, cfg: BuildConfig) -> dict[int, tuple[bool, str]]:
    out: dict[int, tuple[bool, str]] = {}
    for o in cfg.candidate_overrides:
        hits = [i for i, c in enumerate(net.complexes)
                if c.name_ja == o.station_ja and c.dist_km <= cfg.input_radius_km]
        if len(hits) != 1:
            raise ConfigError(f"candidate override {o.station_ja!r} matches {len(hits)} stations inside the "
                              f"{cfg.input_radius_km} km input radius; it must match exactly one")
        out[hits[0]] = (o.include, o.reason)
    return out


def select_universe(net: Network, cfg: BuildConfig) -> Universe:
    """Inputs: complexes within input_radius_km. Candidates: inputs within candidate_radius_km
    served by at least candidate_min_lines lines, adjusted by candidate_overrides.csv."""
    overrides = _override_targets(net, cfg)
    inputs = [i for i, c in enumerate(net.complexes) if c.dist_km <= cfg.input_radius_km]
    candidates: list[tuple[int, str]] = []
    for i in inputs:
        c = net.complexes[i]
        by_rule = c.dist_km <= cfg.candidate_radius_km and c.line_count >= cfg.candidate_min_lines
        include, reason = overrides.get(i, (by_rule, "rule"))
        if include:
            candidates.append((i, reason if i in overrides else "rule"))
    cand_set = {i for i, _ in candidates}
    others = [i for i in inputs if i not in cand_set]
    candidates.sort(key=lambda x: net.complexes[x[0]].id)
    others.sort(key=lambda i: net.complexes[i].id)
    return Universe(tuple(i for i, _ in candidates) + tuple(others), len(candidates),
                    tuple(r for _, r in candidates))
