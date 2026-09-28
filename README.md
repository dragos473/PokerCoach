# PokerCoach

A personal, fully local poker learning app: preflop ranges, an odds & variance lab, interactive
lessons and a freeplay table against explainable bots with a live HUD.

- **No backend, no accounts, no network at runtime.** Everything is stored in your browser (IndexedDB).
- **Installable (PWA)** on desktop and phone; works offline after the first visit.
- **Numbers come from the engine.** Equities, odds, EVs and lesson figures are computed, not typed
  in; each number can show its formula ("show the math"). Heuristics are labelled as heuristics.

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev          # development server at http://localhost:5173
npm test             # all tests (~10 s)
npm run test:slow    # also enumerates all 133,784,560 seven-card hands (~10 s more)
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build at http://localhost:4173
npm run lint         # oxlint
```

`dist/` is a static site: open it from any static host (it uses hash URLs and relative paths, so a
sub-folder works too). To install on a phone, open the hosted URL and use "Add to Home Screen".

## Modes

| Mode | What it does |
|---|---|
| **Ranges** | 13x13 grid editor (click / drag painting, weights, per-combo weights, undo/redo, notation), a library of approximate baseline charts (6-max, 9-max, MTT 40 bb) and heads-up push/fold charts solved by the engine; stats, category breakdown, equity vs any range, equity heatmap, range comparison and a range drill. |
| **Odds lab** | Calculator (hands or ranges, 2 to 9 players, board, dead cards, outs, pot odds, EV), quizzer (10 topics, difficulty, time limit, tolerances, spaced repetition, progress charts) and a variance simulator (sample paths, confidence band, risk of ruin). |
| **Lessons** | 14 lessons from hand rankings to bankroll management, with live numbers, quizzes, range grids, equity calculators and hand replays. |
| **Freeplay** | 2 to 9 handed no-limit hold'em against configurable bots. HUD with pot, SPR, pot odds, required equity, MDF, equity vs your read, EV per option, fold equity, villain action probabilities, outs, hand strength and range advantage. Edit your read of each villain's range during the hand. After each hand: review against the bot's actual range, graded decisions, saved hand history (text export) and a leak tracker. |
| **Formulas** | Every formula in the app, with its assumptions and a live calculator. |
| **Diagnostics** | Reference matchups recomputed live, to check the engine. |
| **Settings** | Every option (appearance, engine, quizzer, table, bot profiles, HUD layout, keyboard shortcuts) with reset per section, plus export / import / delete of all data. |

Press `?` anywhere to see the keyboard shortcuts; remap them in Settings → Keyboard.

## Your data

Settings, edited and custom ranges, quiz history, the spaced-repetition queue, lesson progress,
sessions and hands live in IndexedDB. **Settings → Data** exports everything as one JSON file and
imports it again (replace or merge). Clearing your browser data deletes it, so export a backup now
and then.

## Adding lessons

Lessons are Markdown files in `content/lessons/`. Add a file and reload the dev server (or rebuild).

```markdown
---
id: my-lesson
title: My lesson
level: intermediate          # beginner | intermediate
order: 20                    # position in the list
minutes: 10
summary: One sentence for the lesson list.
---
Normal Markdown: headings, lists, tables, **bold**, `code`, links.

You need {{formula requiredEquity pot=15 call=5}} equity to call.
AhKh vs QsQd preflop: {{equity AhKh vs QsQd}}.

> [!math]
> A mathematical fact.

> [!heuristic]
> A strategic rule of thumb (shown with a "not a mathematical fact" label).
```

### Inline expressions

Every number in lesson prose must be an expression; `npm test` fails on hand-typed percentages or
"x to 1" odds. Click a rendered number to see how it was computed.

| Expression | Result |
|---|---|
| `{{formula ID key=value …}}` | Any formula from the Formulas page (`fmt=pct\|pct0\|pct2\|ratio\|num\|int\|bb`). Inputs may be fractions (`hitProb=9/46`) or an engine equity (`equity=eq:AhKh,7s7d,7h8h2c`). |
| `{{equity A vs B [vs C] board=… dead=… player=N}}` | Equity of player N. Players are hands (`AhKh`), range notation (`"TT+, AK"` in quotes when it has spaces) or library charts (`chart:c6-rfi-btn`, `chart:c6-bb-vs-btn:call`). Two hand classes with no board use the preflop matrix. |
| `{{combos RANGE dead=…}}` | Weighted combos after card removal |
| `{{rangepct RANGE}}` | Share of all 1,326 starting hands |
| `{{chartpct CHART-ID layer=raise\|call\|played}}` | Share of hands in a library chart |
| `{{outs HERO board=… villain=… field=clean\|dirty\|effective\|total}}` | Outs |
| `{{foldprob RANGE continue=RANGE dead=…}}` | Fold probability of a range |
| `{{hand CARDS board=…}}` | Text: best hand description |
| `{{binom n k}}`, `{{frac a b}}` | C(n, k); a / b (terms may be `binom:52:5`) |
| `{{vsrandom AKs}}` | Equity vs a random hand |
| `{{assume 45%}}` | An example assumption, shown and labelled as such |

### Widgets

Fenced blocks named `widget TYPE` with `key: value` lines (indent a line by two spaces to continue a value):

````markdown
```widget quiz
question: The pot is 12 bb and villain bets 6 bb. What equity do you need (%)?
answer: {{formula requiredEquity pot=18 call=6}}
unit: percent                 # percent | count | ratio | number
explain: Shown after answering; may contain {{expressions}}.
```

```widget quiz
question: Who wins?
options: You | Villain | Split pot
correct: 2
```

```widget quiz
topic: outs                   # a generated question from the quizzer (any quizzer topic)
difficulty: easy
```

```widget range-grid
title: A range
range: 22+, A2s+, KTo+        # or chart:c6-rfi-btn
call: 99-66                   # optional second layer
```

```widget equity-calc
players: AhKh | 7s7d          # hands or ranges, separated by |
board: 7h8h2c
```

```widget hand
players: Hero=AhKh | Villain=7s7d
board: 7h 8h 2c 9s 3d
preflop: Hero raises to 2.5 bb | Villain calls
flop: Villain bets 3 bb | Hero calls
note-flop: Optional note for this street.
turn: …
river: …
```
````

A lesson is completed after every quiz block is answered; the score is saved.

## Adding and editing ranges

- **In the app** (recommended): Ranges → *New range*, or open any chart and edit it. Edits to
  built-in charts are saved as overrides (with *Restore baseline*); *Duplicate* makes an independent copy.
  Paste notation such as `22+, A2s+, KTo+, AKs:50%` into the notation panel.
- **Built-in library**: `src/data/ranges/library.ts` holds the baseline charts as notation, each
  with its assumptions. Add an entry with `raise` (open / 3-bet / 4-bet / shove) and optional
  `call`. Tests check that every chart parses and that raise + call never exceeds 100 %.
- **Computed push/fold charts** are solved by `src/engine/pushfold.ts`; edit `PUSH_FOLD_STACKS` /
  `PUSH_FOLD_ANTE` in the library file to add stack depths.

Range notation: `QQ+`, `99-66`, `A2s+` (kicker raised up to one below the top card), `KTo+`,
`A5s-A2s`, `AK` (suited and offsuit), `AhKh` (one combo), `any`, and weights with `:50%`.

## Adding quiz content

Quiz questions are generated in `src/features/odds/quiz/questions.ts`:

1. Add the topic id and label to `QUIZ_TOPICS` in `src/store/settingsSchema.ts`.
2. In `generateParams`, return random JSON parameters for the topic.
3. In `buildQuestion`, compute the answer from those parameters with the engine and return the
   prompt, answer (`numeric` with a unit, or `choice`), explanations and notes.

Parameters are stored for spaced repetition, so `buildQuestion` must be deterministic. The test
`questions.test.ts` generates every topic at every difficulty.

## Bots

Bot profiles (VPIP, PFR, 3-bet, fold to 3-bet, c-bet, fold to c-bet, aggression factor, bluff
frequency) are edited in Settings → Freeplay table. A bot's decision is a policy over its whole
range: preflop thresholds come from the profile scaled by position; postflop it bets or continues
with the top of its range by hand strength and bluffs with its best draws, starting from MDF when
facing bets. The bot's range is narrowed after each action, which is what the review shows as its
"actual range". These are modelling choices, described in the action log and in `src/engine/game/bots.ts`.

## Accuracy

- The hand evaluator is checked against all 2,598,960 five-card hands (exact category counts,
  7,462 distinct values), all 133,784,560 seven-card hands (`npm run test:slow`) and an
  independent brute-force evaluator.
- Equity is checked against known values (AA vs KK 81.95 %, AKs vs QQ 46.05 %), an analytic
  7/44 case, independent brute-force enumerations and Monte Carlo agreement within 4 standard errors.
- The preflop class matrix (`src/engine/data/preflopMatrix.json`) is generated by the engine itself
  (`npm run gen:matrix`, 100,000 trials per pair, deterministic seeds) and validated in tests.
- The EV figures in freeplay use a one-street model (no further betting, re-raises counted as calls);
  preflop decisions are graded only when all-in. The UI states these assumptions.

## Project layout

See `CLAUDE.md` for the architecture, data schemas, conventions and design decisions.
