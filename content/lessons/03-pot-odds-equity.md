---
id: pot-odds-equity
title: Pot odds and equity
level: beginner
order: 3
minutes: 15
summary: Required equity, pot odds, and the expected value of a call, all derived step by step.
---
## Equity

Your **equity** is your share of the pot if all the cards were dealt out with no more betting: the probability of winning plus your share of ties. The engine computes it exactly by enumerating every possible board whenever that is affordable.

- A♥ K♥ against Q♠ Q♦ before the flop: {{equity AhKh vs QsQd}} (exact over every five-card board).
- A♥ K♥ against 7♠ 7♦ on 7♥ 8♥ 2♣: {{equity AhKh vs 7s7d board=7h8h2c}}.

## Pot odds and required equity

Suppose the pot is 10 bb and your opponent bets 5 bb. The pot you can win is now 15 bb and it costs 5 bb to call.

- **Pot odds** compare what you can win with what you must pay: {{formula potOddsRatio pot=15 call=5}}.
- **Required equity** is the share of the final pot your call represents: 5 / (15 + 5) = {{formula requiredEquity pot=15 call=5}}.

> [!math]
> Required equity = call / (pot + call), where "pot" already includes the bet you face. If your equity is higher than this number, calling makes money at showdown; if it is lower, calling loses money. This is exact when no more betting can happen (for example when your opponent is all-in).

Common bet sizes and the equity you need to call them:

| Bet size | Required equity |
|---|---|
| Quarter pot (100 into 400) | {{formula requiredEquity pot=500 call=100}} |
| Third pot (100 into 300) | {{formula requiredEquity pot=400 call=100}} |
| Half pot (100 into 200) | {{formula requiredEquity pot=300 call=100}} |
| Two-thirds pot (200 into 300) | {{formula requiredEquity pot=500 call=200}} |
| Pot (100 into 100) | {{formula requiredEquity pot=200 call=100}} |
| Double pot (200 into 100) | {{formula requiredEquity pot=300 call=200}} |

## Expected value of a call

The EV of calling (compared with folding, which is worth 0 because money already in the pot is no longer yours) is

`EV(call) = equity · (pot + call) − call`

With the flush draw above (equity {{equity AhKh vs 7s7d board=7h8h2c}}) facing an all-in of 5 bb into 15 bb: EV = {{formula evCall pot=15 call=5 equity=eq:AhKh,7s7d,7h8h2c}}. Click any number to see the calculation.

```widget equity-calc
title: Try it
players: AhKh | 7s7d
board: 7h8h2c
```

```widget hand
title: Calling an all-in with a draw
players: Hero=AhKh | Villain=7s7d
board: 7h 8h 2c 9s 3d
preflop: Hero raises to 2.5 bb | Villain calls
flop: Villain bets 3 bb | Hero raises to 10 bb | Villain moves all-in | Hero calls
note-flop: Hero's equity when calling is shown in the equity column. Compare it with the required equity for the price of the call.
turn: No more betting
river: Showdown
```

> [!heuristic]
> When more betting can follow, pot odds alone are not the full story: you may win more later when you hit (implied odds) or lose more when you hit and are still behind (reverse implied odds). Those are covered in the outs and SPR lessons.

## Quiz

```widget quiz
question: The pot is 12 bb and villain bets 6 bb. What equity do you need to call?
answer: {{formula requiredEquity pot=18 call=6}}
unit: percent
explain: Pot after the bet = 18 bb, call = 6 bb, so 6 / (18 + 6).
```

```widget quiz
question: Villain bets the size of the pot. What pot odds are you getting (x : 1)?
answer: {{formula potOddsRatio pot=200 call=100}}
unit: ratio
explain: A pot-sized bet of 100 into 100 means you call 100 to win 200.
```

```widget quiz
topic: call-or-fold
difficulty: easy
```
