import type { AgentActionContext } from '../../agents/contracts.js'
import type { Queryable } from '../../db/queryable.js'
import { pool } from '../../db/pool.js'
import { loadTeacherTurnContext as teacherContext } from './teacher-agent-application.js'
import { createPermissionService } from '../access/public.js'
import { listForumItems } from './forum-repository.js'
export function loadTeacherTurnContext(work: AgentActionContext, db: Queryable = pool) { return teacherContext(work,db) }
export async function loadLearningTurnContext(work: AgentActionContext, actorId?: string, db: Queryable = pool) {
  const permission=await createPermissionService(db).assertCan({actorUserId:actorId ?? work.authorizationUserId!,companyId:work.companyId,
    action:'learning:read',resource:{type:'conversation',id:work.channelId}})
  if (!permission.project) return undefined
  return { projectId:permission.project.id, assignments:await listForumItems(db,work.companyId,permission.project.id,{kind:'assignment'}) }
}
