/**
 * Card representation.
 *
 * A card is a small integer 0..51:  card = rank * 4 + suit
 *   rank: 0 = deuce, 1 = three, ..., 8 = ten, 9 = jack, 10 = queen, 11 = king, 12 = ace
 *   suit: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
 *
 * Integers keep the hot loops (evaluation, enumeration) allocation-free.
 * Text form is the usual two-character notation: rank char + suit char, e.g. "Ah", "Td", "2c".
 */

export type Card = number

export const RANK_CHARS = '23456789TJQKA'
export const SUIT_CHARS = 'cdhs'
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const
export const RANK_NAMES = [
  'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace',
] as const

export const NUM_RANKS = 13
export const NUM_SUITS = 4
export const DECK_SIZE = 52

export const ACE = 12
export const KING = 11
export const QUEEN = 10
export const JACK = 9
export const TEN = 8

export const rankOf = (c: Card): number => c >> 2
export const suitOf = (c: Card): number => c & 3
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit

export function rankFromChar(ch: string): number {
  const r = RANK_CHARS.indexOf(ch.toUpperCase())
  if (r < 0) throw new Error(`Invalid rank character "${ch}"`)
  return r
}

export function suitFromChar(ch: string): number {
  const s = SUIT_CHARS.indexOf(ch.toLowerCase())
  if (s < 0) throw new Error(`Invalid suit character "${ch}"`)
  return s
}

/** Parse a single card like "Ah" or "tc" (case-insensitive rank, lower/upper suit). */
export function parseCard(text: string): Card {
  const t = text.trim()
  if (t.length !== 2) throw new Error(`Invalid card "${text}"`)
  return makeCard(rankFromChar(t[0]), suitFromChar(t[1]))
}

/**
 * Parse a run of cards: "AhKd", "Ah Kd 7c", "Ah,Kd,7c".
 * Throws on duplicates, because a duplicated card is always a user input error.
 */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, '')
  if (compact.length % 2 !== 0) throw new Error(`Invalid card list "${text}"`)
  const cards: Card[] = []
  for (let i = 0; i < compact.length; i += 2) cards.push(parseCard(compact.slice(i, i + 2)))
  assertDistinct(cards)
  return cards
}

export function formatCard(c: Card): string {
  return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)]
}

export function formatCards(cards: readonly Card[], sep = ''): string {
  return cards.map(formatCard).join(sep)
}

export function assertDistinct(cards: readonly Card[]): void {
  const seen = new Set<number>()
  for (const c of cards) {
    if (c < 0 || c > 51 || !Number.isInteger(c)) throw new Error(`Invalid card value ${c}`)
    if (seen.has(c)) throw new Error(`Duplicate card ${formatCard(c)}`)
    seen.add(c)
  }
}

/** A full 52-card deck in canonical order. */
export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i)
}

/** Deck minus the given dead cards, preserving canonical order. */
export function remainingDeck(dead: readonly Card[]): Card[] {
  const isDead = new Uint8Array(DECK_SIZE)
  for (const c of dead) isDead[c] = 1
  const out: Card[] = []
  for (let c = 0; c < DECK_SIZE; c++) if (!isDead[c]) out.push(c)
  return out
}

/** Boolean lookup of dead cards, for fast membership tests in loops. */
export function deadFlags(dead: readonly Card[]): Uint8Array {
  const f = new Uint8Array(DECK_SIZE)
  for (const c of dead) f[c] = 1
  return f
}
