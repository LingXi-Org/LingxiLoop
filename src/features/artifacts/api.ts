import { http } from '@/api/core/http'
import type { ArtifactEditorGrant, ArtifactSnapshot, ArtifactSummary } from './contracts'
import type { SlideEditorContext } from '../../../shared/slides-editor-context'

export interface SlideWorkspace { artifactId: string; conversationId: string; agentId: string; sourceConversationId: string | null }
export interface SlideRevisions { current: string; revisions: Array<{ seq: string; version: string; actorId: string | null; createdAt: string; actorName?:string;actorKind?:'user'|'agent';changedPageIds?:string[] }> }

const id = (value: string) => encodeURIComponent(value)

export const artifactsApi = {
  slideWorkspace: (artifactId: string, signal?: AbortSignal) => http<SlideWorkspace>(`/artifacts/${id(artifactId)}/slides-workspace`, { method: 'POST', signal }),
  editorContext: (artifactId: string, context: SlideEditorContext, signal?: AbortSignal) => http<SlideEditorContext>(`/artifacts/${id(artifactId)}/editor-context`, { method: 'PUT', body: JSON.stringify(context), signal }),
  revisions: (artifactId: string,signal?:AbortSignal) => http<SlideRevisions>(`/artifacts/${id(artifactId)}/revisions`,{signal}),
  restoreRevision: (artifactId: string, seq: string, version: string) => http<{ version: string }>(`/artifacts/${id(artifactId)}/revisions/${id(seq)}/restore`, { method: 'POST', body: JSON.stringify({ version }) }),
  getConversationDesign: (conversationId: string) => http<ArtifactSnapshot | null>(`/conversations/${id(conversationId)}/design`),
  ensureConversationDesign: (conversationId: string) => http<ArtifactSnapshot>(`/conversations/${id(conversationId)}/design`, { method: 'POST' }),
  listSlides: (projectId: string, signal?: AbortSignal) => http<ArtifactSummary[]>(`/projects/${id(projectId)}/slides`, { signal }),
  createSlides: (projectId: string, title: string) => http<ArtifactSnapshot>(`/projects/${id(projectId)}/slides`, { method: 'POST', body: JSON.stringify({ title }) }),
  get: (artifactId: string, signal?: AbortSignal) => http<ArtifactSnapshot>(`/artifacts/${id(artifactId)}`, { signal }),
  rename: (artifactId: string, title: string, expectedVersion: number, operationId: string) => http<ArtifactSnapshot>(`/artifacts/${id(artifactId)}`, { method: 'PATCH', body: JSON.stringify({ title, expectedVersion, operationId }) }),
  remove: (artifactId: string) => http<{ ok: boolean }>(`/artifacts/${id(artifactId)}`, { method: 'DELETE' }),
  editorGrant: (artifactId: string, signal?: AbortSignal) => http<ArtifactEditorGrant>(`/artifacts/${id(artifactId)}/editor-grant`, { method: 'POST', signal }),
}
