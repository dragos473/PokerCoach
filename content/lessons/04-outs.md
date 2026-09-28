---
id: outs
title: Outs and drawing odds
level: beginner
order: 4
minutes: 15
summary: Counting outs, exact probabilities vs the rules of 2 and 4, dirty outs and implied odds.
---
An **out** is a card that improves your hand to the one that wins. Outs only make sense against what your opponent holds, so the app defines them against a hand or a range:

- **Clean out**: after this card you beat every hand that was ahead of you.
- **Dirty out**: it improves you, but some of the hands that were ahead stay ahead (or it only ties).

## Counting a combo draw

You hold J♥ T♥ on 9♥ 8♣ 2♥ against A♠ A♦. Any heart gives you a flush and any queen or seven gives you a straight:

- 9 hearts left in the deck, plus 3 non-heart queens and 3 non-heart sevens.
- The engine counts {{outs JhTh board=9h8c2h villain=AsAd field=clean}} clean outs.

## Exact probabilities

On the flop you have seen 5 cards (your two and the three on the board), so 52 − 5 = 47 cards are unseen from your point of view (your opponent's cards count as unseen because you do not know them).

- Next card only: outs / unseen = {{formula hitNextCard outs=15 unseen=47}}.
- Turn or river (you see both cards, for example when all-in): 1 − C(32, 2) / C(47, 2) = {{formula hitByRiver outs=15 unseen=47}}.

## The rules of 2 and 4

Multiply your outs by 2 for one card, or by 4 for two cards:

| Outs | Rule of 2 | Exact, one card (46 unseen) | Rule of 4 | Exact, two cards (47 unseen) |
|---|---|---|---|---|
| 4 | {{formula ruleOf2 outs=4}} | {{formula hitNextCard outs=4 unseen=46}} | {{formula ruleOf4 outs=4}} | {{formula hitByRiver outs=4 unseen=47}} |
| 8 | {{formula ruleOf2 outs=8}} | {{formula hitNextCard outs=8 unseen=46}} | {{formula ruleOf4 outs=8}} | {{formula hitByRiver outs=8 unseen=47}} |
| 9 | {{formula ruleOf2 outs=9}} | {{formula hitNextCard outs=9 unseen=46}} | {{formula ruleOf4 outs=9}} | {{formula hitByRiver outs=9 unseen=47}} |
| 12 | {{formula ruleOf2 outs=12}} | {{formula hitNextCard outs=12 unseen=46}} | {{formula ruleOf4 outs=12}} | {{formula hitByRiver outs=12 unseen=47}} |
| 15 | {{formula ruleOf2 outs=15}} | {{formula hitNextCard outs=15 unseen=46}} | {{formula ruleOf4 outs=15}} | {{formula hitByRiver outs=15 unseen=47}} |

> [!heuristic]
> The rules are approximations for use at the table. The rule of 4 overestimates with many outs because it double counts hitting on both the turn and the river. They also ignore that some outs are dirty and that your opponent can improve too.

## Dirty outs

You hold K♠ Q♠ on 7♥ 8♠ 3♠. If your opponent has A♥ A♦, every spade gives you the winning flush. If they have a set of sevens, the 7♠ gives you a flush but gives them four of a kind. Against the range "77, A♥A♦" the engine finds {{outs KsQs board=7h8s3s villain="77, AhAd" field=clean}} clean and {{outs KsQs board=7h8s3s villain="77, AhAd" field=dirty}} dirty outs, worth {{outs KsQs board=7h8s3s villain="77, AhAd" field=effective}} **effective outs** (each out counted by the share of the hands ahead that it beats).

## Real equity is not "outs"

Hitting an out on the next card is not the same as winning. With the set of sevens against the flush draw, the drawing hand wins {{equity AhKh vs 7s7d board=7h8h2c}} when all-in on the flop, while counting 8 clean outs with the formula gives {{formula hitByRiver outs=8 unseen=47}}. The difference comes from the set improving to a full house on the river after the flush hits on the turn, and from the two unseen cards in the opponent's hand.

```widget equity-calc
title: Set vs flush draw
players: 7s7d | AhKh
board: 7h8h2c
```

## Implied odds

On the turn with a flush draw (9 outs, 46 unseen) you face a half-pot bet: 50 into 100. Your direct odds require {{formula requiredEquity pot=150 call=50}} but you hit only {{formula hitNextCard outs=9 unseen=46}} of the time.

To break even you must win on average {{formula impliedOddsNeeded pot=150 call=50 hitProb=9/46}} more on the river when you hit (assuming you win every time you hit and fold when you miss).

> [!heuristic]
> Implied odds are best with disguised draws, deep stacks and opponents who pay off. Reverse implied odds (you hit but still lose, like a low flush against a higher one) make drawing worse than the raw numbers suggest.

## Quiz

```widget quiz
question: On the flop you have 8 outs and will see both the turn and river. What is the exact probability of hitting at least one out?
answer: {{formula hitByRiver outs=8 unseen=47}}
unit: percent
explain: 1 − C(39, 2) / C(47, 2).
```

```widget quiz
topic: outs
difficulty: easy
```

```widget quiz
question: With 12 outs on the flop the rule of 4 estimates {{formula ruleOf4 outs=12}} to hit by the river. Is the exact probability higher or lower?
options: Higher | Lower
correct: 2
explain: Exact: 1 − C(35, 2) / C(47, 2) = {{formula hitByRiver outs=12 unseen=47}}. The rule of 4 counts hitting on both streets twice, so it runs high with many outs.
```
