---
id: combos-blockers
title: Combos and blockers
level: beginner
order: 6
minutes: 15
summary: Counting combinations with card removal and using blockers to reason about your opponent's range.
---
## Counting combos

Every hand class has a fixed number of combinations when no cards are visible:

- Pocket pair: C(4, 2) = {{formula pairCombos cardsLeft=4}}
- Suited hand: {{combos AKs}}
- Offsuit hand: {{combos AKo}}
- Both together (for example AK): {{formula unpairedCombos highLeft=4 lowLeft=4 suitedPairsLeft=4}}

## Card removal

Every card you can see (in your hand or on the board) cannot be in your opponent's hand.

- One ace visible: AA has C(3, 2) = {{combos AA dead=Ah}} combos left, AK has 3 × 4 = {{combos AK dead=Ah}}.
- A♠ and K♦ visible: AK has 3 × 3 = {{combos AK dead=AsKd}} combos, of which {{combos AKs dead=AsKd}} are suited.
- Two aces visible: only {{combos AA dead=AhAd}} combo of AA remains.

> [!math]
> Pairs: C(n, 2) where n is the number of unseen cards of that rank. Unpaired hands: a × b, where a and b are the unseen cards of each rank; the suited combos are the suits in which both cards are still unseen.

## Blockers

A **blocker** is a card you hold that removes combos from your opponent's range.

Suppose your opponent's value range on the river is QQ+ and AK. Without card removal that is {{combos "QQ+, AK"}} combos. If you hold A♠ 5♠, it becomes {{combos "QQ+, AK" dead=As5s}}; if you hold K♠ Q♠, it becomes {{combos "QQ+, AK" dead=KsQs}}.

> [!heuristic]
> Hands that block your opponent's strong hands (and do not block their bluffs or folds) are good candidates for bluffing, and good bluff-catchers when they block the bluffs less than the value hands. Blockers shift ratios; they rarely decide a hand on their own.

## Combos on the board

On K♠ 7♦ 2♣, how many ways can someone have a set?

- Kings: {{combos KK dead=Ks7d2c}} combos, sevens: {{combos 77 dead=Ks7d2c}}, deuces: {{combos 22 dead=Ks7d2c}}.
- Two pair K7: {{combos K7 dead=Ks7d2c}} combos.
- Top pair AK: {{combos AK dead=Ks7d2c}} combos.

That is why "he always has a set" is rarely true: sets are few combos compared with top pair.

## Quiz

```widget quiz
topic: combos
difficulty: medium
```

```widget quiz
question: You hold K♥ K♣. How many combos of AK can your opponent have?
answer: {{combos AK dead=KhKc}}
unit: count
explain: 4 aces × 2 kings left.
```

```widget quiz
topic: blockers
difficulty: medium
```
