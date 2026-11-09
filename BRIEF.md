# Tokyo Meetup Optimizer — Claude Code Build Brief

Nov 9, 2026 · @komay

## Mission

Build a Tokyo-only web tool that takes any number of people, each with a current location and a home location, and ranks meeting stations by total train time for everyone's full trip: start → meeting spot → home.

Existing tools (Meet in the Middle, MeetingSpot, midPoint) optimize the outbound leg only, and several use geographic midpoints. In Tokyo that misleads: rail topology, not distance, decides who has an easy trip, and a spot that is easy to reach can be a painful way home. This tool's cost function is the train network, and it counts the way home.

## Requirements

V1 answers one question well: which station minimizes the pain of the whole evening for N people, using trains only.

**Inputs (per participant)**

- Label (name or nickname)
- Start location: a station, or a lat/lng or address that snaps to nearby stations
- Home location: same options; a toggle for "same as start"
- Global: number of people (target 2-20), optional meeting time and duration, objective weighting (efficient ↔ fair)

**Outputs**

- Top 10 candidate stations, ranked
- Per person: outbound minutes, home minutes, transfers, walking minutes, and whether the last train home is feasible
- Aggregate: total minutes, worst-case person, spread
- Map of the candidates and participants

**Scope limits**

- Tokyo metropolitan rail only: JR, Tokyo Metro, Toei, and private railways, including the Yokohama, Kawasaki, Saitama and Chiba fringes
- Walking to and from stations counts as cost; buses and taxis are out of scope
- No accounts, no backend if avoidable, no venue search in v1 (stretch goal)
- English and Japanese station names, with kana search

**Non-functional**

- Re-scoring after any input change in under 100 ms for 20 people (matrix precomputed)
- No API keys exposed to the browser
- Data licenses documented in the repo

## Optimization model

Each candidate station X gets a round-trip cost per person, and the group objective combines those costs.

```latex
c_i(X) = t(s_i \to X) + t(X \to h_i) + \lambda \cdot \text{transfers}_i(X) + w_i
S(X) = \sum_i c_i(X) \qquad M(X) = \max_i c_i(X)
J(X) = \alpha \, \frac{S(X)}{N} + (1-\alpha)\, M(X)
```

`s_i` and `h_i` are person i's start and home stations, `w_i` is walking time at the edges, and `λ` is a transfer penalty (default 5 min). `α` is the efficient ↔ fair slider: α = 1 minimizes the average, α = 0 minimizes the worst-off person. Default α = 0.5.

**Rules**

- Directed times: `t(a→b)` and `t(b→a)` can differ, so the matrix is not assumed symmetric.
- Hard constraint: when a meeting end time is given, drop any X where someone's last train home departs before they could leave.
- Snapping: a lat/lng input maps to its 3 nearest stations with walking time (about 80 m/min, with a 1.3× detour factor); take the minimum cost over the three.
- Tie-break: prefer the station with more lines, then lower spread.
- Also return the Pareto set of (average, worst-case) so the UI can show the tradeoff, not just one winner.
- V1 uses one representative weekday timetable. Time-of-day-dependent matrices are a stretch goal.

## Data and routing

The hard part is a trustworthy station-to-station travel-time matrix for the Tokyo network. Milestone M0 is a feasibility spike on this, with a decision gate, before any UI work.

The options below come from general knowledge, not a fresh lookup. **Verify current availability, pricing and license terms before depending on any of them.**

| Option | Strength | Risk |
| --- | --- | --- |
| ODPT (Open Data Challenge for Public Transportation in the Tokyo Metropolitan Area) | Free, official, covers many operators; stations, lines, timetables | Needs a developer key; JR coverage and data completeness may be uneven |
| Operator GTFS-JP feeds | Standard format, usable with OpenTripPlanner | Not every operator publishes one |
| OpenTripPlanner (self-hosted) with GTFS + OpenStreetMap | Full multi-leg routing engine, no per-query cost | Setup effort; only as good as the feeds |
| Commercial routing API (Ekispert, NAVITIME) | Accurate multi-operator Japanese routing | Per-query cost; about 150×150 = 22,500 queries for the matrix; license may forbid caching |

**Candidate set.** Start with roughly 150-250 stations: those within about 30 km of Tokyo Station that are served by at least 2 lines or are major termini. Keep the list in a versioned data file.

**Matrix.** Directed minutes between every candidate pair, plus every station that appears as an input (so a participant's own station is always routable). Store as a compact `Uint16` array with a station index file.

**Fallback if M0 fails.** If open data cannot cover JR reliably, build the matrix from a commercial API once, check the license, and ship only derived minutes (not raw responses).

**Google Maps is excluded as a data source.** Google's Routes API terms restrict caching most content, require route results shown on a map to appear on a Google Map, and forbid content derived from Google data, so a stored matrix would breach them. Google Maps may be used by hand for the M0 spot checks only. Check the terms again before relying on this.

**Map layer.** Rail line and station geometry comes from MLIT's free railway data (国土数値情報 鉄道データ; check its terms of use). The basemap is MapLibre with open vector tiles; verify the license of the chosen tile provider. The pipeline also emits a predecessor matrix (about 125 KB at 250 stations) so the app can rebuild each person's station sequence and draw their route along the real rail geometry.

## Architecture and stack

Precompute offline, score in the browser. The heavy routing runs once in a data pipeline; the app ships a static matrix and does the cheap arithmetic client-side, so it needs no backend.

```text
[ transit data: ODPT / GTFS / API ]
          |
   pipeline/ (Python)  -- build graph, route all candidate pairs
          |
   data/ stations.json + matrix.bin (directed minutes, transfers)
          |
   web/ (static: Vite + React + TypeScript)
     |- core/   scoring engine (pure TS, no DOM)
     |- ui/     participant form, results list, map
     '- tests/  unit + property tests
```

**Choices (change with a note in `DECISIONS.md` if you find better)**

- Pipeline in Python, since the routing and data libraries are strongest there.
- App in TypeScript with Vite and React; MapLibre GL for the map using open tiles.
- The scoring engine is a pure function `rank(participants, options, data) → candidates[]`, shared by the UI and a CLI for testing.
- Deploy as a static site (any static host).

**Repo layout**

```text
meetup/
  PLAN.md  DECISIONS.md  README.md
  pipeline/   # fetch, build graph, emit matrix
  data/       # generated artifacts + LICENSES.md
  web/        # app
  cli/        # rank from the command line for tests
```

## UI spec

One screen, mobile-first, results updating live as inputs change.

- **Participant list:** each row has a label, a start field and a home field, both with station autocomplete (English, Japanese and kana). A "home = start" checkbox, add and remove buttons, and a "use my location" option for the start field.
- **Objective slider:** "Efficient ↔ Fair", mapped to `α`, with the current value shown.
- **Optional time:** meeting end time; when set, last-train filtering turns on and excluded stations are listed with the reason.
- **Results:** ranked list of the top 10. Each card shows the station, group average, worst-case person, and a colored per-person bar split into outbound and home minutes. Expanding a card shows each person's transfers and walking time.
- **Map:** the hero of the screen. A muted basemap with rail lines visible; each person is a numbered, colored marker on their start station with a line in their color following the real rail route to the suggested station, carrying a time chip such as "22 min". Dashed lines show the way home. Candidate stations are ranked markers; the selected one is highlighted. Color is never the only identifier: use a number as well.
- **Shareable URL:** the full input state encoded in the query string (station codes only, no personal data), so a plan can be sent in chat.
- **Languages:** English and Japanese UI, toggled in the header.
- **Empty and error states:** unroutable station, fewer than 2 people, and no feasible candidate (suggest relaxing the last-train filter).

## Milestones

Build in this order. Each milestone ends with something checkable, and M0 gates everything after it.

1. **M0: data feasibility spike.** Evaluate the data options, route 20 sample station pairs, compare against a trusted journey planner, and write the findings and a recommendation in `DECISIONS.md`. Gate: pick a data source whose sample times land within ±5 minutes for at least 18 of 20 pairs, or stop and report.
2. **M1: matrix pipeline.** Reproducible command that builds `stations.json` and `matrix.bin` from source data, with `LICENSES.md`. Gate: full matrix for the candidate set, no unreachable pairs among candidates, build documented in the README.
3. **M2: scoring engine and CLI.** Pure `rank()` function plus a CLI, written test-first. Gate: all acceptance tests in the next section pass.
4. **M3: web UI.** The screen described above, wired to the engine. Gate: a 5-person scenario works end to end on a phone-sized viewport.
5. **M4: validation and polish.** Spot-check results against real journeys, tune `λ` and the default `α`, add Japanese strings and the shareable URL. Gate: README with a limits section and a demo scenario.
6. **M5 (stretch):** time-of-day matrices, last-train detail, then a venue search near the chosen station.

## Acceptance criteria

The engine passes these before the UI is considered done. Most are property-based, so they hold regardless of the exact timetable data.

| Test | Setup | Pass condition |
| --- | --- | --- |
| Identity | 2 people, both start and home at station A | A ranks first with cost 0 |
| Permutation invariance | Same participants in any order | Identical ranking |
| Symmetry of identical people | N copies of one person | Same ranking as N = 1 |
| Home leg counts | Two people, same start, different homes on opposite sides of the city | Ranking differs from the same case with homes ignored |
| Objective extremes | α = 1 versus α = 0 on one scenario | α = 0 never has a worse worst-case person than α = 1 |
| Last-train filter | Meeting end time late enough to strand a suburban commuter | Candidates that strand anyone are excluded, with a stated reason |
| Snapping | Lat/lng input inside a station area | Snaps to the right station and adds walking time |
| Real-world spot check | 10 origin-destination pairs vs a trusted journey planner | Within ±5 minutes on at least 9 |
| Performance | 20 participants, 250 candidates, mid-range phone | Re-score under 100 ms |
| Unroutable input | Station missing from the matrix | Clear error naming the station, no crash |

## Working agreement for the session

This brief is written for Claude Code running Opus 5.5 at xhigh effort. Spend the deep reasoning on M0 (data feasibility) and the scoring model; move quickly through UI scaffolding.

**Operate like this**

- Write `PLAN.md` first, with the milestones above and your concrete steps for M0. Then execute.
- Proceed without asking on implementation choices. Log each non-obvious decision in `DECISIONS.md` with a one-line reason.
- Stop and report at the M0 gate before building anything else.
- Write the scoring tests before the engine.
- Commit at the end of each milestone with a message that names the gate you met.
- Keep secrets out of the repo; read keys from environment variables and document them in the README.

**Ask the owner before**

- Using any paid API or anything that needs a credit card
- Shipping data whose license is unclear
- Changing the scope limits (for example, adding buses)
- Choosing a different front-end stack

**Definition of done:** M0 to M4 gates met, acceptance tests green, a README that explains how to rebuild the data and run the app, and a short limits section stating what the travel times do and do not include.

**Kickoff prompt to paste**

```text
Read the build brief "Tokyo Meetup Optimizer". Start by writing PLAN.md, then run
the M0 data-feasibility spike and stop at its gate with a written recommendation
in DECISIONS.md. Do not start the UI until I approve the data source.
```
