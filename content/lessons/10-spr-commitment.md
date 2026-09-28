---
id: spr-commitment
title: SPR and commitment
level: intermediate
order: 10
minutes: 12
summary: Stack-to-pot ratio, how it changes by pot type, and when a hand is committed.
---
The **stack-to-pot ratio** (SPR) is the effective stack divided by the pot at the start of the flop. It tells you how many pot-sized bets are left.

## Typical SPRs at 100 bb

| Pot type (6-max, 100 bb) | Pot on the flop | Stack behind | SPR |
|---|---|---|---|
| Single raised: BTN opens 2.5, BB calls | 5.5 bb | 97.5 bb | {{formula spr effectiveStack=97.5 pot=5.5}} |
| 3-bet: BB 3-bets to 11, BTN calls | 22.5 bb | 89 bb | {{formula spr effectiveStack=89 pot=22.5}} |
| 4-bet: 4-bet to 25, called | 50.5 bb | 75 bb | {{formula spr effectiveStack=75 pot=50.5}} |

(The half big blind from the folded small blind is in the pot.)

## Getting stacks in

If every bet is called and you use the same fraction each street, the **geometric** size that gets exactly all-in by the river is:

- From the single-raised pot above, three streets: {{formula geometricBet pot=5.5 stack=97.5 streets=3}} of the pot each time.
- From the 3-bet pot, three streets: {{formula geometricBet pot=22.5 stack=89 streets=3}}.
- From the 4-bet pot, two streets: {{formula geometricBet pot=50.5 stack=75 streets=2}}.

> [!math]
> The lower the SPR, the smaller the bets needed to get all-in. With SPR around 1, a single pot-sized bet is already all-in.

## Commitment

Suppose the pot is 20 bb on the flop with 40 bb stacks (SPR {{formula spr effectiveStack=40 pot=20}}). You bet 10 bb and your opponent moves all-in for 40 bb. You must call 30 bb into a pot of 70 bb: you need only {{formula requiredEquity pot=70 call=30}} equity.

With top pair against a range of overpairs and draws, that price is usually too good to fold, so betting here effectively **commits** you.

> [!heuristic]
> At low SPR, strong one-pair hands (top pair good kicker, overpairs) are usually happy to get all-in, and you should plan that before you bet. At high SPR, one pair is rarely strong enough to stack off against a raise, while sets, two pair and strong draws gain value from the deep stacks. Decide your plan for the hand before the flop bet, not after the raise.

## Quiz

```widget quiz
question: The pot on the flop is 12 bb and the effective stack is 60 bb. What is the SPR?
answer: {{formula spr effectiveStack=60 pot=12}}
unit: number
explain: 60 / 12.
```

```widget quiz
topic: spr
difficulty: medium
```

```widget quiz
question: Pot 30 bb, stacks 60 bb. You bet 15 bb and villain shoves 60 bb. What equity do you need to call (%)?
answer: {{formula requiredEquity pot=105 call=45}}
unit: percent
explain: Pot facing you = 30 + 15 + 60 = 105 bb; you call 60 − 15 = 45 bb.
```
