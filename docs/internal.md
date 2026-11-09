# Internal notes

These notes are for the owner. They keep the project history, the approvals and the operations that the public README leaves out. The repo is public, so do not put secrets or private data here.

## Where things are

| File | Contents |
| --- | --- |
| `BRIEF.md` | The original brief: scope, milestones and acceptance tests |
| `PLAN.md` | The milestones and their steps |
| `DECISIONS.md` | Each decision with its reason, plus the M0 result and the data source analysis |
| `LESSONS.md` | Lessons learned, written as stories for interviews |
| `CLAUDE.md` | Notes for the coding agent. Its "Status" section is the current state and the open items |
| `data/LICENSES.md` | The terms and credits for each data source |

## History

| Milestone | Result |
| --- | --- |
| M0, feasibility spike (`spike/m0/`) | 18 of 20 station pairs within 5 minutes of Yahoo!乗換案内. Commit `d060d81` |
| M1, data pipeline | 207 candidates. 24 of 26 held-out pairs within 5 minutes |
| M2, scoring engine and command line | Every acceptance test in `BRIEF.md` passes |
| M3, web app | Iteration 1, then the iteration 2 redesign. After that: trip pills, link preview, plan links, the proposed meeting end, and kana and address search |

M4 is next: tune the transfer penalty and the default slider position, and add a demo to the README.

## Open decision: the data license

The timetables come from Mini Tokyo 3D, which is MIT licensed. Its README says that the data comes from ODPT, which has its own terms. The ODPT license for JR East and most private railways ends on 2027-03-12. You approved the public preview and the public repo with this question still open. Clear it before any wider launch. `DECISIONS.md`, "What I need from you", has the options.

## Accuracy gates

These commands guard the travel times. Run them after a change to the pipeline or to `pipeline/config/`.

```bash
cd pipeline
uv run kaname-pipeline check      # the M1 gate: shapes, checksums, unreachable candidate pairs, route rebuilds
uv run kaname-pipeline validate   # held-out reference times, plus 40 random stored values calculated again
cd .. && npm --prefix web run cli -- spotcheck --refs pipeline/validation/heldout_reference.csv
```

`validate` fails in two cases: fewer than 90% of the pairs are within 5 minutes, or a stored value differs from a fresh calculation. The reference times in `pipeline/validation/` come from Yahoo!乗換案内. They are summary facts for validation only, never a data source.

To run the M0 spike again, use `bash spike/m0/fetch_mt3d.sh && python3 -I spike/m0/run_spike.py`.

## Release

1. Run the unit tests, the type check and the end-to-end tests (README, "Tests").
2. If the design changed, render the preview image and icons again with `npm --prefix web run og`.
3. Deploy with `npm --prefix web run deploy`.
4. Update the "Status" section in `CLAUDE.md`.
5. Push to `develop` (see "Git").

## Cloudflare Pages

The site is https://kaname-1l6.pages.dev/, on your own Cloudflare account. It sends `X-Robots-Tag: noindex, nofollow` from `web/static/_headers`, so search engines do not list it.

The project is on classic Pages. Wrangler 4.153 sends new projects to Workers and adds files to the repo. The `--force` flag prevents that. You did these steps one time only:

```bash
npx wrangler@4.153.0 login
npx wrangler@4.153.0 pages project create kaname --production-branch main --force
```

The Pages production branch is `main`, but the git branch is `develop`. These names are separate. The deploy script passes `--branch main`, so each deploy goes to production.

If the machine has no browser for the login, set these environment variables instead:

- `CLOUDFLARE_API_TOKEN`: an API token with the "Cloudflare Pages: Edit" permission.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Cloudflare dashboard.

## Git

- Use the personal account `zenxha` (komays5042@gmail.com) in this repo. Set it with `git config --local`, never globally.
- The default branch is `develop`. The old `main` branch was deleted on 2026-11-10.
- Git uses the GitHub CLI login to push. Run `gh auth setup-git` one time on each machine.
- Commit messages use `<type>: <description>`, with no attribution lines.
- Never commit raw third-party timetables. `.cache/` holds them and git ignores it.
