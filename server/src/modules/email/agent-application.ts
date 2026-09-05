import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import {
  findAgentEmailThread,
  listAgentEmailExternalContacts,
  listAgentEmailHumanContacts,
  listAgentEmailParticipantContacts,
  listAgentEmailThreadMessages,
  listAgentEmailThreads,
} from './agent-repository.js'
import { type EmailApplication, EmailApplicationError } from './application.js'
import type {
  AgentEmailCommandIdentity,
  AgentEmailContact,
  AgentEmailDeliveryResult,
  AgentEmailThread,
  AgentEmailThreadView,
  EmailScope,
  ReplyEmailInput,
  SendEmailInput,
} from './contracts.js'

interface AgentEmailInfrastructure {
  addressingConfigured(): boolean
  computeAgentAddress(participantId: string, companySlug: string): string | null
  ensureAddress(userId: string, companyId: string): Promise<{
    email: string
    displayName: string
  } | null>
}

export class AgentEmailApplication {
  constructor(
    private readonly db: Queryable,
    private readonly delivery: EmailApplication,
    private readonly infrastructure: AgentEmailInfrastructure,
  ) {}

  isAddressingConfigured(): boolean {
    return this.infrastructure.addressingConfigured()
  }

  async whoami(scope: EmailScope): Promise<{ email: string; displayName: string } | null> {
    return this.infrastructure.ensureAddress(scope.userId, scope.companyId)
  }

  async contacts(scope: EmailScope, rawQuery: string): Promise<AgentEmailContact[]> {
    const query = rawQuery.trim().toLowerCase()
    const matches = (contact: AgentEmailContact) => !query
      || contact.name.toLowerCase().includes(query)
      || contact.address.toLowerCase().includes(query)
      || (contact.participantId?.toLowerCase().includes(query) ?? false)
      || (contact.role?.toLowerCase().includes(query) ?? false)
    const [agents, humans, external] = await Promise.all([
      listAgentEmailParticipantContacts(this.db, scope.companyId, scope.userId),
      listAgentEmailHumanContacts(this.db, scope.companyId),
      listAgentEmailExternalContacts(this.db, scope.companyId, query ? 200 : 30),
    ])
    return [
      ...agents.flatMap((agent): AgentEmailContact[] => {
        const address = agent.email
          ?? this.infrastructure.computeAgentAddress(agent.id, agent.companySlug)
        return address ? [{
          participantId: agent.id,
          name: agent.name,
          address,
          kind: 'agent',
          role: agent.role,
        }] : []
      }),
      ...humans.map((human): AgentEmailContact => ({
        participantId: human.id,
        name: human.displayName,
        address: human.email,
        kind: 'human',
      })),
      ...external.map((contact): AgentEmailContact => ({
        participantId: null,
        name: contact.displayName ?? contact.address,
        address: contact.address,
        kind: 'external',
      })),
    ].filter(matches)
  }

  async inbox(
    scope: EmailScope,
    input: { unreadOnly: boolean; limit: number },
  ): Promise<AgentEmailThread[]> {
    return listAgentEmailThreads(this.db, {
      companyId: scope.companyId,
      agentId: scope.userId,
      unreadOnly: input.unreadOnly,
      limit: Math.min(50, Math.max(1, input.limit)),
    })
  }

  async thread(scope: EmailScope, conversationId: string, limit: number): Promise<AgentEmailThreadView> {
    const thread = await findAgentEmailThread(this.db, scope.companyId, conversationId)
    if (!thread) throw new EmailApplicationError('message_not_found', `unknown email thread ${conversationId}`)
    if (!thread.members.includes(scope.userId)) {
      throw new EmailApplicationError('thread_forbidden', `${scope.userId} is not a member of ${conversationId}`)
    }
    const messages = await listAgentEmailThreadMessages(
      this.db,
      scope.companyId,
      conversationId,
      Math.min(50, Math.max(1, limit)),
    )
    return { conversationId, title: thread.title, messages }
  }

  async send(
    scope: EmailScope,
    input: Omit<SendEmailInput, 'idempotencyKey'>,
    identity: AgentEmailCommandIdentity,
  ): Promise<AgentEmailDeliveryResult> {
    return this.delivery.sendFromAgent(
      scope,
      { ...input, idempotencyKey: this.idempotencyKey(identity) },
      { autoSubmitted: 'auto-generated', ...(identity.projectId ? { projectId: identity.projectId } : {}) },
    )
  }

  async reply(
    scope: EmailScope,
    messageId: string,
    input: Omit<ReplyEmailInput, 'idempotencyKey'>,
    identity: AgentEmailCommandIdentity,
  ): Promise<AgentEmailDeliveryResult> {
    return this.delivery.replyFromAgent(
      scope,
      messageId,
      { ...input, idempotencyKey: this.idempotencyKey(identity) },
      { autoSubmitted: 'auto-replied' },
    )
  }

  private idempotencyKey(identity: AgentEmailCommandIdentity): string {
    return identity.idempotencyKey ?? `agent-cli/${randomUUID()}`
  }
}
