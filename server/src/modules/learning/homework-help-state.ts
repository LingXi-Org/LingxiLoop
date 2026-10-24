import { z } from 'zod'
import type { Queryable } from '../../db/queryable.js'
import type { HomeworkMaterial } from './homework-contracts.js'
import type { HomeworkRow, HomeworkStateRow } from './homework-repository.js'
import { homeworkHelpPlan, type HelpAssessment } from './homework-help.js'

const evidenceSchema = z.array(z.object({
  messageId: z.string(), role: z.enum(['user', 'assistant']), text: z.string(), sequence: z.number().int().positive(),
  materials: z.array(z.object({ source: z.string(), hash: z.string(), text: z.string(),
    contentStatus: z.enum(['unsupported', 'empty', 'failed', 'too_large']).optional() })),
})).max(1001)
const selectedSchema = z.array(z.string()).min(1).max(20)

/** Called only after the dedicated homework conversation and learner scope are authorized. */
export async function loadHomeworkHelpState(db: Queryable, hw: Pick<HomeworkRow, 'company_id' | 'id' | 'criteria'>,
  state: Pick<HomeworkStateRow, 'learner_id' | 'assessment_id' | 'evidence_revision' | 'return_epoch'>,
  evidenceAvailable: (materials: HomeworkMaterial[]) => Promise<boolean>) {
  const input = { criteria: hw.criteria, assessmentId: state.assessment_id, evidenceRevision: state.evidence_revision, returnEpoch: state.return_epoch }
  if (!state.assessment_id) return homeworkHelpPlan({ ...input, assessments: [] })
  const { rows } = await db.query<{ id: string; evidence_revision: number; return_epoch: number; status: string; message_ids: unknown; result: unknown; evidence: unknown }>(
    `SELECT id,evidence_revision,return_epoch,status,message_ids,result,evidence FROM homework_assessments
      WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3 AND return_epoch=$4
        AND evidence_revision<=$5 AND status='READY' ORDER BY evidence_revision DESC LIMIT 2`,
    [hw.company_id, hw.id, state.learner_id, state.return_epoch, state.evidence_revision])
  const assessments: HelpAssessment[] = []
  for (const row of rows) {
    const evidence = evidenceSchema.safeParse(row.evidence), selected = selectedSchema.safeParse(row.message_ids)
    assessments.push({ id: row.id, evidenceRevision: row.evidence_revision, returnEpoch: row.return_epoch, status: row.status,
      selectedMessageIds: selected.success ? selected.data : [], result: row.result, messages: evidence.success ? evidence.data : [],
      available: evidence.success && await evidenceAvailable(evidence.data.flatMap(message => message.materials)) })
  }
  return homeworkHelpPlan({ ...input, assessments })
}
