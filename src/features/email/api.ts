
import { API, http } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId } from '@/stores/auth'
import type { EmailDeliveryResult, EmailMessage, EmailThread, ReplyEmailInput, SendEmailInput } from './contracts'

export const emailApi = {
  listThreads: (query: string, offset = 0, signal?: AbortSignal) =>
    http<{ items: EmailThread[]; hasMore: boolean }>(`/email/threads?${new URLSearchParams({ q: query, offset: String(offset) })}`, { signal }),
  getMessages: (id: string, before?: number, signal?: AbortSignal) =>
    http<EmailMessage[]>(`/conversations/${encodeURIComponent(id)}/messages?limit=50${before === undefined ? '' : `&before=${before}`}`, { signal }),
  sendEmail: (args: SendEmailInput) =>
    http<EmailDeliveryResult>(
      '/email/send',
      { method: 'POST', body: JSON.stringify(args) },
    ),
  replyEmail: (messageId: string, args: ReplyEmailInput) =>
    http<EmailDeliveryResult>(
      `/email/reply/${encodeURIComponent(messageId)}`,
      { method: 'POST', body: JSON.stringify(args) },
    ),
  fetchEmailHtml: async (messageId: string): Promise<string | null> => {
    const headers: Record<string, string> = {}
    const company = getActiveCompanyId()
    if (company) headers['x-company-id'] = company
    const res = await lingxiApiFetch(`${API}/email/${encodeURIComponent(messageId)}/html`, { headers, credentials: 'include' })
    if (res.status === 204) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `${res.status} ${res.statusText}`)
    }
    return res.text()
  }
}
