# M0 reference times: provenance

- Planner: Yahoo!乗換案内 (transit.yahoo.co.jp), looked up by hand in a browser, one query per pair, 2026-11-09.
- Query: Wednesday 2026-11-11, depart 18:30. Sort: 到着が早い順 (earliest arrival). Walking speed: the planner's `ws=3` setting.
- Excluded modes: 新幹線, 有料特急, 空路, 高速バス, 路線/連絡バス, フェリー (only ordinary trains).
- Recorded: route 1 (earliest arrival). `ref_minutes` = arrival − departure of the first train, as the planner displays it.
- Planner data vintage (per page footer): JR and private-railway timetables "令和8年11月現在" (as of November 2026).
- Only these 20 summary facts (times, transfer counts, line names) are recorded. Nothing else from the planner is stored.
