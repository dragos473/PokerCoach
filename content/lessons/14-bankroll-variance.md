---
id: bankroll-variance
title: Bankroll and variance
level: intermediate
order: 14
minutes: 15
summary: Win rate, standard deviation, how big swings really are, and the maths of risk of ruin.
---
## Win rate and standard deviation

- **Win rate**: average profit per 100 hands, in big blinds (bb/100).
- **Standard deviation**: how much results spread per 100 hands (bb/100). In no-limit hold'em it is large compared with the win rate: typical 6-max values are around 80 to 110 bb/100.

The model used here treats every block of 100 hands as an independent normal result (by the central limit theorem). Over n hands:

- Expected result: `win rate · n / 100`
- Standard deviation of the result: `sd · √(n / 100)`

For a player winning 5 bb/100 with a standard deviation of 90 bb/100 over 100,000 hands:

- Expected result: {{formula expectedWinnings winRate=5 hands=100000}}
- Standard deviation: {{formula resultStdDev stdDev=90 hands=100000}}
- Probability of still being behind: {{formula probLoser winRate=5 stdDev=90 hands=100000}}

The mean grows with n but the spread grows only with √n, so the win rate eventually dominates, but slowly: after 10,000 hands the same player is behind {{formula probLoser winRate=5 stdDev=90 hands=10000}} of the time.

## How long until you know?

To be 95 percent (one-sided, z = 1.645) confident that this player's results are above zero, they need about {{formula handsToConfidence winRate=5 stdDev=90 confidenceZ=1.645}} hands. For a 2 bb/100 winner: {{formula handsToConfidence winRate=2 stdDev=90 confidenceZ=1.645}}.

## Risk of ruin

The probability of ever losing a bankroll B (in bb) when playing forever with a positive win rate is `exp(−2 · winRate · B / sd²)`:

| Bankroll | Risk of ruin (5 bb/100, sd 90) |
|---|---|
| 1,000 bb (10 buy-ins) | {{formula riskOfRuin winRate=5 stdDev=90 bankroll=1000}} |
| 2,000 bb (20 buy-ins) | {{formula riskOfRuin winRate=5 stdDev=90 bankroll=2000}} |
| 3,000 bb (30 buy-ins) | {{formula riskOfRuin winRate=5 stdDev=90 bankroll=3000}} |
| 5,000 bb (50 buy-ins) | {{formula riskOfRuin winRate=5 stdDev=90 bankroll=5000}} |

> [!math]
> Risk of ruin falls exponentially with bankroll size and with the win rate, and rises with the square of the standard deviation. A player with a win rate of zero or less goes broke eventually with certainty in this model.

> [!heuristic]
> Real win rates are uncertain and change over time (games, tilt, learning), and most players move down in stakes before going broke, so these numbers are a guide. Common advice is to keep a larger bankroll than the formula suggests and to move down after a set loss.

Try your own numbers in the Odds lab's variance simulator, which plots sample paths next to these formulas.

## Quiz

```widget quiz
question: Win rate 4 bb/100, standard deviation 100 bb/100. What is the expected result over 50,000 hands (bb)?
answer: {{formula expectedWinnings winRate=4 hands=50000}}
unit: number
explain: 4 · 50,000 / 100.
```

```widget quiz
question: Same player, 50,000 hands. What is the probability of being behind (%)?
answer: {{formula probLoser winRate=4 stdDev=100 hands=50000}}
unit: percent
explain: z = −(4 · 500) / (100 · √500), then Φ(z).
```

```widget quiz
question: If you double your bankroll, what happens to the risk of ruin (with a positive win rate)?
options: It halves | It is squared | It stays the same
correct: 2
explain: exp(−2·μ·2B/σ²) = (exp(−2·μ·B/σ²))². A risk of ruin of r becomes r².
```
