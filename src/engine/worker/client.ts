/**
 * Promise-based client for the engine worker.
 * One job at a time per client; starting a job cancels the previous one.
 * `cancel()` terminates the worker; a fresh one is spawned lazily on the next job.
 */
import type { EquityResult } from '../equity'
import type { EquityJob, Job, JobResultMap, PushFoldJob, WorkerResponse } from './protocol'

export interface RunOptions<P = unknown> {
  onProgress?: (fraction: number, partial?: P) => void
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
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

  run<K extends Job['kind']>(job: Extract<Job, { kind: K }>, opts: RunOptions = {}): Promise<JobResultMap[K]> {
    this.cancel()
    const worker = this.getWorker()
    const id = this.nextId++
    return new Promise<JobResultMap[K]>((resolve, reject) => {
      this.pending = { id, reject }
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data
        if (msg.id !== id) return
        if (msg.type === 'progress') opts.onProgress?.(msg.fraction, msg.partial)
        else if (msg.type === 'result') { this.pending = null; resolve(msg.result as JobResultMap[K]) }
        else { this.pending = null; reject(new Error(msg.message)) }
      }
      worker.onerror = (e) => { this.pending = null; reject(new Error(e.message || 'Worker error')) }
      worker.postMessage({ id, job })
    })
  }

  equity(job: Omit<EquityJob, 'kind'>, opts: RunOptions<EquityResult> = {}): Promise<EquityResult> {
    return this.run({ kind: 'equity', ...job }, opts as RunOptions)
  }

  pushFold(job: Omit<PushFoldJob, 'kind'>) {
    return this.run({ kind: 'pushFold', ...job })
  }

  get busy(): boolean {
    return this.pending !== null
  }

  /** Abort the running job (if any). Its promise rejects with CancelledError. */
  cancel(): void {
    if (this.pending) {
      this.pending.reject(new CancelledError())
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
