import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { readDocumentSnapshot } from '../documents/collaboration-application.js'
import { readAgentChannelMessages } from '../../im/public.js'
import type { ArtifactEvidenceRef } from './contracts.js'

export async function observeArtifactEvidence(db: Queryable, scope: {
  companyId: string; projectId: string; artifactId: string; conversationId: string; principalId: string; signal?: AbortSignal
}, ref: ArtifactEvidenceRef): Promise<Record<string, unknown>> {
  const permissions = createPermissionService(db, { lockDependencies: true })
  const permit = (action: 'document:read' | 'knowledge:read' | 'learning:read', type: 'document' | 'knowledge_source' | 'project', id: string) =>
    permissions.assertCan({ actorUserId: scope.principalId, companyId: scope.companyId, projectId: scope.projectId, action, resource: { type, id } })
  let observed: Record<string, unknown> | undefined
  switch (ref.kind) {
    case 'file': observed = (await db.query('SELECT path,sha256 FROM artifact_files WHERE path=$1 AND artifact_id=$2', [ref.id,scope.artifactId])).rows[0]; break
    case 'report': observed = (await db.query('SELECT id,evidence_id FROM artifact_assignment_reports WHERE id=$1 AND artifact_id=$2 AND company_id=$3', [ref.id,scope.artifactId,scope.companyId])).rows[0]; break
    case 'document': {
      await permit('document:read', 'document', ref.id)
      observed = (await db.query(`SELECT id FROM documents WHERE id=$1 AND company_id=$2 AND project_id=$3
        AND (conversation_id IS NULL OR conversation_id=$4)`, [ref.id,scope.companyId,scope.projectId,scope.conversationId])).rows[0]
      if (observed) { const snapshot = await readDocumentSnapshot(db, ref.id, scope.companyId); observed = { id: ref.id, revision: snapshot.revision, sha256: createHash('sha256').update(snapshot.body).digest('hex') } }
      break
    }
    case 'source':
      await permit('knowledge:read', 'knowledge_source', ref.id)
      observed = (await db.query('SELECT id,updated_at FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL', [ref.id,scope.companyId,scope.projectId])).rows[0]; break
    case 'attempt':
      await permit('learning:read', 'project', scope.projectId)
      observed = (await db.query('SELECT id,submitted_at AS created_at FROM course_forum_submissions WHERE id=$1 AND company_id=$2 AND project_id=$3 AND learner_id=$4', [ref.id,scope.companyId,scope.projectId,scope.principalId])).rows[0]; break
    case 'message': {
      const messages = await readAgentChannelMessages({ companyId: scope.companyId, agentId: scope.principalId,
        channelId: scope.conversationId, messageIds: [ref.id], ...(scope.signal ? { signal: scope.signal } : {}) })
      if (messages?.[0]) observed = { id: ref.id, sha256: createHash('sha256').update(JSON.stringify(messages[0])).digest('hex') }
      break
    }
  }
  if (!observed) throw new Error(`Artifact evidence is outside the authorized scope: ${ref.kind}:${ref.id}`)
  return JSON.parse(JSON.stringify(observed)) as Record<string, unknown>
}
