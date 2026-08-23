import type {
  AgentContext,
  AgentRunEvent,
  AgentSessionRecord,
  AgentWorkItem,
  HostAction,
  HostActionResult,
  HostHeartbeat,
  LingxiMessageV1,
} from './types.js'

export interface AgentOSHostAdapter {
  claimWork(signal?: AbortSignal): Promise<AgentWorkItem | null>
  heartbeat(work: AgentWorkItem): Promise<HostHeartbeat>
  loadContext(work: AgentWorkItem): Promise<AgentContext>
  loadSession(key: string): Promise<AgentSessionRecord | null>
  saveSession(session: AgentSessionRecord): Promise<void>
  executeAction(work: AgentWorkItem, action: HostAction): Promise<HostActionResult>
  emitEvent(work: AgentWorkItem, event: AgentRunEvent): Promise<void>
  commitMessage(work: AgentWorkItem, message: LingxiMessageV1): Promise<void>
  completeWork(work: AgentWorkItem, outcome: { status: 'completed' | 'failed' | 'cancelled'; error?: string }): Promise<void>
}

interface HttpHostOptions {
  baseUrl: string
  serviceToken: string
  workerId: string
}

export class HttpHostAdapter implements AgentOSHostAdapter {
  constructor(private readonly options: HttpHostOptions) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.serviceToken}`,
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Agent OS host ${path} returned ${response.status}: ${detail.slice(0, 500)}`)
    }
    return await response.json() as T
  }

  claimWork(signal?: AbortSignal): Promise<AgentWorkItem | null> {
    return this.request('/internal/agent-os/work/claim', {
      method: 'POST', body: JSON.stringify({ workerId: this.options.workerId }), signal,
    })
  }

  heartbeat(work: AgentWorkItem): Promise<HostHeartbeat> {
    return this.request<HostHeartbeat>(`/internal/agent-os/work/${encodeURIComponent(work.id)}/heartbeat`, {
      method: 'POST', body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken }),
    })
  }

  loadContext(work: AgentWorkItem): Promise<AgentContext> {
    return this.request(`/internal/agent-os/work/${encodeURIComponent(work.id)}/context?fence=${work.fence}&leaseToken=${encodeURIComponent(work.leaseToken)}`)
  }

  loadSession(key: string): Promise<AgentSessionRecord | null> {
    return this.request<{ session: AgentSessionRecord | null }>(`/internal/agent-os/sessions/${encodeURIComponent(key)}`)
      .then((value) => value.session)
  }

  saveSession(session: AgentSessionRecord): Promise<void> {
    return this.request<{ revision: number }>('/internal/agent-os/sessions', { method: 'PUT', body: JSON.stringify(session) })
      .then((value) => { session.revision = value.revision })
  }

  executeAction(work: AgentWorkItem, action: HostAction): Promise<HostActionResult> {
    return this.request(`/internal/agent-os/work/${encodeURIComponent(work.id)}/actions`, {
      method: 'POST', body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken, action }),
    })
  }

  emitEvent(work: AgentWorkItem, event: AgentRunEvent): Promise<void> {
    return this.request(`/internal/agent-os/work/${encodeURIComponent(work.id)}/events`, {
      method: 'POST', body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken, event }),
    }).then(() => undefined)
  }

  commitMessage(work: AgentWorkItem, message: LingxiMessageV1): Promise<void> {
    return this.request(`/internal/agent-os/work/${encodeURIComponent(work.id)}/messages`, {
      method: 'POST', body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken, message }),
    }).then(() => undefined)
  }

  completeWork(work: AgentWorkItem, outcome: { status: 'completed' | 'failed' | 'cancelled'; error?: string }): Promise<void> {
    return this.request(`/internal/agent-os/work/${encodeURIComponent(work.id)}/complete`, {
      method: 'POST', body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken, ...outcome }),
    }).then(() => undefined)
  }
}

/** Standalone adapter for core tests and local protocol experiments. */
export class MemoryHostAdapter implements AgentOSHostAdapter {
  readonly queue: AgentWorkItem[] = []
  readonly contexts = new Map<string, AgentContext>()
  readonly sessions = new Map<string, AgentSessionRecord>()
  readonly actions: HostAction[] = []
  readonly events: AgentRunEvent[] = []
  readonly messages: LingxiMessageV1[] = []
  readonly outcomes = new Map<string, { status: 'completed' | 'failed' | 'cancelled'; error?: string }>()
  actionHandler: (action: HostAction) => Promise<HostActionResult> = async () => ({ ok: true, value: null })

  async claimWork(): Promise<AgentWorkItem | null> { return this.queue.shift() ?? null }
  async heartbeat(): Promise<HostHeartbeat> { return { ok: true } }
  async loadContext(work: AgentWorkItem): Promise<AgentContext> {
    const value = this.contexts.get(work.id)
    if (!value) throw new Error(`missing context for work ${work.id}`)
    return structuredClone(value)
  }
  async loadSession(key: string): Promise<AgentSessionRecord | null> {
    const value = this.sessions.get(key)
    return value ? structuredClone(value) : null
  }
  async saveSession(session: AgentSessionRecord): Promise<void> {
    const existing = this.sessions.get(session.key)
    if (existing && existing.revision !== session.revision) throw new Error('Agent OS session revision conflict')
    if (!existing && session.revision !== 0) throw new Error('Agent OS session revision conflict')
    session.revision += 1
    this.sessions.set(session.key, structuredClone(session))
  }
  async executeAction(_work: AgentWorkItem, action: HostAction): Promise<HostActionResult> {
    this.actions.push(structuredClone(action))
    return this.actionHandler(action)
  }
  async emitEvent(_work: AgentWorkItem, event: AgentRunEvent): Promise<void> { this.events.push(structuredClone(event)) }
  async commitMessage(_work: AgentWorkItem, message: LingxiMessageV1): Promise<void> { this.messages.push(structuredClone(message)) }
  async completeWork(work: AgentWorkItem, outcome: { status: 'completed' | 'failed' | 'cancelled'; error?: string }): Promise<void> {
    this.outcomes.set(work.id, { ...outcome })
  }
}
