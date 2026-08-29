import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import type {
  ConversationScope,
  ConversationUpdatedEvent,
  CreateGroupInput,
  SearchBuckets,
  TypingEvent,
  WorkspacePolicy,
} from './contracts.js'
import {
  createConversationBundle,
  findActiveAgentCompanyId,
  findConversation,
  findBindingForUpdate,
  findConversationForUpdate,
  findAgentConversationContext,
  findConversationWorkspacePolicy,
  findGeneralConversationWorkspacePolicy,
  findDirectConversation,
  hasManagedPulse,
  listCourseHumanIds,
  listActiveCompanyParticipantIds,
  listActiveConversationMutes,
  listParticipants,
  participantAllowedInProject,
  markConversationReadNow,
  searchWorkspaceDirectory,
  setMute,
  updateConversation,
  upsertBinding,
  type ConversationRow,
} from './repository.js'

export type ConversationErrorCode =
  | 'invalid_members'
  | 'invalid_leader'
  | 'managed_pulse'
  | 'workspace_read_only'
  | 'not_found'
  | 'not_group'
  | 'not_member'
  | 'teacher_room_managed'
  | 'idempotency_conflict'
  | 'binding_missing'
  | 'invalid_direct'
  | 'stale_title'

export class ConversationApplicationError extends Error {
  constructor(readonly code: ConversationErrorCode, message: string) {
    super(message)
  }
}

export interface ConversationInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  syncChannel(profile: ImChannelProfile): Promise<void>
  publishUpdated(event: ConversationUpdatedEvent): Promise<void>
  publishTyping(event: TypingEvent): Promise<void>
  isTeacherRoom(companyId: string, conversationId: string): Promise<boolean>
  postMembershipMessage(args: {
    conversationId: string
    companyId: string
    actorId: string
    kind: 'joined' | 'left'
    participantId: string
  }): Promise<{ messageId: string; sequence: number }>
  clearReplyHold(agentId: string, conversationId: string): Promise<void>
  searchMessages(input: {
    companyId: string
    userId: string
    projectId: string
    query: string
    limit: number
  }): Promise<Array<{
    channelId: string
    title: string
    kind: string
    message: { messageId: string; fromUid: string; timestamp: number; payload: { body?: string } }
  }>>
}

function deterministicId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24)}`
}

function profileFor(conversation: ConversationRow, now = new Date().toISOString()): ImChannelProfile {
  return {
    channelId: conversation.id,
    channelType: 2,
    kind: conversation.kind === 'direct' ? 'direct' : 'group',
    title: conversation.title,
    topic: conversation.topic,
    members: conversation.members,
    leaderAgentId: conversation.leader_id ?? undefined,
    pinned: conversation.pinned,
    createdAt: now,
    updatedAt: now,
  }
}

export class ConversationsApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: ConversationInfrastructure,
  ) {}

  async createGroup(
    scope: Omit<ConversationScope, 'projectId'>,
    workspace: WorkspacePolicy,
    input: CreateGroupInput,
  ): Promise<{ id: string; members: string[]; leaderId: string; projectId: string; created: boolean }> {
    if (workspace.projectStatus !== 'active') {
      throw new ConversationApplicationError('workspace_read_only', 'archived courses are read-only')
    }
    const members = [...new Set([...input.members, scope.userId])]
    if (members.length < 2) {
      throw new ConversationApplicationError('invalid_members', 'pick at least one teammate')
    }
    const participants = await listParticipants(this.db, scope.companyId, members)
    const known = new Set(participants.map((participant) => participant.id))
    const missing = members.filter((member) => !known.has(member))
    if (missing.length > 0) {
      throw new ConversationApplicationError('invalid_members', `unknown participant(s): ${missing.join(', ')}`)
    }
    if (await hasManagedPulse(this.db, scope.companyId, members)) {
      throw new ConversationApplicationError('managed_pulse', 'Pulse can only belong to its provisioned teacher room')
    }
    const leader = participants.find((participant) => participant.id === input.leaderId)
    if (!leader || leader.kind !== 'agent' || leader.departed_at) {
      throw new ConversationApplicationError('invalid_leader', 'leaderId must be an active agent member')
    }
    if (workspace.courseId) {
      const humanIds = participants.filter((participant) => participant.kind === 'human').map((participant) => participant.id)
      const enrolled = new Set(await listCourseHumanIds(this.db, scope.companyId, workspace.courseId, humanIds))
      if (humanIds.some((id) => !enrolled.has(id))) {
        throw new ConversationApplicationError('invalid_members', 'all human members must belong to the course')
      }
    }
    const id = deterministicId('g', scope.companyId, input.workspaceId, scope.userId, input.clientRequestId)
    const topic = input.topic || null
    const now = new Date().toISOString()
    const profile: ImChannelProfile = {
      channelId: id, channelType: 2, kind: 'group', title: input.title, topic,
      members, leaderAgentId: input.leaderId, pinned: false, createdAt: now, updatedAt: now,
    }
    const created = await this.infrastructure.transaction(async (db) => {
      const inserted = await createConversationBundle(db, {
        id, companyId: scope.companyId, projectId: input.workspaceId, kind: 'group',
        title: input.title, topic, members, leaderId: input.leaderId, tag: null, profile,
      })
      if (!inserted) {
        const existing = await findConversationForUpdate(db, scope.companyId, id)
        if (!existing || existing.project_id !== input.workspaceId || existing.title !== input.title
          || existing.leader_id !== input.leaderId
          || JSON.stringify([...existing.members].sort()) !== JSON.stringify([...members].sort())) {
          throw new ConversationApplicationError('idempotency_conflict', 'clientRequestId was reused with different input')
        }
      }
      return inserted
    })
    await this.infrastructure.syncChannel(profile)
    return { id, members, leaderId: input.leaderId, projectId: input.workspaceId, created }
  }

  async openDirect(
    scope: ConversationScope,
    workspace: WorkspacePolicy,
    otherId: string,
  ): Promise<{ id: string; created: boolean }> {
    if (otherId === scope.userId) {
      throw new ConversationApplicationError('invalid_direct', 'cannot DM yourself')
    }
    const participants = await listParticipants(this.db, scope.companyId, [otherId])
    const other = participants[0]
    if (!other || other.departed_at) throw new ConversationApplicationError('not_found', 'unknown participant')
    if (await hasManagedPulse(this.db, scope.companyId, [otherId])) {
      throw new ConversationApplicationError('managed_pulse', 'Pulse can only belong to its provisioned teacher room')
    }
    if (workspace.courseId && other.kind === 'human') {
      const enrolled = await listCourseHumanIds(this.db, scope.companyId, workspace.courseId, [otherId])
      if (!enrolled.includes(otherId)) throw new ConversationApplicationError('not_found', 'unknown participant')
    }
    const members = [scope.userId, otherId]
    const canonicalMembers = [...members].sort()
    const id = deterministicId('direct', scope.companyId, scope.projectId, ...canonicalMembers)
    const now = new Date().toISOString()
    const result = await this.infrastructure.transaction(async (db) => {
      const existing = await findDirectConversation(db, {
        companyId: scope.companyId, projectId: scope.projectId,
        firstId: scope.userId, secondId: otherId,
      })
      if (existing) {
        const binding = await findBindingForUpdate(db, scope.companyId, existing.id)
        if (!binding) throw new ConversationApplicationError('binding_missing', 'conversation channel binding is missing')
        const profile = { ...profileFor(existing, now), ...binding.profile, channelId: existing.id,
          title: existing.title, members: existing.members } as ImChannelProfile
        return { created: false, profile }
      }
      const profile: ImChannelProfile = {
        channelId: id, channelType: 2, kind: 'direct', title: other.name,
        members, pinned: false, createdAt: now, updatedAt: now,
      }
      const created = await createConversationBundle(db, {
        id, companyId: scope.companyId, projectId: scope.projectId, kind: 'direct',
        title: other.name, topic: null, members, leaderId: null,
        tag: other.kind === 'human' ? 'human' : null, profile,
      })
      return { created, profile }
    })
    // The binding committed above is the durable synchronization intent.
    // The Worker continuously reconciles it to WuKongIM, so a transient IM
    // outage must not turn a persisted Agent/direct conversation into a 500.
    await this.infrastructure.syncChannel(result.profile).catch((error: unknown) => {
      console.warn('[conversations] committed direct channel awaits reconciliation:',
        error instanceof Error ? error.message : String(error))
    })
    return { id: result.profile.channelId, created: result.created }
  }

  async openDirectForDocumentMention(
    scope: ConversationScope,
    agentId: string,
  ): Promise<{ id: string; created: boolean }> {
    const workspace = await findConversationWorkspacePolicy(this.db, scope.companyId, scope.projectId)
    if (!workspace) throw new ConversationApplicationError('not_found', 'workspace not found')
    if (workspace.projectStatus !== 'active') {
      throw new ConversationApplicationError('workspace_read_only', 'workspace is read-only')
    }
    return this.openDirect(scope, workspace, agentId)
  }

  async openDirectForNewAgent(
    scope: Omit<ConversationScope, 'projectId'>,
    agentId: string,
  ): Promise<{ id: string; created: boolean }> {
    const workspace = await findGeneralConversationWorkspacePolicy(this.db, scope.companyId)
    if (!workspace) throw new ConversationApplicationError('not_found', 'active general workspace not found')
    return this.openDirect({ ...scope, projectId: workspace.projectId }, workspace, agentId)
  }

  /** Create the complete direct-conversation bundle for a newly joined member.
   * Reuses the same deterministic, tenant-scoped path as an interactive DM so
   * retries repair bindings and WuKong synchronization instead of creating a
   * second conversation data plane. */
  async seedMemberDirects(scope: Omit<ConversationScope, 'projectId'>): Promise<void> {
    const workspace = await findGeneralConversationWorkspacePolicy(this.db, scope.companyId)
    if (!workspace) throw new ConversationApplicationError('not_found', 'active general workspace not found')
    const participantIds = await listActiveCompanyParticipantIds(this.db, scope.companyId)
    if (!participantIds.includes(scope.userId)) {
      throw new ConversationApplicationError('not_found', 'active company participant not found')
    }
    for (const participantId of participantIds) {
      if (participantId === scope.userId) continue
      await this.openDirect({ ...scope, projectId: workspace.projectId }, workspace, participantId)
    }
  }

  async authorizeDocumentShare(
    scope: ConversationScope,
    conversationId: string,
  ): Promise<'allowed' | 'not_found' | 'not_member'> {
    const conversation = await findConversation(this.db, scope.companyId, conversationId)
    if (!conversation || conversation.project_id !== scope.projectId) return 'not_found'
    return conversation.members.includes(scope.userId) ? 'allowed' : 'not_member'
  }

  async setLeader(scope: ConversationScope, conversationId: string, leaderId: string) {
    if (await hasManagedPulse(this.db, scope.companyId, [leaderId])) {
      throw new ConversationApplicationError('managed_pulse', 'Pulse can only belong to its provisioned teacher room')
    }
    const profile = await this.mutate(scope, conversationId, async (db, conversation, binding) => {
      if (conversation.kind !== 'group') throw new ConversationApplicationError('not_group', 'only group chats have a leader')
      if (!conversation.members.includes(leaderId)) throw new ConversationApplicationError('invalid_leader', 'leader must be a group member')
      const candidate = (await listParticipants(db, scope.companyId, [leaderId]))[0]
      if (!candidate || candidate.kind !== 'agent' || candidate.departed_at) {
        throw new ConversationApplicationError('invalid_leader', 'leader must be an active agent')
      }
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, leaderId })
      const next = { ...profileFor({ ...conversation, leader_id: leaderId }), ...binding.profile,
        channelId: conversationId, members: conversation.members, leaderAgentId: leaderId } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, leaderId, binding.preset_key)
      return next
    })
    await this.afterMutation(scope, conversationId, profile, { leaderId })
    return { ok: true as const, leaderId }
  }

  async setTopic(scope: ConversationScope, conversationId: string, topic: string | null) {
    const profile = await this.simpleProfileMutation(scope, conversationId, { topic }, { topic })
    await this.afterMutation(scope, conversationId, profile, { topic })
    return { ok: true as const, topic }
  }

  async setTitle(scope: ConversationScope, conversationId: string, title: string) {
    const result = await this.setTitleInternal(scope, conversationId, title)
    return { ok: true as const, title: result.title }
  }

  async getAgentMetadata(agentId: string, conversationId: string) {
    return this.requireAgentContext(agentId, conversationId)
  }

  async addAgentMember(agentId: string, conversationId: string, participantId: string) {
    const context = await this.requireAgentContext(agentId, conversationId)
    this.assertAgentWorkspaceWritable(context.projectStatus)
    if (!context.projectId) throw new ConversationApplicationError('not_found', 'conversation workspace is missing')
    const result = await this.addMember({
      userId: agentId,
      companyId: context.companyId,
      projectId: context.projectId,
    }, conversationId, participantId)
    return { ...result, title: context.title, companyId: context.companyId }
  }

  async leaveAgentConversation(agentId: string, conversationId: string) {
    const context = await this.requireAgentContext(agentId, conversationId)
    this.assertAgentWorkspaceWritable(context.projectStatus)
    if (!context.projectId) throw new ConversationApplicationError('not_found', 'conversation workspace is missing')
    const result = await this.leave({
      userId: agentId,
      companyId: context.companyId,
      projectId: context.projectId,
    }, conversationId)
    return { ...result, title: context.title, companyId: context.companyId }
  }

  async setAgentTopic(agentId: string, conversationId: string, topic: string | null) {
    const context = await this.requireAgentContext(agentId, conversationId)
    this.assertAgentWorkspaceWritable(context.projectStatus)
    if (!context.projectId) {
      throw new ConversationApplicationError('not_found', 'conversation workspace is missing')
    }
    await this.setTopic({
      userId: agentId,
      companyId: context.companyId,
      projectId: context.projectId,
    }, conversationId, topic)
    return { ok: true as const, topic, companyId: context.companyId }
  }

  async setAgentTitle(
    agentId: string,
    conversationId: string,
    title: string,
    expectedTitle?: string,
  ) {
    const context = await this.requireAgentContext(agentId, conversationId)
    this.assertAgentWorkspaceWritable(context.projectStatus)
    if (!context.projectId) {
      throw new ConversationApplicationError('not_found', 'conversation workspace is missing')
    }
    const result = await this.setTitleInternal({
      userId: agentId,
      companyId: context.companyId,
      projectId: context.projectId,
    }, conversationId, title, expectedTitle)
    return { ...result, companyId: context.companyId }
  }

  private async setTitleInternal(
    scope: ConversationScope,
    conversationId: string,
    title: string,
    expectedTitle?: string,
  ) {
    let changed = false
    const profile = await this.mutate(scope, conversationId, async (db, conversation, binding) => {
      if (conversation.kind !== 'group') throw new ConversationApplicationError('not_group', 'only group chats can be renamed')
      if (expectedTitle !== undefined && conversation.title !== expectedTitle) {
        throw new ConversationApplicationError(
          'stale_title',
          `stale: current title is "${conversation.title}", you passed --if-equals "${expectedTitle}". Re-read with \`lingxiloop conversations\` and decide if you still want to rename.`,
        )
      }
      if (conversation.title === title) {
        return { ...profileFor(conversation), ...binding.profile,
          channelId: conversationId, title, members: conversation.members } as ImChannelProfile
      }
      changed = true
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, title })
      const next = { ...profileFor({ ...conversation, title }), ...binding.profile,
        channelId: conversationId, title, members: conversation.members } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, conversation.leader_id, binding.preset_key)
      return next
    })
    if (changed) await this.afterMutation(scope, conversationId, profile, { title })
    return { ok: true as const, title, changed }
  }

  async setPinned(scope: ConversationScope, conversationId: string, requested?: boolean) {
    let pinned = false
    const profile = await this.mutate(scope, conversationId, async (db, conversation, binding) => {
      pinned = requested ?? !conversation.pinned
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, pinned })
      const next = { ...profileFor({ ...conversation, pinned }), ...binding.profile,
        channelId: conversationId, members: conversation.members, pinned } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, conversation.leader_id, binding.preset_key)
      return next
    })
    await this.afterMutation(scope, conversationId, profile, { pinned })
    return { ok: true as const, pinned }
  }

  async setMuted(scope: Omit<ConversationScope, 'projectId'>, conversationId: string, mute: boolean, until: Date | null) {
    const conversation = await findConversation(this.db, scope.companyId, conversationId)
    if (!conversation) throw new ConversationApplicationError('not_found', 'not found')
    if (!conversation.members.includes(scope.userId)) throw new ConversationApplicationError('not_member', 'not a member')
    await setMute(this.db, { ...scope, conversationId, mute, until })
    return { ok: true as const, muted: mute, mutedUntil: mute && until ? until.toISOString() : null }
  }

  async listAgentMutes(agentId: string) {
    const companyId = await findActiveAgentCompanyId(this.db, agentId)
    if (!companyId) throw new ConversationApplicationError('not_found', `unknown agent ${agentId} (no company)`)
    return listActiveConversationMutes(this.db, companyId, agentId)
  }

  async setAgentMuted(
    agentId: string,
    conversationId: string,
    mute: boolean,
    until: Date | null,
  ) {
    const context = await this.requireAgentContext(agentId, conversationId)
    const changed = await this.infrastructure.transaction(async (db) => {
      const conversation = await findConversationForUpdate(db, context.companyId, conversationId)
      if (!conversation) throw new ConversationApplicationError('not_found', `conversation not found: ${conversationId}`)
      if (!conversation.members.includes(agentId)) {
        throw new ConversationApplicationError('not_member', `you are not a member of ${conversationId}`)
      }
      if (conversation.kind === 'direct' && mute) {
        throw new ConversationApplicationError('invalid_direct', 'direct conversations always deliver; mute a group instead')
      }
      const updated = await setMute(db, {
        userId: agentId,
        companyId: context.companyId,
        conversationId,
        until,
        mute,
      })
      if (mute) {
        await markConversationReadNow(db, {
          userId: agentId,
          companyId: context.companyId,
          conversationId,
        })
      }
      return updated
    })
    if (mute) await this.infrastructure.clearReplyHold(agentId, conversationId)
    return {
      ok: true as const,
      changed,
      title: context.title,
      muted: mute,
      mutedUntil: mute && until ? until.toISOString() : null,
    }
  }

  async addMember(scope: ConversationScope, conversationId: string, participantId: string) {
    if (await this.infrastructure.isTeacherRoom(scope.companyId, conversationId)) {
      throw new ConversationApplicationError('teacher_room_managed', 'teacher-room membership follows course teacher membership')
    }
    if (!await participantAllowedInProject(this.db, {
      participantId, companyId: scope.companyId, projectId: scope.projectId,
    })) throw new ConversationApplicationError('invalid_members', `unknown participant: ${participantId}`)
    if (await hasManagedPulse(this.db, scope.companyId, [participantId])) {
      throw new ConversationApplicationError('managed_pulse', 'Pulse can only belong to its provisioned teacher room')
    }
    let alreadyIn = false
    const profile = await this.mutate(scope, conversationId, async (db, conversation, binding) => {
      if (conversation.kind !== 'group') {
        throw new ConversationApplicationError('not_group', `cannot add to a ${conversation.kind} conversation`)
      }
      if (conversation.members.includes(participantId)) {
        alreadyIn = true
        return { ...binding.profile, channelId: conversationId, channelType: 2,
          title: conversation.title, members: conversation.members } as ImChannelProfile
      }
      const members = [...conversation.members, participantId]
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, members })
      const next = { ...profileFor({ ...conversation, members }), ...binding.profile,
        channelId: conversationId, members } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, conversation.leader_id, binding.preset_key)
      return next
    })
    await this.infrastructure.syncChannel(profile)
    let membershipMessage: { messageId: string; sequence: number } | undefined
    if (!alreadyIn) {
      membershipMessage = await this.infrastructure.postMembershipMessage({
        conversationId, companyId: scope.companyId, actorId: scope.userId,
        kind: 'joined', participantId,
      })
    }
    return {
      ok: true as const,
      members: profile.members,
      ...(membershipMessage ? { systemMessageId: membershipMessage.messageId } : {}),
      ...(alreadyIn ? { alreadyIn: true as const } : {}),
    }
  }

  async leave(scope: ConversationScope, conversationId: string) {
    if (await this.infrastructure.isTeacherRoom(scope.companyId, conversationId)) {
      throw new ConversationApplicationError('teacher_room_managed', 'teacher-room membership follows course teacher membership')
    }
    const current = await findConversation(this.db, scope.companyId, conversationId)
    if (!current || current.project_id !== scope.projectId) {
      throw new ConversationApplicationError('not_found', 'not found')
    }
    if (!current.members.includes(scope.userId)) {
      throw new ConversationApplicationError('not_member', 'not a member')
    }
    if (current.kind === 'direct') {
      throw new ConversationApplicationError('invalid_direct', 'cannot leave a direct conversation')
    }
    const profile = await this.mutate(scope, conversationId, async (db, conversation, binding) => {
      if (conversation.kind === 'direct') throw new ConversationApplicationError('invalid_direct', 'cannot leave a direct conversation')
      const members = conversation.members.filter((member) => member !== scope.userId)
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, members })
      const next = { ...profileFor({ ...conversation, members }), ...binding.profile,
        channelId: conversationId, members } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, conversation.leader_id, binding.preset_key)
      return next
    })
    const membershipMessage = await this.infrastructure.postMembershipMessage({
        conversationId, companyId: scope.companyId, actorId: scope.userId,
        kind: 'left', participantId: scope.userId,
      }).catch(() => undefined)
    await this.infrastructure.syncChannel(profile)
    return {
      ok: true as const,
      members: profile.members,
      ...(membershipMessage ? { systemMessageId: membershipMessage.messageId } : {}),
    }
  }

  async typing(scope: Omit<ConversationScope, 'projectId'>, conversationId: string, done: boolean) {
    await this.infrastructure.publishTyping({
      type: 'typing', conversationId, agentId: scope.userId, done, companyId: scope.companyId,
    })
    return { ok: true as const }
  }

  async search(scope: ConversationScope, raw: string) {
    if (!raw) return { participants: [], rooms: [], groups: [], messages: [] }
    const [directory, messageMatches] = await Promise.all([
      searchWorkspaceDirectory(this.db, { ...scope, raw }),
      this.infrastructure.searchMessages({
        companyId: scope.companyId,
        userId: scope.userId,
        projectId: scope.projectId,
        query: raw,
        limit: 15,
      }),
    ])
    const authors = await listParticipants(
      this.db,
      scope.companyId,
      [...new Set(messageMatches.map((match) => match.message.fromUid))],
    )
    const authorNames = new Map(authors.map((author) => [author.id, author.name]))
    const buckets: SearchBuckets = { ...directory, messages: messageMatches.map((match) => ({
      id: match.message.messageId,
      conversationId: match.channelId,
      conversationTitle: match.title,
      conversationKind: match.kind,
      authorId: match.message.fromUid,
      authorName: authorNames.get(match.message.fromUid) ?? match.message.fromUid,
      body: match.message.payload.body ?? '',
      createdAt: new Date(match.message.timestamp > 10_000_000_000
        ? match.message.timestamp
        : match.message.timestamp * 1000).toISOString(),
    })) }
    return this.withSnippets(buckets, raw)
  }

  private async simpleProfileMutation(
    scope: ConversationScope,
    conversationId: string,
    databasePatch: { topic?: string | null },
    profilePatch: Record<string, unknown>,
  ): Promise<ImChannelProfile> {
    return this.mutate(scope, conversationId, async (db, conversation, binding) => {
      await updateConversation(db, { id: conversationId, companyId: scope.companyId, ...databasePatch })
      const next = { ...profileFor({ ...conversation, ...databasePatch }), ...binding.profile,
        channelId: conversationId, members: conversation.members, ...profilePatch } as ImChannelProfile
      await upsertBinding(db, scope.companyId, next, conversation.leader_id, binding.preset_key)
      return next
    })
  }

  private async mutate(
    scope: ConversationScope,
    conversationId: string,
    work: (db: Queryable, conversation: ConversationRow, binding: Awaited<ReturnType<typeof findBindingForUpdate>> & {}) => Promise<ImChannelProfile>,
  ): Promise<ImChannelProfile> {
    return this.infrastructure.transaction(async (db) => {
      const conversation = await findConversationForUpdate(db, scope.companyId, conversationId)
      if (!conversation) throw new ConversationApplicationError('not_found', 'not found')
      if (conversation.project_id !== scope.projectId || !conversation.members.includes(scope.userId)) {
        throw new ConversationApplicationError('not_member', 'not a member')
      }
      const binding = await findBindingForUpdate(db, scope.companyId, conversationId)
      if (!binding) throw new ConversationApplicationError('binding_missing', 'conversation channel binding is missing')
      return work(db, conversation, binding)
    })
  }

  private async afterMutation(
    scope: ConversationScope,
    conversationId: string,
    profile: ImChannelProfile,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.infrastructure.syncChannel(profile)
    await this.infrastructure.publishUpdated({
      type: 'conversation.updated', conversationId, companyId: scope.companyId,
      workspaceId: scope.projectId, patch,
    })
  }

  private withSnippets(buckets: SearchBuckets, raw: string) {
    const needle = raw.toLowerCase()
    return {
      ...buckets,
      messages: buckets.messages.map(({ body, ...message }) => {
        const index = body.toLowerCase().indexOf(needle)
        const start = Math.max(0, index < 0 ? 0 : index - 40)
        const end = Math.min(body.length, index < 0 ? 120 : index + needle.length + 80)
        return { ...message, snippet: `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}` }
      }),
    }
  }

  private async requireAgentContext(agentId: string, conversationId: string) {
    const context = await findAgentConversationContext(this.db, agentId, conversationId)
    if (!context) throw new ConversationApplicationError('not_found', `unknown conversation ${conversationId}`)
    if (!context.members.includes(agentId)) {
      throw new ConversationApplicationError('not_member', `${agentId} is not a member of ${conversationId}`)
    }
    return context
  }

  private assertAgentWorkspaceWritable(projectStatus: string | null): void {
    if (projectStatus === 'archived') {
      throw new ConversationApplicationError('workspace_read_only', 'archived courses are read-only')
    }
  }
}
