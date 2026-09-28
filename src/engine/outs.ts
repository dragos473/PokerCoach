/**
 * Outs analysis.
 *
 * Two modes:
 *
 * 1) Versus a villain hand or range (mathematically defined):
 *    Let B = the villain combos that currently beat you on this board ("you are behind"), weighted.
 *    For each unseen card x, share(x) = weighted fraction of B (excluding combos that contain x)
 *    that you beat after x comes (a tie counts as 1/2).
 *      clean out: share(x) = 1        (wins against every hand that was ahead)
 *      dirty out: 0 < share(x) < 1   (improves you, but some hands that were ahead stay ahead)
 *      effective outs = Σ_x share(x)
 *    Exact probabilities (villain's cards are random from their range, so the real deck has
 *    `unseen − 2` cards):
 *      P(best hand after next card) = Σ_v w_v · #{x ∉ v : you win} / (unseen − 2)  /  Σ_v w_v  (ties 1/2)
 *      P(best hand at river)        = your all-in equity vs B (exact enumeration, flop only).
 *
 * 2) Improvement only (no villain information): a card is an out if it raises your made-hand
 *    category and the improvement is not on the board alone. "Dirty" warnings in this mode are
 *    HEURISTICS (board pairs, flush or straight becomes possible for others), labelled as such.
 */
import { type Card, DECK_SIZE, assertDistinct, formatCard, suitOf } from './cards'
import { COMBO_CARDS, comboIndex } from './combos'
import {
  evaluate, categoryOfCards, categoryOf, HandCategory, CATEGORY_NAMES, rankMask, straightWindowCount,
} from './evaluator'
import type { WeightedCombo } from './range'
import { exactEquity } from './equity'
import { hitByRiver, hitNextCard, ruleOf2, ruleOf4 } from './formulas'

export type OutStatus = 'clean' | 'dirty' | 'none'

export interface CardOutInfo {
  card: Card
  label: string
  heroCategoryAfter: HandCategory
  heroCategoryName: string
  /** Improves your made-hand category, with the improvement not purely on the board. */
  improves: boolean
  /** vs-villain mode: share of the hands that were ahead which you now beat (ties 1/2). */
  winShare: number
  status: OutStatus
  /** Improvement mode only: heuristic reasons this out may be dirty. */
  warnings: string[]
}

export interface OutsResult {
  mode: 'vs-villain' | 'improvement'
  heroCategoryNow: HandCategory
  heroCategoryNowName: string
  /** Cards unseen from your perspective (52 − your 2 − board − dead). */
  unseen: number
  cards: CardOutInfo[]
  cleanOuts: number
  dirtyOuts: number
  /** Σ share(x) in vs-villain mode; clean + dirty in improvement mode. */
  effectiveOuts: number
  /** vs-villain mode: weighted fraction of villain's range you are currently behind. */
  behindFraction: number
  /** vs-villain: exact probability of having the best hand after the next card, given you are behind now. */
  exactNextCard: number
  /** Exact probability to be best at the river (vs-villain mode, from the flop, given behind now). */
  exactByRiver?: number
  /** Textbook probabilities computed from the clean+dirty out count, for comparison. */
  formulaNextCard: number
  formulaByRiver?: number
  ruleOf2: number
  ruleOf4?: number
}

export interface OutsRequest {
  hero: [Card, Card]
  /** Flop (3) or turn (4). */
  board: Card[]
  /** Known villain hand or weighted range. Omit for improvement-only mode. */
  villain?: WeightedCombo[]
  dead?: Card[]
}

export function analyzeOuts(req: OutsRequest): OutsResult {
  const { hero, board } = req
  const dead = req.dead ?? []
  if (board.length !== 3 && board.length !== 4) throw new Error('Outs are defined on the flop or turn')
  assertDistinct([...hero, ...board, ...dead])

  const known = new Uint8Array(DECK_SIZE)
  for (const c of [...hero, ...board, ...dead]) known[c] = 1
  const unseenCards: Card[] = []
  for (let c = 0; c < DECK_SIZE; c++) if (!known[c]) unseenCards.push(c)
  const unseen = unseenCards.length

  const heroNowScore = evaluate([...hero, ...board])
  const heroCategoryNow = categoryOf(heroNowScore)
  const flop = board.length === 3

  const base = (card: Card) => {
    const after = evaluate([...hero, ...board, card])
    const cat = categoryOf(after)
    const boardCat = categoryOfCards([...board, card])
    return { after, cat, improves: cat > heroCategoryNow && cat > boardCat }
  }

  // --------------------------------------------------------------- improvement-only mode
  if (!req.villain) {
    const cards: CardOutInfo[] = unseenCards.map((card) => {
      const { cat, improves } = base(card)
      const warnings = improves ? dirtyWarnings(board, card, cat) : []
      return {
        card, label: formatCard(card), heroCategoryAfter: cat, heroCategoryName: CATEGORY_NAMES[cat],
        improves, winShare: improves ? 1 : 0,
        status: improves ? (warnings.length ? 'dirty' : 'clean') : 'none',
        warnings,
      }
    })
    const clean = cards.filter((c) => c.status === 'clean').length
    const dirty = cards.filter((c) => c.status === 'dirty').length
    const outs = clean + dirty
    return {
      mode: 'improvement', heroCategoryNow, heroCategoryNowName: CATEGORY_NAMES[heroCategoryNow], unseen, cards,
      cleanOuts: clean, dirtyOuts: dirty, effectiveOuts: outs, behindFraction: NaN,
      exactNextCard: hitNextCard.compute({ outs, unseen }),
      formulaNextCard: hitNextCard.compute({ outs, unseen }),
      formulaByRiver: flop ? hitByRiver.compute({ outs, unseen }) : undefined,
      exactByRiver: flop ? hitByRiver.compute({ outs, unseen }) : undefined,
      ruleOf2: ruleOf2.compute({ outs }),
      ruleOf4: flop ? ruleOf4.compute({ outs }) : undefined,
    }
  }

  // --------------------------------------------------------------- vs villain mode
  const villain = req.villain.filter(
    (wc) => wc.weight > 0 && !known[COMBO_CARDS[2 * wc.combo]] && !known[COMBO_CARDS[2 * wc.combo + 1]],
  )
  if (villain.length === 0) throw new Error('Villain has no possible hands after card removal')

  let totalW = 0
  const behind: WeightedCombo[] = []
  let behindW = 0
  for (const wc of villain) {
    const a = COMBO_CARDS[2 * wc.combo], b = COMBO_CARDS[2 * wc.combo + 1]
    totalW += wc.weight
    if (evaluate([a, b, ...board]) > heroNowScore) { behind.push(wc); behindW += wc.weight }
  }

  const heroAfter = new Map<Card, ReturnType<typeof base>>()
  for (const card of unseenCards) heroAfter.set(card, base(card))

  // Per-card win share against the "ahead" combos, and the exact next-card probability.
  const shareSum = new Float64Array(DECK_SIZE)
  const shareW = new Float64Array(DECK_SIZE)
  let nextCardWin = 0
  for (const wc of behind) {
    const a = COMBO_CARDS[2 * wc.combo], b = COMBO_CARDS[2 * wc.combo + 1]
    let wins = 0
    for (const card of unseenCards) {
      if (card === a || card === b) continue
      const h = heroAfter.get(card)!.after
      const v = evaluate([a, b, ...board, card])
      const r = h > v ? 1 : h === v ? 0.5 : 0
      shareSum[card] += wc.weight * r
      shareW[card] += wc.weight
      wins += r
    }
    nextCardWin += wc.weight * (wins / (unseen - 2))
  }

  const cards: CardOutInfo[] = unseenCards.map((card) => {
    const h = heroAfter.get(card)!
    const winShare = shareW[card] > 0 ? shareSum[card] / shareW[card] : 0
    const status: OutStatus = shareW[card] === 0 ? 'none' : winShare >= 1 - 1e-12 ? 'clean' : winShare > 0 ? 'dirty' : 'none'
    return {
      card, label: formatCard(card), heroCategoryAfter: h.cat, heroCategoryName: CATEGORY_NAMES[h.cat],
      improves: h.improves, winShare, status, warnings: [],
    }
  })
  const clean = cards.filter((c) => c.status === 'clean').length
  const dirty = cards.filter((c) => c.status === 'dirty').length
  const effectiveOuts = cards.reduce((s, c) => s + c.winShare, 0)
  const outs = clean + dirty

  let exactByRiver: number | undefined
  if (flop && behind.length) {
    const res = exactEquity({
      players: [{ combos: [{ combo: comboOf(hero), weight: 1 }] }, { combos: behind }],
      board, dead,
    })
    exactByRiver = res.players[0].equity
  }

  return {
    mode: 'vs-villain', heroCategoryNow, heroCategoryNowName: CATEGORY_NAMES[heroCategoryNow], unseen, cards,
    cleanOuts: clean, dirtyOuts: dirty, effectiveOuts,
    behindFraction: behindW / totalW,
    exactNextCard: behindW ? nextCardWin / behindW : 0,
    exactByRiver: behind.length ? exactByRiver : undefined,
    formulaNextCard: hitNextCard.compute({ outs, unseen }),
    formulaByRiver: flop ? hitByRiver.compute({ outs, unseen }) : undefined,
    ruleOf2: ruleOf2.compute({ outs }),
    ruleOf4: flop ? ruleOf4.compute({ outs }) : undefined,
  }
}

function comboOf(h: [Card, Card]): number {
  return comboIndex(h[0], h[1])
}

/** HEURISTIC warnings for improvement-mode outs (no villain information). */
function dirtyWarnings(board: Card[], card: Card, heroCat: HandCategory): string[] {
  const after = [...board, card]
  const w: string[] = []
  const boardRanks = rankMask(board)
  if (boardRanks & (1 << (card >> 2)) && heroCat < HandCategory.FULL_HOUSE) {
    w.push('Pairs the board: full houses become possible')
  }
  const suitCount = after.filter((c) => suitOf(c) === suitOf(card)).length
  if (suitCount >= 3 && heroCat < HandCategory.FLUSH) w.push('Puts three of a suit on board: flushes become possible')
  if (straightWindowCount(rankMask(after)) >= 3 && straightWindowCount(rankMask(board)) < 3 && heroCat < HandCategory.STRAIGHT) {
    w.push('Makes a straight possible for two-card holdings')
  }
  return w
}
