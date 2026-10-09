import { http } from '@/api/core/http'
import type { OpenUiEnvelope, UiState, UiStateResponse } from '@/lib/interactive-ui/protocol'

const path = (conversationId: string, uiId: string) => `/im/channels/${encodeURIComponent(conversationId)}/ui/${encodeURIComponent(uiId)}`
const reference = (envelope: OpenUiEnvelope) => ({ messageId: envelope.messageId, revision: envelope.revision, sourceHash: envelope.sourceHash })

export const interactiveApi = {
  read(conversationId: string, envelope: OpenUiEnvelope, signal?: AbortSignal) {
    const query = new URLSearchParams({ ...reference(envelope), revision: String(envelope.revision) })
    return http<UiStateResponse>(`${path(conversationId, envelope.uiId)}/state?${query}`, { signal })
  },
  save(conversationId: string, envelope: OpenUiEnvelope, expectedVersion: number, state: UiState, signal?: AbortSignal) {
    return http<UiStateResponse>(`${path(conversationId, envelope.uiId)}/state`, {
      method: 'PUT', body: JSON.stringify({ ...reference(envelope), expectedVersion, state }), signal,
    })
  },
  action(conversationId: string, envelope: OpenUiEnvelope, request: { actionId: string; idempotencyKey: string; state: UiState }, signal?: AbortSignal) {
    return http<unknown>(`${path(conversationId, envelope.uiId)}/actions`, {
      method: 'POST', body: JSON.stringify({ ...reference(envelope), ...request }), signal,
    })
  },
}
