# DECISIONS

Non-obvious decisions, one line of reasoning each. The M0 gate write-up comes first because it blocks everything else.

---

## M0 gate: data source (2026-11-09) · STATUS: approved for M1/M2 builds (owner, 2026-11-09); license still to clear before any public deploy

### TL;DR

- **Gate met, narrowly.** The timetables published by the Mini Tokyo 3D project ([nagix/mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d), `data/train-timetables/`), routed with a simple transfer model, landed within ±5 min of Yahoo!乗換案内 on **18 of 20** gate pairs (10 exact, MAE 2.25 min). They also matched **6 of 6** late-evening and near-last-train checks exactly.
- **The timetable data looks exact. The transfer model is the weak part.** Whenever the planner and the router boarded the same train, departure and arrival times agreed to the minute. Both misses, and every near-miss, come from transfer walking times at hubs. M1 fixes that with a curated transfer table.
- **No open-licensed source covers JR East or the big private railways long-term.** On ODPT, JR East, Tobu, Keio, Sotetsu, Tokyu, Odakyu, Seibu and Keikyu are "Challenge 2026 only": the license ends **2027-03-12**, and the data must then be deleted. Keisei and Tokyo Monorail aren't on ODPT at all. The commercial APIs forbid caching or secondary use of results without a negotiated contract.
- **The license of the recommended source is unclear, so per the brief I'm asking before shipping it.** The repo is MIT, but its README says the data "are sourced from the Public Transportation Open Data Center", and its build needs a Challenge 2026 token. The timetables may therefore carry ODPT restrictions that MIT can't lift.

**Recommendation:** approve Mini Tokyo 3D timetables as the M1 source **for building and testing**. Before any public deploy, clear the license question with the steps under "What I need from you". Ship only derived minutes, transfers and route skeletons, never raw timetables.

### Gate result

Query: Wednesday 2026-11-11, depart 18:30, ordinary trains only (no Shinkansen or paid limited express). Reference: Yahoo!乗換案内, route 1 (earliest arrival), looked up by hand in a browser. Provenance is in `spike/m0/reference_times.md`. The transfer model was fixed **before** looking at any reference time. Reproduce with `bash spike/m0/fetch_mt3d.sh && python3 -I spike/m0/run_spike.py`.

| # | Pair | Stresses | Ref | Ours | Δ |
|---|---|---|---|---|---|
| 1 | 新宿→東京 | JR single line | 14 | 14 | 0 |
| 2 | 渋谷→池袋 | JR vs Metro | 12 | 12 | 0 |
| 3 | 横浜→新宿 | Yokohama fringe | 35 | 35 | 0 |
| 4 | 大宮→品川 | Saitama, Ueno-Tokyo line through-running | 44 | 44 | 0 |
| 5 | 千葉→渋谷 | Chiba, 2–3 transfers | 68 | 66 | −2 |
| 6 | 吉祥寺→豊洲 | JR→Metro cross-operator | 50 | 50 | 0 |
| 7 | 北千住→二子玉川 | Metro→Tokyu through-running | 56 | 56 | 0 |
| 8 | 町田→大手町 | Odakyu→Metro | 47 | 52 | +5 |
| 9 | 大手町→町田 | reverse of 8 (asymmetry) | 53 | 53 | 0 |
| 10 | 立川→錦糸町 | long JR, Tama | 60 | 65 | +5 |
| 11 | 武蔵小杉→上野 | Kawasaki, JR hub transfer | 35 | 29 | **−6** |
| 12 | 船橋→六本木 | Chiba, JR→Metro×2 | 49 | 50 | +1 |
| 13 | 押上→羽田空港第1・第2 | Keisei/Toei/Keikyu through-running | 52 | 47 | −5 |
| 14 | 川越→新宿 | Tobu Tojo + JR | 40 | 40 | 0 |
| 15 | 二俣川→渋谷 | Sotetsu/Tokyu Shin-Yokohama line | 48 | 48 | 0 |
| 16 | 柏→新橋 | Joban rapid + Ueno | 46 | 43 | −3 |
| 17 | 調布→秋葉原 | Keio + JR×2 | 41 | 37 | −4 |
| 18 | 所沢→有楽町 | Seibu + Metro | 54 | 50 | −4 |
| 19 | 流山おおたかの森→秋葉原 | Tsukuba Express | 27 | 27 | 0 |
| 20 | 海浜幕張→品川 | Keiyo deep platform at Tokyo | 62 | 52 | **−10** |

**18/20 within ±5 (gate: ≥18).** 10 exact. MAE 2.25 min. Mean signed error −1.15 min, so the router is slightly optimistic.

Late-evening home-leg checks (`reference_times_late.csv`): 大手町→町田, 新宿→川越 and 有楽町→所沢 at 22:30; 渋谷→二俣川 (JR→Sotetsu through-running) and 秋葉原→流山おおたかの森 at 22:30; 新宿→立川 at 00:10. **6/6 exact.** Combined: 24/26 within ±5, 16/26 exact.

**Why the misses happen.** Mini Tokyo 3D gives every JR line at a station one shared coordinate, so the walk-distance rule sees 0 m between, say, the Keiyo platform at Tokyo and the Yokosuka platform (really a 10–15 min walk).
- #20: the router allowed 7 min for Keiyo → Yokosuka at Tokyo. The planner wouldn't make that connection and took a later Tokaido train.
- #11 (Shinagawa), #15 (Yokohama), #16 (Ueno), #17 (Shinjuku) and #18 (Ikebukuro): same direction, 3–6 min too short.
- #8 (Yoyogi-Uehara) and #10 (Ochanomizu) err the other way. They are cross-platform transfers that the router charged at 3–5 min.
- #13 passes only at the boundary, via a monorail detour with 2 transfers that the planner rejected.

**The margin is thin.** Three pairs sit at exactly ±5. The pass rests on the timetable data being exact, which is the thing M0 is meant to test. It does not show the transfer model is good. M1 validates any transfer-table change against a fresh, held-out set of pairs, not these 20, so the table isn't fitted to them.

### Source survey

All checked 2026-11-09 against the live catalogs and terms, not from memory.

| Source | Coverage | Access | License for our use | Verdict |
|---|---|---|---|---|
| **ODPT, Basic License / CC BY 4.0** | GTFS for Tokyo Metro, Tsukuba Express, Rinkai, Tama Monorail and Yokohama subway (Basic License); Toei (CC BY 4.0). Yurikamome publishes station timetables only. | Free developer key (signup, up to 2 business days for approval) | Products and data may be published, commercial use is OK. Republishing raw data or 派生データ (data from which "all or most of the original can be restored") is forbidden without written consent (art. 8-4). A minutes matrix can't be turned back into a timetable. Requires an accuracy disclaimer and a contact point (art. 10-3). | Clean, but **no JR and no major private railways**. Not sufficient alone. |
| **ODPT, Challenge 2026 Limited License** | GTFS for JR East (Kanto local lines), Tobu, Keio, Sotetsu. Station timetables only for Tokyu, Odakyu, Seibu, Keikyu. | Developer key plus a Challenge entry | The grant **ends 2027-03-12**, then use must stop and the data be deleted (art. 13-2/3). Use is only for a Challenge entry (art. 4-1/4-7). JR East adds a term that survives the contest: no competing services. | Fine for a time-boxed Challenge entry. **Not a foundation for a lasting app.** |
| Missing from ODPT entirely | Keisei, Hokuso, Shin-Keisei, Tokyo Monorail, Minatomirai, Saitama Railway, Toyo Rapid, Seaside Line, others | none | none | Gap |
| **Mini Tokyo 3D `data/train-timetables`** | 179 railways, 177 with weekday trips. Every Tokyo-area operator including the ODPT gaps, with through-running links (`nt`), station coords, ja/en names and transfer groups. Revised after each timetable change (JR: 2026-03-14 revision; Keio 2026-08; Ginza/Marunouchi 2026-09). | Public GitHub, no key | Repo is MIT ("Copyright (c) 2019-2026 Akihiko Kusanagi"). The README says the data come from ODPT and the build needs ODPT and Challenge 2026 tokens. No statement on timetable provenance or upstream permission. TokyoGTFS republishes the same data as GTFS, citing MIT. | **Technically best, passes the gate. License unclear, so you decide.** |
| OpenTripPlanner / r5 on GTFS | Only as good as the feeds. The open feeds lack JR and the privates. | Self-host | n/a | Not needed. A CSA in the pipeline does the job. Revisit only if we add time-of-day profiles at scale. |
| OSM rail relations | Topology, no times | ODbL | Share-alike on derived databases | Rejected for times. Estimating from geometry can't model express patterns or waits. |
| MLIT 国土数値情報 N02 (2025 edition) | Line and station geometry, operator and line names, no times | Free download | CC BY 4.0 since 2020. Attribution: 出典：国土交通省国土数値情報ダウンロードサイト | **Use for the map layer** (M3). Not a time source. |
| Ekispert (駅すぱあと API) | Excellent | Free plan: simple route search returns a web URL, not minutes. Paid: packs of up to 20,000 requests (¥22,000); Standard plan priced on inquiry. | Free plan forbids "生成されるデータを二次利用・転売する行為" (art. 15-4). Paid-plan terms aren't public. | Not viable without a negotiated contract. 62,500 queries exceeds the largest pack. |
| NAVITIME API | Excellent | RapidAPI free tier 500/month; $200/month for 5,000. Direct contract priced on inquiry. | RapidAPI terms forbid caching (art. 5-5). A direct contract allows storage only as written in the order form. | Not viable without a negotiated contract. **Paid, so I won't touch it without your approval.** |
| Google Maps | n/a | n/a | Excluded by the brief | Not used, not even for spot checks (Yahoo used instead). |

### What I need from you

1. **Approve or reject Mini Tokyo 3D timetables as the M1/M2 build source.** I recommend approving. M1/M2 only build locally and nothing is published until M3/M4, so this step carries little exposure.
2. **Before any public deploy, choose how to clear the license:**
   - (a) **Ask the Mini Tokyo 3D author** whether the timetable files are redistributable and whether a derived travel-time matrix is fine. This is the cheapest option. I can draft the message (a GitHub issue or email, sent by you, since it goes out under your name).
   - (b) **Ask ODPT (公共交通オープンデータ協議会)** for written consent under art. 8-4 for a non-restorable derived matrix.
   - (c) **Accept the risk with mitigations:** ship only derived minutes, transfers and route skeletons (raw timetables are never committed; `fetch_mt3d.sh` pulls them at build time from a pinned commit), add attribution plus the ODPT-style accuracy disclaimer, and publish a takedown contact.
   - **Closed on 2026-11-10:** the owner judged the data license okay (in chat). The mitigations of (c) are in place: derived data only, a pinned source commit, and credits in the app footer and in `data/LICENSES.md`.
3. **Fallback if the answer is no:** a time-boxed ODPT Challenge 2026 entry (applications close 2027-01-11, data until 2027-03-12, you'd need to register), or a negotiated commercial contract (paid, so only on your say-so). Neither is a lasting solution, and the brief's "data license unclear → ask the owner" rule applies to both.

### Consequences for M1 if approved

- **Transfer table:** curated walking minutes for the ~30 largest hubs and the known cross-platform pairs, replacing the uniform rule. Sources must be license-clean (operator station maps checked by hand, or ODPT Basic/CC BY GTFS `transfers.txt` / pathways where they exist). No values copied from planner output. Validate on a held-out pair set.
- **Paid-train exclusion list** (`PAID_TYPES` in `spike/m0/router.py`) becomes reviewed config.
- **Travel-time definition:** "first boarding to arrival" over a representative weekday window. I'd use the median over departures in two windows: outbound 17:30–19:30, home 21:00–23:00. That replaces the planner-style single query.
- **Matrix universe:** a participant's station can be any of ~1,900 network complexes, but candidates are ~227 (complexes within 30 km of Tokyo Station with ≥2 lines). The dense block is candidates×candidates; the input stations need rows *to* candidates and columns *from* candidates (two ~1,900×227 Uint16 blocks, about 0.9 MB each before gzip).
- **Predecessor matrix and coordinates (owner request):** `pred.bin` stores, for each directed pair, the previous boarding/transfer complex on the chosen path, so the route rebuilds recursively. Each leg also records its railway, so the UI can draw it along that line's geometry (MLIT N02 or Mini Tokyo 3D `coordinates.json`) between the two stations. `stations.json` carries per-complex centroid and per-platform coordinates.
- **Kana:** Mini Tokyo 3D has ja/en names only. Kana readings will come from Wikidata (CC0) or ODPT Basic station data, never guessed.

---

## M3 web UI · STATUS: iteration 2 built (2026-11-09)

### Iteration 2: the journey redesign

- **What the owner approved:** all six details of the restyle options page (https://claude.ai/artifact/Jw6j3Bej9TynBbKP4FroyT), and the journey prototype (https://claude.ai/artifact/PLDTNhm9zVovrV9vLd8Ueh). The owner did not pick a typeface or a default pair. The build uses the recommended ones: BIZ UDPGothic, and Shizuku with Tora.
- **Layout:** on a phone the map fills the screen and the result is a sheet over it, at three heights (peek, half, full). On a desktop the same content is a side panel. The map stays in view while you tap people and stations.
- **Explaining the answer:** the ticket says what changes at another station, for example "Same average as Jimbocho. Shizuku's trip is 3 min shorter, Tora's trip is 3 min longer." It also proposes when to leave: "Everyone can stay until 23:30, Tora's last train home." Tapping a person opens their trip as a list of trains, changes and walks, and fades everyone else on the map. One line under the slider says what the position means.
- **Motion:** routes draw in along the tracks (500-1000 ms by ride length, 80 ms apart), then the 要 seal stamps (220 ms). The camera eases to each new fit (450 ms). Rows of the station list slide to new places (220 ms). The sheet settles in 280 ms. Under reduced motion, every state appears at once.
- **Gate test passes:** `npm --prefix web run e2e` runs the journey on a 390×844 phone and a 1280×820 desktop. The example opens on 神保町, and a tapped person's trip opens. The runner-up explains itself, and the slider moves the answer to 日暮里. Hitori moves it to 品川, and the proposed end becomes Tora's 23:18 last train. Japanese works.
- **Review:** a TypeScript review found no critical issues and three high ones, now fixed. A theme change during the line animation could write to a removed map. One failed tile could switch off the street map for the session. A language switch lost the focus fading on the markers. Medium fixes: the sheet handle now works with screen readers, a flick settles from its last height, offscreen content can be scrolled to, and hidden content stays out of the tab order. The map no longer refits when the address bar moves. The end-to-end tests now cover the sheet drag and the handle from the keyboard, and the focus across a language switch.
- **After iteration 2:** trips show as line pills (closed row) and a compact rail (open row). Shared links have a preview. The shareable link from M4 is done: see the decision log.
- **Not in this iteration:** kana search (M4), and track shapes from MLIT N02. A keyboard user who picks a station on the map loses focus, because the markers are rebuilt. The list below the map keeps a keyboard path.

### Iteration 1

- **Design:** direction G of the design canvas "Kaname — Tokyo Meetup Optimizer" (a full-bleed map with floating cards and animated routes). It was the last direction on the canvas, it already takes E's "TIGHT" last-train warning, and it matches the brief's map-as-hero spec. The other six directions (A-F) stay on the canvas for comparison.
- **Gate test passes:** `npm --prefix web run e2e` runs the 5-person scenario end to end on a 390×844 phone and on a 1280×820 desktop: add a person with station search, set a meeting end, pick another station, slide to fair, switch to Japanese.
- **Changes from the wireframe:** the list on the right shows the top 5 including the winner, so any of them can be selected (the wireframe's "next best" shows ranks 2-5). The wireframe's numbers were samples; the app shows the real ranking (the sample group meets at 東京, 62 min on average). The station "Rosenzu" lines are drawn station to station along each railway, not along the exact track shape.
- **Review:** a TypeScript review of the app found no misuse of the engine. It found UI defects that are now fixed with tests: the map refitted on every edit, a failed basemap left the map empty, a late "use my location" result could bring back a removed person, Enter in a Japanese IME conversion picked a station, home markers and chips showed color only (they now show the number too), and focus was lost when a card opened as an editor.
- **Not in this iteration:** the shareable URL, kana search and the remaining Japanese copy (all M4 in the brief), and the animated route drawing of the wireframe (the markers pop in and the meeting marker pulses; both stop under reduced motion).

## M2 gate: scoring engine and CLI (2026-11-09) · STATUS: gate met

- **Gate met.** `npm --prefix web test` (91 tests) runs every row of the BRIEF.md acceptance table on the real M1 data, and all pass: identity, permutation invariance, copies of one person, home leg, objective extremes, last-train filter, snapping, the 10-pair spot check, performance and the unroutable-input error. Property tests on random data repeat the first five, the Pareto set and the last-train filter.
- **Spot check (10 pairs):** held-out pairs h01 to h10, chosen by their order in the file, compare the stored median minutes with the Yahoo!乗換案内 time. 10 of 10 are within ±5 min. On all 50 reference rows that are in the matrix, 46 are within ±5 min. The 4 misses are 武蔵小杉→上野 twice (−6, the 新橋 transfer from M1), 立川→錦糸町 (−8: the window median uses a faster Chuo special rapid than the 18:30 query) and 新宿→立川 at 00:10 (−7: after midnight only slower trains run, and the matrix describes 21:00-23:00).
- **Speed:** 20 people on the real data score in well under 1 ms on a desktop. The test budget is 20 ms, a 5× margin under the 100 ms phone target.
- **Review.** A TypeScript review found no error in the cost model or the matrix indexing. It found defects at the edges, now fixed with regression tests: home cells marked unreachable while an early train still ran (fixed in the pipeline, see the M1 decision log), unbounded route decoding, a spot check that passed with nothing compared, a non-transitive comparator, and scenario options that were ignored when misspelled.
- **Tests were written first** (commit 01b0bfe) and failed before the engine existed (commit 59e4d32). Two test expectations were wrong and were corrected, not the engine: 25:00 is valid timetable notation for 01:00, and in the real data the Shibuya person also misses last trains from a few far stations at 23:45.

## M1 gate: matrix pipeline (2026-11-09) · STATUS: gate met

### TL;DR

- **Gate met.** `uv run kaname-pipeline build` builds the data from the pinned Mini Tokyo 3D commit in about 30 seconds. `uv run kaname-pipeline check` then verifies the files against their checksums and runs the gate. All 42,642 directed candidate pairs are reachable in both windows, every candidate pair has a last train, and all routes rebuild. The README documents the build.
- **Router accuracy on fresh pairs: 24 of 26 within ±5 min** of Yahoo!乗換案内 (13 exact, MAE 1.31, mean signed −0.62). The M0 set improved from MAE 2.25 to 1.55 (18/20, 11 exact), and the late set stays at 6/6 exact.
- **One change to the M0 plan: routes ship as exact route blocks, not as a predecessor matrix.** A recursive rebuild from a predecessor (or next-hop) matrix looped for 12% of pairs. Each pair keeps its own median journey, so the rest of one route is not the route stored for the next station. The route blocks serve the same purpose (draw each person's route on the real rail geometry) and are exact.
- **Size:** 1,419 stations (1,417 within 60 km, plus 2 that routes pass through), 207 candidates, 12 MB raw, about 3.3 MB gzipped. The app needs the 1.2 MB of matrices and station data at start. Route blocks of about 5 KB gzipped load per selected candidate.

### Held-out validation

The transfer tables were committed (f931bc5) before the router saw the held-out pairs, and they were not changed after. Pairs, settings and provenance are in `pipeline/validation/`. Rows c20 and c11 repeat M0 pairs to confirm that the query settings match M0 exactly.

Outside ±5 min, all optimistic:

| Pair | Ref | Ours | Cause |
|---|---|---|---|
| 武蔵小杉→上野 (c11, M0 #11) | 35 | 29 | 5-min change at 新橋 from the deep Yokosuka platforms (B5) to the Tokaido surface platforms. The planner allows more. |
| 南浦和→新木場 (h18) | 62 | 56 | 12-min change at 東京 from the surface to the Keiyo platforms. The planner does not make this connection and takes the Yurakucho line. |
| 千葉→渋谷 (M0 #5) | 68 | 62 | Walk from the deep JR 馬喰町 platforms to 馬喰横山 (Toei), then the 九段下 cross-platform change. |

h14 (舞浜→新宿, Keiyo→Chuo at 東京) sits at exactly −5. **Pattern:** changes to and from deep underground JR platforms (東京 Keiyo and Sobu, 新橋, 馬喰町) are still too short. **Follow-up for M4:** raise the deep-platform allowance and add 新橋, 馬喰町 and 新日本橋, then validate on another fresh set, not these pairs.

**Done in M4 (2026-11-10).** Each deep JR platform now adds 3 minutes, and the rule covers 新橋, 新日本橋 and 馬喰町 (decision log, 2026-11-10). A fresh set of 24 pairs was picked and committed with the change (`444d6b2`), then compared with the planner. 18 pairs are likely to change at a deep platform, and 6 are controls.

| Model | Within ±5 | Exact | MAE | Mean signed, deep pairs | Mean signed, controls |
|---|---|---|---|---|---|
| Before (`444d6b2~1`) | 22/24 | 3 | 2.79 | −2.83 | −0.33 |
| After | 24/24 | 7 | 2.08 | −1.33 | −0.33 |

The old misses 市川→日本橋 (−8) and 津田沼→田町 (−6) are now 0 and −3. On the M0 set, 千葉→渋谷 went from −6 to −2. Changes at deep platforms are still about 1.3 min short on average, and three fresh pairs sit at −5. The set is now seen, so a further change needs another fresh set.

The M1 diagnosis was right for 千葉→渋谷 only. c11 now changes at 品川 with 5 minutes instead of at 新橋, for the same 29 min. h18 takes three tight changes (浦和, 上野, 有楽町) that the planner does not allow. h14 needs a longer walk from the Keiyo platform to the raised Chuo platforms at 東京. None of the three is a deep-platform problem.

### Candidate set

207 complexes within 30 km of Tokyo Station served by at least 2 line families (`data/candidates.csv`). A branch counts as its parent line, so 鶴見線大川支線 is 鶴見線. Before that rule, industrial stops such as 安善 and 浅野 counted as 2-line stations. One override: 浜川崎 is excluded. It has about 2 trains an hour after 20:00, so from 36 candidates most of the home window has no journey to it. No single-line terminus needed adding.

### Open items for M2 and later

- About 6,500 home cells are unreachable: far stations with no train after 21:00 from some candidates. The engine reports them by name.
- Kana readings are not in the data. M3 adds them from Wikidata (CC0) or ODPT Basic station data.
- The license question from M0 is still open. The derived files in `data/` are committed locally. Pushing the repo to a public remote would publish them, so ask the owner first.

---

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-09 | Repo identity `zenxha <komays5042@gmail.com>` pinned in `.git/config`; any remote will be `https://zenxha@github.com/zenxha/…` | Personal project; same pattern as `~/Projects/p/mita`; global git and the active `gh` account (`ksugi-fieldai`) stay untouched. |
| 2026-11-09 | Spike router = Connection Scan Algorithm in plain Python, no dependencies | 584k weekday connections; one scan takes about 0.1 s, plenty for a spike and probably for the M1 batch too. |
| 2026-11-09 | Transfer rule fixed before comparison: same line 1 min, same sub-group 3 min, other sub-group max(5, 3 + 1.3·d/80) | Keeps the gate honest (no fitting to the reference). Uses the brief's walking constants. |
| 2026-11-09 | Exclude Shinkansen and surcharge or reserved-seat trains (JR/Tobu/Seibu/Odakyu limited expresses, liners, S-TRAIN, Skyliner, Wing) | A meetup trip shouldn't assume a premium ticket. Free 特急 on Keio, Tokyu, Keikyu, Keisei and Sotetsu stay in. Easy to flip if you prefer otherwise. |
| 2026-11-09 | Reference planner = Yahoo!乗換案内, by hand, route 1 by earliest arrival | Trusted multi-operator planner with current (2026-11) timetables. Google is excluded by the brief. Only 26 summary facts are recorded. |
| 2026-11-09 | Endpoints = the whole same-name station complex, no access/egress walk | Matches how planners treat "新宿"; participant walking is a separate cost term (`w_i`). |
| 2026-11-09 | Raw third-party timetables are never committed; fetched at build time from a pinned commit | Keeps the repo clean whatever the license answer turns out to be. |
| 2026-11-09 | Pipeline router = reverse profile Connection Scan, one scan per target, pure Python with fork workers | One scan gives every origin's full (departure, arrival) profile. The full build takes about 30 s, so numba or a compiled router is not needed. Property tests check it against a brute-force forward search. |
| 2026-11-09 | Matrix minutes = median over every minute of the window of the planner-style duration (first boarding to arrival) | It is what a planner shows, and it does not depend on the minute someone happens to ask. The representative journey (transfers, route) is the median one with the most weight. |
| 2026-11-09 | Windows: outbound 17:30-19:30, home 21:00-23:00, horizon 240 min. If the trains stop early in the window, the value is the median over the minutes that still have a train. A pair is unreachable only with no train after the window opens | Carried from the M0 plan. The first rule made about 10,000 home cells "unreachable" although a train ran at, say, 21:14, so a meeting that ended at 21:00 wrongly excluded them (found in the M2 review). `last_dep` now decides feasibility. |
| 2026-11-09 | Last departure = latest Pareto departure after 21:00 on the same service day | Comes free from the home scan. Trips that start before 03:00 belong to the previous day, so a 00:15 train counts as 24:15. |
| 2026-11-09 | Input stations: complexes within 60 km of Tokyo Station (1,417), closed under route hops (+2) | Covers the commuter belt (熊谷, 成田, 鎌倉, 八王子). 小田原 (74 km) is out. Every route endpoint needs a station index. |
| 2026-11-09 | Station complex = stops with the same normalized Japanese name within 550 m | Splits 都電早稲田 (688 m) and TX 浅草 (591 m), which planners list separately. Merges 両国 (408 m). ヶ and ケ count as the same. |
| 2026-11-09 | Station id = English name slug, plus the operator on a collision (`kasumigaseki-tobu`) | Stable, readable, and safe in a URL for the shareable state in M3. |
| 2026-11-09 | Line count = distinct line families, ignoring 3 routing segments (山手貨物線, 東海道貨物線, 大崎支線) | A branch is not a separate line for a rider. The count drives the candidate rule and the tie-break. |
| 2026-11-09 | Transfer model v2 = M0 rules + 18 N02 platform positions (東京, 武蔵小杉) with +2 min per deep platform + 16 cross-platform pairs at 1 min | Mini Tokyo 3D puts all JR lines of a station on one point, which caused the M0 misses at 東京. The positions are CC BY 4.0. The cross-platform pairs are documented station layouts. Fixed before the held-out check. |
| 2026-11-09 | Routes ship as exact per-candidate route blocks, not a predecessor matrix | A recursive rebuild looped for 12% of pairs (medians are not consistent along a path). Exact routes also carry walks and seated through-running. |
| 2026-11-09 | Stops without coordinates are bridged; a through-running link counts only if the next trip leaves at or after the arrival | Keeps trips continuous and avoids a seated link that goes back in time. |
| 2026-11-09 | Held-out references fetched as 26 Yahoo result pages, 3 s apart, summary facts only | robots.txt allows `/search/result`. Same settings as M0, checked on 2 repeated M0 pairs. |
| 2026-11-09 | Derived files in `data/` are committed | M2 tests and later work run without the 110 MB fetch. The files hold no raw timetables. They are not pushed. |
| 2026-11-09 | Kana readings deferred to M3 | Not needed for the M1 gate. Mini Tokyo 3D has no kana, and guessing readings is not acceptable. |
| 2026-11-09 | Engine in `web/core/` with no runtime dependencies; validation is hand-written narrowing of `unknown` | The format is small and fixed. No dependency keeps the browser bundle small and the engine portable. |
| 2026-11-09 | Engine input: station id, Japanese or English name, alias, or `{lat, lng}`. A name that matches 2 stations is an error that lists both ids | 霞ケ関 is both a Tokyo Metro station and a Tobu station 40 km apart. Guessing would score the wrong place. |
| 2026-11-09 | Snapped options are chosen per leg: the cheapest start option and the cheapest feasible home option | The two legs are independent in the cost formula, so the per-leg minimum is the brief's "minimum cost over the three". |
| 2026-11-09 | Snapping refuses points more than 2 km from every station | Buses are out of scope. A 26-minute walk is the most the train model can honestly cover. |
| 2026-11-09 | Last train: a home option is feasible if its last departure is at or after the meeting end. Living at the candidate is always feasible | The brief's hard constraint. The person is already at the station when the meeting ends. |
| 2026-11-09 | "Homes ignored" in the acceptance test = `ignoreHome: true` (outbound-only), also checked against "home = start" | The brief leaves the comparison open. The engine exposes `ignoreHome` so a UI can show what outbound-only tools would pick. |
| 2026-11-09 | Sums use the costs in sorted order; the worst person's label is the first in sort order on a tie; the ranking and the Pareto set compare values rounded to 1e-6 minutes | Results are identical for any participant order, and the comparator stays transitive with a fractional lambda (an epsilon comparison is not). |
| 2026-11-09 | Labels must be unique; `ignoreHome` together with a meeting end is an error; a meeting end after 26:59 is an error | A label names a person in every result and reason. The last-train filter needs the home leg. The last departures stop around 25:00, so a later end could only exclude everything. |
| 2026-11-09 | All 3 snap options must be within 2 km; farther ones are dropped | The nearest station may be close while the 2nd and 3rd are 10 km away, and those are not walkable. |
| 2026-11-09 | Scenario files accept only known option names with the right types | A misspelled `meeting_end` used to switch the last-train filter off silently. |
| 2026-11-09 | CLI exit codes: 0 ranked, 1 no station gets everyone home or the spot check fails, 2 bad input or data | Scripts can tell an empty result from an error. A spot check that compares nothing fails. |
| 2026-11-09 | Clock input accepts up to 26:59 and treats 00:00-02:59 as after midnight | Japanese timetables write 25:00 for 01:00. The service day matches the pipeline's. |
| 2026-11-09 | At most 50 participants | The brief targets 2 to 20. The cap guards against runaway input; the engine accepts 1 so the "N copies" test can compare against N = 1. |
| 2026-11-09 | Toolchain pinned to versions at least two weeks old: TypeScript 7.0.2, Vitest 5.0.5, Vite 8.3.4, fast-check 4.10.2, tsx 4.23.15 | Reproducible installs. Vite is listed explicitly because it is Vitest's peer and the M3 build tool. |
| 2026-11-09 | `web/.npmrc` sets `legacy-peer-deps=true` | npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) on Vitest's optional peers. With Vite listed explicitly, nothing that is needed goes missing. |
| 2026-11-09 | CLI paths are relative to where the user ran npm (`INIT_CWD`) | `npm --prefix web run` runs in `web/`, so repo-relative paths failed when tried by hand. |
| 2026-11-09 | M3 builds direction G of the design canvas | The latest direction, map first as the brief asks, and it already folds in E's last-train warning. |
| 2026-11-09 | Basemap: OpenFreeMap dark style (`tiles.openfreemap.org`) | Free, no API key, no registration, no usage limit, commercial use allowed. MapLibre shows the required OpenMapTiles and OpenStreetMap credit. No key ever reaches the browser. |
| 2026-11-09 | Routes are drawn through each railway's stations (new `railways[].stations` in `stations.json`), the short way round a loop | Uses only the approved source. The MLIT N02 track shapes would be truer and can replace this later without a format change for the engine. |
| 2026-11-09 | The app fetches one candidate's route block with an HTTP Range request (about 20 KB), with a whole-file fallback | The route files are 9 MB together; a phone should not load them all. Vite and common static hosts answer Range requests. |
| 2026-11-09 | MapLibre's worker is bundled by Vite (`?worker&url`) and set with `setWorkerUrl` | MapLibre 6 looks for its worker next to its own module, which bundling moves; without this the map has no tiles. |
| 2026-11-09 | The app reads `data/` as Vite's public folder; `?basemap=none` gives a plain background | No copy step, and the E2E tests do not depend on the tile server. |
| 2026-11-09 | Public preview on Cloudflare Pages (`npm --prefix web run deploy`), approved by the owner with the license question ("What I need from you", item 2) still open | The owner wants to try the app on a phone over HTTPS, which location access needs. The owner accepted the license risk for now. Only derived files ship, and the site sends `X-Robots-Tag: noindex, nofollow`. A private site needed Cloudflare Access, which asks for a payment card. |
| 2026-11-09 | Iteration 2 type: BIZ UDPGothic for all text and numbers, with no monospace | It descends from the type of Tokyo station signs, and its numbers read well at small sizes. Monospace capitals were the most generic part of iteration 1. |
| 2026-11-09 | The app follows the phone's light or dark setting: OpenFreeMap Positron by day, Dark at night | Paper and ink reads as print, not as a dashboard template. Both styles are free with no key. |
| 2026-11-09 | Routes use each railway's own color, and a numbered badge tells people apart | Line colors make the map read like a 路線図. Every marker already shows the number, so color does not have to identify a person. |
| 2026-11-09 | The example group is Shizuku (聖蹟桜ヶ丘) and Tora (柴又), and the empty name field hints "Hitori" | Each lives at that station in their story. The engine sends them to 神保町, the book town, within 3 minutes of each other. |
| 2026-11-09 | (Replaced the same day, see the next decision.) The station a meeting end ruled out comes from a second rank without the end | The engine's exclusion reasons are English sentences. Ranking again (under 1 ms) gives the people and last trains, so the note works in both languages. |
| 2026-11-09 | Draw-in animates by calling GeoJSONSource.setData each frame with cut-off legs | MapLibre has no line trim. The routes have a few hundred points, so a frame costs little. |
| 2026-11-09 | Link preview: "Kaname 要 · Where should we meet?", the owner's line "Find the closest station for all your friends in Tokyo" (みんなにとって最適な集合場所を、東京の駅から。), and a 1200×630 image of the example routes meeting at 神保町 | The owner chose the line. The image shows what the app does, with the real routes, in the app's own look. Previews from Slack, X, LINE and Discord use these Open Graph tags. |
| 2026-11-09 | The preview image and icons are rendered from the data by `npm --prefix web run og` and committed | The image changes only when the design does. Rendering at build time would need a browser in the build. |
| 2026-11-09 | `web/static/` holds the site's own files, copied by a small Vite plugin | Vite's public folder is the pipeline's `data/`, and the site files are not data. |
| 2026-11-09 | The owner's call: the app proposes the meeting end, and the last train never changes the place. The meeting end input, the "ruled out" note and the crossed-out marker are gone. The ticket says "Everyone can stay until 23:30, Tora's last train home", and the open row of whoever leaves first is marked | People choose the place first and check their last trains once they are there. This replaces BRIEF.md's optional meeting end input in the UI. The engine keeps its last-train filter for the CLI and the acceptance test. |
| 2026-11-09 | The shareable link holds stations, names and settings in the query string (`?p=shibamata_Tora&p=kanazawa-hakkei.yokohama_Hitori&fair=75&at=tokyo`). Older links' `end` is ignored | The owner asked for names, because a plan goes to the friends whose names are in it. This replaces the brief's "station codes only". A location still never travels: it goes as the station it snapped to. Station ids use only `a-z0-9-`, so the station part needs no escaping. |
| 2026-11-09 | The address bar follows the plan as it changes (`history.replaceState`), and the untouched example keeps a clean address | Copying the address bar shares the plan too, and a reload keeps it. No history entries, so Back leaves the app. |
| 2026-11-09 | "Share plan" opens the phone's share sheet on a touch screen and copies the link elsewhere | The share sheet reaches LINE and other chat apps directly. Desktop share sheets are less useful than the clipboard. |
| 2026-11-09 | A person without a name shows as "Person 1" (1人目), in the viewer's language | The engine needs a label for everyone, and a number reads better than "#1". |
| 2026-11-09 | Every link shows the same preview card | A card per plan ("Meet at 東京") needs a server to write the tags, for example a Cloudflare Pages Function. That can come later. |
| 2026-11-10 | Kana readings come from Wikidata "name in kana" (P1814), matched by name within 1.5 km, in a separate `lookup` step | CC0, no key. Readings are never guessed: 1,393 of 1,419 stations have one, and the rest (練馬, 流山 and 24 more) are found by name. The step changes no travel time, so `stations.json` and its checksums stay as they are. |
| 2026-11-10 | Station search folds katakana to hiragana | A reading typed either way matches, also halfway through an IME conversion. |
| 2026-11-10 | Address search runs on the device over MLIT's town and 丁目 points, not over an online geocoder | GSI's address search is meant for its own map and may change without notice (its maintainers say so in gsi-cyberjapan/gsimaps#29). The MLIT data is free with credit, and a typed address never leaves the phone. |
| 2026-11-10 | An address resolves to its 丁目 | A 丁目 point is within a few hundred meters of any address in it, which is enough to find the nearest stations. Block-level data (街区) would be about 30 times larger. |
| 2026-11-10 | Address ranking: a town that starts with the query and whose city has the same name first (渋谷 finds 渋谷区渋谷), then a town that starts with it, then the rest. A 番地 without 丁目 falls back to its town. ヶ, ケ and が match each other | A review found that 渋谷 ranked every town in 渋谷区 alike, and that a broken download crashed the pipeline. Both are fixed with tests. |
| 2026-11-10 | The address index (about 230 KB compressed) loads on the first Japanese typed into a station field | Most visits never type an address, so they never download it. |
| 2026-11-09 | Wrangler runs through `npx` at a pinned version (4.153.0), not as a dependency | Only a deploy needs it, and it is large. The deploy uses the owner's own Cloudflare account, not a temporary account, because a temporary account expires and accepts Cloudflare's terms for the owner. |
| 2026-11-09 | The Pages project is on classic Pages (created once with `--force`) | Wrangler 4.153 sends new Pages projects to Workers. That setup added a Cloudflare Vite plugin, an unpinned Wrangler and a `wrangler.jsonc`, and needed an account-wide workers.dev name. Classic Pages needs none of these, and later deploys go to it without `--force`. |
| 2026-11-09 | After a host ignores a Range request once, the app keeps the whole route file and cuts later blocks from it | Cloudflare Pages answers Range with 200 and the whole 4.9 MB file. Without this, each station tap downloads both route files again (about 9.6 MB). |
| 2026-11-10 | The GitHub default branch is `develop`, and `main` is deleted. The Cloudflare Pages production branch stays `main` | The owner asked for `develop`. The Pages branch name is separate from git, and `npm run deploy` passes `--branch main`, so deploys still go to production. |
| 2026-11-10 | The owner approved the push of `data/` to the public GitHub repo, with the license question still open | The same derived files are already public on the Cloudflare preview. The repo has no raw timetables. |
| 2026-11-10 | A repeated name in the app gets the person's list number (Aki, Aki (3)). The engine still rejects duplicate labels | Friends often share a first name. The command line and the engine API still need unique labels as keys. |
| 2026-11-10 | The Add person button stops at 50 people, the engine's limit | A 51st person made the engine throw. The brief targets 2 to 20 people, so 50 leaves room. |
| 2026-11-10 | Engine errors carry the participant and the place (start or home), and the app writes the message | The engine's message is English and technical. The app can then name the person and say what to change, in both languages. |
| 2026-11-10 | A PostToolUse hook (`.claude/hooks/log-check.mjs`) asks for a decision or a lesson after each feat, fix, perf or refactor commit that changes code and logs neither | The owner asked for a hook. It runs after the commit, not before, because a command such as `git add . && git commit` stages files that a check before it cannot see. |
| 2026-11-10 | The default slider stays at α = 0.5 (M4) | In the tuning study (`docs/tuning.md`, 1,000 sampled groups), the α = 0.5 winner is 1.8 min above the best average and 1.2 min above the best longest trip. α = 1 adds 8.2 min to the longest trip, and α = 0 adds 5.2 min to the average. |
| 2026-11-10 | Tuning groups start at a random candidate and go home to a random MLIT town point | There is no open table of where Tokyo people work and live. Candidates stand in for after-work places, and town points are densest where most people live. |
| 2026-11-10 | The app shows a general message for an engine error that it does not expect, never the engine's English text | A review found that rare errors put English into the Japanese app. The engine's messages are for the command line. |
| 2026-11-10 | The tuning study draws a person at most 200 times, then stops with an error | A review found that the sampler looped forever when no person could be planned. |
| 2026-11-10 | The transfer penalty λ is 10 minutes, up from 5 (M4, owner's choice) | The tuning study (`docs/tuning.md`) shows that each transfer avoided between λ = 5 and 10 costs about 4 minutes of travel, below published estimates of 8 to 18 minutes. The walk part of a change already differs per station, so λ is the same for every change. |
| 2026-11-10 | The app shows plain trip minutes (train and walk), not the score with the penalty (owner's choice) | People compare the numbers with a journey planner. The penalty only orders the stations, and "What do the numbers mean?" says so. The CLI prints both. |
| 2026-11-10 | No control for the transfer penalty in the app | The owner asked. From λ = 5 to 10, only about 1 winner in 6 changes, so a second slider would add work for little visible effect. A "fewer changes" switch would fit better if testers ask. |
| 2026-11-10 | The ticket and the station list show the group's changes of train next to the plain minutes (owner's choice) | With λ = 10 and plain minutes, a lower-ranked station looked shorter on both numbers for about 1 group in 7. The change count shows why it ranks lower. |
| 2026-11-10 | Each JR platform 25 to 32 m below the street adds 3 minutes to a change, up from 2. The rule covers 東京 (Sobu, Yokosuka and Keiyo), 新橋 (Yokosuka), 新日本橋 and 馬喰町 | An escalator climbs about 15 m a minute (30 m/min on a 30° slope). A deep platform adds about 25 m of climb over a normal one, plus 3 or 4 changes between flights. That is 2.5 to 3 minutes. The value comes from this estimate, not from planner times. 馬喰町 is 27 m below sea level. |
| 2026-11-10 | The deep-platform change is tested on a fresh set of 24 pairs. The pairs (`pipeline/validation/m4_pairs.csv`) were picked and committed with the change, before the planner was asked | The M1 held-out pairs showed the problem, so they cannot also show the fix. 18 pairs are likely to change at a deep platform, and 6 are controls. |
| 2026-11-10 | Map markers get no `position` of their own in theme.css | MapLibre places each marker with `position: absolute`. Our `position: relative` replaced it, so each badge and the seal sat 26 px further right for each person before it. |
| 2026-11-10 | A person's name on the map tries six spots beside the badge: right or left, then one line down or up. If no spot is free, the name hides. The focused person picks first, then the list order | If two starts were close, their names covered each other. A hidden name keeps its badge, and the list and the trip still give the name. |
| 2026-11-10 | The data license question is closed: the owner judged the license okay | The owner's decision, in chat. The data stays pinned to one Mini Tokyo 3D commit. The ODPT terms for JR East and most private railways end on 2027-03-12, so look at the terms again before a data refresh after that date. |
