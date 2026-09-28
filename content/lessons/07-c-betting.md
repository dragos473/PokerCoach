---
id: c-betting
title: Continuation betting
level: intermediate
order: 7
minutes: 15
summary: Why the preflop raiser often bets the flop, the maths of a c-bet bluff, and how range advantage depends on the board.
---
A **continuation bet** (c-bet) is a bet on the flop by the player who made the last raise before the flop.

## The maths of a c-bet bluff

If your hand has no chance when called, the bet must work often enough to pay for itself. The break-even fold frequency is `risk / (pot + risk)`:

| C-bet size | Villain must fold at least |
|---|---|
| Third pot | {{formula breakEvenFold pot=3 risk=1}} |
| Half pot | {{formula breakEvenFold pot=2 risk=1}} |
| Two-thirds pot | {{formula breakEvenFold pot=3 risk=2}} |
| Pot | {{formula breakEvenFold pot=1 risk=1}} |

In a single-raised pot of 5.5 bb, a third-pot bet of 1.8 bb with a pure bluff that gets folds {{assume 45%}} of the time earns {{formula evBet pot=5.5 risk=1.8 villainCall=1.8 foldProb=0.45 equityWhenCalled=0}} on average. Most real c-bets also have some equity when called (overcards, backdoor draws), which lowers the fold frequency they need.

## Range advantage

Compare the whole range of the preflop raiser with the range of the caller on a given flop. Using the library's approximate 6-max charts, the button's opening range against the big blind's calling range has this equity:

- On K♠ 7♦ 2♣: {{equity chart:c6-rfi-btn vs chart:c6-bb-vs-btn:call board=Ks7d2c}}
- On 7♠ 6♠ 5♦: {{equity chart:c6-rfi-btn vs chart:c6-bb-vs-btn:call board=7s6s5d}}

The button's range contains more strong kings and more big pairs, which hit or dominate a king-high dry board; the big blind's range contains more suited connectors and small pairs, which connect with low boards.

> [!heuristic]
> On boards that favour your range (high, dry, disconnected) you can c-bet often and small. On boards that favour the caller (low, connected, suited) you c-bet less often, usually with a larger size, and check more of your medium hands. Solvers confirm these tendencies, but the best frequency depends on ranges, stack depth and opponents.

## Nut advantage

Range advantage is about average equity; **nut advantage** is about who has more of the very strongest hands. On K♠ 7♦ 2♣ the button can have K7 and sets of kings; the big blind has 3-bet most KK preflop, so the button holds more of the nuts. The number of set combos on this board is small anyway: {{combos "KK, 77, 22" dead=Ks7d2c}} in total for someone who plays every pocket pair.

## Quiz

```widget quiz
question: You c-bet a pure bluff of half the pot. How often must your opponent fold for it to break even (%)?
answer: {{formula breakEvenFold pot=2 risk=1}}
unit: percent
explain: risk / (pot + risk) = 1 / (2 + 1).
```

```widget quiz
question: Which flop is usually better for the preflop raiser's range?
options: K♠ 7♦ 2♣ | 7♠ 6♠ 5♦
correct: 1
explain: The raiser has more strong high cards and overpairs; the caller has more low connected hands. The equity numbers above show the difference.
```

```widget quiz
topic: break-even-fold
difficulty: medium
```
