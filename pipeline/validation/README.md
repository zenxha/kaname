# Reference journey times

`heldout_reference.csv` holds the M1 held-out set. M1 changed the transfer model, so its
accuracy is measured on these pairs, which played no part in choosing the model. The
transfer tables were committed (f931bc5) before these pairs were compared with the router.

- Planner: Yahoo!乗換案内 (transit.yahoo.co.jp), one result page per pair, fetched on
  2026-11-09, 3 seconds apart. robots.txt allows `/search/result`.
- Query: Wednesday 2026-11-11, depart at `query_time`, sort 到着が早い順 (earliest arrival),
  walking speed `ws=3`. 新幹線, 有料特急, 空路, 高速バス, 路線/連絡バス and フェリー off.
  These are the M0 settings: rows `c20` and `c11` repeat M0 pairs 20 and 11 and match the M0
  values exactly.
- Recorded: route 1 only. `ref_minutes` = arrival − departure of the first train, as the
  planner shows it. Only these summary facts are kept. The pages themselves are not stored.
- `ref_route` comes from a simple text parse and can miss a line name. It is informative only.

Run the comparison with `uv run kaname-pipeline validate` (from `pipeline/`).
The M0 sets stay in `spike/m0/`.
