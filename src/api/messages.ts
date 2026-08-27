
import { http } from '@/api/core/http'
import type { ApiMessage, ApiAttachment, } from './contracts'

export const messagesApi = {
  getMessages: (
    conversationId: string,
    opts?: { before?: number; limit?: number },
  ) => {
    const qs = new URLSearchParams()
    if (opts?.before !== undefined) qs.set('before', String(opts.before))
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit))
    const q = qs.toString()
    return http<ApiMessage[]>(
      `/conversations/${encodeURIComponent(conversationId)}/messages${q ? `?${q}` : ''}`,
    )
  },
  getReplies: (conversationId: string, rootId: string) =>
    http<ApiMessage[]>(
      `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(rootId)}/replies`,
    ),
  sendMessage: (
    conversationId: string,
    body: string,
    attachment?: ApiAttachment | null,
    quotedMessageId?: string | null,
    /** Optional client-supplied dedup key (the optimistic bubble's tempId).
     *  Server echoes it on CH_MESSAGE_NEW so the renderer can match the WS
     *  echo to its still-temp local bubble even when the WS event arrives
     *  before this POST resolves. */
    clientId?: string | null,
  ) =>
    http<{ id: string; sequence: number }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        attachment: attachment ?? undefined,
        quotedMessageId: quotedMessageId ?? undefined,
        clientId: clientId ?? undefined,
      }),
    }),
  createPoll: (args: {
    conversationId: string
    question: string
    mode: 'single' | 'multi'
    options: string[]
    /** Minutes until the poll auto-closes. null / undefined ⇒ no expiration. */
    expiresInMinutes?: number | null
  }) =>
    http<{ messageId: string; sequence: number; poll: import('../types.js').PollPayload }>(
      '/polls',
      { method: 'POST', body: JSON.stringify(args) },
    ),
  castPollVote: (messageId: string, optionIds: string[]) =>
    http<{ tallies: import('../types.js').PollTally[]; poll: import('../types.js').PollPayload }>(
      `/polls/${encodeURIComponent(messageId)}/vote`,
      { method: 'POST', body: JSON.stringify({ optionIds }) },
    ),
  closePoll: (messageId: string) =>
    http<{ closed: boolean; poll: import('../types.js').PollPayload | null }>(
      `/polls/${encodeURIComponent(messageId)}/close`,
      { method: 'POST' },
    ),
  toggleReaction: (messageId: string, emoji: string) =>
    http<{ reactions: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }> }>(
      `/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
    )
}
