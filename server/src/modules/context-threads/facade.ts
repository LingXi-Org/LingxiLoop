import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import { createPermissionService, isActiveProjectStudent } from '../access/public.js'
import { ContextThreadsApplication } from './application.js'

const permissionService = createPermissionService(pool)

export const contextThreadsApplication = new ContextThreadsApplication({
  transaction: (work) => withTransaction(pool, work),
  assertCanManageLearning: async (scope) => {
    await permissionService.assertCan({
      actorUserId: scope.userId,
      action: 'learning:manage',
      companyId: scope.companyId,
      projectId: scope.projectId,
    })
  },
  assertCanWriteConversation: async (scope) => {
    await permissionService.assertCan({
      actorUserId: scope.userId,
      action: 'conversation:write',
      companyId: scope.companyId,
      projectId: scope.projectId,
    })
  },
  isActiveProjectStudent: (db, scope, studentId) => isActiveProjectStudent(db, {
    companyId: scope.companyId,
    projectId: scope.projectId,
    userId: studentId,
  }),
  syncChannel: (profile) => wukongClient().upsertChannel(profile),
})
