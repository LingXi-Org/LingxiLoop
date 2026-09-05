import { notifyOperationalAlert } from '../../alerting.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { inc } from '../../metrics.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { storage } from '../../storage.js'
import { formatAddress, normalizeMessageId, parseAddress } from './addressing.js'
import { listReferencedEmailAttachmentKeys } from './attachment-repository.js'
import type { EmailRetryCandidate } from './contracts.js'
import { EmailGcApplication } from './gc-application.js'
import { sendViaProvider } from './provider.js'
import { EmailRetryApplication } from './retry-application.js'
import {
  claimDueEmailRetries,
  findEmailRetryAttachments,
  markEmailRetryFailed,
  markEmailRetrySent,
} from './retry-repository.js'

const retryApplication = new EmailRetryApplication({
  claim: (limit) => withTransaction(pool, (client) => claimDueEmailRetries(client, limit)),
  findAttachments: (companyId, messageId) => findEmailRetryAttachments(pool, companyId, messageId),
  resolveAttachment: (storageKey) => storage.publicUrl(storageKey),
  normalizeFromAddress: (value) => {
    const parsed = parseAddress(value)
    return parsed ? formatAddress(parsed.addr, parsed.name) : value
  },
  normalizeMessageId,
  send: sendViaProvider,
  markSent: (input) => markEmailRetrySent(pool, input),
  markFailed: (input) => markEmailRetryFailed(pool, input),
  metric: (name) => inc(name),
  terminalAlert: async (candidate, error) => {
    await notifyOperationalAlert({
      title: 'email retry: terminal failure (message lost)',
      detail: `message_id=\`${candidate.messageId}\`\ncompany=\`${candidate.companyId}\`\nsubject=${candidate.subject.slice(0, 100)}\nerror: ${(error ?? '').slice(0, 800)}`,
      level: 'error',
    })
  },
  unexpected: (candidate: EmailRetryCandidate, error: unknown) => {
    console.error(`[email-retry] unexpected failure for ${candidate.companyId}/${candidate.messageId}:`, error)
  },
  now: Date.now,
})

const gcApplication = new EmailGcApplication({
  listStorage: (prefix) => storage.listObjectsByPrefix(prefix),
  listReferencedKeys: () => listReferencedEmailAttachmentKeys(pool),
  deleteObject: (key) => storage.deleteObject(key),
  metric: (name) => inc(name),
  now: Date.now,
})

export async function runEmailRetryTick(maxBatch = 16): Promise<{ attempted: number }> {
  return retryApplication.run(maxBatch)
}

export async function runEmailGcTick(): Promise<{ inspected: number; deleted: number; failed: number }> {
  return gcApplication.run()
}

function startIntervalWorker(args: {
  name: string
  intervalMs: number
  run(): Promise<unknown>
}): WorkerTaskHandle | null {
  if (intervalTimers.has(args.name)) {
    return { stop: () => stopIntervalWorker(args.name) }
  }
  if (args.intervalMs <= 0) {
    console.log(`[${args.name}] disabled`)
    return null
  }
  const timer = setInterval(() => {
    void args.run().catch((error) => {
      console.error(`[${args.name}] tick failed:`, error instanceof Error ? error.message : error)
    })
  }, args.intervalMs)
  intervalTimers.set(args.name, timer)
  return { stop: () => stopIntervalWorker(args.name) }
}

const intervalTimers = new Map<string, NodeJS.Timeout>()

function stopIntervalWorker(name: string): void {
  const timer = intervalTimers.get(name)
  if (!timer) return
  clearInterval(timer)
  intervalTimers.delete(name)
}

export function startEmailRetryWorker(): WorkerTaskHandle | null {
  return startIntervalWorker({
    name: 'email-retry',
    intervalMs: env.EMAIL_RETRY_INTERVAL_MS,
    run: () => runEmailRetryTick(),
  })
}

export function startEmailGcWorker(): WorkerTaskHandle | null {
  return startIntervalWorker({
    name: 'email-gc',
    intervalMs: env.EMAIL_GC_INTERVAL_MS,
    run: () => runEmailGcTick(),
  })
}
