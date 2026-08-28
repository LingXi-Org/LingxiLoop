
import { API, http } from '@/api/core/http'
import { getActiveCompanyId, getAuthToken } from '@/stores/auth'
import { lingxiApiFetch, } from './transport'

export const emailApi = {
  sendEmail: (args: {
    to: string[]
    cc?: string[]
    subject: string
    body: string
    attachments?: Array<{ key: string; filename: string; mimeType: string; sizeBytes: number }>
  }) =>
    http<{ messageId: string; conversationId: string; transportStatus: string; error?: string | null }>(
      '/email/send',
      { method: 'POST', body: JSON.stringify(args) },
    ),
  replyEmail: (messageId: string, args: {
    body: string
    cc?: string[]
    attachments?: Array<{ key: string; filename: string; mimeType: string; sizeBytes: number }>
  }) =>
    http<{ messageId: string; conversationId: string; transportStatus: string; error?: string | null }>(
      `/email/reply/${encodeURIComponent(messageId)}`,
      { method: 'POST', body: JSON.stringify(args) },
    ),
  fetchEmailHtml: async (messageId: string): Promise<string | null> => {
    const headers: Record<string, string> = {}
    const token = getAuthToken()
    if (token) headers.authorization = `Bearer ${token}`
    const company = getActiveCompanyId()
    if (company) headers['x-company-id'] = company
    const res = await lingxiApiFetch(`${API}/email/${encodeURIComponent(messageId)}/html`, { headers })
    if (res.status === 204) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `${res.status} ${res.statusText}`)
    }
    return res.text()
  }
}
