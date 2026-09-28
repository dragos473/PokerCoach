---
id: board-texture
title: Board texture
level: intermediate
order: 11
minutes: 15
summary: Dry vs wet boards, how many draws a board allows, and how texture changes equities and strategy.
---
**Board texture** describes how much a flop connects with possible hands: pairs, straights, flushes and draws.

## Dry and wet boards

- **Dry**: K♠ 7♦ 2♣. Disconnected, rainbow (three suits). Few draws are possible.
- **Wet**: J♥ T♥ 4♣. Connected and two-tone. Many straight and flush draws.

On J♥ T♥ 4♣:

- Any two hearts make a flush draw: C(11, 2) = {{binom 11 2}} combos in a random range.
- Open-ended straight draws come from 98, Q9 and KQ: {{combos "98, Q9, KQ" dead=JhTh4c}} combos.
- Sets: {{combos "JJ, TT, 44" dead=JhTh4c}} combos.

## Texture changes equities

The same overpair against a suited connector:

- A♠ A♦ vs 9♥ 8♥ on K♠ 7♦ 2♣ (no draw for the connector apart from a gutshot and backdoors): {{equity AsAd vs 9h8h board=Ks7d2c}}.
- A♠ A♦ vs 9♥ 8♥ on J♥ T♥ 4♣ (flush draw and open-ended straight draw): {{equity AsAd vs 9h8h board=JhTh4c}}.

```widget equity-calc
title: Try other boards
players: AsAd | 9h8h
board: JhTh4c
```

## Paired and monotone boards

- On a paired board such as 8♠ 8♦ 3♣, only hands holding one of the two remaining eights have trips or better: {{combos "A8, K8, Q8, J8, T8, 98, 87, 86, 85, 84, 83, 82, 88" dead=8s8d3c}} combos out of {{binom 49 2}} possible holdings.
- On a monotone board such as K♥ 9♥ 4♥, any single heart is a flush draw and two hearts are already a flush: {{binom 10 2}} flush combos.

> [!heuristic]
> Dry boards change little from street to street, so hands keep their value and small bets work well. Wet boards change a lot, equities run closer, and both value hands and draws prefer bigger bets. Paired boards reduce the number of strong hands, which favours the player with more pocket pairs and trips in range.

## Quiz

```widget quiz
question: How many flush-draw combos (two hearts) are possible on J♥ T♥ 4♣?
answer: {{binom 11 2}}
unit: count
explain: 11 hearts remain; choose 2 of them.
```

```widget quiz
question: On which flop does A♠ A♦ have less equity against 9♥ 8♥?
options: K♠ 7♦ 2♣ | J♥ T♥ 4♣
correct: 2
explain: The two-tone connected board gives 9♥ 8♥ a flush draw plus an open-ended straight draw.
```

```widget quiz
topic: equity-estimate
difficulty: medium
```
