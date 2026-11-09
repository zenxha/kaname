# kaname

kaname ranks Tokyo meeting stations for a group. It counts each person's full evening by train: from their start to the meeting station, and from there to their home.

The data pipeline (M1) and the scoring engine with its CLI (M2) are done. The web app (M3) is at its first design iteration: direction G of the design canvas, a full-bleed map with floating cards. `BRIEF.md` is the scope, `PLAN.md` is the plan, and `DECISIONS.md` records each decision with its reason.

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/` | Python pipeline that builds the travel-time data (managed with `uv`) |
| `web/core/` | The scoring engine: pure TypeScript, no runtime dependencies, no DOM |
| `web/src/` | The web app: React, MapLibre, the map and the floating cards |
| `web/e2e/` | Playwright tests of the app on a phone and a desktop viewport |
| `web/tests/` | Engine tests, including every row of the BRIEF.md acceptance table |
| `cli/` | Command line front end for the engine (`rank`, `spotcheck`) |
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
4. Compare the router with the reference journey times, and recompute 40 random stored values from scratch. If a reference set has fewer than 90% of its pairs within 5 minutes, or if a stored value differs, the command fails.
   ```bash
   uv run kaname-pipeline validate
   ```
5. Run the tests.
   ```bash
   uv run pytest --cov
   ```

The build is deterministic. The same source commit and configuration give the same files and the same checksums in `meta.json`.

The pipeline needs no API keys, secrets or environment variables.

## Run the web app

You need Node.js 22.12 or later.

```bash
npm --prefix web install
npm --prefix web run dev        # http://localhost:5173/
```

The app reads the files in `data/` as static files. It needs no API key and no backend. The basemap follows the device's light or dark setting: OpenFreeMap Positron or Dark. Add `?basemap=none` to the address for a plain background with no tile requests.

Build a static site into `web/dist/`, which any static host can serve:

```bash
npm --prefix web run build
```

## Share a plan

"Share plan" on the result ticket shares a link to the current plan. On a phone it opens the share sheet, and on a desktop it copies the link. The address bar always holds the same link.

The link holds station ids and settings only, never names or locations:

```text
https://kaname-1l6.pages.dev/?p=seiseki-sakuragaoka&p=kanazawa-hakkei.yokohama&fair=75&at=tokyo
```

- `p`: one per person. The start station, then `.` and the home station if home is somewhere else. A location goes as the station it snapped to.
- `fair`: the slider, from 0 (efficient) to 100 (fair). The default 50 is left out.
- `at`: a station picked from the ranking.

If a link names a station that the data does not have, the app leaves it out and says so. The app does not take a meeting end. It proposes one: the first last train home in the group.

## Link preview and icons

A shared link shows a title, a one-line description and a 1200×630 image. The tags are in `web/index.html`, and the image and icons are in `web/static/`. The build copies `web/static/` into the site.

Link previews need the image's full address. The build writes `https://kaname-1l6.pages.dev` into the tags. To deploy somewhere else, set `KANAME_SITE_URL` before the build, for example `KANAME_SITE_URL=https://example.org npm --prefix web run build`.

The image and icons are made from the real data. After a design change, render them again (this needs the Playwright browser and a network connection for the font):

```bash
npm --prefix web run og
```

## Deploy to Cloudflare Pages

The owner approved a public preview on Cloudflare Pages on 2026-11-09, with the data license question still open (see DECISIONS.md). The site sends `X-Robots-Tag: noindex, nofollow` (from `web/static/_headers`), so that search engines do not list it.

Do these two steps one time only. Log in to your own Cloudflare account, then create the project. The `--force` flag keeps the project on classic Pages (see DECISIONS.md).

```bash
npx wrangler@4.153.0 login
npx wrangler@4.153.0 pages project create kaname --production-branch main --force
```

Build and deploy:

```bash
npm --prefix web run deploy
```

The live site is https://kaname-1l6.pages.dev/.

If the machine has no browser for the login, set these environment variables instead of logging in:

- `CLOUDFLARE_API_TOKEN`: an API token with the "Cloudflare Pages: Edit" permission.
- `CLOUDFLARE_ACCOUNT_ID`: your account ID, from the Cloudflare dashboard.

Run the end-to-end tests. The first run needs the browser once (`npx --prefix web playwright install chromium`).

```bash
npm --prefix web run e2e
```

## Rank meeting stations from the command line

You need Node.js 22.12 or later. Install the tools once.

```bash
npm --prefix web install
```

Rank stations for a group. A person is `label:start>home`. A place is a station id, a Japanese or English station name, or `lat,lng`. Without `>home`, the person goes home to the start.

```bash
npm --prefix web run cli -- --person "Aki:町田" --person "Ben:大宮>船橋" --person "Chie:35.6905,139.7003>千葉" --end 23:30
```

Other options: `--alpha` (1 is efficient, 0 is fair, default 0.5), `--lambda` (minutes per transfer, default 5), `--top`, `--ignore-home`, `--json`, and `--input scenario.json`. Run with `--help` for the list.

Compare the stored minutes with reference journey times:

```bash
npm --prefix web run cli -- spotcheck --refs pipeline/validation/heldout_reference.csv
```

Run the engine tests and the type check:

```bash
npm --prefix web test
npm --prefix web run coverage
npm --prefix web run typecheck
```

## How the engine scores

For each candidate X and person i, `c_i(X) = t(s_i→X) + t(X→h_i) + λ·transfers + walking`. The group objective is `J(X) = α·average + (1−α)·worst`. The engine reads each value straight from the typed arrays, so 20 people and 207 candidates take well under 1 ms.

- A coordinate snaps to its 3 nearest stations (80 m/min, 1.3 detour factor, at most 2 km away). Each leg uses the cheapest of the 3.
- If you set a meeting end (CLI `--end`), each home option must have a last train at or after that end. The web app does not set one: it reports the first last train home instead. A candidate that strands anyone moves to `excluded`, with a reason that names the person and the last train.
- Ties go to the station with more lines, then to the lower spread, then to the station id.
- The result also holds the Pareto set of (average, worst case), so a UI can show the tradeoff.

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
- About 6,500 home cells are unreachable: some far stations have no train after 21:00 from some candidates. Where the trains stop early in the 21:00-23:00 window, the home minutes describe the trains that still run, and `last_dep.u16` shows the last one.
- Kana readings are not in the data yet. They will come from an open source in M3.
- The home minutes describe the 21:00-23:00 window. After midnight, fewer and slower trains run, so a later meeting gets longer trips home than the values show. The last-train check uses the real last departure.
