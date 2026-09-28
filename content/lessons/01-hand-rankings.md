---
id: hand-rankings
title: Hand rankings
level: beginner
order: 1
minutes: 10
summary: The nine hand categories, how often each occurs, kickers, ties and the best five of seven cards.
---
In Texas Hold'em every player makes the **best five-card hand** from their two hole cards and the five community cards. You may use both, one or none of your hole cards.

## The nine categories

From strongest to weakest. The counts are the number of distinct five-card hands in a 52-card deck; there are {{binom 52 5}} five-card hands in total. The app's evaluator reproduces every count below by checking all of them (see the engine tests).

| Category | Example | Five-card hands | Probability |
|---|---|---|---|
| Straight flush | 9♥ 8♥ 7♥ 6♥ 5♥ | 40 | {{frac 40 binom:52:5 fmt=pct2}} |
| Four of a kind | Q♠ Q♥ Q♦ Q♣ 3♠ | 624 | {{frac 624 binom:52:5 fmt=pct2}} |
| Full house | 7♠ 7♥ 7♦ K♣ K♠ | 3,744 | {{frac 3744 binom:52:5 fmt=pct2}} |
| Flush | A♦ J♦ 8♦ 4♦ 2♦ | 5,108 | {{frac 5108 binom:52:5 fmt=pct2}} |
| Straight | T♠ 9♥ 8♦ 7♣ 6♠ | 10,200 | {{frac 10200 binom:52:5 fmt=pct2}} |
| Three of a kind | 8♠ 8♥ 8♦ K♣ 4♠ | 54,912 | {{frac 54912 binom:52:5 fmt=pct2}} |
| Two pair | J♠ J♥ 5♦ 5♣ A♠ | 123,552 | {{frac 123552 binom:52:5 fmt=pct2}} |
| One pair | A♠ A♥ K♦ 9♣ 3♠ | 1,098,240 | {{frac 1098240 binom:52:5 fmt=pct2}} |
| High card | A♠ Q♥ 9♦ 6♣ 3♠ | 1,302,540 | {{frac 1302540 binom:52:5 fmt=pct2}} |

> [!math]
> Rarer categories rank higher. That is the whole logic of the ranking: a flush beats a straight because there are fewer ways to make it.

The royal flush (A K Q J T of one suit) is simply the best straight flush. The **wheel** A-2-3-4-5 is the lowest straight: the ace plays low, so a 6-high straight beats it.

## Kickers and ties

When two players have the same category, compare the ranks that make the hand, then the remaining cards (**kickers**), always using exactly five cards.

- Board K♣ 9♦ 7♠ 3♥ 2♣: A♠ K♦ has {{hand AsKd board=Kc9d7s3h2c}} and beats Q♠ K♥ because the ace kicker outranks the queen.
- Board A♥ A♦ K♠ K♣ Q♥: every player's best hand is at least {{hand 2c3d board=AhAdKsKcQh}} (two pair, aces and kings, queen kicker). Anyone without an ace, a king or a queen **plays the board** and splits the pot.
- Suits never break ties. Two flushes compare their highest cards, one by one.

## Best five of seven

With seven cards available, many hands contain more than five useful cards. Only the best five count:

- Hole 7♥ 7♦ on the board 7♣ 2♠ 2♥ 2♦ K♣ makes {{hand 7h7d board=7c2s2h2dKc}}: three sevens and two of the deuces. A player holding A♣ Q♦ on the same board only has {{hand AcQd board=7c2s2h2dKc}}.
- Three pairs? Only the best two pairs play, and the fifth card is the best remaining card, which can come from the third pair.

```widget hand
title: Ace kicker vs queen kicker
players: Hero=AsKd | Villain=KhQs
board: Kc 9d 7s 3h 2c
preflop: Hero raises | Villain calls
flop: Both players check
turn: Hero bets | Villain calls
river: Hero bets | Villain calls | Hero shows the better kicker
note-flop: Both hold top pair. The kicker decides who is ahead.
```

## Quiz

```widget quiz
question: How many different five-card hands can be dealt from a 52-card deck?
answer: {{binom 52 5}}
unit: count
explain: C(52, 5): choose 5 cards out of 52 without caring about order.
```

```widget quiz
question: Board 9♠ 9♥ 5♦ 5♣ K♠. You hold A♣ 2♦, villain holds Q♥ Q♦. Who wins?
options: You | Villain | Split pot
correct: 2
explain: Villain has queens and nines (two pair, the queens replace the fives). You have nines and fives with an ace kicker, which is a lower two pair.
```

```widget quiz
question: Which category is rarer in five-card poker?
options: A straight | A flush
correct: 2
explain: There are 5,108 flushes but 10,200 straights among all five-card hands, so the flush is rarer and ranks higher.
```
