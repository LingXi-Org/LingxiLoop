
import { http } from '@/api/core/http'
import { putPresignedFile } from './transport'
import type {
  ConversationSourceSelection,
  KnowledgeSource,
} from '@/types'
import { filesApi } from './files'

export const knowledgeApi = {
  listSources: (conversationId: string) => http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`),
  getSource: (conversationId: string, sourceId: string) => http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`),
  addTextSource: (conversationId: string, input: { title?: string; text: string }) => http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'text', ...input }) }),
  addUrlSource: (conversationId: string, input: { title?: string; url: string }) => http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'url', ...input }) }),
  uploadKnowledgeFile: async (conversationId: string, file: File): Promise<void> => {
    const caps = await filesApi.uploadCapabilities()
    const mime = file.type || 'text/plain'
    if (file.size > caps.maxBytes) throw new Error(`file exceeds the ${Math.round(caps.maxBytes / 1024 / 1024)} MB limit`)
    if (!caps.allowedMimes.includes(mime)) throw new Error(`file type not allowed: ${mime}`)
    const signed = await http<{ id: string; uploadUrl: string; mime: string; size: number }>(`/conversations/${encodeURIComponent(conversationId)}/sources/upload/presign`, {
      method: 'POST', body: JSON.stringify({ name: file.name, mime, size: file.size }),
    })
    const response = await putPresignedFile(signed.uploadUrl, file, mime)
    if (!response.ok) throw new Error(`source upload failed: ${response.status}`)
    await http(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(signed.id)}/complete-upload`, { method: 'POST' })
  },
  retrySource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST' }),
  deleteSource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
  getConversationSources: async (conversationId: string): Promise<ConversationSourceSelection> => {
    const sources = await http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`)
    return { conversationId, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: (source as KnowledgeSource & { enabled?: boolean }).enabled !== false })) }
  },
  updateConversationSources: (conversationId: string, excludedSourceIds: string[]) => http<{ ok: boolean; excludedSourceIds: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'PUT', body: JSON.stringify({ excludedSourceIds }) })
}
