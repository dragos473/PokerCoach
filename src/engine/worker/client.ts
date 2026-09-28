/**
 * Promise-based client for the engine worker.
 * One job at a time per client; `cancel()` terminates the worker and spawns a fresh one lazily.
 */
import type { EquityResult } from '../equity'
import type { EquityJob, WorkerResponse } from './protocol'

export interface RunOptions {
  onProgress?: (fraction: number, partial?: EquityResult) => void
}

export class EngineClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending: { id: number; reject: (e: Error) => void } | null = null

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    }
    return this.worker
  }

  equity(job: Omit<EquityJob, 'kind'>, opts: RunOptions = {}): Promise<EquityResult> {
    this.cancel()
    const worker = this.getWorker()
    const id = this.nextId++
    return new Promise<EquityResult>((resolve, reject) => {
      this.pending = { id, reject }
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data
        if (msg.id !== id) return
        if (msg.type === 'progress') opts.onProgress?.(msg.fraction, msg.partial)
        else if (msg.type === 'result') { this.pending = null; resolve(msg.result) }
        else { this.pending = null; reject(new Error(msg.message)) }
      }
      worker.postMessage({ id, job: { kind: 'equity', ...job } })
    })
  }

  /** Abort the running job (if any). The promise rejects with an AbortError-like error. */
  cancel(): void {
    if (this.pending) {
      this.pending.reject(new Error('cancelled'))
      this.pending = null
      this.worker?.terminate()
      this.worker = null
    }
  }

  dispose(): void {
    this.cancel()
    this.worker?.terminate()
    this.worker = null
  }
}
