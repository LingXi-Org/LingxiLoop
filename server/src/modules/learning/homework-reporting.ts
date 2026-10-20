import { NoEffectError } from '@lyyzka/lingxios'
import { homeworkAnswerText } from './homework-answer.js'
import type { Queryable } from '../../db/queryable.js'
import type { LearningScope } from './contracts.js'
import type { HomeworkReport } from './homework-contracts.js'
import { readHomeworkMaterials } from './homework-effects.js'
import { assertHomeworkPublished, homeworkHash, homeworkRow, homeworkScope, homeworkState, studentHomeworkView, type homeworkView } from './homework-repository.js'

type OverviewInput = { homeworkId?: string; learnerId?: string; section: 'report'|'answer'|'shared_evidence'|'requirements'; offset: number }
type LearnerReadInput = { homeworkId: string; section: 'summary'|'requirements'|'materials'|'answer'|'report'; offset: number }
type Progress = 'NOT_STARTED'|'LEARNING'|'MASTERED'|'PENDING'|'PASSED'|'RETURNED'
type LearnerProgress = { learnerId: string; learnerName: string; status: Progress; missingCriterionIndexes: number[];
  submissionId: string|null; submissionVersion: number|null }
const outputLimit = 7000

function label(value: string, limit: number) {
  if(JSON.stringify(value).length<=limit) return value
  let text=value.slice(0,limit-1)
  while(JSON.stringify(`${text}…`).length>limit) text=text.slice(0,-1)
  return `${text}…`
}

function page<T>(base: object, rows: T[], offset: number) {
  const items:T[]=[]
  for(const row of rows.slice(0,10)) {
    if(JSON.stringify({...base,items:[...items,row],nextOffset:offset+items.length+1}).length>outputLimit) break
    items.push(row)
  }
  return {...base,items,nextOffset:rows.length>items.length?offset+items.length:null}
}

function visibleReport(report:HomeworkReport) {
  return {completion:report.completion,criteria:report.criteria,assistance:report.assistance,independence:report.independence,
    weaknesses:report.weaknesses,evidence:report.evidenceSources,manualReview:report.manualReview,verification:report.verification??'verified',coverage:report.coverage}
}

function textPage(base:object,content:unknown,offset:number) {
  const text=content===null?'':JSON.stringify(content,null,2)
  const result={...base,text:text.slice(offset,offset+4000),totalChars:text.length,nextOffset:null as number|null}
  const next=()=>offset+result.text.length<text.length?offset+result.text.length:null
  result.nextOffset=next()
  while(JSON.stringify(result).length>outputLimit&&result.text.length) {
    result.text=result.text.slice(0,Math.floor(result.text.length*0.9));result.nextOffset=next()
  }
  return result
}

export function teacherHomeworkDraftReceipt(draft:ReturnType<typeof homeworkView>,courseId:string) {
  const {title,instructions,criteria,links,attachments,dueAt}=draft
  return textPage({result:{homeworkId:draft.id,courseId,revision:draft.revision},
    state:{revision:draft.revision,visibleHash:draft.visibleHash,title},sourceVersion:draft.visibleHash},
  {title,instructions,criteria,links,attachments,dueAt},0)
}

export async function learnerHomeworkRead(db:Queryable,scope:LearningScope,courseId:string,input:LearnerReadInput,signal:AbortSignal) {
  await homeworkScope(db,scope,courseId,'submit')
  const hw=await homeworkRow(db,scope,courseId,input.homeworkId)
  assertHomeworkPublished(hw)
  const state=await homeworkState(db,hw,scope.userId),view=await studentHomeworkView(db,hw,state)
  if(input.section==='summary') return {
    homework:{id:hw.id,title:label(hw.title,160),revision:hw.revision,status:hw.status,dueAt:hw.due_at,hasMaterials:Boolean(hw.links.length||hw.attachments.length)},
    progress:{status:view.status,unlocked:view.unlocked,hasLearningRecord:view.hasLearningRecord,canSubmit:view.canSubmit,feedback:label(view.feedback,160),
      criteria:hw.criteria.map((criterion,index)=>{
        const judgment=view.criteria.find(item=>item.criterion===criterion)
        return {index,criterion:label(criterion,64),met:judgment?.met??false,independent:judgment?.independent??false,feedback:label(judgment?.feedback??'等待学习证据',64)}
      })},
    answerRevision:state.answer_revision,evidenceRevision:state.evidence_revision,reportStatus:state.report_status,reportFeedback:label(state.report_feedback,160),
    hasAnswer:Boolean(state.answer.text||state.answer.links.length||state.answer.attachments.length),hasReport:Boolean(state.report),
  }
  let content:unknown
  switch(input.section) {
    case 'requirements': content={title:hw.title,instructions:hw.instructions,criteria:hw.criteria,links:hw.links,attachments:hw.attachments,dueAt:hw.due_at};break
    case 'materials': {
      const materials=await readHomeworkMaterials(db,scope,hw,AbortSignal.any([signal,AbortSignal.timeout(90000)]))
      if(homeworkHash(materials.map(item=>[item.source,item.hash]))!==homeworkHash(hw.materials.map(item=>[item.source,item.hash]))) {
        throw new NoEffectError('作业材料已变化，需要教师发布新版本','conflict')
      }
      content=materials;break
    }
    case 'answer': content=homeworkAnswerText(state.answer);break
    case 'report': content=state.report?visibleReport(state.report):null;break
  }
  return textPage({homeworkId:hw.id,section:input.section,sourceVersion:homeworkHash(content)},content,input.offset)
}

export async function teacherHomeworkOverview(db:Queryable,scope:LearningScope,courseId:string,input:OverviewInput) {
  await homeworkScope(db,scope,courseId,'review')
  if(!input.homeworkId) {
    const {rows}=await db.query<{id:string;title:string;status:string;dueAt:string|null}>(`SELECT id,title,status,due_at AS "dueAt"
      FROM homeworks WHERE company_id=$1 AND course_id=$2 AND status<>'DRAFT'
      ORDER BY published_at DESC,id DESC LIMIT 11 OFFSET $3`,[scope.companyId,courseId,input.offset])
    return page({},rows.map(row=>({...row,title:label(row.title,200)})),input.offset)
  }
  const hw=await homeworkRow(db,scope,courseId,input.homeworkId)
  if(input.section==='requirements') return textPage({homeworkId:hw.id,title:hw.title,status:hw.status,revision:hw.revision,
    sourceVersion:hw.visible_hash,section:input.section},
  {title:hw.title,instructions:hw.instructions,criteria:hw.criteria,links:hw.links,attachments:hw.attachments,dueAt:hw.due_at},input.offset)
  assertHomeworkPublished(hw)
  if(input.learnerId) {
    const {rows}=await db.query<{name:string}>(`SELECT u.display_name AS name FROM project_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.company_id=$1 AND m.project_id=$2 AND m.user_id=$3 AND m.role='STUDENT' AND m.status='ACTIVE'`,[scope.companyId,hw.project_id,input.learnerId])
    if(!rows[0]) throw new NoEffectError('homework learner not found','not_found')
    const state=await homeworkState(db,hw,input.learnerId),view=await studentHomeworkView(db,hw,state,{readLearningRecord:false}),submitted=view.latestSubmission
    const report=submitted?.report
    const content=input.section==='shared_evidence'
      ? state.manual_evidence?{evidence:state.manual_evidence.evidence,sharedAt:state.manual_evidence.sharedAt}:null
      : input.section==='answer'?submitted?homeworkAnswerText(submitted.answer):null
        : report?visibleReport(report):null
    return textPage({homeworkId:hw.id,learnerId:input.learnerId,learnerName:label(rows[0].name,80),status:view.status,
      submission:submitted?{id:submitted.id,version:submitted.version,submittedAt:submitted.submittedAt,late:submitted.late,reviewStatus:submitted.reviewStatus}:null,
      section:input.section},content,input.offset)
  }
  const {rows}=await db.query<{counts:Partial<Record<Progress,number>>;missing:Record<string,number>;items:LearnerProgress[]}>(`
    WITH roster AS (
      SELECT m.user_id AS learner_id,u.display_name AS learner_name,s.channel_id,COALESCE(s.evidence_revision,0) AS evidence_revision,
        sub.id AS submission_id,sub.version AS submission_version,d.decision,
        COALESCE(s.manual_unlock->>'evidenceRevision'=s.evidence_revision::text AND s.manual_unlock->>'returnEpoch'=s.return_epoch::text,FALSE) AS manual,
        COALESCE(jsonb_array_length(COALESCE(sub.report->'criteria',a.result->'criteria')),0)=jsonb_array_length($4::jsonb) AS complete,
        ARRAY(SELECT c.ordinality::integer-1 FROM jsonb_array_elements_text($4::jsonb) WITH ORDINALITY c(criterion,ordinality)
          WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(sub.report->'criteria',a.result->'criteria','[]'::jsonb)) j
            WHERE j->>'criterion'=c.criterion AND j->'met'='true'::jsonb AND j->'independent'='true'::jsonb)) AS missing
      FROM project_memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN homework_learner_state s ON s.company_id=m.company_id AND s.homework_id=$2 AND s.learner_id=m.user_id
      LEFT JOIN homework_assessments a ON a.id=s.assessment_id AND a.company_id=s.company_id AND a.homework_id=s.homework_id
        AND a.learner_id=s.learner_id AND a.evidence_revision=s.evidence_revision AND a.return_epoch=s.return_epoch AND a.status IN ('READY','INVALID')
      LEFT JOIN homework_submissions sub ON sub.id=s.latest_submission_id AND sub.company_id=s.company_id AND sub.homework_id=s.homework_id AND sub.learner_id=s.learner_id
      LEFT JOIN LATERAL (SELECT decision FROM homework_teacher_decisions WHERE company_id=sub.company_id AND homework_id=sub.homework_id
        AND learner_id=sub.learner_id AND submission_id=sub.id ORDER BY created_at DESC,id DESC LIMIT 1) d ON TRUE
      WHERE m.company_id=$1 AND m.project_id=$3 AND m.role='STUDENT' AND m.status='ACTIVE'
    ), progress AS (
      SELECT *,CASE WHEN submission_id IS NOT NULL THEN COALESCE(decision,'PENDING')
        WHEN manual OR (complete AND cardinality(missing)=0) THEN 'MASTERED'
        WHEN channel_id IS NOT NULL OR evidence_revision>0 THEN 'LEARNING' ELSE 'NOT_STARTED' END AS status FROM roster
    )
    SELECT COALESCE((SELECT jsonb_object_agg(status,total) FROM (SELECT status,count(*)::integer AS total FROM progress GROUP BY status) counts),'{}'::jsonb) AS counts,
      COALESCE((SELECT jsonb_object_agg(criterion,total) FROM (SELECT criterion,count(*)::integer AS total FROM progress CROSS JOIN LATERAL unnest(missing) criterion GROUP BY criterion) missing_counts),'{}'::jsonb) AS missing,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('learnerId',learner_id,'learnerName',learner_name,'status',status,
        'missingCriterionIndexes',missing,'submissionId',submission_id,'submissionVersion',submission_version) ORDER BY learner_id)
        FROM (SELECT * FROM progress ORDER BY learner_id LIMIT 11 OFFSET $5) items),'[]'::jsonb) AS items`,
  [scope.companyId,hw.id,hw.project_id,JSON.stringify(hw.criteria),input.offset])
  const summary=rows[0]!
  return page({homeworkId:hw.id,title:label(hw.title,200),
    counts:{NOT_STARTED:0,LEARNING:0,MASTERED:0,PENDING:0,PASSED:0,RETURNED:0,...summary.counts},
    missingCriteria:hw.criteria.map((criterion,index)=>({index,criterion:label(criterion,120),count:summary.missing[index]??0}))},
  summary.items.map(item=>({...item,learnerName:label(item.learnerName,80)})),input.offset)
}
