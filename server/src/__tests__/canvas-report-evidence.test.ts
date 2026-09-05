import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { createCanvasReportApplication } from '../modules/canvas/reports-application.js'
import type { ReportRow } from '../modules/canvas/repository.js'

test('Canvas reports persist only canonical Evidence IDs for validated source references', async () => {
  const evidenceRows = new Map<string, Record<string, unknown>>()
  let reportInsert: { text: string; params?: readonly unknown[] } | undefined
  const db: Queryable = {
    query: async (text, params) => {
      if (text.includes('FROM agent_work_items work')) return { rows: [{
        canvas_assignment_id: 'assignment-1', execution_role: 'specialist', project_id: 'project-1',
      }], rowCount: 1 } as never
      if (text.includes('WITH requested(kind,id)')) return { rows: [], rowCount: 0 } as never
      if (text.includes('SELECT * FROM evidence_records')) {
        const row = evidenceRows.get(String(params?.[2]))
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 } as never
      }
      if (text.includes('INSERT INTO evidence_records')) {
        const row = {
          id: String(params?.[0]), company_id: 'company-1', project_id: 'project-1',
          level: String(params?.[3]), derivation: String(params?.[4]), kind: String(params?.[5]),
          subject_user_id: null, data: JSON.parse(String(params?.[7])) as Record<string, unknown>,
          created_by_type: String(params?.[8]), created_by_id: params?.[9] ?? null,
          created_at: '2026-08-30T01:00:00.000Z',
        }
        evidenceRows.set(row.id, row)
        return { rows: [row], rowCount: 1 } as never
      }
      if (text.includes('SELECT 1 FROM evidence_records')) return { rows: [{ '?column?': 1 }], rowCount: 1 } as never
      if (text.includes('INSERT INTO evidence_links')) return { rows: [], rowCount: 1 } as never
      if (text.includes('INSERT INTO canvas_assignment_reports')) {
        reportInsert = { text, params }
        return { rows: [{
          id: String(params?.[0]), canvas_id: 'canvas-1', assignment_id: 'assignment-1',
          author_agent_id: 'agent-1', execution_role: 'specialist', schema_version: 'learning_report_v1',
          finding: 'Observed result', evidence_id: String(params?.[7]),
          source_evidence_ids: JSON.parse(String(params?.[8])) as string[], confidence: 0.8,
          unresolved: [], next_step: null, verifies_report_id: null, disconfirming_checks: [],
          verdict: null, consumed_report_ids: [], conflict_resolution: [],
          created_at: '2026-08-30T01:01:00.000Z',
        }], rowCount: 1 } as never
      }
      throw new Error(`unexpected query: ${text}`)
    },
  }
  const application = createCanvasReportApplication({
    db,
    transaction: (work) => work(db),
    toReport: (row: ReportRow) => ({
      id: row.id, canvasId: row.canvas_id, assignmentId: row.assignment_id,
      authorAgentId: row.author_agent_id, executionRole: row.execution_role,
      schemaVersion: row.schema_version, finding: row.finding, evidenceId: row.evidence_id,
      sourceEvidenceIds: row.source_evidence_ids, confidence: Number(row.confidence),
      unresolved: row.unresolved, nextStep: row.next_step, verifiesReportId: row.verifies_report_id,
      disconfirmingChecks: row.disconfirming_checks, verdict: row.verdict,
      consumedReportIds: row.consumed_report_ids, conflictResolution: row.conflict_resolution,
      createdAt: row.created_at,
    }),
    publishCanvas: async () => {},
    publishAssignments: async () => {},
    logActivity: async () => ({}) as never,
    missingChannelMessageIds: async () => [],
  })

  const report = await application.submitCanvasReport({
    companyId: 'company-1', workId: 'work-1', agentId: 'agent-1', canvasId: 'canvas-1',
    executionRole: 'specialist', finding: 'Observed result',
    evidenceRefs: [{ kind: 'frame', id: 'frame-1' }], confidence: 0.8,
  })

  assert.equal(report.sourceEvidenceIds.length, 1)
  assert.equal(report.evidenceId.startsWith('evidence-report-'), true)
  assert.match(reportInsert?.text ?? '', /evidence_id,source_evidence_ids/)
  assert.doesNotMatch(reportInsert?.text ?? '', /evidence_refs/)
  assert.deepEqual([...evidenceRows.values()].map((row) => row.data), [
    { sourceKind: 'frame', sourceId: 'frame-1' },
    { reportId: report.id, canvasId: 'canvas-1', executionRole: 'specialist' },
  ])
})
