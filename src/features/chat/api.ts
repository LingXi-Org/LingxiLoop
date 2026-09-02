
import { http } from '@/api/core/http'

export const messagesApi = {
  createPoll: (args: {
    clientRequestId: string
    conversationId: string
    question: string
    mode: 'single' | 'multi'
    options: string[]
    /** Minutes until the poll auto-closes. null / undefined ⇒ no expiration. */
    expiresInMinutes?: number | null
  }) =>
    http<{ messageId: string; sequence: number; poll: import('@/types').PollPayload }>(
      '/polls',
      { method: 'POST', body: JSON.stringify(args) },
    ),
  castPollVote: (messageId: string, optionIds: string[]) =>
    http<{ tallies: import('@/types').PollTally[]; poll: import('@/types').PollPayload }>(
      `/polls/${encodeURIComponent(messageId)}/vote`,
      { method: 'POST', body: JSON.stringify({ optionIds }) },
    ),
  closePoll: (messageId: string) =>
    http<{ closed: boolean; poll: import('@/types').PollPayload | null }>(
      `/polls/${encodeURIComponent(messageId)}/close`,
      { method: 'POST' },
    ),
  toggleReaction: (conversationId: string, messageId: string, messageSeq: number, emoji: string) =>
    http<{ reactions: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }> }>(
      `/im/channels/${encodeURIComponent(conversationId)}/reactions`,
      { method: 'POST', body: JSON.stringify({ messageId, messageSeq, emoji }) },
    ),
}
