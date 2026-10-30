import { randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import { persistNativeEvents } from '../../agents/native-events.js'
import { createNativeMessage } from '../../im/message-types.js'
import { missingAgentChannelMessageIds } from '../../im/public.js'
import { CH_ARTIFACTS, publish } from '../../redis.js'
import { createArtifactApplication } from './application.js'
import { acquireArtifactSharedFence, availableAgents, releaseArtifactSharedFence } from './repository.js'
import { createArtifactExecution } from './execution.js'
import { createArtifactRuntime } from './runtime.js'
import type { SharedStateUpdate } from '@lyyzka/lingxios'

const collaboration = createArtifactRuntime(async () => (await import('../../agent-runtime/runtime.js')).lingxiOSControl())
export const readArtifactCollaboration = (companyId: string,userId: string,artifactId: string,afterSeq = 0) => collaboration.readCollaboration(pool,companyId,userId,artifactId,afterSeq)
export const updateArtifactSharedState = (companyId: string,userId: string,artifactId: string,update: SharedStateUpdate) => collaboration.updateSharedState(pool,companyId,userId,artifactId,update)

const artifactApplication = createArtifactApplication({
  db: pool,
  execution: createArtifactExecution(async () => (await import('../../agent-runtime/runtime.js')).lingxiOSControl()),
  transaction: (work) => withTransaction(pool, work),
  withArtifactFence: async (artifactId, work) => {
    const client = await pool.connect()
    try {
      await acquireArtifactSharedFence(client, artifactId)
      return await withClientTransaction(client, work)
    } finally {
      await releaseArtifactSharedFence(client, artifactId).catch(() => undefined)
      client.release()
    }
  },
  missingChannelMessageIds: (input) => missingAgentChannelMessageIds({
    companyId: input.companyId,
    agentId: input.actorId,
    channelId: input.channelId,
    messageIds: input.messageIds,
  }),
  publishEvent: (event) => publish(CH_ARTIFACTS, event),
  /** The thread goes to the agent that last worked on the artifact, else its coordinator, else the room's first capable agent. */
  async deliverComment({ companyId, artifact, authorId, view }) {
    if (!artifact.conversation_id) return
    await withTransaction(pool, async db => {
      const agents = await availableAgents(db, companyId, artifact.conversation_id!, artifact.kind)
      if (!agents.length) return
      const { rows: recent } = await db.query<{ actor_id: string }>(`SELECT actor_id FROM artifact_activity
        WHERE artifact_id=$1 AND actor_kind='agent' ORDER BY created_at DESC LIMIT 20`, [artifact.id])
      const ids = new Set(agents.map(agent => agent.id))
      const agentId = recent.map(row => row.actor_id).find(id => ids.has(id))
        ?? (artifact.initiator_agent_id && ids.has(artifact.initiator_agent_id) ? artifact.initiator_agent_id : agents[0].id)
      const { rows: authorizations } = await db.query<{ authorization: string }>(`SELECT COALESCE(access_revoked_at::text,'') AS authorization
        FROM users WHERE id=$1 AND departed_at IS NULL AND suspended_at IS NULL AND deleted_at IS NULL FOR SHARE`, [authorId])
      if (!authorizations[0]) return
      const id = 'artifact-comment-' + randomUUID()
      const last = view.messages.filter(message => message.from === 'user').at(-1)?.text ?? ''
      const noun = artifact.kind === 'slides' ? '演示文稿' : '设计'
      const text = `@${agentId} 请处理${noun}「${artifact.title}」中的评论 ${view.id}（${view.where}${view.file ? `，${view.file}` : ''}）：${last}`
      await persistNativeEvents(db, { key: id, companyId, workId: id }, [{ type: 'im.user', companyId, userId: authorId,
        channelId: artifact.conversation_id!, clientNonce: id, artifactId: artifact.id, commentId: view.id,
        authorization: authorizations[0].authorization,
        payload: createNativeMessage({ id, role: 'user', content: [{ type: 'text', text }], custom: { mentionedIds: [agentId] } }) }])
    })
  },
})

export const {
  assignArtifactWorkspaceWork,
  completeArtifactWork,
  createComment,
  createSlides,
  deleteArtifact,
  deleteComment,
  editComment,
  ensureConversationDesign,
  getArtifactSnapshot,
  listArtifactAvailableAgents,
  listArtifacts,
  listComments,
  publishArtifactFiles,
  readArtifactFile,
  renameArtifact,
  replyComment,
  sendComment,
  setCommentStatus,
  startArtifactWorkspace,
  stopArtifactAssignment,
  stopArtifactWorkspace,
  submitArtifactReport,
} = artifactApplication

/** What a turn knows up front: the conversation's canvas and decks by title and file paths, never their content. */
export async function artifactTurnContext(companyId: string, conversationId: string, kinds: Array<'design' | 'slides'>) {
  const { rows } = await pool.query<{ id: string; kind: 'design' | 'slides'; title: string; status: string; paths: string[] }>(
    `SELECT artifact.id,artifact.kind,artifact.title,artifact.status,
       COALESCE((SELECT array_agg(file.path ORDER BY file.path) FROM artifact_files file WHERE file.artifact_id=artifact.id),'{}') AS paths
       FROM artifacts artifact WHERE artifact.company_id=$1 AND artifact.conversation_id=$2 AND artifact.kind=ANY($3::text[])
      ORDER BY artifact.updated_at DESC LIMIT 20`, [companyId, conversationId, kinds])
  return {
    ...(kinds.includes('design') ? { design: rows.find(row => row.kind === 'design') ?? null } : {}),
    ...(kinds.includes('slides') ? { slides: rows.filter(row => row.kind === 'slides') } : {}),
  }
}
