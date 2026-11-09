# kaname: notes for agents

Tokyo meetup optimizer. Read these before doing anything:

- `BRIEF.md`: the owner's brief. It is the source of truth for scope, milestones and acceptance tests.
- `PLAN.md`: milestones and concrete steps.
- `DECISIONS.md`: the M0 result, the data-source analysis and licenses, and the decision log.

## Status (update this section when it changes)

- **2026-11-09: M0 done.** Gate met: 18/20 pairs within ±5 min, plus 6/6 late-evening checks (commit `d060d81`). The work was done on the owner's Mac, then moved to the desktop.
- **2026-11-09: the owner approved Mini Tokyo 3D as the M1/M2 build source** (in chat, on the desktop). This approval covers local builds and tests only. Clear the license (DECISIONS.md, "What I need from you", item 2) before any public deploy.
- **Session scope set by the owner:** M0, M1 and M2 only (data pipeline, scoring engine and CLI). **Do not build the web UI** (M3+) unless the owner says so.

## Rules

- **Git identity: personal account `zenxha`, never the work account.** After cloning, set:
  `git config --local user.name zenxha` and `git config --local user.email komays5042@gmail.com`.
  Never change the global git config, and never run `gh auth switch`. Remote: `https://zenxha@github.com/zenxha/kaname.git`.
- **Ask the owner first** before any of these: using a paid API or anything that needs a credit card, shipping data whose license is unclear, changing the scope limits, or changing the front-end stack.
- Google Maps is not a data source.
- **Never commit raw third-party timetables.** `bash spike/m0/fetch_mt3d.sh` fetches them into `spike/m0/.cache/` (gitignored) at a pinned commit. Ship only derived data.
- Log each non-obvious decision in `DECISIONS.md`, one line with its reason.
- In M2, write the scoring tests before the engine.
- Commit at the end of each milestone, and name the gate you met in the message. Don't push unless the owner asks.
- Secrets come from environment variables, documented in the README, and never go in the repo.
- The owner asked for the pipeline to also emit a **predecessor matrix and station coordinates**, so routes can be drawn on a map later. The design is in DECISIONS.md under "Consequences for M1".

## Resume on a fresh machine

```bash
git clone https://zenxha@github.com/zenxha/kaname.git && cd kaname
git config --local user.name zenxha && git config --local user.email komays5042@gmail.com
bash spike/m0/fetch_mt3d.sh            # ~110 MB, data/ folder only
python3 -I spike/m0/run_spike.py       # expect 18/20 and 6/6; takes about a minute
```

The spike uses only the Python standard library (3.9 or later). M1 sets up the real `pipeline/` with `uv`.
