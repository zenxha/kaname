# Data licenses

The files in this folder are derived data. The pipeline in `pipeline/` builds them. They contain no raw timetables.

## Mini Tokyo 3D timetables (source of all times and routes)

- Source: [nagix/mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d), folder `data/`, at the commit in `meta.json` (`source.commit`).
- Repository license: MIT, "Copyright (c) 2019-2026 Akihiko Kusanagi".
- Used for: train timetables (weekday), station names in Japanese and English, station coordinates, railway names and colors, and station transfer groups.
- What ships here: median travel minutes, transfer counts, last departure times, routes as sequences of railways and stations, and station names and coordinates. A timetable cannot be rebuilt from these files.
- Open question: the Mini Tokyo 3D README says that its data comes from the Public Transportation Open Data Center (ODPT). Parts of the ODPT data have their own terms. DECISIONS.md, "What I need from you", describes the question.
- Status: the owner approved this source for local builds and tests on 2026-11-09. On the same day, the owner approved a public preview on Cloudflare Pages (not listed by search engines) with the license question still open. You must clear the license question before a public launch.

## MLIT 国土数値情報 鉄道データ (N02, 2025 edition)

- Source: [国土数値情報ダウンロードサイト](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html), file `N02-25_GML.zip`.
- License: CC BY 4.0.
- Used for: 18 platform positions at 東京 and 武蔵小杉 in `pipeline/config/stop_positions.csv`. These positions set transfer walking times. They do not ship as separate data.
- Attribution: 出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）「国土数値情報（鉄道データ）」を加工して作成

## Not a data source

- Yahoo!乗換案内 gave reference times for validation only. The repo keeps 52 summary facts (times, transfer counts, line names) in `spike/m0/` and `pipeline/validation/`. None of them are in this folder.
- Google Maps is not used.

## Accuracy

The times are estimates from a published weekday timetable and a simple transfer model. They do not include delays, timetable changes after the source commit, or station walking beyond a train change. Do not rely on them for a last train. Check an official source.
