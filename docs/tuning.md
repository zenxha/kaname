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

"Extra average" is how many minutes the average trip at the winning station is above the lowest average of any station. "Extra longest" is the same for the longest trip. λ is 5.

| α | Extra average (min) | Extra longest (min) | Same winner as α = 0.5 |
| --- | --- | --- | --- |
| 0 | 5.2 | 0.0 | 70% |
| 0.1 | 4.5 | 0.0 | 75% |
| 0.2 | 3.7 | 0.2 | 81% |
| 0.3 | 3.1 | 0.4 | 86% |
| 0.4 | 2.4 | 0.8 | 93% |
| 0.5 | 1.8 | 1.2 | 100% |
| 0.6 | 1.4 | 1.8 | 93% |
| 0.7 | 0.8 | 2.8 | 84% |
| 0.8 | 0.4 | 4.0 | 75% |
| 0.9 | 0.1 | 5.6 | 67% |
| 1 | 0.0 | 8.2 | 57% |

At α = 0.5, the winner is less than 2 minutes from the best station on both measures. The ends of the slider cost much more on the other measure. At α = 1, the longest trip grows by 8.2 minutes. At α = 0, the average grows by 5.2 minutes.

Result: the default stays at α = 0.5.

## The transfer penalty (λ)

"Minutes" are train and walk minutes for each person, there and back, without the penalty. "Transfers" are changes of train for each person, there and back. α is 0.5.

| λ | Minutes per person | Transfers per person | Same winner as λ = 5 |
| --- | --- | --- | --- |
| 0 | 87.6 | 1.88 | 75% |
| 2.5 | 87.7 | 1.78 | 89% |
| 5 | 87.8 | 1.71 | 100% |
| 7.5 | 88.0 | 1.65 | 90% |
| 10 | 88.2 | 1.61 | 83% |
| 15 | 88.9 | 1.57 | 74% |

From λ = 5 to 10, each transfer that the winner avoids costs about 4 minutes of extra travel. From 10 to 15, each one costs about 17 minutes.

Published studies put the cost of one change of train at more than 4 minutes. A survey study in Edinburgh and Glasgow valued a rail-to-rail transfer at 8 minutes of riding time. The source is Wardman, Hine and Stradling (2001), in [MIT lecture notes][mit]. An international study found a pure transfer penalty of about 18 minutes ([World Transit Research][wtr]). The minutes in Kaname already include the walk and the wait, so λ is the pure penalty.

These numbers support a λ near 10. Up to 10, each transfer avoided costs less than every published estimate. Above 10, the cost reaches the top of the range.

A higher λ also has two visible effects:

- The example group (Shizuku at 聖蹟桜ヶ丘, Tora at 柴又) moves from 神保町 to 神田 at λ = 7.5 and at λ = 10.
- The numbers in the app include the penalty. At λ = 10, Tora's 85 minutes of trains show as 125.

Result: waiting for the owner's decision. `DECISIONS.md` records it.

[mit]: https://dspace.mit.edu/bitstream/handle/1721.1/65385/1-258j-spring-2006/contents/lecture-notes/lect23.pdf
[wtr]: https://www.worldtransitresearch.info/research/9198
