# DECISIONS

Non-obvious decisions, one line of reasoning each. The M0 gate write-up comes first because it blocks everything else.

---

## M0 gate: data source (2026-11-09) · STATUS: awaiting owner approval

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
3. **Fallback if the answer is no:** a time-boxed ODPT Challenge 2026 entry (applications close 2027-01-11, data until 2027-03-12, you'd need to register), or a negotiated commercial contract (paid, so only on your say-so). Neither is a lasting solution, and the brief's "data license unclear → ask the owner" rule applies to both.

### Consequences for M1 if approved

- **Transfer table:** curated walking minutes for the ~30 largest hubs and the known cross-platform pairs, replacing the uniform rule. Sources must be license-clean (operator station maps checked by hand, or ODPT Basic/CC BY GTFS `transfers.txt` / pathways where they exist). No values copied from planner output. Validate on a held-out pair set.
- **Paid-train exclusion list** (`PAID_TYPES` in `spike/m0/router.py`) becomes reviewed config.
- **Travel-time definition:** "first boarding to arrival" over a representative weekday window. I'd use the median over departures in two windows: outbound 17:30–19:30, home 21:00–23:00. That replaces the planner-style single query.
- **Matrix universe:** a participant's station can be any of ~1,900 network complexes, but candidates are ~227 (complexes within 30 km of Tokyo Station with ≥2 lines). The dense block is candidates×candidates; the input stations need rows *to* candidates and columns *from* candidates (two ~1,900×227 Uint16 blocks, about 0.9 MB each before gzip).
- **Predecessor matrix and coordinates (owner request):** `pred.bin` stores, for each directed pair, the previous boarding/transfer complex on the chosen path, so the route rebuilds recursively. Each leg also records its railway, so the UI can draw it along that line's geometry (MLIT N02 or Mini Tokyo 3D `coordinates.json`) between the two stations. `stations.json` carries per-complex centroid and per-platform coordinates.
- **Kana:** Mini Tokyo 3D has ja/en names only. Kana readings will come from Wikidata (CC0) or ODPT Basic station data, never guessed.

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
