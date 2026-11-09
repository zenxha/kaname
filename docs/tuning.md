# Tuning the slider and the transfer penalty

The engine has two settings that change the ranking. α is the slider position: 1 counts only the average trip, and 0 counts only the longest trip. λ is the number of minutes added for each change of train. This study tests both on realistic groups. Run it again with this command, which takes about 90 seconds:

```bash
npm --prefix web run tune -- --groups 1000 --seed 1
```

## Method

- The study uses 1,000 groups of 2 to 8 people, from a seeded random generator.
- Each person starts at a random meeting candidate. The candidates are stations with at least two lines within 30 km of Tokyo Station, so they stand in for where people are after work.
- Each person goes home to a random town point from `data/addresses.json`. Town points are densest where most people live, so the homes follow the population without a population table.
- If a person has no evening train home, the study draws a new person.
- The study ranks every group for 11 values of α and 6 values of λ. The code is in `cli/tune.ts`.

## The slider (α)

"Extra average" is how many minutes the average trip at the winning station is above the lowest average of any station. "Extra longest" is the same for the longest trip. λ is 10, the default.

| α | Extra average (min) | Extra longest (min) | Same winner as α = 0.5 |
| --- | --- | --- | --- |
| 0 | 6.0 | 0.0 | 70% |
| 0.1 | 5.2 | 0.0 | 74% |
| 0.2 | 4.4 | 0.2 | 79% |
| 0.3 | 3.7 | 0.4 | 85% |
| 0.4 | 2.8 | 0.9 | 92% |
| 0.5 | 2.0 | 1.5 | 100% |
| 0.6 | 1.5 | 2.2 | 93% |
| 0.7 | 1.0 | 3.2 | 86% |
| 0.8 | 0.5 | 4.8 | 77% |
| 0.9 | 0.1 | 6.7 | 68% |
| 1 | 0.0 | 9.4 | 60% |

At α = 0.5, the winner is 2 minutes or less from the best station on both measures. The ends of the slider cost much more on the other measure. At α = 1, the longest trip grows by 9.4 minutes. At α = 0, the average grows by 6.0 minutes. With λ = 5, the numbers are close: 1.8 and 1.2 minutes at α = 0.5.

Result: the default stays at α = 0.5.

## The transfer penalty (λ)

"Minutes" are train and walk minutes for each person, there and back, without the penalty. "Transfers" are changes of train for each person, there and back. α is 0.5.

| λ | Minutes per person | Transfers per person | Same winner as λ = 10 |
| --- | --- | --- | --- |
| 0 | 87.6 | 1.88 | 64% |
| 2.5 | 87.7 | 1.78 | 75% |
| 5 | 87.8 | 1.71 | 83% |
| 7.5 | 88.0 | 1.65 | 93% |
| 10 | 88.2 | 1.61 | 100% |
| 15 | 88.9 | 1.57 | 88% |

From λ = 5 to 10, each transfer that the winner avoids costs about 4 minutes of extra travel. From 10 to 15, each one costs about 17 minutes.

Published studies put the cost of one change of train at more than 4 minutes. A survey study in Edinburgh and Glasgow valued a rail-to-rail transfer at 8 minutes of riding time. The source is Wardman, Hine and Stradling (2001), in [MIT lecture notes][mit]. An international study found a pure transfer penalty of about 18 minutes ([World Transit Research][wtr]). The minutes in Kaname already include the walk and the wait, so λ is the pure penalty.

These numbers support a λ near 10. Up to 10, each transfer avoided costs less than every published estimate. Above 10, the cost reaches the top of the range.

Result: the owner chose λ = 10 on 2026-11-10. Two things changed with it:

- The example group (Shizuku at 聖蹟桜ヶ丘, Tora at 柴又) now meets at 神田 instead of 神保町. The two stations are within half a minute.
- The app shows plain trip minutes, the same minutes that a journey planner shows. The penalty only orders the stations, and "What do the numbers mean?" says so.

A station can then look shorter on both numbers than the winner, because its trips have more changes. In 300 sampled groups, this happens in the top 5 for 14% of groups at λ = 10, and for 7% at λ = 5.

[mit]: https://dspace.mit.edu/bitstream/handle/1721.1/65385/1-258j-spring-2006/contents/lecture-notes/lect23.pdf
[wtr]: https://www.worldtransitresearch.info/research/9198
