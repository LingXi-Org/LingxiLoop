import type { ContentDocument } from '../content-editor/contracts.js'
import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { LearningScope } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import type { HomeworkAnswer, HomeworkJudgment, HomeworkMaterial, HomeworkReport } from './homework-contracts.js'
import type { LearningAttachment } from './forum-contracts.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import { hasHomeworkLearningRecord } from './homework-evidence.js'

export const homeworkHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type HomeworkTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
export interface HomeworkRow {
  id: string; company_id: string; project_id: string; course_id: string; created_by: string; status: 'DRAFT'|'PUBLISHED'|'CLOSED';
  editor_document?: ContentDocument | null; criteria_document?: ContentDocument | null; revision: number; title: string; instructions: string; criteria: string[]; links: string[]; attachments: LearningAttachment[];
  due_at: Date|null; visible_hash: string; validated_revision: number|null; validation_status: 'PENDING'|'READY'|'INVALID';
  validation_feedback: string; materials: HomeworkMaterial[]; publish_key: string|null
}
export interface HomeworkStateRow {
  company_id: string; project_id: string; homework_id: string; learner_id: string; agent_id: string|null; channel_id: string|null;
  answer: HomeworkAnswer; answer_revision: number; evidence_revision: number; assessment_id: string|null;
  report: HomeworkReport|null; report_status: 'NONE'|'PENDING'|'READY'|'INVALID'; report_feedback:string; latest_submission_id: string|null;
  return_epoch: number; returned_at: Date|null; returned_after_sequence: string|number;
  manual_evidence: { evidence: string[]; sharedAt: string; evidenceRevision: number }|null;
  manual_unlock: { reason: string; teacherId: string; evidenceRevision: number; returnEpoch: number }|null
}
export interface HomeworkSubmission {
  conversationReferences:import('./forum-evidence.js').ConversationEvidence[]
  id: string; learnerId: string; learnerName: string; learnerAvatarUrl: string | null; version: number; answer: HomeworkAnswer; report: HomeworkReport;
  submittedAt: string; late: boolean; reviewStatus: 'PENDING'|'PASSED'|'RETURNED'; feedback: string; feedbackDocument?: ContentDocument | null; feedbackAttachments: LearningAttachment[]; feedbackLinks: string[]
}

export async function homeworkScope(db: Queryable, scope: LearningScope, courseId: string, mode: 'read'|'submit'|'manage'|'review'='read') {
  const permissions = createPermissionService(db, { lockDependencies: mode !== 'read' })
  await permissions.assertCan({ actorUserId: scope.userId, companyId: scope.companyId,
    action: `learning:${mode}`, resource: { type: 'course', id: courseId } })
  return requireLearningCourseProjectScope(db,scope.companyId,courseId)
}
export async function homeworkRow(db: Queryable, scope: LearningScope, courseId: string, id: string, lock=false) {
  const { rows } = await db.query<HomeworkRow>(`SELECT * FROM homeworks WHERE company_id=$1 AND course_id=$2 AND id=$3${lock?' FOR UPDATE':''}`,
    [scope.companyId,courseId,id])
  if (!rows[0]) throw new LearningApplicationError('not_found','homework not found')
  return rows[0]
}
export async function homeworkState(db: Queryable, homework: HomeworkRow, learnerId: string, lock=false) {
  if (lock) await db.query(`INSERT INTO homework_learner_state(company_id,project_id,homework_id,learner_id)
    VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[homework.company_id,homework.project_id,homework.id,learnerId])
  const { rows } = await db.query<HomeworkStateRow>(`SELECT * FROM homework_learner_state
    WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3${lock?' FOR UPDATE':''}`,[homework.company_id,homework.id,learnerId])
  return rows[0] ?? { company_id: homework.company_id, project_id: homework.project_id, homework_id: homework.id, learner_id: learnerId,
    agent_id:null,channel_id:null,answer:{text:'',links:[],attachments:[]},answer_revision:0,evidence_revision:0,assessment_id:null,
    report:null,report_status:'NONE' as const,report_feedback:'',latest_submission_id:null,return_epoch:0,returned_at:null,returned_after_sequence:0,manual_evidence:null,manual_unlock:null }
}
export async function homeworkAssessment(db: Queryable,state: HomeworkStateRow): Promise<HomeworkJudgment|null> {
  if (!state.assessment_id) return null
  const { rows } = await db.query<{result:HomeworkJudgment}>(`SELECT result FROM homework_assessments WHERE id=$1 AND company_id=$2
    AND homework_id=$3 AND learner_id=$4 AND evidence_revision=$5 AND return_epoch=$6 AND status IN ('READY','INVALID')`,
    [state.assessment_id,state.company_id,state.homework_id,state.learner_id,state.evidence_revision,state.return_epoch])
  return rows[0]?.result ?? null
}
export const independentMastery = (criteria: HomeworkJudgment['criteria'], required: string[]) => required.length>0
  && criteria.length===required.length && required.every(criterion=>criteria.some(item=>item.criterion===criterion&&item.met&&item.independent))
export const manualMastery = (state: HomeworkStateRow) => Boolean(state.manual_unlock && state.manual_unlock.evidenceRevision===state.evidence_revision
  && state.manual_unlock.returnEpoch===state.return_epoch)

export async function homeworkSubmissions(db: Queryable,hw: HomeworkRow,learnerId: string|null,offset=0,submissionId?:string) {
  const {rows}=await db.query<HomeworkSubmission>(`SELECT s.id,s.learner_id AS "learnerId",u.display_name AS "learnerName",u.avatar_url AS "learnerAvatarUrl",s.version,
    s.answer,s.report,s.conversation_references AS "conversationReferences",s.submitted_at AS "submittedAt",s.late,COALESCE(d.decision,'PENDING') AS "reviewStatus",COALESCE(d.reason,'') AS feedback,d.editor_document AS "feedbackDocument",COALESCE(d.attachments,'[]') AS "feedbackAttachments",COALESCE(d.links,'[]') AS "feedbackLinks"
    FROM homework_submissions s JOIN users u ON u.id=s.learner_id LEFT JOIN LATERAL (
      SELECT decision,reason,editor_document,attachments,links FROM homework_teacher_decisions WHERE company_id=s.company_id AND homework_id=s.homework_id
        AND learner_id=s.learner_id AND submission_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1
    ) d ON TRUE WHERE s.company_id=$1 AND s.homework_id=$2 AND ($3::text IS NULL OR s.learner_id=$3) AND ($5::text IS NULL OR s.id=$5)
    ORDER BY s.submitted_at DESC,s.version DESC LIMIT 51 OFFSET $4`,[hw.company_id,hw.id,learnerId,offset,submissionId??null])
  return rows
}
export async function studentHomeworkView(db:Queryable,hw:HomeworkRow,state:HomeworkStateRow,options:{readLearningRecord?:boolean}={}) {
  const assessment=await homeworkAssessment(db,state)
  const latestSubmission=state.latest_submission_id?(await homeworkSubmissions(db,hw,state.learner_id,0,state.latest_submission_id))[0]??null:null
  const criteria=state.report?.criteria??assessment?.criteria??hw.criteria.map(criterion=>({criterion,met:false,independent:false,feedback:'等待学习证据'}))
  const unlocked=independentMastery(criteria,hw.criteria)||manualMastery(state)
  const status=latestSubmission?.reviewStatus??(unlocked?'MASTERED':state.channel_id||state.evidence_revision?'LEARNING':'NOT_STARTED')
  const hasLearningRecord=options.readLearningRecord===false?Boolean(state.report||latestSubmission):await hasHomeworkLearningRecord(db,hw,state)
  const canSubmit=hasLearningRecord && status!=='PASSED' && hw.status!=='DRAFT' && (hw.status!=='CLOSED'||status==='RETURNED')
  return {answer:state.answer,answerRevision:state.answer_revision,evidenceRevision:state.evidence_revision,channelId:state.channel_id,
    status,unlocked,hasLearningRecord,canSubmit,criteria,report:state.report,reportStatus:state.report_status,reportFeedback:state.report_feedback,latestSubmission,
    feedback:latestSubmission?.feedback??'',feedbackDocument:latestSubmission?.feedbackDocument,feedbackAttachments:latestSubmission?.feedbackAttachments??[],feedbackLinks:latestSubmission?.feedbackLinks??[],manualReview:state.manual_evidence,
    manualReviewPreview:assessment?.evidence.map(item=>item.excerpt)??[]}
}
export function homeworkView(hw:HomeworkRow,userId:string) {
  return {id:hw.id,courseId:hw.course_id,title:hw.title,instructions:hw.instructions,editorDocument:hw.editor_document,criteria:hw.criteria,criteriaDocument:hw.criteria_document,links:hw.links,attachments:hw.attachments,
    dueAt:hw.due_at,status:hw.status,revision:hw.revision,visibleHash:hw.visible_hash,createdBy:hw.created_by,
    validation:{status:hw.validation_status,revision:hw.validated_revision,feedback:hw.validation_feedback},
    canEditDraft:hw.created_by===userId&&hw.status==='DRAFT',
    canPublish:hw.created_by===userId&&hw.status==='DRAFT'&&hw.validation_status==='READY'&&hw.validated_revision===hw.revision}
}
export function assertHomeworkPublished(hw:HomeworkRow) {
  if(hw.status==='DRAFT') throw new LearningApplicationError('not_found','homework not found')
}
export function assertHomeworkRevision(actual:number,expected:number) {
  if(actual!==expected) throw new LearningApplicationError('conflict','内容已更新，请刷新后重试')
}
