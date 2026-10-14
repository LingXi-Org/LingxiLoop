import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { createHomeworkThread } from '../context-threads/public.js'
import { getAgentChannelHistory, readAgentChannelMessages } from '../../im/public.js'
import { nativeAttachments } from '../../im/message-types.js'
import { unavailableAttachmentIds } from '../../agent-runtime/attachments.js'
import type { LearningScope } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { enqueueLearningEffect } from './effects-repository.js'
import { assertOwnedLearningAttachments } from './submission-attachments.js'
import { homeworkEvidenceAvailable, readHomeworkReportEvidence, readHomeworkMaterials } from './homework-effects.js'
import { homeworkAssessmentSchema, homeworkDeadlineSchema, homeworkDraftSchema, homeworkEditSchema, homeworkPublishSchema,
  homeworkReportSchema, homeworkReviewSchema, homeworkRevisionSchema, homeworkSaveAnswerSchema, homeworkShareSchema,
  homeworkSubmitSchema, homeworkUnlockSchema, type HomeworkDraft, type HomeworkMaterial } from './homework-contracts.js'
import { assertHomeworkPublished, assertHomeworkRevision, homeworkHash, homeworkRow, homeworkScope, homeworkState,
  homeworkSubmissions, homeworkView, studentHomeworkView, type HomeworkTransaction } from './homework-repository.js'

export class HomeworkApplication {
  constructor(private readonly db:Queryable,private readonly transaction:HomeworkTransaction) {}

  async draft(scope:LearningScope,courseId:string,input:HomeworkDraft) {
    const data=homeworkDraftSchema.parse(input),id=randomUUID()
    await this.transaction(async db=>{
      const project=await homeworkScope(db,scope,courseId,'manage')
      await assertOwnedLearningAttachments(db,scope,data.attachments)
      await db.query(`INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,links,attachments,due_at,visible_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12)`,
      [id,scope.companyId,project.projectId,courseId,scope.userId,data.title,data.instructions,JSON.stringify(data.criteria),JSON.stringify(data.links),JSON.stringify(data.attachments),data.dueAt,homeworkHash(data)])
      await enqueueLearningEffect(db,{companyId:scope.companyId,courseId,kind:'homework.validate',effectKey:id,payload:{homeworkId:id,revision:1,userId:scope.userId}})
    })
    return this.detail(scope,courseId,id)
  }

  async detail(scope:LearningScope,courseId:string,id:string) {
    await homeworkScope(this.db,scope,courseId)
    const hw=await homeworkRow(this.db,scope,courseId,id)
    const teacher=(await createPermissionService(this.db).can({actorUserId:scope.userId,companyId:scope.companyId,action:'learning:review',resource:{type:'course',id:courseId}})).allowed
    if(!teacher) assertHomeworkPublished(hw)
    return {homework:homeworkView(hw,scope.userId),teacher,student:teacher?null:await studentHomeworkView(this.db,hw,await homeworkState(this.db,hw,scope.userId))}
  }

  async updateDraft(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkEditSchema>) {
    const {expectedRevision,...data}=homeworkEditSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'manage')
      const hw=await homeworkRow(db,scope,courseId,id,true)
      if(hw.created_by!==scope.userId) throw new LearningApplicationError('forbidden','只有发起教师可以修改草稿')
      if(hw.status!=='DRAFT') throw new LearningApplicationError('conflict','已发布的要求不可修改，请关闭后创建新版作业')
      assertHomeworkRevision(hw.revision,expectedRevision)
      await assertOwnedLearningAttachments(db,scope,data.attachments)
      await db.query(`UPDATE homeworks SET title=$3,instructions=$4,criteria=$5::jsonb,links=$6::jsonb,attachments=$7::jsonb,due_at=$8,
        visible_hash=$9,revision=revision+1,validation_status='PENDING',validated_revision=NULL,validation_feedback='',materials='[]',updated_at=NOW()
        WHERE company_id=$1 AND id=$2`,[scope.companyId,id,data.title,data.instructions,JSON.stringify(data.criteria),JSON.stringify(data.links),JSON.stringify(data.attachments),data.dueAt,homeworkHash(data)])
      await enqueueLearningEffect(db,{companyId:scope.companyId,courseId,kind:'homework.validate',effectKey:id,payload:{homeworkId:id,revision:hw.revision+1,userId:scope.userId}})
    })
    return this.detail(scope,courseId,id)
  }

  async publish(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkPublishSchema>) {
    const data=homeworkPublishSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'manage')
      const hw=await homeworkRow(db,scope,courseId,id,true)
      if(hw.created_by!==scope.userId) throw new LearningApplicationError('forbidden','只有发起教师可以确认发布')
      assertHomeworkRevision(hw.revision,data.expectedRevision)
      if(hw.visible_hash!==data.visibleHash) throw new LearningApplicationError('conflict','草稿内容已变化，请重新确认')
      if(hw.status==='PUBLISHED'&&hw.publish_key===data.idempotencyKey) return
      if(hw.status!=='DRAFT'||hw.validated_revision!==hw.revision||hw.validation_status!=='READY') throw new LearningApplicationError('conflict','请等待最新内容验证通过后再发布')
      await assertOwnedLearningAttachments(db,scope,hw.attachments)
      await db.query(`UPDATE homeworks SET status='PUBLISHED',published_at=NOW(),publish_key=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[scope.companyId,id,data.idempotencyKey])
    })
    return this.detail(scope,courseId,id)
  }

  async close(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkRevisionSchema>) {
    const data=homeworkRevisionSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'manage')
      const hw=await homeworkRow(db,scope,courseId,id,true)
      assertHomeworkPublished(hw);assertHomeworkRevision(hw.revision,data.expectedRevision)
      await db.query(`UPDATE homeworks SET status='CLOSED',updated_at=NOW() WHERE company_id=$1 AND id=$2`,[scope.companyId,id])
    })
    return this.detail(scope,courseId,id)
  }

  async extendDeadline(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkDeadlineSchema>) {
    const data=homeworkDeadlineSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'manage')
      const hw=await homeworkRow(db,scope,courseId,id,true)
      assertHomeworkPublished(hw);assertHomeworkRevision(hw.revision,data.expectedRevision)
      if(!hw.due_at||new Date(data.dueAt)<=new Date(hw.due_at)) throw new LearningApplicationError('invalid','只可延长现有截止时间')
      // Published revision identifies frozen requirements; deadline changes do not invalidate evidence.
      await db.query(`UPDATE homeworks SET due_at=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[scope.companyId,id,data.dueAt])
    })
    return this.detail(scope,courseId,id)
  }

  async start(scope:LearningScope,courseId:string,id:string) {
    const binding=await this.transaction(async db=>{
      const project=await homeworkScope(db,scope,courseId,'submit'),hw=await homeworkRow(db,scope,courseId,id,true)
      assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true)
      const {rows}=await db.query<{id:string}>(`SELECT p.id FROM participants p JOIN courses course ON course.company_id=p.company_id
        JOIN conversations room ON room.company_id=course.company_id AND room.id=course.study_room_conversation_id
        WHERE p.company_id=$1 AND course.project_id=$2 AND p.kind='agent' AND p.departed_at IS NULL AND room.members ? p.id
          AND (($3::text IS NOT NULL AND p.id=$3) OR ($3::text IS NULL AND p.preset_key='nova'))
        ORDER BY p.id LIMIT 1`,[scope.companyId,project.projectId,state.agent_id])
      if(!rows[0]) throw new LearningApplicationError('conflict','课程的学习助手暂不可用，请联系教师')
      await db.query(`UPDATE homework_learner_state SET agent_id=$4,updated_at=NOW() WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId,rows[0].id])
      return {projectId:project.projectId,agentId:rows[0].id}
    })
    const thread=await createHomeworkThread({...scope,projectId:binding.projectId},{homeworkId:id,agentId:binding.agentId})
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true),state=await homeworkState(db,hw,scope.userId,true)
      if(state.agent_id!==binding.agentId||state.channel_id&&state.channel_id!==thread.channelId) throw new LearningApplicationError('conflict','学习对话绑定已变化')
      await db.query(`UPDATE homework_learner_state SET channel_id=$4,updated_at=NOW() WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId,thread.channelId])
    })
    return {...thread,agentId:binding.agentId}
  }

  async saveAnswer(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkSaveAnswerSchema>) {
    const {expectedRevision,...answer}=homeworkSaveAnswerSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true),view=await studentHomeworkView(db,hw,state)
      if(view.status==='PASSED') throw new LearningApplicationError('conflict','作业已通过，需教师退回后才可修改')
      assertHomeworkRevision(state.answer_revision,expectedRevision)
      await assertOwnedLearningAttachments(db,scope,answer.attachments)
      await db.query(`UPDATE homework_learner_state SET answer=$4::jsonb,answer_revision=answer_revision+1,report=NULL,report_status='NONE',report_feedback='',updated_at=NOW()
        WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId,JSON.stringify(answer)])
    })
    return (await this.detail(scope,courseId,id)).student!
  }

  async requestAssessment(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkAssessmentSchema>,binding:{agentId:string;channelId:string}) {
    const data=homeworkAssessmentSchema.parse(input)
    await homeworkScope(this.db,scope,courseId,'submit')
    const scopedHomework=await homeworkRow(this.db,scope,courseId,id),scopedState=await homeworkState(this.db,scopedHomework,scope.userId)
    if(scopedState.agent_id!==binding.agentId||scopedState.channel_id!==binding.channelId) throw new LearningApplicationError('forbidden','证据不属于此作业的私人学习对话')
    const messages=await readAgentChannelMessages({companyId:scope.companyId,agentId:binding.agentId,channelId:binding.channelId,messageIds:data.messageIds})
    const selected=data.messageIds.map(messageId=>messages?.find(message=>(message.clientMsgNo===messageId||message.messageId===messageId)
      && message.fromUid===scope.userId&&message.payload.role==='user'))
    if(selected.some(message=>!message)) throw new LearningApplicationError('forbidden','只能使用当前学生已发送的真实学习证据')
    const messageIds=[...new Set(selected.map(message=>message!.clientMsgNo))].sort()
    const attachments=selected.flatMap(message=>nativeAttachments(message!.payload).map(file=>({clientMsgNo:message!.clientMsgNo,attachmentId:file.id})))
    return this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true)
      if(state.agent_id!==binding.agentId||state.channel_id!==binding.channelId) throw new LearningApplicationError('forbidden','证据不属于此作业的私人学习对话')
      if((await unavailableAttachmentIds(db,scope.companyId,binding.channelId,attachments,[scope.userId])).size) {
        throw new LearningApplicationError('forbidden','学习证据附件的访问权限已变化，请重新选择可读取的证据后验证。')
      }
      const {rows}=await db.query<{id:string;message_ids:string[];status:'PENDING'|'READY';evidence:Array<{materials:HomeworkMaterial[]}>}>(`
        SELECT id,message_ids,status,evidence FROM homework_assessments WHERE id=$1 AND company_id=$2 AND homework_id=$3
          AND learner_id=$4 AND evidence_revision=$5 AND return_epoch=$6 AND status IN ('PENDING','READY')`,
        [state.assessment_id,scope.companyId,id,scope.userId,state.evidence_revision,state.return_epoch])
      const current=rows[0]
      if(current) {
        const previousIds=[...new Set(current.message_ids.map(messageId=>selected.find(message=>message!.clientMsgNo===messageId||message!.messageId===messageId)?.clientMsgNo))].sort()
        if(previousIds.length===messageIds.length&&previousIds.every((messageId,index)=>messageId===messageIds[index])) {
          if(!await homeworkEvidenceAvailable(db,scope,state,current.evidence.flatMap(message=>message.materials))) {
            throw new LearningApplicationError('forbidden','学习证据附件的访问权限已变化，请重新选择可读取的证据后验证。')
          }
          const receipt={assessmentId:current.id,evidenceRevision:state.evidence_revision,returnEpoch:state.return_epoch,status:current.status}
          if(current.status==='PENDING') {
            const payload={homeworkId:id,userId:scope.userId,assessmentId:current.id,evidenceRevision:state.evidence_revision,returnEpoch:state.return_epoch}
            const active=await db.query(`SELECT 1 FROM learning_effects WHERE company_id=$1 AND course_id=$2 AND kind='homework.assess'
              AND effect_key=$3 AND status IN ('pending','processing','failed') AND (payload @> $4::jsonb OR queued_payload @> $4::jsonb)`,
              [scope.companyId,courseId,`${id}:${scope.userId}`,JSON.stringify(payload)])
            if(!active.rows.length) await enqueueLearningEffect(db,{companyId:scope.companyId,courseId,kind:'homework.assess',effectKey:`${id}:${scope.userId}`,payload})
          }
          return receipt
        }
      }
      const assessmentId=randomUUID(),evidenceRevision=state.evidence_revision+1
      await db.query(`INSERT INTO homework_assessments(id,company_id,homework_id,learner_id,evidence_revision,return_epoch,message_ids)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[assessmentId,scope.companyId,id,scope.userId,evidenceRevision,state.return_epoch,JSON.stringify(messageIds)])
      await db.query(`UPDATE homework_learner_state SET assessment_id=$4,evidence_revision=$5,manual_evidence=NULL,manual_unlock=NULL,updated_at=NOW()
        WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId,assessmentId,evidenceRevision])
      await enqueueLearningEffect(db,{companyId:scope.companyId,courseId,kind:'homework.assess',effectKey:`${id}:${scope.userId}`,payload:{homeworkId:id,userId:scope.userId,assessmentId,evidenceRevision,returnEpoch:state.return_epoch}})
      return {assessmentId,evidenceRevision,returnEpoch:state.return_epoch,status:'PENDING' as const}
    })
  }

  async requestReport(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkReportSchema>) {
    const data=homeworkReportSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true),view=await studentHomeworkView(db,hw,state)
      assertHomeworkRevision(state.answer_revision,data.expectedAnswerRevision)
      if(!view.hasLearningRecord) throw new LearningApplicationError('conflict','请先在本作业学习对话中留下真实学习记录')
      if(!state.answer.text.trim()&&!state.answer.links.length&&!state.answer.attachments.length) throw new LearningApplicationError('invalid','请先保存作答内容')
      if(!view.canSubmit) throw new LearningApplicationError('conflict',hw.status==='CLOSED'?'作业已关闭，仅当前被退回的学生可提交一次修订':'作业已通过')
      await db.query(`UPDATE homework_learner_state SET report=NULL,report_status='PENDING',report_feedback='' WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId])
      await enqueueLearningEffect(db,{companyId:scope.companyId,courseId,kind:'homework.report',effectKey:`${id}:${scope.userId}`,
        payload:{homeworkId:id,userId:scope.userId,answerRevision:state.answer_revision,returnEpoch:state.return_epoch}})
    })
    return (await this.detail(scope,courseId,id)).student!
  }

  async submit(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkSubmitSchema>) {
    const data=homeworkSubmitSchema.parse(input)
    await homeworkScope(this.db,scope,courseId,'submit')
    const snapshot=await homeworkRow(this.db,scope,courseId,id),snapshotState=await homeworkState(this.db,snapshot,scope.userId)
    const duplicate=await this.db.query<{content_hash:string}>(`SELECT content_hash FROM homework_submissions WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3 AND idempotency_key=$4`,[scope.companyId,id,scope.userId,data.idempotencyKey])
    let materialHashes:string[]|null=null
    let evidenceHash:string|null=null
    let conversationSequence:number|null=null
    let evidenceMaterials:HomeworkMaterial[]=[]
    if(!duplicate.rows.length) {
      if(!snapshotState.report||snapshotState.report_status!=='READY'||snapshotState.report.id!==data.reportId)
        throw new LearningApplicationError('conflict','请先为最新内容生成并确认学习报告')
      try {
        const taskMaterials=await readHomeworkMaterials(this.db,scope,snapshot,AbortSignal.timeout(90000))
        const answerMaterials=await readHomeworkMaterials(this.db,scope,snapshotState.answer,AbortSignal.timeout(90000),'answer')
        const evidence=await readHomeworkReportEvidence(this.db,scope,snapshot,snapshotState,AbortSignal.timeout(90000))
        evidenceMaterials=evidence.materials;evidenceHash=evidence.hash;conversationSequence=evidence.conversationSequence
        materialHashes=[...taskMaterials,...answerMaterials,...evidenceMaterials].map(item=>`${item.source}:${item.hash}${item.contentStatus?`:${item.contentStatus}`:''}`)
      } catch { throw new LearningApplicationError('conflict','作答材料无法完整读取，请检查后重新生成报告') }
    }
    const submissionId=await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true),contentHash=homeworkHash(data)
      const prior=await db.query<{id:string;content_hash:string}>(`SELECT id,content_hash FROM homework_submissions WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3 AND idempotency_key=$4`,[scope.companyId,id,scope.userId,data.idempotencyKey])
      if(prior.rows[0]) {
        if(prior.rows[0].content_hash!==contentHash) throw new LearningApplicationError('conflict','重复请求与原提交内容不同')
        return prior.rows[0].id
      }
      assertHomeworkRevision(state.answer_revision,data.expectedAnswerRevision)
      const view=await studentHomeworkView(db,hw,state),report=state.report
      if(!view.canSubmit) throw new LearningApplicationError('conflict',hw.status==='CLOSED'?'作业已关闭，仅当前被退回的学生可提交一次修订':'当前作业尚不可提交')
      if(!report||state.report_status!=='READY'||report.id!==data.reportId||report.answerRevision!==state.answer_revision
        ||report.answerHash!==homeworkHash(state.answer)||report.evidenceHash!==evidenceHash||report.conversationSequence!==conversationSequence||report.returnEpoch!==state.return_epoch
        ||report.homeworkRevision!==hw.revision||homeworkHash(report.materialHashes)!==homeworkHash(materialHashes)
        ||snapshotState.answer_revision!==state.answer_revision)
        throw new LearningApplicationError('conflict','答案或材料已变化，请先为最新内容生成并确认学习报告')
      if(!await homeworkEvidenceAvailable(db,scope,state,evidenceMaterials)) {
        throw new LearningApplicationError('conflict','学习记录附件的访问权限已变化，请重新选择可访问的材料并生成报告')
      }
      await assertOwnedLearningAttachments(db,scope,state.answer.attachments)
      const latest=await getAgentChannelHistory({companyId:scope.companyId,agentId:state.agent_id!,channelId:state.channel_id!,limit:1})
      if(!latest||latest.some(message=>message.channelId!==state.channel_id||!Number.isSafeInteger(message.messageSeq))
        ||Math.max(0,...latest.map(message=>message.messageSeq))!==report.conversationSequence) {
        throw new LearningApplicationError('conflict','学习对话已更新，请先重新生成并确认学习报告')
      }
      const submission=randomUUID(),version=(view.latestSubmission?.version??0)+1
      await db.query(`INSERT INTO homework_submissions(id,company_id,project_id,homework_id,learner_id,version,idempotency_key,content_hash,answer,report,answer_revision,return_epoch,late,submitted_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,($13::timestamptz<submission_clock.submitted_at) IS TRUE,submission_clock.submitted_at
        FROM (SELECT clock_timestamp() AS submitted_at) submission_clock`,
      [submission,scope.companyId,hw.project_id,id,scope.userId,version,data.idempotencyKey,contentHash,JSON.stringify(state.answer),JSON.stringify(report),state.answer_revision,state.return_epoch,hw.due_at])
      await db.query(`UPDATE homework_learner_state SET latest_submission_id=$4,updated_at=NOW() WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,scope.userId,submission])
      return submission
    })
    const hw=await homeworkRow(this.db,scope,courseId,id)
    return (await homeworkSubmissions(this.db,hw,scope.userId,0,submissionId))[0]!
  }

  async submissions(scope:LearningScope,courseId:string,id:string,offset=0) {
    await homeworkScope(this.db,scope,courseId)
    const hw=await homeworkRow(this.db,scope,courseId,id);assertHomeworkPublished(hw)
    const teacher=(await createPermissionService(this.db).can({actorUserId:scope.userId,companyId:scope.companyId,action:'learning:review',resource:{type:'course',id:courseId}})).allowed
    const rows=await homeworkSubmissions(this.db,hw,teacher?null:scope.userId,offset)
    return {items:rows.slice(0,50),nextOffset:rows.length>50?offset+50:null}
  }

  async learners(scope:LearningScope,courseId:string,id:string,offset=0) {
    await homeworkScope(this.db,scope,courseId,'review')
    const hw=await homeworkRow(this.db,scope,courseId,id);assertHomeworkPublished(hw)
    const {rows}=await this.db.query<{learnerId:string;learnerName:string}>(`SELECT m.user_id AS "learnerId",u.display_name AS "learnerName"
      FROM project_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.project_id=$2 AND m.role='STUDENT' AND m.status='ACTIVE'
      ORDER BY m.user_id LIMIT 51 OFFSET $3`,[scope.companyId,hw.project_id,offset])
    const items=await Promise.all(rows.slice(0,50).map(async learner=>{
      const state=await homeworkState(this.db,hw,learner.learnerId),view=await studentHomeworkView(this.db,hw,state,{readLearningRecord:false})
      return {...learner,status:view.status,missingCriteria:view.criteria.filter(item=>!item.met||!item.independent).map(item=>item.criterion),
        evidenceRevision:state.evidence_revision,latestSubmission:view.latestSubmission,manualReview:state.manual_evidence}
    }))
    return {items,nextOffset:rows.length>50?offset+50:null}
  }

  async shareEvidence(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkShareSchema>) {
    const data=homeworkShareSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,scope.userId,true),view=await studentHomeworkView(db,hw,state)
      assertHomeworkRevision(state.evidence_revision,data.expectedEvidenceRevision)
      if(!view.manualReviewPreview.length) throw new LearningApplicationError('conflict','请先在学习对话中提供证据并完成验证')
      await db.query(`UPDATE homework_learner_state SET manual_evidence=$4::jsonb WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,
      [scope.companyId,id,scope.userId,JSON.stringify({evidence:view.manualReviewPreview,sharedAt:new Date().toISOString(),evidenceRevision:state.evidence_revision})])
    })
    return (await this.detail(scope,courseId,id)).student!
  }

  async manualUnlock(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkUnlockSchema>) {
    const data=homeworkUnlockSchema.parse(input)
    await this.transaction(async db=>{
      // Both actors precede shared permission rows, matching single-actor learner writes.
      await db.query('SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[[scope.userId,data.learnerId]])
      await homeworkScope(db,scope,courseId,'review')
      await homeworkScope(db,{...scope,userId:data.learnerId},courseId,'submit')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,data.learnerId,true)
      assertHomeworkRevision(state.evidence_revision,data.expectedEvidenceRevision)
      if(!state.manual_evidence?.evidence.length||state.manual_evidence.evidenceRevision!==state.evidence_revision) throw new LearningApplicationError('conflict','学生尚未分享当前学习证据')
      const unlock={reason:data.reason,teacherId:scope.userId,evidenceRevision:state.evidence_revision,returnEpoch:state.return_epoch}
      await db.query(`INSERT INTO homework_teacher_decisions(id,company_id,homework_id,learner_id,teacher_id,decision,reason,evidence_revision,return_epoch,created_at)
        VALUES($1,$2,$3,$4,$5,'UNLOCKED',$6,$7,$8,clock_timestamp())`,[randomUUID(),scope.companyId,id,data.learnerId,scope.userId,data.reason,state.evidence_revision,state.return_epoch])
      await db.query(`UPDATE homework_learner_state SET manual_unlock=$4::jsonb,report=NULL,report_status='NONE',report_feedback='' WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,data.learnerId,JSON.stringify(unlock)])
    })
    return {ok:true}
  }

  async review(scope:LearningScope,courseId:string,id:string,input:z.input<typeof homeworkReviewSchema>) {
    const data=homeworkReviewSchema.parse(input)
    await this.transaction(async db=>{
      await homeworkScope(db,scope,courseId,'review')
      const hw=await homeworkRow(db,scope,courseId,id,true);assertHomeworkPublished(hw)
      const state=await homeworkState(db,hw,data.learnerId,true)
      if(!state.latest_submission_id||state.latest_submission_id!==data.expectedSubmissionId) throw new LearningApplicationError('conflict','学生已更新提交，请先查看最新版本')
      const view=await studentHomeworkView(db,hw,state,{readLearningRecord:false})
      if(view.status===data.decision) return
      if(data.decision==='PASSED'&&view.status!=='PENDING') throw new LearningApplicationError('conflict','只能验收当前待批阅的提交')
      await db.query(`INSERT INTO homework_teacher_decisions(id,company_id,homework_id,learner_id,submission_id,teacher_id,decision,reason,evidence_revision,return_epoch,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())`,[randomUUID(),scope.companyId,id,data.learnerId,state.latest_submission_id,scope.userId,data.decision,data.reason,state.evidence_revision,state.return_epoch])
      if(data.decision==='RETURNED') {
        const latest=state.agent_id&&state.channel_id?await getAgentChannelHistory({companyId:scope.companyId,agentId:state.agent_id,channelId:state.channel_id,limit:1}):[]
        const sequence=Math.max(0,...(latest??[]).map(message=>message.messageSeq))
        await db.query(`UPDATE homework_learner_state SET return_epoch=return_epoch+1,returned_at=clock_timestamp(),returned_after_sequence=$4,
          report=NULL,report_status='NONE',report_feedback='',manual_unlock=NULL,manual_evidence=NULL
          WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3`,[scope.companyId,id,data.learnerId,sequence])
      }
    })
    return {ok:true}
  }
}
