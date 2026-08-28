import { audit, gravatarUrlForEmail } from '../identity/public.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { generateInvitationToken, hashInvitationToken } from '../../http/invitation-token.js'
import { wukongClient } from '../../im/wukong.js'
import { ensureProjectNotebook, syncProjectNotebookMetadata } from '../../knowledge/service.js'
import {
  closeTeacherRoomForCourse,
  ensureTeacherAgentForCourse,
  reactivateTeacherRoomForCourse,
  sendTeacherAgentWelcome,
  syncTeacherRoomMembers,
} from '../../learning/teacher-agent.js'
import { seedMemberDms } from '../../onboardCompany.js'
import { CH_DOC_ACCESS_REVOKED, publish } from '../../redis.js'
import { LearningApplication } from './application.js'
import { inc } from '../../metrics.js'

export const learningApplication = new LearningApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  audit: async (event) => { await audit(event) },
  ensureTeacherAgent: (courseId, db) => ensureTeacherAgentForCourse(courseId, db),
  syncTeacherRoom: syncTeacherRoomMembers,
  welcomeTeacherAgent: sendTeacherAgentWelcome,
  closeTeacherRoom: closeTeacherRoomForCourse,
  reactivateTeacherRoom: reactivateTeacherRoomForCourse,
  ensureNotebook: async (projectId, companyId) => { await ensureProjectNotebook(projectId, companyId) },
  syncNotebook: syncProjectNotebookMetadata,
  syncChannel: async (channel) => {
    await wukongClient().upsertChannel({ channelType: 2, ...channel })
  },
  revokeDocumentSubscriptions: async (userId, projectId) => {
    const { revokeUserProjectDocumentSubscriptions } = await import('../../ws.js')
    await revokeUserProjectDocumentSubscriptions(userId, projectId)
  },
  publishDocumentAccessRevoked: async (event) => {
    await publish(CH_DOC_ACCESS_REVOKED, { type: 'doc.access.revoked', ...event })
  },
  seedMemberDms: async (companyId, userId) => { await seedMemberDms({ companyId, memberId: userId }) },
  generateInvitationToken,
  hashInvitationToken,
  invitationUrl: (token) => {
    const base = (env.INVITE_BASE_URL || env.AUTH_DONE_URL).replace(/\/+$/, '')
    return `${base}/invite/course/${encodeURIComponent(token)}`
  },
  avatarForEmail: gravatarUrlForEmail,
  teacherAgentSummary: async (courseId, userId) => {
    const { getTeacherAgentSummary } = await import('../../learning/teacher-agent.js')
    return getTeacherAgentSummary(courseId, userId)
  },
  metric: inc,
})
