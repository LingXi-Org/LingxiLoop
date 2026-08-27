
import { http } from '@/api/core/http'
import type { ApiWhisper, ApiWhisperMessage, ApiConveneSession, ApiConveneTranscript, } from './contracts'

export const whispersApi = {
  getWhispers: () => http<ApiWhisper[]>('/peek/agent-chats'),
  getWhisperMessages: (id: string) =>
    http<ApiWhisperMessage[]>(`/peek/agent-chats/${encodeURIComponent(id)}/messages`),
  startConvene: (conversationId: string, topic: string) =>
    http<ApiConveneSession>(`/conversations/${encodeURIComponent(conversationId)}/convene`, {
      method: 'POST',
      body: JSON.stringify({ topic }),
    }),
  getActiveConvene: (conversationId: string) =>
    http<ApiConveneSession | null>(`/conversations/${encodeURIComponent(conversationId)}/convene`),
  getConveneTranscript: (sessionId: string) =>
    http<ApiConveneTranscript[]>(`/convene/${encodeURIComponent(sessionId)}/transcript`)
}
