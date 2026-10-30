export type ArtifactKind = 'design' | 'slides'
export type ArtifactWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'

export interface ArtifactSummary {
  id: string
  kind: ArtifactKind
  title: string
  projectId: string
  conversationId: string | null
  status: ArtifactWorkspaceStatus
  fileCount: number
  assignmentCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ArtifactSnapshot extends Omit<ArtifactSummary, 'fileCount' | 'assignmentCount'> {
  goal: string
  initiatorAgentId: string | null
  ver: string
  seq: number
  files: Record<string, { sha256: string; size: number; contentType: string }>
  assignments: Array<{ id: string; agentId: string; assignment: string; status: string; executionRole: 'specialist' | 'verifier' }>
}

export interface ArtifactEditorGrant {
  url: string
  expiresAt: number
  write: boolean
}

/** The collaboration progress card an artifact's workspace posts in its conversation. */
export interface ArtifactProgress {
  artifactId: string
  kind: ArtifactKind
  title: string
  goal: string
  status: ArtifactWorkspaceStatus
  coordinatorAgentId: string | null
  assignments: Array<{ id: string; agentId: string; task: string; status: string; executionRole: string }>
}

export const ARTIFACT_LABELS: Record<ArtifactKind, string> = { design: '设计', slides: '演示文稿' }
