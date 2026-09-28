---
id: positions
title: Positions and the order of action
level: beginner
order: 2
minutes: 10
summary: Who acts when, why acting last is an advantage, and why opening ranges widen toward the button.
---
## The seats

At a 6-max table the seats, in the order they act **preflop**, are:

1. **UTG** (under the gun), first to act before the flop
2. **HJ** (hijack)
3. **CO** (cutoff)
4. **BTN** (button, the dealer)
5. **SB** (small blind, posts half a big blind)
6. **BB** (big blind, posts one big blind, acts last preflop)

At a 9-max table UTG+1, UTG+2 and the lojack (LJ) sit between UTG and the hijack.

**After the flop** the order changes: the small blind acts first, then the big blind, and the button always acts **last**. "In position" (IP) means you act after your opponent on every postflop street; "out of position" (OOP) means you act first.

> [!math]
> The button is in position against every other player after the flop. The blinds are out of position against everyone who calls their raise. This follows directly from the rules, not from strategy.

## Why position is worth money

> [!heuristic]
> Acting last lets you see what your opponent does before you decide: you can take free cards, control the pot size, bluff when they show weakness and value bet thinner. Solvers and win-rate databases agree that the button is the most profitable seat and the blinds are the least profitable (the blinds lose money in the long run because they post forced bets). The exact size of the edge depends on players and stakes, so treat it as a strong tendency, not a formula.

## Opening ranges widen with position

Two things change as you move toward the button:

- **Fewer players are left to act behind you**, so it is less likely that someone wakes up with a strong hand.
- **You are more likely to be in position** after the flop.

That is why the baseline charts open more hands from later seats. From the library's approximate 6-max charts (100 bb, see their assumptions):

| Seat | Opens |
|---|---|
| UTG | {{chartpct c6-rfi-utg}} |
| HJ | {{chartpct c6-rfi-hj}} |
| CO | {{chartpct c6-rfi-co}} |
| BTN | {{chartpct c6-rfi-btn}} |
| SB (raise or fold) | {{chartpct c6-rfi-sb}} |

The chance that at least one of several opponents holds a strong hand grows with the number of opponents. For example, a single random hand is a pocket pair TT or better {{rangepct TT+}} of the time; with five opponents that is much more likely than with one.

```widget range-grid
title: 6-max UTG open (approximate baseline)
range: chart:c6-rfi-utg
```

```widget range-grid
title: 6-max BTN open (approximate baseline)
range: chart:c6-rfi-btn
```

> [!note]
> Open these charts in the Ranges mode to see the assumptions (stack depth, open size, rake) and to edit them.

## Quiz

```widget quiz
question: After the flop, who acts last if the button, the small blind and the big blind are all still in the hand?
options: Small blind | Big blind | Button
correct: 3
explain: Postflop action starts left of the button, so the button always acts last.
```

```widget quiz
question: Which seat acts last before the flop?
options: Under the gun | Button | Big blind
correct: 3
explain: The big blind posted a forced bet, so preflop action goes around the table and ends with the big blind.
```

```widget quiz
question: Using the library charts, which seat opens the most hands?
options: UTG | CO | BTN
correct: 3
explain: The button has only the blinds left to act and is guaranteed position after the flop.
```
