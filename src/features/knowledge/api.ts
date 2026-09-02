
import { http } from '@/api/core/http'
import { putPresignedFile } from '@/api/transport'
import { uploadsApi } from '@/features/platform/api'
import { projectLifecycleApi } from '@/features/projects/api'
import type { WorkspaceSummary } from '@/types'
import type {
  ConversationSourceSelection,
  KnowledgeSource,
} from './contracts'

const sourceRequestKeys = new Map<string, string>()
function sourceRequestKey(fingerprint: string): string {
  const key = sourceRequestKeys.get(fingerprint) ?? crypto.randomUUID()
  sourceRequestKeys.set(fingerprint, key)
  return key
}

async function uploadSource(basePath: string, fingerprintScope: string, file: File, onPending?: () => void): Promise<void> {
  const caps = await uploadsApi.uploadCapabilities()
  const mime = file.type || 'text/plain'
  if (file.size > caps.maxBytes) throw new Error(`file exceeds the ${Math.round(caps.maxBytes / 1024 / 1024)} MB limit`)
  if (!caps.allowedMimes.includes(mime)) throw new Error(`file type not allowed: ${mime}`)
  const fingerprint = JSON.stringify(['file', fingerprintScope, file.name, file.size, file.lastModified, mime])
  const signed = await http<{ id: string; uploadUrl: string; mime: string; size: number }>(`${basePath}/upload/presign`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: sourceRequestKey(fingerprint), name: file.name, mime, size: file.size }),
  })
  onPending?.()
  const response = await putPresignedFile(signed.uploadUrl, file, mime)
  if (!response.ok) throw new Error(`source upload failed: ${response.status}`)
  await http(`${basePath}/${encodeURIComponent(signed.id)}/complete-upload`, { method: 'POST' })
  sourceRequestKeys.delete(fingerprint)
}

export const knowledgeApi = {
  listProjects: () => http<WorkspaceSummary[]>('/projects'),
  openProject: (id: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}/open`, { method: 'POST' }),
  createProject: (input: { name: string; description?: string; color?: string }) =>
    http<WorkspaceSummary>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  archiveProject: projectLifecycleApi.archive,
  deleteProject: projectLifecycleApi.delete,
  updateProject: (projectId: string, input: { name?: string; description?: string; color?: string | null }) =>
    http<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify(input) }),
  listProjectSources: (projectId: string) => http<KnowledgeSource[]>(`/projects/${encodeURIComponent(projectId)}/sources`),
  getProjectSource: (projectId: string, sourceId: string) => http<KnowledgeSource>(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`),
  listCourseReviewSources: (projectId: string) => http<KnowledgeSource[]>(`/projects/${encodeURIComponent(projectId)}/learning/resources`),
  getCourseReviewSource: (projectId: string, sourceId: string) => http<KnowledgeSource>(`/projects/${encodeURIComponent(projectId)}/learning/resources/${encodeURIComponent(sourceId)}`),
  uploadProjectSource: (projectId: string, file: File, onPending?: () => void) => uploadSource(`/projects/${encodeURIComponent(projectId)}/sources`, projectId, file, onPending),
  addProjectTextSource: async (projectId: string, input: { title?: string; text: string }) => {
    const fingerprint = JSON.stringify(['text', projectId, input])
    const result = await http<KnowledgeSource>(`/projects/${encodeURIComponent(projectId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'text', idempotencyKey: sourceRequestKey(fingerprint), ...input }) })
    sourceRequestKeys.delete(fingerprint)
    return result
  },
  addProjectUrlSource: async (projectId: string, input: { title?: string; url: string }) => {
    const fingerprint = JSON.stringify(['url', projectId, input])
    const result = await http<KnowledgeSource>(`/projects/${encodeURIComponent(projectId)}/sources`, { method: 'POST', body: JSON.stringify({ kind: 'url', idempotencyKey: sourceRequestKey(fingerprint), ...input }) })
    sourceRequestKeys.delete(fingerprint)
    return result
  },
  retryProjectSource: (projectId: string, sourceId: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST' }),
  renameProjectSource: (projectId: string, sourceId: string, title: string) => http<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteProjectSource: (projectId: string, sourceId: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
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
  uploadKnowledgeFile: (conversationId: string, file: File, onPending?: () => void) => uploadSource(`/conversations/${encodeURIComponent(conversationId)}/sources`, conversationId, file, onPending),
  retrySource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST' }),
  deleteSource: (conversationId: string, sourceId: string) => http<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
  getConversationSources: async (conversationId: string): Promise<ConversationSourceSelection> => {
    const sources = await http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`)
    return { conversationId, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: (source as KnowledgeSource & { enabled?: boolean }).enabled !== false })) }
  },
  updateConversationSources: (conversationId: string, excludedSourceIds: string[]) => http<{ ok: boolean; excludedSourceIds: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'PUT', body: JSON.stringify({ excludedSourceIds }) })
}
