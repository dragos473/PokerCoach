/** Messages between the UI thread and the engine worker. Only structured-clone-safe data. */
import type { EquityMethod, EquityResult } from '../equity'
import type { WeightedCombo } from '../range'
import type { Card } from '../cards'
import type { PushFoldInput, PushFoldResult } from '../pushfold'

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

export interface PushFoldJob extends PushFoldInput {
  kind: 'pushFold'
}

export type Job = EquityJob | PushFoldJob

export interface JobResultMap {
  equity: EquityResult
  pushFold: PushFoldResult
}

export type WorkerRequest = { id: number; job: Job }

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number; partial?: unknown }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string }
