
import { http } from '@/api/core/http'
import type { ApiConversation, ConversationSearchResults } from './contracts'

export const conversationsApi = {
  search: (query: string, signal?: AbortSignal) =>
    http<ConversationSearchResults>(`/search?q=${encodeURIComponent(query)}`, { signal }),
  getConversations: () => http<ApiConversation[]>('/im/channels'),
  leaveConversation: (conversationId: string) =>
    http<{ ok: boolean; members: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/leave`, {
      method: 'POST',
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
  emitTyping: (conversationId: string, done: boolean) =>
    http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: 'POST',
      body: JSON.stringify({ done }),
    })
}
