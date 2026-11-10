# Lessons learned

Kaname went from an empty repo to a live app in two days (2026-11-09 and 2026-11-10). This file keeps the problems we hit and what they taught, so they can be told as stories. Each lesson names the commit or the DECISIONS.md section that holds the details.

Each story has the same parts:

- What happened: the situation and the surprise.
- What we did: the action, with the numbers.
- Lesson: the rule to keep, in one or two sentences.
- Where to look: commits and sections, for the details.

The owner set the goals, the gates and the product calls. Claude Code wrote most of the code and found most of the bugs. The stories say who did what, because an interviewer will ask.

## Data and validation

### 1. Test the riskiest assumption first, with a gate that can fail

- What happened: the whole product depends on train times that match what people see in a journey planner. Nobody knew whether a free timetable source was good enough.
- What we did: before any app code, a one-day spike (M0) routed 20 station pairs and compared them with Yahoo!乗換案内. The pass mark was fixed in advance: at least 18 of 20 within ±5 minutes. The result was 18 of 20, 10 exact, mean error 2.25 minutes.
- Lesson: spend the first day on the thing that can kill the project. Write the pass mark down before you look at the results.
- Where to look: commit `d060d81`, DECISIONS.md "M0 gate".

### 2. Fix the model before you see the test answers

- What happened: after M0, the transfer model needed better walking times. Tuning it on the same 20 pairs makes the numbers look better, but the model stays the same.
- What we did: the new transfer tables were committed (`f931bc5`) before the router saw a fresh set of 26 held-out pairs. The tables were not changed after. On the fresh set, 24 of 26 were within ±5 minutes, with a mean error of 1.31 minutes.
- Lesson: keep a held-out set, and let the commit order prove that you did not fit to it.
- Where to look: DECISIONS.md "M1 gate", "Held-out validation".

### 3. Group the misses by cause, and the cause tells you the fix

- What happened: the misses in M0 looked random: −6 here, −10 there.
- What we did: we read each miss against the journey the planner chose. Every big miss was a train change at a hub with deep platforms. The source data gives all JR lines at a station one shared point. The router therefore saw a 0 m walk where people walk 10 to 15 minutes. We added 18 real platform positions from MLIT's N02 railway data at 東京 and 武蔵小杉.
- Lesson: an average error hides the story. A table of misses with a cause column shows it.
- Where to look: DECISIONS.md "Why the misses happen".

### 4. A shortcut that looks equivalent can loop

- What happened: the plan was to store a predecessor matrix and rebuild each route by following it back, a standard trick for shortest paths.
- What we did: the rebuild looped for 12% of station pairs. Each pair stores its own median journey over a two-hour window. The rest of one route is therefore not the route stored for the next station. Shortest-path tricks assume that it is. We stored each route exactly instead, as a compact block per candidate.
- Lesson: a classic algorithm trick depends on a property, here optimal substructure. Medians and other aggregates break it, so test the property on real data.
- Where to look: DECISIONS.md "M1 gate", the summary at the top.

### 5. "Unreachable" is a policy decision, not a fact

- What happened: about 10,000 trips home were marked unreachable, although a train still ran. The 21:00 to 23:00 window had trains only at its start, and the median of "no train" won.
- What we did: the median now uses only the minutes that still have a train. The last-train time decides whether someone can get home. Unreachable trips home dropped from 16,683 to 6,458.
- Lesson: a sentinel value such as 65535 hides a decision. Write down what it means, and test the edge where the decision flips.
- Where to look: commit `054d123`.

### 6. A license is a product risk, so find it early and let the owner decide

- What happened: the best timetable source is MIT licensed, but its README says the data comes from ODPT. The ODPT license for JR East and most private railways ends on 2027-03-12.
- What we did: we wrote the question down with options and a recommendation. The owner approved local builds first, then a public preview with the risk accepted. The repo ships only derived minutes and routes, never raw timetables.
- Lesson: read the data terms before you build on the data. Give the decision maker options, a recommendation and the cost of each.
- Where to look: DECISIONS.md "What I need from you", data/LICENSES.md.

## Testing

### 7. A check that cannot fail is not a check

- What happened: the M1 review found that the router validation always passed. The M2 review found that the spot check passed with zero pairs compared.
- What we did: the validation now fails in two cases: fewer than 90% of pairs within ±5 minutes, or a stored value that differs from a fresh calculation (40 random samples). A spot check with zero pairs fails too.
- Lesson: break your own check on purpose once, and make sure that it goes red.
- Where to look: commits `d58f71f` and `2357b1a`.

### 8. Write the tests first, and change a test only when the test is wrong

- What happened: the scoring engine tests were written before the engine (`01b0bfe`). Two of them failed against the finished engine.
- What we did: we read both. One expected 25:00 to be invalid, but timetables write 01:00 the next morning as 25:00. The other did not know that a second person also misses a last train in the real data. We fixed those two tests and wrote down why. Every other failure was an engine bug.
- Lesson: a failing test is a question. Answer it before you change code or test.
- Where to look: DECISIONS.md "M2 gate".

### 9. A flaky test is usually a race in the test

- What happened: one end-to-end test failed about four times in six, with a timeout.
- What we did: we repeated it with `--repeat-each 6` and read the page snapshot that Playwright saved. The sheet was back at its smallest height. The test helper clicked the handle again before React had applied the previous click, so a third click closed the sheet. The fix waits for each height before the next click.
- Lesson: reproduce a flaky test by repeating it, then read the state at the failure. Wait for state, never for time.
- Where to look: `web/e2e/plan.spec.ts`, `openSheet`.

### 10. A warm cache can hide a bug from a passing test

- What happened: address search showed nothing the first time someone typed an address. The end-to-end test passed anyway.
- What we did: the loading hook set its state to "loading". That change re-ran its effect, and the cleanup threw the result away. The test passed because an earlier step had already loaded the file. We first wrote a test for a fresh page, saw it fail, then fixed the hook.
- Lesson: test the cold start on purpose. When a bug hides from a green test, write the red test before the fix.
- Where to look: commit `4678282`, `web/src/data/addresses.ts`.

### 11. Two things with the same name collide later

- What happened: the map markers and the list rows both used `data-person`. Keyboard focus went to the map after an edit, and tests clicked the wrong element. Later the line pills and the "Example group" tag both used the class `pill`.
- What we did: the tests failed with "resolved to 2 elements", which pointed at both collisions. Each name now has one meaning.
- Lesson: give test hooks and class names one meaning each. Strict locators turn a silent collision into a loud failure.

## The web platform

### 12. Test the real host, because it can ignore what your code assumes

- What happened: the app loads one station's routes with an HTTP Range request, about 20 KB. Cloudflare Pages answered every Range request with the whole 4.9 MB file.
- What we did: `curl` against the live site showed the 200 answer. The app now keeps a whole file after the first full answer, so each station tap no longer downloads 9.6 MB again.
- Lesson: a fallback that works can still cost a lot. Measure on the real host, not only on the dev server.
- Where to look: commit `bbecb57`.

### 13. Read what a tool changed before you trust it

- What happened: `wrangler pages project create` quietly sent the new project to Cloudflare Workers. It also added a Vite plugin and an unpinned dependency, and rewrote two scripts.
- What we did: `git status` and `git diff` showed every change. We reverted all of them, used the tool's documented `--force` flag, and kept Wrangler pinned to one version.
- Lesson: after any tool that writes files, read the diff. Pin the versions of tools that run in your deploy.
- Where to look: DECISIONS.md, the "classic Pages" row.

### 14. Async work outlives the component that started it

- What happened: a review found a race. A theme change during the route animation writes to a map that no longer exists.
- What we did: the `remove` event of the map now stops the animation. A re-run continues from the same start time, so the lines do not start over.
- Lesson: every timer, frame callback and fetch needs an owner and a way to stop.
- Where to look: commit `c674312`.

### 15. Japanese input and small screens have their own bugs

- What happened: the reviews found that Enter, pressed to accept a Japanese IME conversion, also picked a station. Markers showed a person only by color, and tap targets were 26 px.
- What we did: the field ignores Enter during composition (`isComposing`). Every marker shows the person's number, and every tap target is at least 44 px.
- Lesson: test with the input method and the device of the real users.
- Where to look: commit `d1e6464`.

## Product and design

### 16. Model the real order of decisions

- What happened: the brief asked for a meeting end time that removes stations where someone misses the last train. The owner pointed out that groups never pick a place by last train. They pick the place, then check last trains once they are there.
- What we did: we removed the input. The app now proposes the end instead: "Everyone can stay until 23:30, Tora's last train home."
- Lesson: a correct feature can still sit in the wrong place in the user's story. Ask when, in real life, the user thinks about it.
- Where to look: commit `86ccd50`.

### 17. Decide on purpose what personal data travels, and where

- What happened: a shared link first carried stations only, as the brief said. The owner wanted names too, because a plan goes to the friends who are in it.
- What we did: names now travel in the link. A GPS location or a typed address never does, only the station it snapped to. Address search runs on the phone, so the address is never sent anywhere.
- Lesson: sort data by where it goes (device, link, server), and record each decision with its reason.
- Where to look: commits `5ccc024` and `64db5a7`.

### 18. Read the issue tracker before you depend on a free API

- What happened: the Japanese government map site has an address search that answers any web page. It looked perfect.
- What we did: an issue on its GitHub repo showed the maintainers' answer. The search is meant for their own map and can change without notice. We shipped MLIT's address data instead (20,899 town points, 230 KB compressed) and search it on the device.
- Lesson: "it works" is not "it is offered". Look for the owner's own words on reuse.
- Where to look: DECISIONS.md, the address search rows, and gsi-cyberjapan/gsimaps issue 29.

### 19. Ground the design in the subject, not in the default look

- What happened: the first design used uppercase monospace labels on navy with an amber accent. The owner disliked the font and said that every vibe-coded project looks the same.
- What we did: we compared typefaces side by side and picked BIZ UDPGothic, from the same family as Tokyo station signs. Routes take each railway's own color, the answer is a ticket, and the meeting point is a red 要 seal.
- Lesson: take colors, type and shapes from the subject's own world, here train tickets and station signs.
- Where to look: DECISIONS.md "Iteration 2".

### 20. A strict core needs a plan at the edge

- What happened: the engine rejects two people with the same label, which is right for the command line. The app passed each friend's name straight in. Two friends called Aki made the whole result disappear behind an English error. A search for more cases found 13 stations with no train home in the evening, with the same kind of message.
- What we did: we listed each error that the engine can raise and asked how an app user can meet it. A repeated name now gets the person's number (Aki, Aki (3)), so it never reaches the engine. The Add button stops at the limit of 50. The other errors name the person and say what to change, in English or Japanese.
- Lesson: when a core rejects input, decide for each rejection what the user sees. Real names repeat, so test with the inputs that real groups have.
- Where to look: commit `fb1aee5`, `web/src/model/problem.ts`.

### 21. Zoom in on the screenshot before you fix the symptom

- What happened: the owner's phone screenshot showed two names on the map on top of each other. A close crop during the fix showed more: two people at the same station had badges 26 px apart. A CSS rule gave each marker `position: relative`, which replaced the map library's `position: absolute`. The markers then flowed in a row, so each badge, and the 要 seal, sat 26 px further right for each person before it. The bug was live from the first web iteration. Every test checked the text and the count of markers, and none checked a position.
- What we did: an end-to-end test now puts two people at one station and checks that their badges and the seal share one point. It failed, and removing two declarations fixed it. Each name now picks a free spot beside its badge, or one line up or down. If no spot is free, the name hides. A unit test checks 200 random crowds for overlaps.
- Lesson: a visual bug can hide a bigger one, so look closely at the picture first. For a map, test where things are, not only that they are there.
- Where to look: `web/src/map/labels.ts`, the two map tests at the end of `web/e2e/plan.spec.ts`.

### 22. A test that checks what the code adds itself proves nothing

- What happened: routes were to follow the real tracks. A test said that a drawn ride "starts and ends at the platforms", and it passed. A separate reviewer measured the gap between each track shape and its station: the median was 276 m. The search let a line join the track anywhere within 300 m of a station, with a straight link. On each curve, the straight link was cheaper. The test passed only because the drawing code adds the two platform points itself.
- What we did: a straight link now counts 5 times its length, so the line joins the track close to each station. The median gap is now 39 m. New tests check the gap on the real data and a curve on test data, which failed first.
- Lesson: break the feature on purpose and run each test. Measure the output itself, not a value that the code puts in on its own.
- Where to look: `pipeline/src/kaname_pipeline/shapes.py` (`_search`), `web/tests/app/shapes.test.ts`.

### 23. A fix for the repeat can leave the first visit slow

- What happened: lesson 12 stopped the app from downloading the route files again for each station. A usability pass later measured a first visit on a phone profile: 12.2 MB. The two route files still came whole, and the host sent every binary file uncompressed.
- What we did: the build now writes a gzip copy of each matrix and one small gzip file per station's routes, about 5 KB each. The app uses them, and falls back to the old files on a host without them. A first visit dropped to about 1.6 MB. A review then found that one failed request turned the packed files off for the rest of the visit. Now only a 404 or an HTML page does that.
- Lesson: after a fix, measure the whole user path again, not only the case that showed the bug.
- Where to look: `web/scripts/pack.ts`, `web/src/data/packed.ts`, the last e2e tests in `web/e2e/plan.spec.ts`.

### 24. The way out has to work on the device people hold

- What happened: the owner asked how to leave the person editor. The fix added a "Done" button and the Escape key. The owner answered that Escape is not intuitive. A phone has no Escape key. In phone apps, a tap beside a panel closes it.
- What we did: a tap outside the editor now closes it, and the tap still does what it hit. A drag, such as a map pan, does not count. A version of the code that ignored where the press started still passed the test. Chromium sends no click after the pressed element disappears. The check stays for browsers that send that click. The test now picks a station low in the list, over the rows below.
- Lesson: answer a usability question with the gesture that the platform already teaches. A keyboard shortcut is an extra, not the answer.
- Where to look: `web/src/useOutsideTap.ts`, the editor tests near the end of `web/e2e/plan.spec.ts`.

## Working with an AI agent

### 25. A separate reviewer finds what the author cannot

- What happened: each milestone ended with a code review by a separate agent that saw the code but not the author's reasoning.
- What we did: every review found real defects, for example a check that never failed, a map race, an address ranking error and a retry loop with no limit. Each fix came with a regression test.
- Lesson: keep the author and the reviewer apart. Give the reviewer the code, not the conclusion.
- Where to look: the commits named "fix: address the ... review".

### 26. Decisions written down make the story possible

- What happened: two days produced about 70 logged decisions, each with a reason.
- What we did: every non-obvious decision got one line in DECISIONS.md, and every commit says what changed and why. This file was written from that record.
- Lesson: the decision log is the cheapest documentation there is. Write the reason while you still know it.

### 27. The agent makes mistakes too, so check its work

- What happened: some bugs came from the agent itself. A `pkill -f` pattern killed its own shell, so a commit did not happen. A page script named a variable `top`, which clashes with the browser's `window.top`. A Python class shadowed the built-in `LookupError`.
- What we did: each one surfaced because a command, a test or a reviewer checked the result instead of trusting the claim.
- Lesson: treat generated code like any other code. Run it, test it and read the diff.

## Telling these stories

Pick three that fit the role. Lessons 1, 2 and 4 suit a data or backend interview. Lessons 9, 12 and 16 suit a frontend or product one. For each, give the situation in one sentence and a number for the result. End with the rule you now follow.

Numbers worth remembering:

- 18 of 20 pairs within ±5 minutes on the M0 gate, then 24 of 26 on held-out pairs.
- 12% of routes looped with a predecessor matrix.
- 10,000 trips home wrongly marked unreachable, then fixed.
- 9.6 MB downloaded per station tap before the Range fix, and 12.2 MB for a first visit until the packed files cut it to about 1.6 MB.
- 1,393 of 1,419 stations with a kana reading. 20,899 address points.
- Over 60 commits, about 220 web unit tests, about 130 pipeline tests, and 39 end-to-end runs across phone and desktop.
