import { startMemorySynthesisScheduler } from './agent-os/memory-service.js'
import { startLearningRoutineScheduler } from './agent-os/routine-scheduler.js'
import { startAgentWorkWatchdog } from './agent-os/work-watchdog.js'
import { startStaleAgentRunSweeper } from './agents/observability.js'
import { pool } from './db/pool.js'
import { startDbGcWorker } from './db-gc.js'
import { env } from './env.js'
import { reconcileImChannels, startImChannelReconciliation } from './im/reconcile.js'
import { startCalendarScheduler } from './modules/calendar/index.js'
import { startAttentionProjectionWorker } from './modules/attention/public.js'
import { startCompanyOnboardingEffectWorker } from './modules/companies/worker.js'
import { startDocumentMentionDeliveryWorker } from './modules/documents/worker.js'
import { startEmailGcWorker, startEmailRetryWorker } from './modules/email/worker.js'
import { startKnowledgeStorageGc, startKnowledgeWorker } from './modules/knowledge/worker.js'
import { startLearningEffectWorker } from './modules/learning/worker.js'
import { startNotificationScheduler } from './modules/notifications/public.js'
import { startPollExpirationSweeper } from './modules/polls/index.js'
import { redis, sub } from './redis.js'
import { Lifecycle, type ServiceHandle, startWorkerTasks, type WorkerTaskDefinition } from './runtime/lifecycle.js'
import { initializeNativeStorage } from './storage.js'

/**
 * Concurrency is part of each task's contract, rather than an accidental
 * consequence of the number of Web replicas:
 * - queue-claim: work is leased/claimed in PostgreSQL;
 * - database-lock: a row/advisory lock elects the active tick;
 * - idempotent: duplicate ticks converge on the same durable state;
 */
export const productionWorkerTasks: readonly WorkerTaskDefinition[] = [
  { name: 'attention-projection', concurrency: 'database-lock', start: () => startAttentionProjectionWorker() },
  { name: 'learning-routines', concurrency: 'queue-claim', start: () => startLearningRoutineScheduler() },
  { name: 'notifications', concurrency: 'queue-claim', start: () => startNotificationScheduler() },
  { name: 'learning-effects', concurrency: 'queue-claim', start: () => startLearningEffectWorker() },
  { name: 'company-onboarding-effects', concurrency: 'queue-claim', start: () => startCompanyOnboardingEffectWorker() },
  { name: 'im-channel-reconciliation', concurrency: 'idempotent', start: () => startImChannelReconciliation() },
  { name: 'agent-work-watchdog', concurrency: 'idempotent', start: () => startAgentWorkWatchdog() },
  { name: 'memory-synthesis', concurrency: 'idempotent', start: () => startMemorySynthesisScheduler() },
  { name: 'email-retry', concurrency: 'queue-claim', start: () => startEmailRetryWorker() },
  { name: 'email-storage-gc', concurrency: 'idempotent', start: () => startEmailGcWorker() },
  { name: 'document-mention-delivery', concurrency: 'queue-claim', start: () => startDocumentMentionDeliveryWorker() },
  { name: 'database-gc', concurrency: 'idempotent', start: () => startDbGcWorker() },
  { name: 'knowledge-ingestion', concurrency: 'queue-claim', start: () => startKnowledgeWorker() },
  { name: 'knowledge-storage-gc', concurrency: 'idempotent', start: () => startKnowledgeStorageGc() },
  { name: 'calendar-dispatch', concurrency: 'idempotent', start: () => startCalendarScheduler() },
  { name: 'poll-expiration', concurrency: 'database-lock', start: () => startPollExpirationSweeper(env.POLL_SWEEP_INTERVAL_MS) },
  ...(process.env.ENABLE_AGENT_RUN_SWEEPER === 'false' ? [] : [
    { name: 'stale-agent-runs', concurrency: 'idempotent' as const, start: () => startStaleAgentRunSweeper() },
  ]),
]

async function prepareWorkerData(): Promise<void> {
  const { channels, failures } = await reconcileImChannels()
  console.log(`[worker] reconciled ${channels - failures}/${channels} IM channels`)
}

export interface WorkerProcessOptions {
  tasks?: readonly WorkerTaskDefinition[]
  prepare?: () => Promise<void>
  closePostgres?: () => void | Promise<void>
  closeRedis?: () => void | Promise<void>
  initializeStorage?: () => void
}

export async function startWorkerProcess(options: WorkerProcessOptions = {}): Promise<ServiceHandle> {
  const tasks = options.tasks ?? productionWorkerTasks
  const prepare = options.prepare ?? prepareWorkerData
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('postgres', options.closePostgres ?? (() => pool.end()))
  lifecycle.addDisposer('redis', options.closeRedis ?? (() => { sub.disconnect(); redis.disconnect() }))

  try {
    const initializeStorage = options.initializeStorage ?? initializeNativeStorage
    initializeStorage()
    await prepare()
    startWorkerTasks(lifecycle, tasks)
    console.log(`[worker] ready · tasks=${tasks.length}`)
    return lifecycle
  } catch (error) {
    await lifecycle.stop('startup-failure').catch(() => undefined)
    throw error
  }
}
