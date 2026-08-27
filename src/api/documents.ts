
import { http } from '@/api/core/http'
import type { ApiDocument, } from './contracts'

export const documentsApi = {
  listDocuments: () =>
    http<{ documents: ApiDocument[] }>('/documents'),
  createDocument: (input: { title?: string; conversationId?: string | null } = {}) =>
    http<ApiDocument>('/documents', { method: 'POST', body: JSON.stringify(input) }),
  getDocument: (id: string) =>
    http<ApiDocument>(`/documents/${encodeURIComponent(id)}`),
  renameDocument: (id: string, title: string) =>
    http<{ ok: boolean; title: string }>(`/documents/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ title }),
    }),
  deleteDocument: (id: string) =>
    http<{ ok: boolean }>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
