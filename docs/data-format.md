# Data format

The pipeline in `pipeline/` writes these files to `data/`. The web app and the command line read them as static files.

All binary files are little-endian and row-major. `meta.json` gives the shape, type and SHA-256 checksum of each file. `stations.json` lists the stations. The candidates come first, so station index `i < n_candidates` is also candidate index `i`.

| File | Type and shape | Meaning |
| --- | --- | --- |
| `stations.json` | JSON | Stations (id, Japanese and English names, aliases, coordinates, railways, platform coordinates, line count) and railways (id, names, color) |
| `candidates.csv` | CSV | The candidate meeting stations, each with the reason that it is a candidate |
| `out_min.u16` | uint16 [stations × candidates] | Minutes from a start station to a candidate, 17:30 to 19:30 window |
| `out_xfer.u8` | uint8 [stations × candidates] | Transfers on that journey |
| `home_min.u16` | uint16 [candidates × stations] | Minutes from a candidate to a home station, 21:00 to 23:00 window |
| `home_xfer.u8` | uint8 [candidates × stations] | Transfers on that journey |
| `last_dep.u16` | uint16 [candidates × stations] | Latest departure from the candidate that still reaches the home station, in minutes after 00:00 (values over 1440 are after midnight) |
| `out_routes.u16`, `out_routes_idx.u32` | uint16, uint32 | The route of each outbound journey, one block per candidate |
| `home_routes.u16`, `home_routes_idx.u32` | uint16, uint32 | The route of each home journey, one block per candidate |
| `kana.json` | JSON | Kana readings for station search, by station id. Optional: without it, search still works by name |
| `addresses.json` | JSON | Towns and 丁目 with one point each, grouped by city, coordinates in 1e-5 degrees |
| `shapes.json` | JSON | The track between each pair of neighboring stations, for the map. Optional: without it, the map draws straight lines |

## Sentinels

- `65535` means unreachable or no value.
- In `last_dep.u16`, `65534` means that the candidate is the home station.
- In the `.u8` files, `255` means unreachable.

## Routes

A route is `[hop count, then per hop: railway | flags, boarding station (only with flag 0x4000), end station]`.

- Flag `0x8000` means that the train runs through from the previous hop, so there is no change of train.
- Flag `0x4000` means a walk to another station before the hop.

`meta.json` describes the same encoding.

## Track shapes

`shapes.json` has one list for each railway in `stations.json`, in the same order. A list has one entry for each pair of neighboring stations in the railway's `stations`. A loop line has one more entry, from its last station back to its first.

- An entry is an encoded polyline of the track from the first station of the pair to the second. It uses the published encoding, latitude first, with 5 decimals.
- An empty entry means that no track path was found. The app draws a straight line for that pair.
- A ride the other way uses the same entry in reverse.

The pipeline searches only the track of the railway's own operator. A straight link between a station and the track counts 5 times its length, so each path joins the track close to its stations. The pipeline drops a path more than 1.6 times as long as the straight line plus 1.5 km. `pairs` and `on_track` count the entries and the entries with a path.

`stations_sha256` is the checksum of the `stations.json` that the shapes were built from. If `meta.json` gives the same checksum for the loaded `stations.json`, the app uses the shapes. Otherwise it draws straight lines.

## What the travel times include

- Each value is the median of what a journey planner shows for a query at every minute of the window. A value runs from the departure of the first train to the arrival.
- Trains only. The data excludes the Shinkansen and trains that need a surcharge or a reserved seat.
- Transfer walks come from a simple model: 1 minute on the same platform, 3 minutes inside one concourse, and at least 5 minutes between separate stations. Reviewed tables in `pipeline/config/` correct some stations.
- A station is the whole complex of platforms with the same name. The values do not include the walk from a home or an office to the station.
- The data uses one weekday timetable. It has no holiday timetable and no delays.
- The home minutes describe the 21:00 to 23:00 window. After midnight, fewer and slower trains run. The last-train check uses the real last departure.

## Rebuilds

The build is deterministic. The same source commit and the same configuration give the same files and the same checksums in `meta.json`. The pipeline needs no API keys, secrets or environment variables.
