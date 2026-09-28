---
id: preflop-ranges
title: Preflop ranges
level: beginner
order: 5
minutes: 15
summary: Thinking in ranges, range notation, the 13x13 grid, how often hands are dealt, and classic preflop matchups.
---
You never know your opponent's exact cards, so you think about **all the hands they could have in this situation**, weighted by how likely they are to play each one that way. That set is a **range**.

## The 13x13 grid

There are {{formula totalStartingHands deck=52}} two-card starting hands. They group into 169 strategically different **hand classes**:

- 13 pocket pairs (diagonal), each with {{formula pairCombos cardsLeft=4}} combos,
- 78 suited hands (above the diagonal), each with 4 combos,
- 78 offsuit hands (below the diagonal), each with 12 combos.

So you are dealt a pocket pair {{rangepct 22+}} of the time, a suited hand {{rangepct "A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s"}} of the time, and pocket aces only {{rangepct AA fmt=pct2}} of the time.

## Range notation

| Notation | Meaning | Combos |
|---|---|---|
| `QQ+` | QQ, KK, AA | {{combos QQ+}} |
| `A2s+` | A2s up to AKs | {{combos A2s+}} |
| `KTo+` | KTo, KJo, KQo | {{combos KTo+}} |
| `99-66` | 99, 88, 77, 66 | {{combos 99-66}} |
| `AK` | AKs and AKo | {{combos AK}} |
| `AKs:50%` | AKs half of the time | {{combos AKs:50%}} |

The "+" raises the lower card up to one below the top card. The whole range "22+, A2s+, KTo+" contains {{combos "22+, A2s+, KTo+"}} combos, which is {{rangepct "22+, A2s+, KTo+"}} of all hands.

```widget range-grid
title: 22+, A2s+, KTo+
range: 22+, A2s+, KTo+
```

## Classic preflop matchups

All-in before the flop, averaged over all suit combinations (click a number to see how it is computed):

| Matchup | Equity of the first hand |
|---|---|
| AA vs KK | {{equity AA vs KK}} |
| AKs vs QQ | {{equity AKs vs QQ}} |
| AKo vs 22 | {{equity AKo vs 22}} |
| AKo vs KQo | {{equity AKo vs KQo}} |
| 76s vs AKo | {{equity 76s vs AKo}} |
| AA vs a random hand | {{vsrandom AA}} |
| 72o vs a random hand | {{vsrandom 72o}} |

> [!math]
> A pair against two higher unpaired cards is close to a coin flip; a hand that is "dominated" (shares a card with a better hand, like KQ against AK) is a big underdog because it can only win by pairing its other card.

Specific suits matter a little. Exactly computed: A♥ K♥ against Q♠ Q♦ wins {{equity AhKh vs QsQd}}, but against Q♥ Q♦ (one of its flush cards is gone) only {{equity AhKh vs QhQd}}.

```widget equity-calc
title: Your own preflop matchups (hands like AhKh or ranges like QQ+)
players: AKo | 22
```

## Opening charts

The Ranges mode contains approximate baseline charts for 6-max, 9-max and MTT play. They are starting points with stated assumptions, not solver outputs.

> [!heuristic]
> Stronger ranges from early position, wider ranges from late position, tighter ranges when facing a raise, and very tight 4-bet ranges are robust principles. The exact edges of a chart depend on stack depth, rake, opponents and sizing.

## Quiz

```widget quiz
question: How many combos are in the range QQ+, AK?
answer: {{combos "QQ+, AK"}}
unit: count
explain: 3 pairs × 6 combos + 16 combos of AK.
```

```widget quiz
question: How often are you dealt any pocket pair (in %)?
answer: {{rangepct 22+}}
unit: percent
explain: 13 pairs × 6 combos = 78 of the 1,326 starting hands.
```

```widget quiz
topic: equity-estimate
difficulty: hard
```
