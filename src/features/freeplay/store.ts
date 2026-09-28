/**
 * Freeplay state (Zustand): the running session, caches of engine results and UI selections.
 * Heavy engine work runs in dedicated workers; results are cached by board / hand.
 */
import { create } from 'zustand'
import type { Session } from './session'
import type { StrengthTable } from '../../engine/game/handStrength'
import type { Weights } from '../../engine/range'
import { EngineClient } from '../../engine/worker/client'
import type { Card } from '../../engine/cards'

export const boardKey = (board: Card[]) => board.join(',')

interface FreeplayState {
  session: Session | null
  /** Strength tables per board. */
  strength: Record<string, StrengthTable>
  /** Hero equity vectors per "heroCards|board". */
  vectors: Record<string, Float64Array>
  /** Selected bet/raise size (street bet level, chips). */
  selectedTo: number | null
  /** Villain seat whose range is being edited (null = closed). */
  estimatorSeat: number | null
  /** Profile id the hero assumes for villains when computing responses from the estimate. */
  assumedProfileId: string
  hudVisible: boolean
  /** Show the true bot-model numbers during the hand (otherwise only in the review). */
  revealModel: boolean
  set: (patch: Partial<FreeplayState>) => void
  setSession: (s: Session | null) => void
  setEstimate: (seat: number, w: Weights) => void
  ensureStrength: (board: Card[]) => Promise<StrengthTable>
  ensureVector: (hero: [Card, Card], board: Card[]) => Promise<Float64Array>
}

// Dedicated workers so bot computations and the HUD never cancel each other.
let strengthWorker: EngineClient | null = null
let vectorWorker: EngineClient | null = null
const strengthClient = { get: () => (strengthWorker ??= new EngineClient()) }
const vectorClient = { get: () => (vectorWorker ??= new EngineClient()) }
const inflight = new Map<string, Promise<unknown>>()

export const useFreeplay = create<FreeplayState>((set, get) => ({
  session: null,
  strength: {},
  vectors: {},
  selectedTo: null,
  estimatorSeat: null,
  assumedProfileId: 'balanced',
  hudVisible: true,
  revealModel: true,
  set: (patch) => set(patch),
  setSession: (session) => set({ session }),
  setEstimate: (seat, w) => {
    const s = get().session
    if (!s) return
    const estimates = [...s.estimates]
    estimates[seat] = w
    set({ session: { ...s, estimates } })
  },
  ensureStrength: async (board) => {
    const key = boardKey(board)
    const have = get().strength[key]
    if (have) return have
    const k = `s:${key}`
    let p = inflight.get(k) as Promise<StrengthTable> | undefined
    if (!p) {
      // Chain strength jobs so a new request does not cancel the one in progress.
      p = queue(() => strengthClient.get().strength(board))
      inflight.set(k, p)
    }
    const t = await p
    inflight.delete(k)
    set({ strength: { ...get().strength, [key]: t } })
    return t
  },
  ensureVector: async (hero, board) => {
    const key = `${hero.join(',')}|${boardKey(board)}`
    const have = get().vectors[key]
    if (have) return have
    const k = `v:${key}`
    let p = inflight.get(k) as Promise<Float64Array> | undefined
    if (!p) {
      p = queueV(() => vectorClient.get().equityVector(hero, board))
      inflight.set(k, p)
    }
    const v = await p
    inflight.delete(k)
    set({ vectors: { ...get().vectors, [key]: v } })
    return v
  },
}))

let chainS: Promise<unknown> = Promise.resolve()
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chainS.then(fn)
  chainS = p.catch(() => {})
  return p
}
let chainV: Promise<unknown> = Promise.resolve()
function queueV<T>(fn: () => Promise<T>): Promise<T> {
  const p = chainV.then(fn)
  chainV = p.catch(() => {})
  return p
}

export function vectorKey(hero: Card[], board: Card[]): string {
  return `${hero.join(',')}|${boardKey(board)}`
}
