# Data licenses

The files in this folder are derived data. The pipeline in `pipeline/` builds them. They contain no raw timetables.

## Mini Tokyo 3D timetables (source of all times and routes)

- Source: [nagix/mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d), folder `data/`, at the commit in `meta.json` (`source.commit`).
- Repository license: MIT, "Copyright (c) 2019-2026 Akihiko Kusanagi".
- Used for: train timetables (weekday), station names in Japanese and English, station coordinates, railway names and colors, and station transfer groups.
- What ships here: median travel minutes, transfer counts, last departure times, routes as sequences of railways and stations, and station names and coordinates. A timetable cannot be rebuilt from these files.
- Upstream data: the Mini Tokyo 3D README says that its data comes from the Public Transportation Open Data Center (ODPT). Parts of the ODPT data have their own terms. DECISIONS.md, "What I need from you", describes the question.
- Status: the owner approved this source for local builds and tests on 2026-11-09, and for a public preview on the same day. On 2026-11-10, the owner closed the license question and judged the license okay. The data stays pinned to one commit. Look at the terms again before a data refresh after 2027-03-12.

## MLIT 国土数値情報 鉄道データ (N02, 2025 edition)

- Source: [国土数値情報ダウンロードサイト](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html), file `N02-25_GML.zip`.
- License: CC BY 4.0.
- Used for: platform positions at 東京, 武蔵小杉, 新橋, 新日本橋 and 馬喰町 in `pipeline/config/stop_positions.csv`, which set transfer walking times. Also the track shapes in `shapes.json`: the railway sections (`N02-25_RailroadSection`), simplified, between neighboring stations.
- Attribution: 出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）「国土数値情報（鉄道データ）」を加工して作成

## Wikidata kana readings (station search)

- Source: Wikidata, property "name in kana" (P1814) of railway stations around Tokyo. `pipeline/src/kaname_pipeline/lookup.py` holds the query, and `kana.json` records it with the fetch date.
- License: CC0 1.0. No attribution is required. The app credits Wikidata anyway.
- Used for: `kana.json`, the readings that let station search find しばまた or シバマタ. 1,393 of 1,419 stations have a reading. A station without one is still found by its name.

## MLIT 大字・町丁目レベル位置参照情報 (address search)

- Source: [位置参照情報ダウンロードサービス](https://nlftp.mlit.go.jp/isj/), version 18.0b (2024 data), files `08000-18.0b.zip`, `11000-18.0b.zip`, `12000-18.0b.zip`, `13000-18.0b.zip` and `14000-18.0b.zip`.
- License: the 位置参照情報利用約款. Use is free. A copy or an edited product must name the source, and should give the year, the file names and who edited it.
- Used for: `addresses.json`, one point for each town or 丁目 within 62 km of Tokyo Station (20,899 points). The app searches it on the device.
- Credit: 「大字・町丁目レベル位置参照情報 国土交通省」（18.0b、2024年、上記ファイル、加工: kaname）. The app shows the credit in its footer.

## Not a data source

- Yahoo!乗換案内 gave reference times for validation only. The repo keeps 52 summary facts (times, transfer counts, line names) in `spike/m0/` and `pipeline/validation/`. None of them are in this folder.
- Google Maps is not used.

## Accuracy

The times are estimates from a published weekday timetable and a simple transfer model. They do not include delays, timetable changes after the source commit, or station walking beyond a train change. Do not rely on them for a last train. Check an official source.
