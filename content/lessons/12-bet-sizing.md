---
id: bet-sizing
title: Bet sizing
level: intermediate
order: 12
minutes: 15
summary: What each bet size asks of your opponent, polarized vs merged betting, and geometric sizing.
---
Every bet size sets a price. The bigger the bet, the more equity your opponent needs to call, and the more often your bluffs must work.

## What a size asks for

| Bet (fraction of pot) | Opponent needs to call | Your bluff must work | Balanced bluff share (river) |
|---|---|---|---|
| Quarter | {{formula requiredEquity pot=5 call=1}} | {{formula breakEvenFold pot=4 risk=1}} | {{formula bluffFraction pot=4 bet=1}} |
| Third | {{formula requiredEquity pot=4 call=1}} | {{formula breakEvenFold pot=3 risk=1}} | {{formula bluffFraction pot=3 bet=1}} |
| Half | {{formula requiredEquity pot=3 call=1}} | {{formula breakEvenFold pot=2 risk=1}} | {{formula bluffFraction pot=2 bet=1}} |
| Three quarters | {{formula requiredEquity pot=7 call=3}} | {{formula breakEvenFold pot=4 risk=3}} | {{formula bluffFraction pot=4 bet=3}} |
| Pot | {{formula requiredEquity pot=2 call=1}} | {{formula breakEvenFold pot=1 risk=1}} | {{formula bluffFraction pot=1 bet=1}} |
| Double pot (overbet) | {{formula requiredEquity pot=3 call=2}} | {{formula breakEvenFold pot=1 risk=2}} | {{formula bluffFraction pot=1 bet=2}} |

> [!math]
> For a bet B into a pot P: the caller needs B / (P + 2B), a pure bluff needs B / (P + B) folds, and in the polarized river toy game the bluff share equals the caller's required equity, B / (P + 2B).

## Polarized and merged ranges

- A **polarized** betting range contains strong hands and bluffs, with few medium hands. It prefers **large** sizes: value hands get paid more and bluffs get more folds per bet.
- A **merged** (linear) range bets strong and medium hands for value, with few bluffs. It prefers **small** sizes: many worse hands can still call.

> [!heuristic]
> When you have a big nut advantage, use large sizes and overbets. When your advantage is a slightly stronger whole range (range advantage without many more nuts), bet small and often. When your opponent's range is capped (cannot hold the nuts), larger bets put maximum pressure on it.

## Planning sizes across streets

To get all-in by the river from a pot of 6 bb with 60 bb behind, betting the same fraction on flop, turn and river requires {{formula geometricBet pot=6 stack=60 streets=3}} of the pot each street. With only two streets left, it would take {{formula geometricBet pot=6 stack=60 streets=2}}.

> [!heuristic]
> Geometric sizing maximises the pot with strong hands when your opponent will call every street. It is a planning tool: most real hands mix sizes by board and range.

## Quiz

```widget quiz
question: You bet three quarters of the pot as a pure bluff. How often must it work (%)?
answer: {{formula breakEvenFold pot=4 risk=3}}
unit: percent
explain: 3 / (4 + 3).
```

```widget quiz
question: Which range usually prefers a small bet size?
options: Polarized (nuts and bluffs) | Merged (many medium-strength value hands)
correct: 2
explain: Medium-strength value hands want calls from many worse hands, which small bets allow.
```

```widget quiz
question: Pot 10 bb, 90 bb behind, three streets left. Which fraction of the pot gets exactly all-in with equal bets (%)?
answer: {{formula geometricBet pot=10 stack=90 streets=3}}
unit: percent
explain: f = ((1 + 2·90/10)^(1/3) − 1) / 2.
```
