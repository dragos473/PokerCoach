---
id: fold-equity-semibluffs
title: Fold equity and semi-bluffs
level: intermediate
order: 8
minutes: 15
summary: How betting wins pots two ways, the EV formula of a bet, and why draws make the best bluffs.
---
When you bet, you can win in two ways: your opponent **folds** now, or they **call** and you win at showdown. The first part is **fold equity**.

## The EV of a bet

`EV(bet) = f · pot + (1 − f) · [ eq · (pot + risk + villainCall) − risk ]`

where f is how often villain folds and eq is your equity when called. The formula assumes villain never raises and no more betting happens after a call (for example when the bet is all-in).

## A pure bluff vs a semi-bluff

On 7♥ 8♥ 2♣ you hold A♥ K♥ (nut flush draw and two overcards) and move all-in for 20 bb into a 10 bb pot. Suppose villain calls only with a set of sevens (7♠ 7♦) and folds everything else, and folds {{assume 40%}} of the time.

- Your equity when called: {{equity AhKh vs 7s7d board=7h8h2c}}.
- EV of the shove: {{formula evBet pot=10 risk=20 villainCall=20 foldProb=0.4 equityWhenCalled=eq:AhKh,7s7d,7h8h2c}}.
- The same shove with zero equity (a pure bluff): {{formula evBet pot=10 risk=20 villainCall=20 foldProb=0.4 equityWhenCalled=0}}.

The draw turns a losing bluff into a profitable bet because it wins often even when called.

## Break-even fold frequency

- Pure bluff of 20 into 10: {{formula breakEvenFold pot=10 risk=20}}.
- With the flush draw's equity when called: {{formula breakEvenFoldWithEquity pot=10 risk=20 villainCall=20 equityWhenCalled=eq:AhKh,7s7d,7h8h2c}}.

> [!math]
> The more equity you have when called, the less often your opponent needs to fold. If your equity when called is high enough, the bet is profitable even if they never fold.

## Fold equity from a range

Fold equity comes from the part of your opponent's range that folds. If their range is "TT+, AK, KQs, QJs, JTs, 98s" ({{combos "TT+, AK, KQs, QJs, JTs, 98s"}} combos) and they continue only with "TT+, AK" ({{combos "TT+, AK"}} combos), they fold {{foldprob "TT+, AK, KQs, QJs, JTs, 98s" continue="TT+, AK"}} of the time. Card removal changes this: if you hold A♠ K♠ yourself, it becomes {{foldprob "TT+, AK, KQs, QJs, JTs, 98s" continue="TT+, AK" dead=AsKs}}.

> [!heuristic]
> Good semi-bluffs: strong draws with many clean outs, hands that block your opponent's continuing range, and spots where your opponent's range is capped (cannot contain the nuts). Bad semi-bluffs: weak draws against opponents who never fold.

## Quiz

```widget quiz
question: You shove 20 bb into 10 bb as a pure bluff. How often must villain fold to break even (%)?
answer: {{formula breakEvenFold pot=10 risk=20}}
unit: percent
explain: 20 / (10 + 20).
```

```widget quiz
question: Two hands both get called exactly half the time. Which bet has the higher EV?
options: A pure bluff | A strong draw
correct: 2
explain: When called, the draw still wins part of the time; the bluff never does. The fold part is identical.
```

```widget quiz
question: Villain's range has 52 combos and 34 of them continue against your bet. What is your fold equity as a probability (%)?
answer: {{frac 18 52}}
unit: percent
explain: Folding combos / all combos = (52 − 34) / 52.
```
