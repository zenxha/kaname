# kaname

kaname ranks Tokyo meeting stations for a group. It counts each person's full evening by train: from their start to the meeting station, and from there to their home.

The project is at milestone M1: the data pipeline is done. The scoring engine (M2) and the web app (M3) do not exist yet. `BRIEF.md` is the scope, `PLAN.md` is the plan, and `DECISIONS.md` records each decision with its reason.

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/` | Python pipeline that builds the travel-time data (managed with `uv`) |
| `pipeline/config/` | Build parameters and reviewed tables (paid train types, platform positions, transfers, candidate overrides) |
| `pipeline/validation/` | Held-out reference journey times and their provenance |
| `data/` | Generated data files, `meta.json` and `LICENSES.md` |
| `spike/m0/` | The M0 feasibility spike, kept so its numbers can be reproduced |

## Rebuild the data

You need `git`, `bash` and [uv](https://docs.astral.sh/uv/). If Python 3.11 or later is not present, uv installs it for the pipeline.

1. Fetch the Mini Tokyo 3D data at the pinned commit. This downloads about 110 MB into `.cache/mt3d` (gitignored).
   ```bash
   bash pipeline/fetch_mt3d.sh
   ```
2. Build the data files into `data/`. This takes about 30 seconds on 32 cores.
   ```bash
   cd pipeline && uv run kaname-pipeline build
   ```
3. Run the M1 gate checks on the written files.
   ```bash
   uv run kaname-pipeline check
   ```
4. Compare the router with the reference journey times, and recompute 40 random stored values from scratch. The command fails if a reference set has fewer than 90% of its pairs within 5 minutes, or if a stored value differs.
   ```bash
   uv run kaname-pipeline validate
   ```
5. Run the tests.
   ```bash
   uv run pytest --cov
   ```

The build is deterministic. The same source commit and configuration give the same files and the same checksums in `meta.json`.

The pipeline needs no API keys, secrets or environment variables.

## Data files

All binary files are little-endian and row-major. `meta.json` gives the shape, type and SHA-256 checksum of each file. `stations.json` lists the stations. The candidates come first, so station index `i < n_candidates` is also candidate index `i`.

| File | Type and shape | Meaning |
| --- | --- | --- |
| `stations.json` | JSON | Stations (id, Japanese and English names, aliases, coordinates, railways, platform coordinates, line count) and railways (id, names, color) |
| `candidates.csv` | CSV | The candidate list with the reason for each one, for review |
| `out_min.u16` | uint16 [stations × candidates] | Minutes from a start station to a candidate, 17:30-19:30 window |
| `out_xfer.u8` | uint8 [stations × candidates] | Transfers on that journey |
| `home_min.u16` | uint16 [candidates × stations] | Minutes from a candidate to a home station, 21:00-23:00 window |
| `home_xfer.u8` | uint8 [candidates × stations] | Transfers on that journey |
| `last_dep.u16` | uint16 [candidates × stations] | Latest departure from the candidate that still reaches the home station, in minutes after 00:00 (values over 1440 are after midnight) |
| `out_routes.u16`, `out_routes_idx.u32` | uint16, uint32 | The route of each outbound journey, one block per candidate |
| `home_routes.u16`, `home_routes_idx.u32` | uint16, uint32 | The route of each home journey, one block per candidate |

Sentinels: `65535` means unreachable or no value. In `last_dep.u16`, `65534` means that the candidate is the home station. In the `.u8` files, `255` means unreachable.

A route is `[hop count, then per hop: railway | flags, boarding station (only with flag 0x4000), end station]`. Flag `0x8000` means that the train runs through from the previous hop, so there is no change of train. Flag `0x4000` means a walk to another station before the hop. `meta.json` describes the same encoding.

## What the travel times include

- Each value is the median of what a journey planner shows over a query at every minute of the window. The planner value runs from the first train's departure to the arrival.
- Trains only. Shinkansen and trains that need a surcharge or a reserved seat are excluded.
- Transfer walking times come from a simple model: 1 minute on the same platform, 3 minutes inside one concourse, and a distance-based walk of at least 5 minutes between separate stations. Reviewed tables correct some stations.
- A station is the whole complex of platforms with the same name. The values do not include the walk from a home or an office to the station.
- One weekday timetable. There are no holiday timetables, no delays and no time-of-day profiles outside the two windows.

## Known limits

- On 26 held-out pairs, 24 values land within 5 minutes of Yahoo!乗換案内 (13 exact). The router is slightly optimistic at large terminals, because long transfers there take longer than the model allows. `DECISIONS.md` lists the cases.
- Stations more than 60 km from Tokyo Station have no data, apart from 2 stations that some routes pass through.
- About 16,700 home cells are unreachable: some far stations have no train from some candidates in most of the 21:00-23:00 window.
- Kana readings are not in the data yet. They will come from an open source in M3.
