
import { http } from '@/api/core/http'
import type { ApiConversation } from './contracts'
import type { ImReadReceiptAdvance } from '@/types'

export const conversationsApi = {
  getConversations: () => http<ApiConversation[]>('/im/channels'),
  createGroup: (input: { clientRequestId: string; title: string; members: string[]; leaderId: string; workspaceId: string }) =>
    http<{ id: string; members: string[]; leaderId: string; projectId: string; created: boolean }>('/conversations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  leaveConversation: (conversationId: string) =>
    http<{ ok: boolean; members: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/leave`, {
      method: 'POST',
    }),
  openDirect: (otherId: string) =>
    http<{ id: string; created: boolean }>('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ otherId }),
    }),
  setTopic: (conversationId: string, topic: string | null) =>
    http<{ ok: boolean; topic: string | null }>(`/conversations/${encodeURIComponent(conversationId)}/topic`, {
      method: 'POST',
      body: JSON.stringify({ topic }),
    }),
  setTitle: (conversationId: string, title: string) =>
    http<{ ok: boolean; title: string }>(`/conversations/${encodeURIComponent(conversationId)}/title`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  setLeader: (conversationId: string, leaderId: string) =>
    http<{ ok: boolean; leaderId: string }>(`/conversations/${encodeURIComponent(conversationId)}/leader`, {
      method: 'POST',
      body: JSON.stringify({ leaderId }),
    }),
  togglePin: (conversationId: string, pinned?: boolean) =>
    http<{ ok: boolean; pinned: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/pin`, {
      method: 'POST',
      body: JSON.stringify(pinned === undefined ? {} : { pinned }),
    }),
  setMute: (conversationId: string, mute: boolean, until?: string | null) =>
    http<{ ok: boolean; muted: boolean; mutedUntil: string | null }>(
      `/conversations/${encodeURIComponent(conversationId)}/mute`,
      {
        method: 'POST',
        body: JSON.stringify({ mute, until: until ?? null }),
      },
    ),
  addMember: (conversationId: string, participantId: string) =>
    http<{ ok: boolean; members: string[]; alreadyIn?: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ id: participantId }),
    }),
  markRead: (conversationId: string, readThroughSeq: number) =>
    http<{ ok: boolean; latestSeq: number; receipt: ImReadReceiptAdvance | null }>(`/im/channels/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ readThroughSeq }),
    }),
  readReceipts: (conversationId: string, fromSeq: number, toSeq: number) =>
    http<{ channelId: string; fromSeq: number; toSeq: number; receipts: ImReadReceiptAdvance[] }>(
      `/im/channels/${encodeURIComponent(conversationId)}/read-receipts?fromSeq=${fromSeq}&toSeq=${toSeq}`,
    ),
  emitTyping: (conversationId: string, done: boolean) =>
    http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: 'POST',
      body: JSON.stringify({ done }),
    })
}
