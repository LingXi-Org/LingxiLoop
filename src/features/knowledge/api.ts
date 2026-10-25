
import { http } from '@/api/core/http'
import { putPresignedFile } from '@/api/transport'
import { uploadsApi } from '@/features/platform/api'
import { projectLifecycleApi } from '@/features/projects/api'
import type { WorkspaceSummary } from '@/types'
import type {
  ConversationSourceSelection,
  KnowledgeSource,
  ProjectMaterials,
} from './contracts'

const sourceRequestKeys = new Map<string, { key: string; sourceId?: string; uploaded?: boolean }>()
function sourceRequestKey(fingerprint: string): string {
  const request = sourceRequestKeys.get(fingerprint) ?? { key: crypto.randomUUID() }
  sourceRequestKeys.set(fingerprint, request)
  return request.key
}

async function deleteSource(path: string, sourceId: string): Promise<{ ok: boolean }> {
  const result = await http<{ ok: boolean }>(path, { method: 'DELETE' })
  if (result.ok) {
    for (const [fingerprint, request] of sourceRequestKeys) {
      if (request.sourceId === sourceId) sourceRequestKeys.delete(fingerprint)
    }
  }
  return result
}

export interface MaterialUploadBinding {
  companyId: string
  userId: string
  space: 'public' | 'private'
  isCurrentIdentity(): boolean
}

interface BoundUpload {
  headers: Record<string, string>
  assertIdentity(): void
  put(uploadUrl: string, file: File, mime: string): Promise<{ ok: boolean; status: number }>
  mime: string
}

async function uploadSource(basePath: string, fingerprintScope: string, file: File, onPending?: () => void, bound?: BoundUpload): Promise<void> {
  bound?.assertIdentity()
  const caps = await uploadsApi.uploadCapabilities()
  bound?.assertIdentity()
  const mime = bound?.mime ?? (file.type || 'text/plain')
  if (file.size > caps.maxBytes) throw new Error(`文件超过 ${Math.round(caps.maxBytes / 1024 / 1024)} MB 大小限制。`)
  if (!caps.allowedMimes.includes(mime)) throw new Error('文件格式暂不支持，请选择支持的文件。')
  const fingerprint = JSON.stringify(['file', fingerprintScope, file.name, file.size, file.lastModified, mime])
  const pending = sourceRequestKeys.get(fingerprint)
  if (pending?.uploaded && pending.sourceId) {
    bound?.assertIdentity()
    await http(`${basePath}/${encodeURIComponent(pending.sourceId)}/complete-upload`, { method: 'POST', headers: bound?.headers })
    sourceRequestKeys.delete(fingerprint)
    return
  }
  const signed = await http<{ id: string; uploadUrl: string; mime: string; size: number }>(`${basePath}/upload/presign`, {
    method: 'POST', headers: bound?.headers, body: JSON.stringify({ idempotencyKey: sourceRequestKey(fingerprint), name: file.name, mime, size: file.size }),
  })
  const request = sourceRequestKeys.get(fingerprint)
  if (request) request.sourceId = signed.id
  onPending?.()
  bound?.assertIdentity()
  const response = await (bound ? bound.put(signed.uploadUrl, file, mime) : putPresignedFile(signed.uploadUrl, file, mime))
  if (!response.ok) throw new Error(`source upload failed: ${response.status}`)
  if (request) request.uploaded = true
  bound?.assertIdentity()
  await http(`${basePath}/${encodeURIComponent(signed.id)}/complete-upload`, { method: 'POST', headers: bound?.headers })
  sourceRequestKeys.delete(fingerprint)
}

export const knowledgeApi = {
  listProjects: () => http<WorkspaceSummary[]>('/projects'),
  openProject: (id: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}/open`, { method: 'POST' }),
  archiveProject: projectLifecycleApi.archive,
  deleteProject: projectLifecycleApi.delete,
  updateProject: (projectId: string, input: { name?: string; description?: string; color?: string | null }) =>
    http<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify(input) }),
  listProjectSources: (projectId: string) => http<KnowledgeSource[]>(`/projects/${encodeURIComponent(projectId)}/sources`),
  listProjectMaterials: (projectId: string, space: 'public' | 'private', signal?: AbortSignal) =>
    http<ProjectMaterials>(`/projects/${encodeURIComponent(projectId)}/sources?space=${space}`, { signal, headers: { 'x-project-id': projectId } }),
  uploadProjectMaterial: async (projectId: string, file: File, binding: MaterialUploadBinding, onProgress: (percent: number) => void) => {
    const [{ putMaterialFile }, { materialMimes }] = await Promise.all([
      import('../course-materials/upload-transport'), import('../course-materials/data'),
    ])
    // Browser MIME aliases (especially Windows ZIP and Markdown) vary; the
    // server validates canonical format plus the actual original-file bytes.
    const mime = materialMimes[file.name.split('.').at(-1)?.toLowerCase() ?? '']
      ?? (file.type || 'application/octet-stream')
    return uploadSource(`/projects/${encodeURIComponent(projectId)}/sources`,
      JSON.stringify([binding.companyId, binding.userId, projectId, binding.space]), file, undefined, {
        mime, headers: { 'x-company-id': binding.companyId, 'x-project-id': projectId },
        assertIdentity() { if (!binding.isCurrentIdentity()) throw new Error('登录账号已改变，请重新上传。') },
        put: (url, selected, contentType) => putMaterialFile(url, selected, contentType, onProgress),
      })
  },
  getProjectSource: (projectId: string, sourceId: string) => http<KnowledgeSource>(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`),
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
  deleteProjectSource: (projectId: string, sourceId: string) => deleteSource(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, sourceId),
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
  deleteSource: (conversationId: string, sourceId: string) => deleteSource(`/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`, sourceId),
  getConversationSources: async (conversationId: string): Promise<ConversationSourceSelection> => {
    const sources = await http<KnowledgeSource[]>(`/conversations/${encodeURIComponent(conversationId)}/sources`)
    return { conversationId, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: (source as KnowledgeSource & { enabled?: boolean }).enabled !== false })) }
  },
  updateConversationSources: (conversationId: string, excludedSourceIds: string[]) => http<{ ok: boolean; excludedSourceIds: string[] }>(`/conversations/${encodeURIComponent(conversationId)}/sources`, { method: 'PUT', body: JSON.stringify({ excludedSourceIds }) })
}
