import { auditInTransaction, gravatarUrlForEmail } from '../identity/public.js'
import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { generateInvitationToken, hashInvitationToken } from '../../http/invitation-token.js'
import { wukongClient } from '../../im/wukong.js'
import { ensureProjectNotebook, syncProjectNotebookMetadata } from '../knowledge/public.js'
import {
  closeTeacherRoomForCourse,
  ensureTeacherAgentForCourse,
  reactivateTeacherRoomForCourse,
  sendTeacherAgentWelcome,
  syncTeacherRoomMembers,
} from './teacher-agent-application.js'
import { seedMemberDirectConversations } from '../conversations/public.js'
import { CH_DOC_ACCESS_REVOKED, publish } from '../../redis.js'
import { LearningApplication } from './application.js'
import { inc } from '../../metrics.js'

function teacherTransaction(db: Queryable) {
  return <T>(work: (client: Queryable) => Promise<T>): Promise<T> => db === pool
    ? withTransaction(pool, work)
    : work(db)
}

export const learningApplication = new LearningApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction: async (db, event) => { await auditInTransaction(db, event) },
  ensureTeacherAgent: (companyId, courseId, db) => ensureTeacherAgentForCourse(companyId, courseId, db, teacherTransaction(db)),
  syncTeacherRoom: (companyId, courseId) => syncTeacherRoomMembers(companyId, courseId, pool, teacherTransaction(pool)),
  welcomeTeacherAgent: (companyId, courseId) => sendTeacherAgentWelcome(companyId, courseId, pool),
  closeTeacherRoom: (companyId, courseId) => closeTeacherRoomForCourse(companyId, courseId, pool, teacherTransaction(pool)),
  reactivateTeacherRoom: (companyId, courseId) => reactivateTeacherRoomForCourse(companyId, courseId, pool, teacherTransaction(pool)),
  ensureNotebook: async (projectId, companyId) => { await ensureProjectNotebook(projectId, companyId) },
  syncNotebook: syncProjectNotebookMetadata,
  syncChannel: async (channel) => {
    await wukongClient().upsertChannel({ channelType: 2, ...channel })
  },
  revokeDocumentSubscriptions: async (userId, companyId, projectId) => {
    const { revokeUserProjectDocumentSubscriptions } = await import('../../ws.js')
    await revokeUserProjectDocumentSubscriptions(userId, companyId, projectId)
  },
  publishDocumentAccessRevoked: async (event) => {
    await publish(CH_DOC_ACCESS_REVOKED, { type: 'doc.access.revoked', ...event })
  },
  seedMemberDms: async (companyId, userId) => {
    await seedMemberDirectConversations({ companyId, memberId: userId })
  },
  generateInvitationToken,
  hashInvitationToken,
  invitationUrl: (token) => {
    const base = (env.INVITE_BASE_URL || env.AUTH_DONE_URL).replace(/\/+$/, '')
    return `${base}/invite/course/${encodeURIComponent(token)}`
  },
  avatarForEmail: gravatarUrlForEmail,
  teacherAgentSummary: async (companyId, courseId, userId) => {
    const { getTeacherAgentSummary } = await import('./teacher-agent-application.js')
    return getTeacherAgentSummary(companyId, courseId, userId, pool)
  },
  metric: inc,
})
