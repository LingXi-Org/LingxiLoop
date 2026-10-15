import { z } from 'zod'
import { homeworkLearnerTools } from './homework-tools.js'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import { productConversationId } from '../../agent-runtime/identity.js'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource, audienceHumanIds } from '../../agents/tools.js'
import { createPermissionService } from '../access/public.js'
import { ForumApplication } from './forum-application.js'
import { readAgentChannelMessages } from '../../im/public.js'

async function scope(context: ActionContext, action: 'learning:read' | 'learning:submit' = 'learning:read') {
  const db=context.database as Queryable, companyId=context.work.tenantId, userId=context.work.principalId!
  const permission=createPermissionService(db,{lockDependencies:true})
  const access=await permission.assertCan({actorUserId:userId,companyId,action,resource:{type:'conversation',id:productConversationId(context.work)}})
  const projectId=access.project?.id
  if (!projectId) throw new NoEffectError('forum project is required','forbidden')
  for (const actorUserId of await audienceHumanIds(context)) if (actorUserId!==userId) {
    await permission.assertCan({actorUserId,companyId,action:'learning:review',resource:{type:'project',id:projectId}})
  }
  const course=await db.query<{id:string}>('SELECT id FROM courses WHERE company_id=$1 AND project_id=$2',[companyId,projectId])
  if (!course.rows[0]) throw new NoEffectError('course forum is required','forbidden')
  return { db, companyId, userId, projectId, courseId:course.rows[0].id, forum:new ForumApplication(db,run=>run(db)) }
}
import { conversationReferencesSchema } from './forum-evidence.js'
const id=z.string().min(1).max(200)
export const learningTools: ToolDefinition[] = [
  ...homeworkLearnerTools,
  nativeTool('learning.list_assignments',z.object({}).strict(),{description:'Read teacher assignments in the current course forum.',effect:'read',approval:false,
    authorize:async context=>{await scope(context)},async execute(context) {
      const s=await scope(context)
      return {ok:true,executionState:'succeeded',value:await s.forum.list(s,s.courseId,{kind:'assignment'})}
    }}),
  nativeTool('learning.get_assignment',z.object({assignmentId:id}).strict(),{description:'Read a teacher forum assignment.',effect:'read',approval:false,
    authorize:async context=>{await scope(context)},async execute(context,input) {
      const s=await scope(context), item=await s.forum.detail(s,s.courseId,'post',input.assignmentId)
      if(item.kind!=='assignment') throw new NoEffectError('assignment not found')
      return {ok:true,executionState:'succeeded',value:item}
    }}),
  nativeTool('learning.list_submissions',z.object({assignmentId:id}).strict(),{description:'Read only the original human’s private submission history.',effect:'read',approval:false,
    authorize:async context=>{await scope(context,'learning:submit')},async execute(context,input) {
      const s=await scope(context,'learning:submit')
      return {ok:true,executionState:'succeeded',value:await s.forum.submissions(s,s.courseId,input.assignmentId,0)}
    }}),
  nativeTool('learning.submit_assignment',z.object({assignmentId:id,answer:z.string().min(1).max(20000),
    conversationReferences:conversationReferencesSchema,source:z.enum(['AGENT_RELAY','AGENT_GENERATED']),messageIds:z.array(id).max(20).default([]),idempotencyKey:id}).strict(),{
    description:'Submit to a teacher forum assignment for the original student, preserving relay/generated attribution. Relay must exactly match committed human messages. Require at least one student-selected real conversation reference containing their own message followed by an assistant reply; the quoted range will be shared with the course teacher. The server automatically queues a learning assessment.',
    effect:'transaction',approval:false,authorize:async context=>{await scope(context,'learning:submit')},async execute(context,input) {
      const s=await scope(context,'learning:submit')
      if(input.source==='AGENT_RELAY') {
        const messages=await readAgentChannelMessages({companyId:s.companyId,agentId:context.work.agentId,
          channelId:productConversationId(context.work),messageIds:input.messageIds,signal:context.signal})
        if(!input.messageIds.length || !messages || messages.length!==input.messageIds.length
          || messages.some(m=>m.fromUid!==s.userId || m.payload.role!=='user')
          || input.answer!==messages.map(m=>m.payload.content.filter(p=>p.type==='text').map(p=>'text' in p ? p.text : '').join('\n')).join('\n')) {
          throw new NoEffectError('relay must exactly preserve committed human text','forbidden')
        }
      }
      const result=await s.forum.submit(s,s.courseId,input.assignmentId,{answer:input.answer,idempotencyKey:input.idempotencyKey,conversationReferences:input.conversationReferences},
        {id:context.work.agentId,workId:context.work.id,source:input.source})
      return {ok:true,executionState:'succeeded',value:result}
    },async verify(context,input,value) {
      const s=await scope(context,'learning:submit'), result=value as {attemptId:string}
      const row=await s.db.query('SELECT answer,source FROM course_forum_submissions WHERE company_id=$1 AND project_id=$2 AND learner_id=$3 AND assignment_id=$4 AND id=$5',
        [s.companyId,s.projectId,s.userId,input.assignmentId,result.attemptId])
      return compareResource(`forum_submission:${result.attemptId}`,{answer:input.answer,source:input.source},row.rows[0] ?? {})
    }}),
]
