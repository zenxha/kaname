# PLAN: Tokyo Meetup Optimizer (kaname)

Source of truth for scope: `BRIEF.md`. Decisions with reasons go in `DECISIONS.md`.

**Session scope (2026-11-09):** M0, M1 and M2, then the owner started M3 (first design iteration) the same day.
**Hard stop:** at the M0 gate (passed; the owner approved the data source on 2026-11-09).

## Constraints carried from the brief and the owner

- No paid API or anything needing a credit card without asking first.
- Google Maps is not a data source. At most it is a hand-checked reference in M0.
- No secrets in the repo. Keys come from environment variables and are documented in the README.
- Only ship data whose license is clear. Licenses go in `data/LICENSES.md`.
- Directed times: never assume `t(a→b) = t(b→a)`.
- The pipeline emits, beyond the minutes matrix: a **predecessor matrix** and **station coordinates**, so routes can later be drawn on a map without reworking the data (owner request).
- Commits are by `zenxha <komays5042@gmail.com>` (repo-local config). No pushing and no GitHub repo creation without asking.

## Milestones

| | Milestone | Gate | This session |
|---|---|---|---|
| M0 | Data feasibility spike | A source whose sample times land within ±5 min on ≥18 of 20 pairs, or stop and report | **yes, stop at the gate** |
| M1 | Matrix pipeline | Full matrix for the candidate set, no unreachable candidate pairs, build documented in the README | **done** |
| M2 | Scoring engine and CLI | All acceptance tests in BRIEF.md pass | **done** |
| M3 | Web UI | 5-person scenario end to end on a phone viewport | **iteration 2** (journey redesign, gate test passes) |
| M4 | Validation and polish | README limits section and a demo scenario | **done** |
| M5 | Stretch | Time-of-day matrices, last-train detail, venue search | no |

## M0: concrete steps

1. **Survey sources (verify, don't trust the brief's table).** For each source, record: coverage by operator (JR East is the known risk), data type (timetable or segment times), access (key? signup? cost?), license (redistribution, derived data, attribution), and freshness.
   - ODPT (Public Transportation Open Data Center): API, GTFS files, the operator list, the JR East situation, how to get a key.
   - Operator GTFS / GTFS-JP feeds (ODPT, gtfs-data.jp, Transitland, operator sites, Tokyo open data catalog).
   - OpenTripPlanner / r5 feasibility given the feeds that exist.
   - OpenStreetMap rail relations (topology only, with times estimated from geometry) as an open fallback.
   - MLIT 国土数値情報 N02 railway data (geometry, map layer) and its terms.
   - Commercial APIs (Ekispert, NAVITIME): pricing, free tiers, caching/derived-data terms. **Research only. No signup or calls without owner approval.**
2. **Choose 20 sample origin–destination pairs** that stress the hard cases: JR-only, subway-only, cross-operator, through-running (e.g. Tokyu ↔ Metro ↔ Tobu), suburban fringes (Yokohama, Kawasaki, Saitama, Chiba, Tama), express-dependent trips, and an asymmetric pair checked both ways.
3. **Get reference times** from a trusted Japanese journey planner, by hand, for one weekday at a fixed evening departure, with paid limited expresses and Shinkansen excluded. Record the source, query and date for every pair in `spike/m0/reference_times.csv`.
4. **Prototype a router** on the best open source(s): load the timetable data, run an earliest-arrival search (CSA or RAPTOR) with transfer walking times, and compute the same 20 pairs under the same conditions. If no timetable source covers JR, also test a graph built from segment run times.
5. **Compare.** Count pairs within ±5 min. Explain every miss: data gap, transfer model, express handling, or a reference artifact.
6. **Write `DECISIONS.md`:** findings for each source, the licenses, the gate result, and a recommendation (plus a fallback if the gate fails). Stop and report to the owner.

Spike code lives in `spike/m0/`. It is throwaway, but versioned so the numbers can be reproduced.

## M1: matrix pipeline (done 2026-11-09, see DECISIONS.md "M1 gate")

- `pipeline/` (Python, `uv`): `fetch_mt3d.sh` → `kaname-pipeline build` → `check` → `validate`.
  Modules: `mt3d` (load and validate), `network` and `transfers` (complexes, timetable, transfer
  model), `profile` (reverse profile CSA), `summary` (window median), `universe` (inputs and
  candidates), `build` (parallel routing), `emit` (files), `check` (gate and validation).
- Candidate set: 207 complexes, 30 km, at least 2 line families, with the reviewed overrides in
  `pipeline/config/candidate_overrides.csv`. The generated list is `data/candidates.csv`.
- Matrix universe: 1,419 stations (60 km, closed under route hops).
- Outputs in `data/`: `stations.json`, `candidates.csv`, outbound and home minutes and transfers,
  `last_dep.u16`, exact route blocks (instead of the planned `pred.bin`), `meta.json`, `LICENSES.md`.
- Gate checks pass. The held-out validation gives 24/26 within ±5 min.
- Carried to M4: longer transfers at deep JR platforms, validated on a fresh pair set.

## M2: scoring engine and CLI (done 2026-11-09, see DECISIONS.md "M2 gate")

- `web/core/`: pure TypeScript `rank(participants, options, data)`, plus `parseData`, station lookup and
  snapping, the clock parser and the route decoder that M3 needs to draw routes.
- `web/tests/`: written first. Vitest and fast-check. Every acceptance row of BRIEF.md runs on the real data.
- `cli/`: `rank` (flags or a JSON scenario, text or `--json` output) and `spotcheck`.

## M3: web UI (iteration 2 done 2026-11-09, see DECISIONS.md "M3 web UI")

- `web/src/`: React and MapLibre. Iteration 1 built direction G of the design canvas. Iteration 2 is the journey
  redesign: a result sheet over the map, the ticket, trips as train lists, line colors, draw-in motion.
- `web/src/map/`: the map, its layers, markers and the draw-in animation. `web/src/model/`: pure, tested logic.
- `web/e2e/`: Playwright, phone and desktop. The journey gate passes.
- Done after iteration 2: trips as line pills and a compact rail, the link preview, and the shareable link (brought forward from M4).
- Done 2026-11-10: kana search and address search (M4).
- Next iterations: owner feedback, and track shapes from MLIT N02.

## M4: validation and polish (done 2026-11-10)

- Done: Japanese strings, the shareable link, the README limits section, and the spot check against reference journeys (M1 and the `spotcheck` command).
- Done: the tuning study (`npm --prefix web run tune`, `docs/tuning.md`). The default slider stays at α = 0.5.
- Done: the transfer penalty λ is 10 (owner's choice). The app shows plain trip minutes and the group's changes of train, and the example group meets at 神田.
- Done: the README demo, a group of three at three slider positions, with links into the app.
- Gate met: the README has a limits section and a demo scenario.
- Still open from M1: longer transfers at deep JR platforms. That needs a fresh set of reference journeys.
