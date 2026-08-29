
import { http } from '@/api/core/http'
import type { DocumentRecord } from './contracts'

export const documentsApi = {
  listDocuments: () =>
    http<{ documents: DocumentRecord[] }>('/documents'),
  createDocument: (input: { title?: string; conversationId?: string | null } = {}) =>
    http<DocumentRecord>('/documents', { method: 'POST', body: JSON.stringify(input) }),
  getDocument: (id: string) =>
    http<DocumentRecord>(`/documents/${encodeURIComponent(id)}`),
  renameDocument: (id: string, title: string) =>
    http<{ ok: boolean; title: string }>(`/documents/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ title }),
    }),
  deleteDocument: (id: string) =>
    http<{ ok: boolean }>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
