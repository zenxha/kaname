"""Command line: `uv run kaname-pipeline build|check|validate|fetch-lookup|lookup|fetch-shapes|shapes`."""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from . import mt3d
from .check import ArtifactError
from .validate import ValidationError
from .config import CONFIG_DIR, DEFAULT_MT3D_DIR, DEFAULT_OUT_DIR, ConfigError, load_config
from .lookup import LookupDataError
from .network import NetworkError
from .shapes import ShapeDataError

log = logging.getLogger("kaname_pipeline")


def _load_network(args):
    from .graph import build_network

    cfg = load_config(Path(args.config))
    raw = mt3d.load(Path(args.mt3d), cfg.mt3d_commit, cfg.calendar, cfg.paid_train_types)
    return cfg, build_network(raw, cfg)


def cmd_build(args) -> int:
    from .build import build_closed
    from .emit import write_outputs
    from .universe import select_universe

    t0 = time.monotonic()
    cfg, net = _load_network(args)
    uni = select_universe(net, cfg)
    log.info("network: %d stops, %d connections, %d complexes; %d input stations, %d candidates",
             len(net.stops), len(net.timetable.dep), len(net.complexes), len(uni.complexes), uni.n_candidates)
    mats = build_closed(net, uni, cfg, workers=args.workers)
    meta = write_outputs(Path(args.out), net, mats.universe, mats, cfg)
    log.info("wrote %d files to %s in %.0f s (%d stations added so every route hop has an index)",
             len(meta["files"]) + 1, args.out, time.monotonic() - t0, mats.n_stations - len(uni.complexes))
    return 0


def cmd_check(args) -> int:
    from .check import gate_report

    report = gate_report(Path(args.out))
    print(report.text)
    return 0 if report.passed else 1


def cmd_validate(args) -> int:
    from .check import load_artifacts
    from .validate import validation_report

    cfg, net = _load_network(args)
    report = validation_report(net, cfg, load_artifacts(Path(args.out)))
    print(report.text)
    return 0 if report.passed else 1


def cmd_fetch_lookup(args) -> int:
    from .lookup import fetch

    for path in fetch():
        log.info("fetched %s", path)
    return 0


#: The address index reaches a little past the input area, so an address at its edge still finds stations.
ADDRESS_MARGIN_KM = 2.0


def cmd_lookup(args) -> int:
    from .lookup import build

    cfg = load_config(Path(args.config))
    kana, addresses = build(Path(args.out), cfg.center, cfg.input_radius_km + ADDRESS_MARGIN_KM)
    cov = kana["coverage"]
    towns = sum(len(towns) for _, towns in addresses["cities"])
    log.info("kana for %d of %d stations (%.1f%%); %d towns and 丁目 in %d cities",
             cov["with_kana"], cov["stations"], 100 * cov["with_kana"] / cov["stations"], towns, len(addresses["cities"]))
    return 0


def cmd_fetch_shapes(args) -> int:
    from .shapes import fetch

    log.info("fetched %s", fetch())
    return 0


def cmd_shapes(args) -> int:
    from .shapes import build

    cfg = load_config(Path(args.config))
    doc = build(Path(args.out), cfg.center, cfg.input_radius_km)
    log.info("track shapes for %d of %d station pairs; the rest are drawn straight", doc["on_track"], doc["pairs"])
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kaname-pipeline", description=__doc__)
    parser.add_argument("--mt3d", default=str(DEFAULT_MT3D_DIR), help="Mini Tokyo 3D checkout (default: .cache/mt3d)")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="output directory (default: data/)")
    parser.add_argument("--config", default=str(CONFIG_DIR), help="configuration directory (default: pipeline/config)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="route all pairs and write the data files")
    b.add_argument("--workers", type=int, default=None, help="worker processes (default: CPUs - 1)")
    sub.add_parser("check", help="run the M1 gate checks on the written data files")
    sub.add_parser("validate", help="compare the router with reference journey times and recompute stored cells")
    sub.add_parser("fetch-lookup", help="download Wikidata kana readings and MLIT address points into .cache/lookup")
    sub.add_parser("lookup", help="write kana.json and addresses.json for station and address search")
    sub.add_parser("fetch-shapes", help="download the MLIT N02 railway data (pinned) into .cache/n02")
    sub.add_parser("shapes", help="write shapes.json: the track between each pair of neighboring stations")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    handlers = {"build": cmd_build, "check": cmd_check, "validate": cmd_validate,
                "fetch-lookup": cmd_fetch_lookup, "lookup": cmd_lookup, "fetch-shapes": cmd_fetch_shapes,
                "shapes": cmd_shapes}
    try:
        return handlers[args.cmd](args)
    except (ConfigError, mt3d.SourceDataError, NetworkError, ArtifactError, ValidationError, LookupDataError,
            ShapeDataError) as exc:
        log.error("error: %s", exc)
        return 2


if __name__ == "__main__":
    sys.exit(main())
