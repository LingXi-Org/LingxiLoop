import { z } from 'zod'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { pool } from '../../db/pool.js'
import { productConversationId } from '../../agent-runtime/identity.js'
import type { AgentActionContext } from '../../agents/contracts.js'
import { audienceHumanIds, authorizeAudienceRead, compareResource, nativeContext, nativeTool } from '../../agents/tools.js'
import { HomeworkApplication } from './homework-application.js'
import { homeworkAssessmentSchema, homeworkDraftSchema } from './homework-contracts.js'
import { homeworkRow, homeworkScope, homeworkState, studentHomeworkView } from './homework-repository.js'
import { learnerHomeworkRead, teacherHomeworkOverview } from './homework-reporting.js'
import { resolveTeacherScope } from './teacher-agent-application.js'

const id=z.string().trim().min(1).max(200)
const teacherHomeworkDraftSchema=homeworkDraftSchema.extend({homeworkId:id.optional(),expectedRevision:z.number().int().min(1).optional()})
  .refine(input=>(input.homeworkId===undefined)===(input.expectedRevision===undefined),'homeworkId and expectedRevision are required together')
const application=(db:Queryable)=>new HomeworkApplication(db,work=>work(db))

async function homeworkBinding(work:AgentActionContext,db:Queryable) {
  const {rows}=await db.query<{homework_id:string;course_id:string;project_id:string;learner_id:string;agent_id:string;channel_id:string}>(`
    SELECT s.homework_id,h.course_id,s.project_id,s.learner_id,s.agent_id,s.channel_id FROM homework_learner_state s
    JOIN homeworks h ON h.company_id=s.company_id AND h.id=s.homework_id
    JOIN context_threads t ON t.company_id=s.company_id AND t.project_id=s.project_id AND t.channel_id=s.channel_id
    JOIN im_channel_bindings b ON b.company_id=t.company_id AND b.channel_id=t.channel_id
    WHERE s.company_id=$1 AND s.channel_id=$2 AND t.context_type='HOMEWORK' AND t.context_id=s.homework_id||':'||s.learner_id
      AND h.status IN ('PUBLISHED','CLOSED') AND b.profile->'members' @> jsonb_build_array(s.learner_id,s.agent_id)
      AND jsonb_array_length(b.profile->'members')=2`,[work.companyId,work.channelId])
  const binding=rows[0]
  if(!binding) {
    const context=await db.query(`SELECT 1 FROM context_threads WHERE company_id=$1 AND channel_id=$2 AND context_type='HOMEWORK'`,[work.companyId,work.channelId])
    if(context.rows.length) throw new NoEffectError('homework conversation binding is unavailable','forbidden')
    return null
  }
  if(binding.learner_id!==work.authorizationUserId||binding.agent_id!==work.agentId) throw new NoEffectError('homework evidence belongs to another learner or agent','forbidden')
  await homeworkScope(db,{companyId:work.companyId,userId:binding.learner_id},binding.course_id,'submit')
  return binding
}

export async function loadHomeworkTurnContext(work:AgentActionContext,db:Queryable=pool):Promise<unknown|null> {
  const binding=await homeworkBinding(work,db)
  if(!binding) return null
  const scope={companyId:work.companyId,userId:binding.learner_id},hw=await homeworkRow(db,scope,binding.course_id,binding.homework_id)
  const state=await homeworkState(db,hw,binding.learner_id),view=await studentHomeworkView(db,hw,state)
  return {homework:{id:hw.id,title:hw.title,instructions:hw.instructions,criteria:hw.criteria,dueAt:hw.due_at,status:hw.status},
    materialReading:{available:Boolean(hw.links.length||hw.attachments.length),tool:'learning.get_homework',section:'materials',
      instruction:'Read the complete requirements and material text with learning.get_homework before tutoring about them. Follow nextOffset until null and keep sourceVersion consistent; file names alone are not material evidence.'},
    progress:{status:view.status,criteria:view.criteria,unlocked:view.unlocked,feedback:view.feedback},answerRevision:state.answer_revision,evidenceRevision:state.evidence_revision}
}

async function learner(context:ActionContext,homeworkId:string) {
  const db=context.database as Queryable,binding=await homeworkBinding(nativeContext(context),db)
  if(!binding||binding.homework_id!==homeworkId) throw new NoEffectError('use the dedicated homework conversation','forbidden')
  if((await audienceHumanIds(context)).some(userId=>userId!==binding.learner_id)) throw new NoEffectError('homework learning evidence is private','forbidden')
  return {db,binding,scope:{companyId:context.work.tenantId,userId:binding.learner_id}}
}

export const homeworkLearnerTools:ToolDefinition[]=[
  nativeTool('learning.get_homework',z.object({homeworkId:id,section:z.enum(['summary','requirements','materials','answer','report']).default('summary'),
    offset:z.number().int().min(0).max(1000000).default(0)}).strict(),{
    description:'Read this private homework. Default summary gives bounded progress with abbreviated criterion labels and zero-based indexes. Use requirements for full task and criteria, materials for actual safely extracted source/hash/text, answer for your learner own saved draft, or report for the learner own visible preview. Read complete requirements and materials before tutoring about them. Text sections are character pages: follow nextOffset until null, keep sourceVersion unchanged, and restart if it changes. File names and partial pages are not proof that a material was read. Only host assessment can unlock submission.',effect:'read',approval:false,
    authorize:async(context,input)=>{await learner(context,input.homeworkId)},
    async execute(context,input) {
      const {db,binding,scope}=await learner(context,input.homeworkId)
      const value=await learnerHomeworkRead(db,scope,binding.course_id,input,context.signal)
      await learner(context,input.homeworkId)
      return {ok:true,executionState:'succeeded',value}
    },
  }),
  nativeTool('learning.assess_homework',homeworkAssessmentSchema.extend({homeworkId:id}),{
    description:'Request host verification of genuine committed student messages in this homework conversation. Incorrect or incomplete evidence is valid input; do not wait for mastery before requesting assessment. Supply message IDs, never mastery claims, scores or flags. Repeating the same evidence reuses its PENDING or READY assessment; an INVALID assessment may be retried. Explain unresolved criteria and tutor independent transfer. Assessment is asynchronous; read get_homework for the result.',
    effect:'transaction',approval:false,authorize:async(context,input)=>{await learner(context,input.homeworkId)},
    async execute(context,input) {
      const {db,binding,scope}=await learner(context,input.homeworkId)
      const result=await application(db).requestAssessment(scope,binding.course_id,input.homeworkId,{messageIds:input.messageIds},{agentId:context.work.agentId,channelId:productConversationId(context.work)})
      return {ok:true,executionState:'succeeded',value:{homeworkId:input.homeworkId,...result}}
    },
    async verify(context,input,value) {
      const {db,binding,scope}=await learner(context,input.homeworkId),hw=await homeworkRow(db,scope,binding.course_id,input.homeworkId)
      const state=await homeworkState(db,hw,scope.userId)
      const receipt=value as {assessmentId:string;evidenceRevision:number;returnEpoch:number}
      return compareResource(`homework:${input.homeworkId}`,{assessmentId:receipt.assessmentId,evidenceRevision:receipt.evidenceRevision,returnEpoch:receipt.returnEpoch},
        {assessmentId:state.assessment_id,evidenceRevision:state.evidence_revision,returnEpoch:state.return_epoch})
    },
  }),
]

async function teacher(context:ActionContext) {
  const db=context.database as Queryable,binding=await resolveTeacherScope(nativeContext(context),db)
  await authorizeAudienceRead(context,{projectId:binding.projectId,action:'learning:manage',resource:{type:'project',id:binding.projectId}})
  return {db,binding,scope:{companyId:binding.companyId,userId:binding.teacherId!}}
}

export const homeworkTeacherTools:ToolDefinition[]=[
  nativeTool('teacher.draft_homework',teacherHomeworkDraftSchema,{
    description:'Create or revise a homework draft with clear instructions and a few human-readable independent mastery criteria. To revise the same draft provide both homeworkId and its current expectedRevision. The initiating teacher must edit/review and explicitly click the latest draft card to publish. Every revision requires renewed confirmation. This tool never publishes. Do not create legacy activities, objectives or Missions for homework.',
    effect:'transaction',approval:false,authorize:async context=>{
      if(context.work.kind==='teacher_digest') throw new NoEffectError('scheduled summaries are read only','forbidden')
      await teacher(context)
    },
    async execute(context,input) {
      const {db,binding,scope}=await teacher(context),{homeworkId,expectedRevision,...draft}=input
      const detail=homeworkId?await application(db).updateDraft(scope,binding.courseId,homeworkId,{...draft,expectedRevision:expectedRevision!})
        :await application(db).draft(scope,binding.courseId,draft)
      return {ok:true,executionState:'succeeded',value:{result:{homeworkId:detail.homework.id,courseId:binding.courseId,revision:detail.homework.revision},
        state:{revision:detail.homework.revision,visibleHash:detail.homework.visibleHash}}}
    },
    async verify(context,_input,value) {
      const {db,binding,scope}=await teacher(context),stored=value as {result:{homeworkId:string};state:{revision:number;visibleHash:string}}
      const hw=await homeworkRow(db,scope,binding.courseId,stored.result.homeworkId)
      return compareResource(`homework:${hw.id}`,stored.state,{revision:hw.revision,visibleHash:hw.visible_hash})
    },
  }),
  nativeTool('teacher.homework_overview',z.object({homeworkId:id.optional(),learnerId:id.optional(),
    section:z.enum(['report','answer','shared_evidence']).default('report'),offset:z.number().int().min(0).max(1000000).default(0)}).strict()
    .refine(input=>!input.learnerId||Boolean(input.homeworkId),'learnerId requires homeworkId'),{
    description:'List published homework, or provide homeworkId for whole-class status counts, missing-criterion counts and a short learner page. Criterion labels are abbreviated; indexes start at zero. Provide learnerId plus homeworkId to read a submitted report, submitted answer, or explicitly shared_evidence text. Follow nextOffset until null: offset counts rows for lists and characters for learner text. Never treat a partial text page as the full evidence; submission metadata identifies the snapshot. Draft answers and private chat are never returned. Give recommendations; teachers alone pass, return or manually unlock in the forum.',
    effect:'read',approval:false,authorize:async context=>{await teacher(context)},
    async execute(context,input) {
      const {db,binding,scope}=await teacher(context)
      return {ok:true,executionState:'succeeded',value:await teacherHomeworkOverview(db,scope,binding.courseId,input)}
    },
  }),
]
