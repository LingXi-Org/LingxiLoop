/**
 * HttpHostClient — the worker-side HostPort implementation over the control
 * plane's HTTP API.
 *
 * Retry discipline: only idempotent-by-construction calls are retried
 * (everything here is: lease proofs make mutations fenced, events dedupe on
 * seq, actions dedupe on idempotency key). Lease-invalid responses (409) are
 * surfaced as {@link LeaseLostError} so the runtime can stop cleanly.
 */
import { AgentOSError, LeaseLostError, errorMessage } from '../errors.js'
import type {
  AssistantMessage, HeartbeatResult, HostAction, HostActionResult,
  RunEvent, SessionRecord, TurnContext, WorkCompletion, WorkItem,
} from '../protocol/types.js'
import type { HostPort } from './port.js'

export interface HttpHostClientOptions {
  baseUrl: string
  serviceToken: string
  workerId: string
  requestTimeoutMs?: number
  maxAttempts?: number
  retryBaseMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export class HostRequestError extends AgentOSError {
  constructor(readonly status: number, message: string) {
    super('host_request', message)
  }
}

export class HttpHostClient implements HostPort {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly retryBaseMs: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly options: HttpHostClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.requestTimeoutMs ?? 30_000
    this.maxAttempts = options.maxAttempts ?? 3
    this.retryBaseMs = options.retryBaseMs ?? 250
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)))
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      signal?.throwIfAborted()
      const timeout = AbortSignal.timeout(this.timeoutMs)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      let response: Response
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.options.serviceToken}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: combined,
        })
      } catch (error) {
        signal?.throwIfAborted()
        lastError = error
        if (attempt < this.maxAttempts) {
          await this.sleep(this.retryBaseMs * 2 ** (attempt - 1))
          continue
        }
        break
      }
      if (response.ok) return await response.json() as T
      const detail = await response.text().catch(() => '')
      let message = detail
      try {
        const parsed = JSON.parse(detail) as { error?: unknown }
        if (typeof parsed.error === 'string') message = parsed.error
      } catch { /* plain-text error body */ }
      if (response.status === 409) throw new LeaseLostError(message || 'lease rejected by control plane')
      if (response.status >= 500 && attempt < this.maxAttempts) {
        lastError = new HostRequestError(response.status, message)
        await this.sleep(this.retryBaseMs * 2 ** (attempt - 1))
        continue
      }
      throw new HostRequestError(response.status, message || `control plane returned ${response.status}`)
    }
    throw new HostRequestError(0, `control plane unreachable after ${this.maxAttempts} attempts: ${errorMessage(lastError)}`)
  }

  private proof(work: WorkItem): { fence: number; leaseToken: string } {
    return { fence: work.fence, leaseToken: work.leaseToken }
  }

  async claimWork(signal?: AbortSignal): Promise<WorkItem | null> {
    return this.request<WorkItem | null>('POST', '/v2/work/claim', { workerId: this.options.workerId }, signal)
  }

  async heartbeat(work: WorkItem): Promise<HeartbeatResult> {
    return this.request<HeartbeatResult>('POST', `/v2/work/${encodeURIComponent(work.id)}/heartbeat`, this.proof(work))
  }

  async loadContext(work: WorkItem): Promise<TurnContext> {
    const query = new URLSearchParams({ fence: String(work.fence), leaseToken: work.leaseToken })
    const context = await this.request<TurnContext>('GET', `/v2/work/${encodeURIComponent(work.id)}/context?${query}`)
    // The wire strips the lease token from the embedded work item; restore it.
    context.work = { ...context.work, leaseToken: work.leaseToken, homeEpoch: work.homeEpoch }
    return context
  }

  async executeAction(work: WorkItem, action: HostAction): Promise<HostActionResult> {
    return this.request<HostActionResult>('POST', `/v2/work/${encodeURIComponent(work.id)}/actions`, {
      ...this.proof(work), action,
    })
  }

  async emitEvent(work: WorkItem, event: RunEvent): Promise<void> {
    await this.request('POST', `/v2/work/${encodeURIComponent(work.id)}/events`, { ...this.proof(work), event })
  }

  async loadSession(_work: WorkItem, key: string): Promise<SessionRecord | null> {
    const payload = await this.request<{ session: SessionRecord | null }>('GET', `/v2/sessions/${encodeURIComponent(key)}`)
    return payload.session
  }

  async saveSession(work: WorkItem, session: SessionRecord): Promise<void> {
    const saved = await this.request<{ revision: number }>('PUT', '/v2/sessions', {
      workId: work.id, ...this.proof(work), session,
    })
    session.revision = saved.revision
  }

  async commitMessage(work: WorkItem, message: AssistantMessage): Promise<void> {
    await this.request('POST', `/v2/work/${encodeURIComponent(work.id)}/messages`, { ...this.proof(work), message })
  }

  async completeWork(work: WorkItem, completion: WorkCompletion): Promise<void> {
    await this.request('POST', `/v2/work/${encodeURIComponent(work.id)}/complete`, { ...this.proof(work), ...completion })
  }

  async yieldWork(work: WorkItem): Promise<void> {
    await this.request('POST', `/v2/work/${encodeURIComponent(work.id)}/yield`, this.proof(work))
  }
}
