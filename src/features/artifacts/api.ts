import { http } from '@/api/core/http'
import type { ArtifactEditorGrant, ArtifactSnapshot, ArtifactSummary } from './contracts'

const id = (value: string) => encodeURIComponent(value)

export const artifactsApi = {
  getConversationDesign: (conversationId: string) => http<ArtifactSnapshot | null>(`/conversations/${id(conversationId)}/design`),
  ensureConversationDesign: (conversationId: string) => http<ArtifactSnapshot>(`/conversations/${id(conversationId)}/design`, { method: 'POST' }),
  listSlides: (projectId: string, signal?: AbortSignal) => http<ArtifactSummary[]>(`/projects/${id(projectId)}/slides`, { signal }),
  createSlides: (projectId: string, title: string) => http<ArtifactSnapshot>(`/projects/${id(projectId)}/slides`, { method: 'POST', body: JSON.stringify({ title }) }),
  get: (artifactId: string, signal?: AbortSignal) => http<ArtifactSnapshot>(`/artifacts/${id(artifactId)}`, { signal }),
  rename: (artifactId: string, title: string) => http<ArtifactSnapshot>(`/artifacts/${id(artifactId)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  remove: (artifactId: string) => http<{ ok: boolean }>(`/artifacts/${id(artifactId)}`, { method: 'DELETE' }),
  editorGrant: (artifactId: string, signal?: AbortSignal) => http<ArtifactEditorGrant>(`/artifacts/${id(artifactId)}/editor-grant`, { method: 'POST', signal }),
}
