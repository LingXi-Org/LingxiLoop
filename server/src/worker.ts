import { startMemorySynthesisScheduler } from './agent-os/memory-service.js'
import { startLearningRoutineScheduler } from './agent-os/routine-scheduler.js'
import { startAgentWorkWatchdog } from './agent-os/work-watchdog.js'
import { startLlmRollupRefresher } from './agents/llm-rollup.js'
import { startStaleAgentRunSweeper } from './agents/observability.js'
import { seedAdmins } from './admin.js'
import { startCalendarScheduler } from './calendar.js'
import { startDbGcWorker } from './db-gc.js'
import { pool } from './db/pool.js'
import { startEmailGcWorker } from './email-gc.js'
import { startEmailRetryWorker } from './email-retry.js'
import { env } from './env.js'
import { reconcileLearningChannels } from './im/reconcile.js'
import { startKnowledgeStorageGc, startKnowledgeWorker } from './knowledge/service.js'
import { startLearningNotificationScheduler } from './learning/notifications.js'
import { startPollExpirationSweeper } from './polls.js'
import { redis, sub } from './redis.js'
import { Lifecycle, startWorkerTasks, type ServiceHandle, type WorkerTaskDefinition } from './runtime/lifecycle.js'
import { seedIfEmpty } from './seed.js'

/**
 * Concurrency is part of each task's contract, rather than an accidental
 * consequence of the number of Web replicas:
 * - queue-claim: work is leased/claimed in PostgreSQL;
 * - database-lock: a row/advisory lock elects the active tick;
 * - idempotent: duplicate ticks converge on the same durable state;
 */
export const productionWorkerTasks: readonly WorkerTaskDefinition[] = [
  { name: 'learning-routines', concurrency: 'queue-claim', start: () => startLearningRoutineScheduler() },
  { name: 'learning-notifications', concurrency: 'queue-claim', start: () => startLearningNotificationScheduler() },
  { name: 'agent-work-watchdog', concurrency: 'idempotent', start: () => startAgentWorkWatchdog() },
  { name: 'memory-synthesis', concurrency: 'idempotent', start: () => startMemorySynthesisScheduler() },
  { name: 'email-retry', concurrency: 'queue-claim', start: () => startEmailRetryWorker() },
  { name: 'email-storage-gc', concurrency: 'idempotent', start: () => startEmailGcWorker() },
  { name: 'database-gc', concurrency: 'idempotent', start: () => startDbGcWorker() },
  { name: 'knowledge-ingestion', concurrency: 'queue-claim', start: () => startKnowledgeWorker() },
  { name: 'knowledge-storage-gc', concurrency: 'idempotent', start: () => startKnowledgeStorageGc() },
  { name: 'calendar-dispatch', concurrency: 'idempotent', start: () => startCalendarScheduler() },
  { name: 'poll-expiration', concurrency: 'database-lock', start: () => startPollExpirationSweeper(env.POLL_SWEEP_INTERVAL_MS) },
  { name: 'llm-rollup', concurrency: 'database-lock', start: () => startLlmRollupRefresher() },
  ...(process.env.ENABLE_AGENT_RUN_SWEEPER === 'false' ? [] : [
    { name: 'stale-agent-runs', concurrency: 'idempotent' as const, start: () => startStaleAgentRunSweeper() },
  ]),
]

async function prepareWorkerData(): Promise<void> {
  await seedIfEmpty()
  await seedAdmins()
  const { channels, failures } = await reconcileLearningChannels()
  console.log(`[worker] reconciled ${channels - failures}/${channels} learning channels`)
}

export interface WorkerProcessOptions {
  tasks?: readonly WorkerTaskDefinition[]
  prepare?: () => Promise<void>
  closePostgres?: () => void | Promise<void>
  closeRedis?: () => void | Promise<void>
}

export async function startWorkerProcess(options: WorkerProcessOptions = {}): Promise<ServiceHandle> {
  const tasks = options.tasks ?? productionWorkerTasks
  const prepare = options.prepare ?? prepareWorkerData
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('postgres', options.closePostgres ?? (() => pool.end()))
  lifecycle.addDisposer('redis', options.closeRedis ?? (() => { sub.disconnect(); redis.disconnect() }))

  try {
    await prepare()
    startWorkerTasks(lifecycle, tasks)
    console.log(`[worker] ready · tasks=${tasks.length}`)
    return lifecycle
  } catch (error) {
    await lifecycle.stop('startup-failure').catch(() => undefined)
    throw error
  }
}
