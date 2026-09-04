import type { Queryable } from '../db/queryable.js'
import { workspaceChannels } from './channels-repository.js'

interface ImConversationState {
  channelId: string
  channelType: number
  unread: number
  lastMessage?: {
    messageId: string
    clientMsgNo: string
    fromUid: string
    timestamp: number
    payload: { kind: string; body?: string }
  } | null
}

export interface ImChannelsInfrastructure {
  db: Queryable
  listConversations(userId: string): Promise<ImConversationState[]>
}

export class ImChannelsApplication {
  constructor(private readonly infrastructure: ImChannelsInfrastructure) {}

  async list(input: { companyId: string; userId: string; projectId: string }) {
    const rows = await workspaceChannels(this.infrastructure.db, input)
    const conversations = await this.infrastructure.listConversations(input.userId)
    const state = new Map(conversations.map((item) => [`${item.channelId}:${item.channelType}`, item]))
    return rows.map((row) => {
      const channelType = Number(row.profile.channelType ?? 2)
      const im = state.get(`${row.channel_id}:${channelType}`)
      const last = im?.lastMessage
      return {
        id: row.channel_id,
        kind: row.kind === 'direct' ? 'direct' : 'group',
        title: row.title,
        subtitle: null,
        topic: typeof row.profile.topic === 'string' ? row.profile.topic : null,
        members: row.members,
        leaderId: row.leader_agent_id,
        pinned: row.profile.pinned === true,
        muted: row.muted,
        mutedUntil: row.muted_until,
        tag: row.preset_key ? 'team' : null,
        pulledBy: null,
        createdAt: typeof row.profile.createdAt === 'string' ? row.profile.createdAt : new Date(0).toISOString(),
        updatedAt: last
          ? new Date(last.timestamp * 1000).toISOString()
          : typeof row.profile.updatedAt === 'string' ? row.profile.updatedAt : new Date(0).toISOString(),
        unreadCount: im?.unread ?? 0,
        lastMessage: last ? {
          id: last.messageId || last.clientMsgNo,
          authorId: last.fromUid,
          kind: last.payload.kind,
          body: last.payload.body ?? '',
          createdAt: new Date(last.timestamp * 1000).toISOString(),
        } : null,
        presetKey: row.preset_key,
      }
    })
  }

}
