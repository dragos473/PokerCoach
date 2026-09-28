---
id: mdf-bluff-catching
title: MDF and bluff-catching
level: intermediate
order: 9
minutes: 15
summary: Minimum defence frequency, alpha, balanced bluffing ratios, and when a bluff-catcher should call.
---
## Alpha and MDF

When your opponent bets B into a pot P:

- **Alpha** = B / (P + B) is how often a zero-equity bluff must work to break even.
- **Minimum defence frequency (MDF)** = P / (P + B) = 1 − alpha is how much of your range you must continue with so that such a bluff does not profit automatically.

| Bet size | Alpha | MDF |
|---|---|---|
| Quarter pot | {{formula alpha pot=4 bet=1}} | {{formula mdf pot=4 bet=1}} |
| Third pot | {{formula alpha pot=3 bet=1}} | {{formula mdf pot=3 bet=1}} |
| Half pot | {{formula alpha pot=2 bet=1}} | {{formula mdf pot=2 bet=1}} |
| Pot | {{formula alpha pot=1 bet=1}} | {{formula mdf pot=1 bet=1}} |
| Double pot | {{formula alpha pot=1 bet=2}} | {{formula mdf pot=1 bet=2}} |

> [!heuristic]
> MDF is a benchmark, not a rule. It comes from a toy game where the bettor's bluffs have zero equity and there are no future streets. Against opponents who rarely bluff, defending less than MDF is correct; against over-bluffers, defend more.

## The polarized river toy game

On the river the bettor holds either the nuts or air (polarized) and the caller holds only **bluff-catchers**: hands that beat every bluff and lose to every value bet. With a pot-sized bet:

- The caller needs {{formula requiredEquity pot=200 call=100}} equity to call.
- The bettor makes the caller indifferent by bluffing with exactly that share of the betting range: {{formula bluffFraction pot=100 bet=100}} bluffs, or 1 bluff for every 2 value bets.

## A concrete river

Board K♠ 9♦ 5♣ 2♥ 7♠. Villain bets pot. Suppose their betting range is sets and missed straight draws: "KK, 99, 55, QJs, JTs, T8s, QTs". You hold A♥ K♦ (top pair, top kicker), which beats every bluff and loses to every set.

- Value combos: {{combos "KK, 99, 55" dead=Ks9d5c2h7sAhKd}}. Bluff combos: {{combos "QJs, JTs, T8s, QTs" dead=Ks9d5c2h7sAhKd}}.
- Your equity against the whole betting range: {{equity AhKd vs "KK, 99, 55, QJs, JTs, T8s, QTs" board=Ks9d5c2h7s}}.
- You need {{formula requiredEquity pot=200 call=100}} to call a pot-sized bet.

> [!math]
> A pure bluff-catcher's equity equals the share of bluffs in the opponent's betting range (after card removal). Call when that share exceeds the required equity.

Notice how your own cards matter: the K♦ in your hand removes combos of KK from villain's value range.

## Quiz

```widget quiz
question: Villain bets half the pot. What is your minimum defence frequency (%)?
answer: {{formula mdf pot=2 bet=1}}
unit: percent
explain: MDF = pot / (pot + bet) = 2 / 3.
```

```widget quiz
question: In the polarized river toy game, what share of a pot-sized betting range should be bluffs (%)?
answer: {{formula bluffFraction pot=100 bet=100}}
unit: percent
explain: bet / (pot + 2·bet): the bluff share equals the caller's required equity.
```

```widget quiz
topic: mdf
difficulty: medium
```
