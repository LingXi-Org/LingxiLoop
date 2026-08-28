
import { http } from '@/api/core/http'
import { putPresignedFile } from '@/api/transport'
import type {
  ConversationSourceSelection,
  KnowledgeSource,
} from './contracts'
import { uploadsApi } from '@/features/platform/api'
import type { WorkspaceSummary } from '@/types'

const sourceRequestKeys = new Map<string, string>()
function sourceRequestKey(fingerprint: string): string {
  const key = sourceRequestKeys.get(fingerprint) ?? crypto.randomUUID()
  sourceRequestKeys.set(fingerprint, key)
  return key
}

export const knowledgeApi = {
  listProjects: () => http<WorkspaceSummary[]>('/projects'),
  openProject: (id: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}/open`, { method: 'POST' }),
  createProject: (input: { name: string; description?: string; color?: string }) =>
    http<WorkspaceSummary>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  archiveProject: (id: string, archive = true) =>
    http<{ ok: boolean; status: string }>(`/projects/${encodeURIComponent(id)}/archive`, {
      method: 'POST', body: JSON.stringify({ archive }),
    }),
  listSources: (conversationId: string) => http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`),
  getSource: (conversationId: string, sourceId: string) => http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`),
  addTextSource: async (conversationId: string, input: { title?: string; text: string }) => {
    const fingerprint = JSON.stringify(['text',conversationId,input])
    const result = await http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'text', idempotencyKey: sourceRequestKey(fingerprint), ...input }) })
    sourceRequestKeys.delete(fingerprint)
    return result
  },
  addUrlSource: async (conversationId: string, input: { title?: string; url: string }) => {
    const fingerprint = JSON.stringify(['url',conversationId,input])
    const result = await http<KnowledgeSource>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'url', idempotencyKey: sourceRequestKey(fingerprint), ...input }) })
    sourceRequestKeys.delete(fingerprint)
    return result
  },
  uploadKnowledgeFile: async (conversationId: string, file: File): Promise<void> => {
    const caps = await uploadsApi.uploadCapabilities()
    const mime = file.type || 'text/plain'
    if (file.size > caps.maxBytes) throw new Error(`file exceeds the ${Math.round(caps.maxBytes / 1024 / 1024)} MB limit`)
    if (!caps.allowedMimes.includes(mime)) throw new Error(`file type not allowed: ${mime}`)
    const fingerprint = JSON.stringify(['file',conversationId,file.name,file.size,file.lastModified,mime])
    const signed = await http<{ id: string; uploadUrl: string; mime: string; size: number }>(`/conversations/${encodeURIComponent(conversationId)}/sources/upload/presign`, {
      method: 'POST', body: JSON.stringify({ idempotencyKey: sourceRequestKey(fingerprint), name: file.name, mime, size: file.size }),
    })
    const response = await putPresignedFile(signed.uploadUrl, file, mime)
    if (!response.ok) throw new Error(`source upload failed: ${response.status}`)
    await http(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(signed.id)}/complete-upload`, { method: 'POST' })
    sourceRequestKeys.delete(fingerprint)
  },
  retrySource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST' }),
  deleteSource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
  getConversationSources: async (conversationId: string): Promise<ConversationSourceSelection> => {
    const sources = await http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`)
    return { conversationId, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: (source as KnowledgeSource & { enabled?: boolean }).enabled !== false })) }
  },
  updateConversationSources: (conversationId: string, excludedSourceIds: string[]) => http<{ ok: boolean; excludedSourceIds: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'PUT', body: JSON.stringify({ excludedSourceIds }) })
}
