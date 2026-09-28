/// <reference lib="webworker" />
/**
 * Engine worker: runs heavy computations off the UI thread.
 * Cancellation is done by the client terminating the worker (loops here are synchronous).
 */
import { calculateEquity } from '../equity'
import { solvePushFold } from '../pushfold'
import { simulateVariance } from '../variance'
import { equityVector } from '../game/decision'
import { strengthTable } from '../game/handStrength'
import type { WorkerRequest, WorkerResponse } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, job } = ev.data
  const post = (msg: WorkerResponse) => ctx.postMessage(msg)
  try {
    switch (job.kind) {
      case 'equity': {
        const result = calculateEquity({
          players: job.players,
          board: job.board,
          dead: job.dead,
          method: job.method,
          iterations: job.iterations,
          maxExactEvaluations: job.maxExactEvaluations,
          seed: job.seed,
          onProgress: (p) => post({ id, type: 'progress', fraction: p.fraction, partial: p.partial }),
        })
        post({ id, type: 'result', result })
        break
      }
      case 'variance': {
        post({ id, type: 'result', result: simulateVariance(job) })
        break
      }
      case 'equityVector': {
        post({ id, type: 'result', result: equityVector(job.hero, job.board, job.dead) })
        break
      }
      case 'strength': {
        post({ id, type: 'result', result: strengthTable(job.board) })
        break
      }
      case 'pushFold': {
        post({ id, type: 'result', result: solvePushFold(job) })
        break
      }
    }
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
