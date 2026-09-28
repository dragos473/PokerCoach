# PokerCoach: project guide

Personal, fully local poker learning web app (single user). Priorities, in order:
1. Mathematically correct, clearly explained numbers.
2. Maximum customisability.
3. Clean minimal dark UI (GGPoker-like aesthetic only: dark theme, clean table, high-contrast cards,
   compact stat panels; no GGPoker logos, assets or trademarks).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest, all fast tests (~5 s) |
| `npm run test:slow` | Also runs the exhaustive 133,784,560-hand 7-card evaluator check (~10 s) |
| `npm run typecheck` | `tsc -b` for app, tests and config |
| `npm run build` | Typecheck + production build |
| `npm run lint` | oxlint |

After every phase: `npm test`, `npm run build`, fix everything, then summarise.

## Tech stack

React 19 + TypeScript + Vite, Tailwind v4 (`@tailwindcss/vite`), Zustand (state), Dexie (IndexedDB),
vite-plugin-pwa (Phase 2), Vitest. No backend, no accounts, no network calls at runtime.
**Ask before adding any paid service or anything that needs a network connection.**

## Architecture

```
src/
  engine/                 Pure TS poker engine. NO React/DOM imports. Runs in main thread, workers and Vitest.
    cards.ts              Card = rank*4+suit (0..51), parse/format, decks, dead-card flags
    evaluator.ts          5/6/7-card bitmask evaluator -> comparable integer score; categories; partial-board category
    combos.ts             1326 combo indexing, 169 hand classes, 13x13 grid mapping
    range.ts              Weights (Float64Array[1326], 0..1), parse/format notation, card removal, counts, fold prob.
    equity.ts             Exact enumeration + Monte Carlo (rejection sampling), multiway, weighted ranges, SE / MOE
    outs.ts               Outs vs villain hand/range (clean / dirty / effective outs) and improvement-only outs
    formulas.ts           EVERY formula (pot odds, EV, MDF, alpha, SPR, outs probs, implied odds, ...) with
                          expression text, variables, kind (math/model/heuristic), assumptions, explain()
    rng.ts                Seedable xoshiro128** PRNG
    worker/               engine.worker.ts (Web Worker entry), client.ts (promise API + cancel), protocol.ts
    __tests__/            Vitest suites (reference values, exhaustive checks, naive cross-checks)
  (Phase 2+)
  app/                    Shell: layout, navigation, routes, theme provider
  features/<mode>/        One folder per mode: ranges/, odds-lab/, lessons/, freeplay/, settings/
  components/             Shared UI: Card, RangeGrid, StatPanel, MathTooltip, charts
  store/                  Zustand stores (settings, ranges, progress, freeplay session)
  db/                     Dexie schema, migrations, export/import
  data/ranges/            Built-in "approximate baseline" range charts (JSON with assumptions)
content/lessons/          Markdown/JSON lessons, editable without code (Phase 5)
```

Rules:
- Engine logic never lives in React components. Components call the engine (or the worker client).
- Anything that can exceed ~50 ms (equity, enumeration, simulations) goes through `engine/worker`.
- Never hardcode a poker number the engine can compute. Reference data (range charts) must carry
  and display its assumptions.
- Every formula lives in `engine/formulas.ts`; the UI's "show the math" reads `FORMULAS[id].explain()`.
- Strategic heuristics are labelled as such (`kind: 'heuristic'` or explicit text in lessons).

### Engine conventions
- Card: `rank*4 + suit`, rank 0 = deuce ... 12 = ace, suit order c, d, h, s.
- Score: `category << 20 | k1<<16 | k2<<12 | k3<<8 | k4<<4 | k5`; higher wins, equal = split.
- Range weights are fractions 0..1 in the engine, shown as 0..100 % in the UI.
- Grid: row/col 0 = Ace; suited above the diagonal, offsuit below.
- Pot conventions in formulas: `pot` includes the bet you face and excludes your call; EVs are
  relative to folding (EV(fold) = 0).
- Equity = showdown pot share (ties split). Range vs range uses product weights over card-disjoint
  combo assignments (PokerStove/Equilab convention). Monte Carlo samples that exact distribution by
  rejection sampling and reports SE and 95 % margin of error (1.96 * SE).
- `method: 'auto'`: exact if estimated evaluations <= `maxExactEvaluations` (default 30M), else MC.

### Verification strategy (engine)
- Evaluator: all 2,598,960 five-card hands give the exact category frequencies and exactly 7,462
  distinct values; all 133,784,560 seven-card hands (SLOW=1); 50k random 6/7-card hands match an
  independent naive evaluator.
- Equity: known preflop references (AA vs KK 81.95, AKs vs QQ 46.05, AKo vs 22 46.96,
  AA vs random ~85.2), an analytic turn case (7/44), and flop matchups (2- and 3-way) that match an
  independent naive enumerator exactly. MC must fall within 4 SE of exact.
- Combos/blockers: 6/4/12/1326, C(n,2) and a*b reductions, removal from full ranges.

## Data schemas (IndexedDB via Dexie, Phase 2+)

All tables are exported/imported together as one JSON file:
`{ app: 'pokercoach', schemaVersion, exportedAt, tables: {...} }`.

```ts
settings       { key: 'app', value: AppSettings }            // one row; AppSettings is versioned
               AppSettings = { theme, deckStyle: '2color'|'4color', tableColor, fontScale, animationSpeed,
                               keybindings: Record<ActionId, string>, equity: { iterations, maxExactEvaluations },
                               quiz: {...}, freeplay: {...}, hud: { items: { id, visible, order }[] } }
ranges         { id, name, tags: string[], format: '6max-cash'|'9max-cash'|'mtt'|'custom',
                 scenario: 'rfi'|'vs-open'|'vs-3bet'|'bb-defence'|'push-fold'|'custom', position?, vsPosition?,
                 stackBB?, actions: { [action: string]: SparseWeights },   // raise / call / fold layers
                 assumptions?: string, builtIn: boolean, createdAt, updatedAt }
               SparseWeights = [comboIndex, weight][]   (exact; notation string kept for display)
quizAttempts   { id, topic, questionKey, prompt, answer, expected, correct, tolerance, ms, at }
srsItems       { questionKey, topic, params, ease, intervalDays, due, lapses, lastResult }
lessonProgress { lessonId, completedAt?, sectionsSeen: string[], quizScore?, updatedAt }
sessions       { id, startedAt, endedAt?, config, stats }
hands          { id, sessionId, at, config, seats, actions, board, result, heroDecisions: DecisionEval[] }
               DecisionEval = { street, options: { action, size?, ev, assumptions }[], chosen, evLoss }
leaks          derived from hands (not stored), recomputed on demand
```

### App conventions (Phase 2+)
- Styling uses design tokens from `src/index.css` (`bg-surface`, `text-muted`, `border-line`,
  `text-good/bad/warn/info`, `bg-felt`, `bg-raise/call/fold`). Light/dark are token swaps via `data-theme`.
- `--anim` (animation multiplier) and `--font-scale` are CSS variables set by `ThemeApplier`.
  Use the `transition-ui`, `animate-in`, `animate-deal` utilities so the speed setting applies.
- Settings: `store/settingsSchema.ts` (types + defaults + `normalizeSettings` for forward compatibility),
  `store/settings.ts` (Zustand, debounced save to Dexie). New options only need a default.
- Hotkeys: declare actions in `hotkeys/actions.ts`, bind with `useHotkeys({ actionId: handler })`.
- Heavy work in components: `useEngine()` gives a worker client that is disposed on unmount.
- Routes: add to `ROUTES` in `app/App.tsx`; navigation items in `app/nav.ts`.

## Design decisions (pick the more customisable option when ambiguous)
- Own evaluator instead of an npm library: small, dependency-free, verified exhaustively.
- Range notation "+" raises the kicker only (T9s+ = T9s; A2s+ = A2s..AKs), as in PokerStove.
  Bare weights > 1 are read as percent ("AKs:75" = 75 %).
- Outs are defined mathematically against a villain hand/range (clean / dirty / effective outs);
  improvement-only outs exist for when no range is given, and its dirty warnings are heuristics.
- Hash routing (no router dependency) so the PWA works offline from any static path (`base: './'`).
- Backup import supports "replace" and "merge" (upsert by primary key).
- Worker cancellation terminates and lazily re-creates the worker (loops are synchronous).
- Exact range-vs-range preflop is correct but slow (AKo vs QQ ~11 s); auto mode uses MC there.
  Possible later optimisation: suit-isomorphism cache for preflop matchups.

## Phase checklist

- [x] **Phase 0** Plan, CLAUDE.md, scaffold (Vite/React/TS/Tailwind/Zustand/Dexie/Vitest)
- [x] **Phase 1** Engine: cards, evaluator, combos, ranges + notation, blockers, equity (exact/MC,
      multiway, ranges), formulas with explanations, outs (clean/dirty), worker, tests.
      Engine check page (now `features/diagnostics`). User confirmed the equity numbers.
- [x] **Phase 2** App shell (hash router, sidebar / mobile tab bar), dark/light/system theme, 2/4-colour
      deck, table colour, font scale, animation speed, remappable shortcuts with conflict detection,
      Settings page with per-section reset, Dexie + JSON export/import (replace/merge), PWA,
      formula reference page, diagnostics page
- [ ] **Phase 3** Preflop ranges: 13x13 grid (paint, drag, weights), baseline library (6-max/9-max
      cash, MTT, push/fold) with assumptions, stats, equity heatmap, range vs range, range drill
- [ ] **Phase 4** Odds lab: calculator with show-the-math, quizzer (topics, difficulty, tolerance,
      spaced repetition, accuracy charts), variance simulator (paths, CIs, risk of ruin)
- [ ] **Phase 5** Lessons in `content/lessons/` with embedded widgets, curriculum, progress, quizzes;
      every number computed by the engine or verified by a test
- [ ] **Phase 6** Freeplay: 2-9 players, bot profiles, HUD (toggle/reorder), villain range estimator,
      live EV / fold equity / action probabilities, after-hand review, hand history, leak tracker
- [ ] **Phase 7** Polish, keyboard play, empty/loading/error states, README
