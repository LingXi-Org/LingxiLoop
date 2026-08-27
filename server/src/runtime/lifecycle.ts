export interface ServiceHandle {
  stop(reason?: string): Promise<void>
}

export interface WorkerTaskHandle {
  stop(): void | Promise<void>
}

export type WorkerConcurrency = 'queue-claim' | 'database-lock' | 'idempotent'

export interface WorkerTaskDefinition {
  name: string
  concurrency: WorkerConcurrency
  start(): WorkerTaskHandle | null
}

export function startWorkerTasks(lifecycle: Lifecycle, tasks: readonly WorkerTaskDefinition[]): void {
  for (const task of tasks) {
    const handle = task.start()
    if (!handle) {
      console.log(`[worker] ${task.name} disabled`)
      continue
    }
    lifecycle.add(task.name, handle)
    console.log(`[worker] ${task.name} started · concurrency=${task.concurrency}`)
  }
}

/** Owns every resource opened by a process and closes them in reverse order. */
export class Lifecycle implements ServiceHandle {
  readonly #disposers: Array<{ name: string; stop: () => void | Promise<void> }> = []
  #stopping: Promise<void> | null = null

  add(name: string, handle: WorkerTaskHandle | null): void {
    if (handle) this.#disposers.push({ name, stop: () => handle.stop() })
  }

  addDisposer(name: string, stop: () => void | Promise<void>): void {
    this.#disposers.push({ name, stop })
  }

  stop(reason = 'shutdown'): Promise<void> {
    if (this.#stopping) return this.#stopping
    this.#stopping = this.#stopAll(reason)
    return this.#stopping
  }

  async #stopAll(reason: string): Promise<void> {
    console.log(`[lifecycle] stopping (${reason})`)
    const failures: unknown[] = []
    for (const entry of [...this.#disposers].reverse()) {
      try { await entry.stop() }
      catch (error) {
        failures.push(error)
        console.error(`[lifecycle] failed to stop ${entry.name}:`, error)
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'one or more resources failed to stop')
  }
}
