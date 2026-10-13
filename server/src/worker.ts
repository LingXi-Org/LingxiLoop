import { closeDatabasePools } from './db/pool.js'
import { startDbGcWorker } from './db-gc.js'
import { env } from './env.js'
import { reconcileImChannels, startImChannelReconciliation } from './im/reconcile.js'
import { startAttentionProjectionWorker } from './modules/attention/public.js'
import { startTeacherBriefingWorker } from './modules/briefings/public.js'
import { startCompanyOnboardingEffectWorker } from './modules/companies/worker.js'
import { startDocumentMentionDeliveryWorker } from './modules/documents/worker.js'
import { startEducationContractExpiryWorker } from './modules/education/public.js'
import { startKnowledgeStorageGc, startKnowledgeWorker } from './modules/knowledge/worker.js'
import { startLearningEffectWorker } from './modules/learning/worker.js'
import { startNotificationScheduler } from './modules/notifications/public.js'
import { startPollExpirationSweeper } from './modules/polls/index.js'
import { startPresentationStorageGc, startPresentationWorker } from './modules/presentations/public.js'
import { redis, sub } from './redis.js'
import { Lifecycle, type ServiceHandle, startWorkerTasks, type WorkerTaskDefinition, type WorkerTaskHandle } from './runtime/lifecycle.js'
import { initializeNativeStorage } from './storage.js'
import { startLingxiOSWorker } from './agent-runtime/runtime.js'
import { startAgentIngressRetry } from './agent-runtime/ingress.js'
import { startNativeEventWorker } from './agents/native-event-worker.js'

/**
 * Concurrency is part of each task's contract, rather than an accidental
 * consequence of the number of Web replicas:
 * - queue-claim: work is leased/claimed in PostgreSQL;
 * - database-lock: a row/advisory lock elects the active tick;
 * - idempotent: duplicate ticks converge on the same durable state;
 */
export const productionWorkerTasks: readonly WorkerTaskDefinition[] = [
  { name: 'agent-native-events', concurrency: 'queue-claim', start: startNativeEventWorker },
  { name: 'attention-projection', concurrency: 'database-lock', start: () => startAttentionProjectionWorker() },
  { name: 'teacher-briefings', concurrency: 'queue-claim', start: () => startTeacherBriefingWorker() },
  { name: 'notifications', concurrency: 'queue-claim', start: () => startNotificationScheduler() },
  { name: 'learning-effects', concurrency: 'queue-claim', start: () => startLearningEffectWorker() },
  { name: 'company-onboarding-effects', concurrency: 'queue-claim', start: () => startCompanyOnboardingEffectWorker() },
  { name: 'im-channel-reconciliation', concurrency: 'idempotent', start: () => startImChannelReconciliation() },
  { name: 'document-mention-delivery', concurrency: 'queue-claim', start: () => startDocumentMentionDeliveryWorker() },
  { name: 'education-contract-expiry', concurrency: 'queue-claim', start: () => startEducationContractExpiryWorker() },
  { name: 'database-gc', concurrency: 'idempotent', start: () => startDbGcWorker() },
  { name: 'knowledge-ingestion', concurrency: 'queue-claim', start: () => startKnowledgeWorker() },
  { name: 'knowledge-storage-gc', concurrency: 'idempotent', start: () => startKnowledgeStorageGc() },
  { name: 'presentation-generation', concurrency: 'queue-claim', start: () => startPresentationWorker() },
  { name: 'presentation-storage-gc', concurrency: 'idempotent', start: () => startPresentationStorageGc() },
  { name: 'poll-expiration', concurrency: 'database-lock', start: () => startPollExpirationSweeper(env.POLL_SWEEP_INTERVAL_MS) },
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
  startAgentRuntime?: () => Promise<WorkerTaskHandle | null>
  startAgentIngress?: () => WorkerTaskHandle | null
}

export async function startWorkerProcess(options: WorkerProcessOptions = {}): Promise<ServiceHandle> {
  const tasks = options.tasks ?? productionWorkerTasks
  const prepare = options.prepare ?? prepareWorkerData
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('postgres', options.closePostgres ?? (() => closeDatabasePools()))
  lifecycle.addDisposer('redis', options.closeRedis ?? (() => { sub.disconnect(); redis.disconnect() }))

  try {
    const initializeStorage = options.initializeStorage ?? initializeNativeStorage
    initializeStorage()
    await prepare()
    lifecycle.add('lingxios-agent-runtime', await (options.startAgentRuntime ?? startLingxiOSWorker)())
    lifecycle.add('lingxios-ingress-retry', (options.startAgentIngress ?? startAgentIngressRetry)())
    startWorkerTasks(lifecycle, tasks)
    console.log(`[worker] ready · tasks=${tasks.length}`)
    return lifecycle
  } catch (error) {
    await lifecycle.stop('startup-failure').catch(() => undefined)
    throw error
  }
}
