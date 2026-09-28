/** Messages between the UI thread and the engine worker. Only structured-clone-safe data. */
import type { EquityMethod, EquityResult } from '../equity'
import type { WeightedCombo } from '../range'
import type { Card } from '../cards'

export interface EquityJob {
  kind: 'equity'
  players: { combos: WeightedCombo[] }[]
  board: Card[]
  dead: Card[]
  method: EquityMethod
  iterations?: number
  maxExactEvaluations?: number
  seed?: number
}

export type WorkerRequest = { id: number; job: EquityJob }

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number; partial?: EquityResult }
  | { id: number; type: 'result'; result: EquityResult }
  | { id: number; type: 'error'; message: string }
