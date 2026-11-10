# kaname: notes for agents

Tokyo meetup optimizer. Read these before doing anything:

- `BRIEF.md`: the owner's brief. It is the source of truth for scope, milestones and acceptance tests.
- `PLAN.md`: milestones and concrete steps.
- `DECISIONS.md`: the M0 result, the data-source analysis and licenses, and the decision log.
- `docs/internal.md`: the owner's notes on history, approvals, deploys and git.

## Status (update this section when it changes)

- **2026-11-09: M0 done.** Gate met: 18/20 pairs within ±5 min, plus 6/6 late-evening checks (commit `d060d81`). The work was done on the owner's Mac, then moved to the desktop.
- **2026-11-09: the owner approved Mini Tokyo 3D as the M1/M2 build source** (in chat, on the desktop). This approval covers local builds and tests only. Clear the license (DECISIONS.md, "What I need from you", item 2) before any public deploy.
- **2026-11-09: M1 done.** Gate met (`kaname-pipeline check` passes): 207 candidates, no unreachable candidate pairs, all routes rebuild. Held-out router accuracy 24/26 within ±5 min.
- **2026-11-09: M2 done.** Gate met: every BRIEF.md acceptance test passes (`npm --prefix web test`). The session scope (M0-M2) is complete. M3 (web UI) needs the owner's go-ahead.
- **2026-11-09: M3 started by the owner** ("M3 first design iteration go"). Iteration 1 builds direction G of the design canvas "Kaname — Tokyo Meetup Optimizer" (https://claude.ai/artifact/24WXup9np7ZxduTBmR2H1T). The E2E gate test passes on a phone viewport. Next: the owner's feedback on the design.
- **2026-11-09: M3 iteration 2 built.** It is the journey redesign the owner approved (DECISIONS.md, "Iteration 2"). The E2E gate passes on phone and desktop. Next: the owner's feedback.
- **2026-11-09: the owner approved a public preview on Cloudflare Pages** with the license question still open (noindex, derived files only). Live at https://kaname-1l6.pages.dev/. Deploy with `npm --prefix web run deploy` from the owner's own Cloudflare account (`docs/internal.md`, "Cloudflare Pages"). Any wider launch still needs the license cleared.
- **2026-11-09 to 11-10: after iteration 2, all built, tested, committed and deployed.** The owner asked for each of these:
  - Trips show as line pills in a closed row and a compact rail in an open row.
  - A link preview, with the owner's line "Find the closest station for all your friends in Tokyo", and icons (`npm --prefix web run og`).
  - A shareable plan link with stations and names, never locations or typed addresses.
  - The owner's rule that the last train never changes the place. The meeting-end input is gone, and the ticket proposes the end ("Everyone can stay until 23:30, Tora's last train home").
  - Kana search (Wikidata) and on-device address search (MLIT 位置参照情報), built by `kaname-pipeline fetch-lookup` and `lookup`.
  - `LESSONS.md`, the lessons learned for the owner's interviews.
- **2026-11-10: pushed to GitHub on the owner's request.** The default branch is now `develop`, and `main` is gone. The repo is public, so `data/` is public too.
- **2026-11-10: bug fixes and M4 started.** Repeated names, the 50-person limit and engine errors in both languages are fixed and deployed. A project hook (`.claude/settings.json`, `.claude/hooks/log-check.mjs`) asks for a DECISIONS.md or LESSONS.md entry after each code commit. The tuning study keeps α = 0.5.
- **2026-11-10: M4 done.** Gate met: the README has a limits section and a demo scenario. The owner chose λ = 10, plain trip minutes on screen, and a count of changes next to them (`docs/tuning.md`). The example group now meets at 神田.
- **2026-11-10: after M4, two fixes.** Deep JR platforms add 3 minutes to a change (24/24 fresh pairs within ±5 min, up from 22/24; `pipeline/validation/m4_reference.csv`). Map markers had `position: relative`, which moved each badge and the seal 26 px right per earlier person. They now sit on their stations, and names pick a free spot or hide.
- **2026-11-10: the owner closed the data license question** and judged the license okay. The site still sends `noindex`. Removing it is a launch step for the owner to decide. Look at the ODPT terms again before a data refresh after 2027-03-12.
- **2026-11-10: routes follow the real tracks** (MLIT N02, `data/shapes.json`, built by `kaname-pipeline fetch-shapes` and `shapes`). 1,769 of 1,770 station pairs follow the track.
- **2026-11-10: usability pass.** A first visit loads about 1.6 MB instead of 12.2 MB (packed files, `web/scripts/pack.ts`). A "Start your own plan" button clears the example. The ticket's comparison names differences in changes of train. A loading screen replaces the blank page on slow connections.
- **2026-11-10: editor and type, on the owner's request.** A compact person editor with icon buttons (pencil, check, bin, location). The station-sign face only marks the answer, and the rest uses the device's UI font. A tap outside the editor, Done or Escape closes it.
- **2026-11-10: the hardest trip replaces the longest trip** on the ticket and in the list, with its changes. With the group's average and changes, these are the four numbers the order depends on, so a lower station never looks better on all of them (`docs/tuning.md`).
- **Open items:** the top 10 instead of 5 and a view of the tradeoff; weekday evenings only; no per-ride minutes; deep JR changes still about 1 min short on average; one link preview for every plan; 26 stations without kana.

## Rules

- **Git identity: personal account `zenxha`, never the work account.** After cloning, set:
  `git config --local user.name zenxha` and `git config --local user.email komays5042@gmail.com`.
  Never change the global git config, and never run `gh auth switch`. Remote: `https://zenxha@github.com/zenxha/kaname.git`.
- **Ask the owner first** before any of these: using a paid API or anything that needs a credit card, shipping data whose license is unclear, changing the scope limits, or changing the front-end stack.
- Google Maps is not a data source.
- **Never commit raw third-party timetables.** `bash spike/m0/fetch_mt3d.sh` fetches them into `spike/m0/.cache/` (gitignored) at a pinned commit. Ship only derived data.
- Log each non-obvious decision in `DECISIONS.md`, one line with its reason.
- When a bug, a failed test or a review finding teaches something, add a story to `LESSONS.md` in its format (what happened, what we did, lesson, where to look). The owner uses it to learn and to tell the stories in interviews.
- In M2, write the scoring tests before the engine.
- Commit at the end of each milestone, and name the gate you met in the message. Don't push unless the owner asks. Work on `develop`, the default branch.
- Secrets come from environment variables, documented in the README or `docs/internal.md`, and never go in the repo.
- `README.md` is for outside developers. Keep milestone names (M0 to M4), approvals and owner-only operations out of it, and put them in `docs/internal.md`.
- The owner asked for the pipeline to also emit a **predecessor matrix and station coordinates**, so routes can be drawn on a map later. The design is in DECISIONS.md under "Consequences for M1".

## Resume on a fresh machine

```bash
git clone https://zenxha@github.com/zenxha/kaname.git && cd kaname
git config --local user.name zenxha && git config --local user.email komays5042@gmail.com
bash pipeline/fetch_mt3d.sh            # ~110 MB, data/ folder only, into .cache/mt3d
cd pipeline && uv run kaname-pipeline build && uv run kaname-pipeline check   # ~30 s
uv run pytest --cov                    # pipeline tests
uv run kaname-pipeline validate        # router vs reference journey times
uv run kaname-pipeline fetch-lookup && uv run kaname-pipeline lookup   # kana.json and addresses.json
cd .. && npm --prefix web install && npm --prefix web test   # engine and acceptance tests
npm --prefix web run cli -- --person "Aki:町田" --person "Ben:大宮>船橋" --end 23:30
```

The M0 spike (`spike/m0/`, standard library only) still runs with `bash spike/m0/fetch_mt3d.sh && python3 -I spike/m0/run_spike.py`.
