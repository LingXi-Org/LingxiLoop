import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  type ApprovalResolutionRow,
  cancelApproval,
  recordApprovalResult,
  supersedeApproval,
} from '../agent-os/approval-repository.js'
import type { Queryable } from '../db/queryable.js'

function queryable(
  handler: (text: string, params: readonly unknown[]) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params = []) => ({
      command: '', rowCount: null, oid: 0, fields: [], ...handler(text, params),
    }) as never,
  }
}

const pending: ApprovalResolutionRow = {
  id: 'approval-old',
  agent_id: 'agent-1',
  channel_id: 'channel-1',
  work_id: 'work-1',
  idempotency_key: 'work-1:cell-1:0',
  action: 'teacher.intervene',
  args: { caseId: 'case-1', note: 'old' },
  status: 'PENDING',
  run_id: 'work-1',
  cell_id: 'cell-1',
  call_index: 0,
  summary: 'Old proposal',
  requested_at: '2026-08-30T00:00:00.000Z',
  requested_by: 'teacher-1',
  authorization_user_id: 'teacher-1',
  expires_at: '2026-08-30T00:15:00.000Z',
  scope: { risk: 'teacher_intervention' },
  preview: { caseVersion: 1 },
}

test('cancellation and execution are guarded one-way approval transitions', async () => {
  const queries: Array<{ text: string; params: readonly unknown[] }> = []
  const db = queryable((text, params) => {
    queries.push({ text, params })
    return { rows: [], rowCount: 1 }
  })

  await cancelApproval(db, { approvalId: pending.id, userId: 'teacher-1', reason: 'approval expired' })
  await recordApprovalResult(db, { approvalId: pending.id, result: { ok: true }, error: null })

  assert.match(queries[0]!.text, /status='CANCELLED'.*cancel_reason=\$3/s)
  assert.match(queries[0]!.text, /WHERE id=\$1 AND status='PENDING'/)
  assert.deepEqual(queries[0]!.params, ['approval-old', 'teacher-1', 'approval expired'])
  assert.match(queries[1]!.text, /status='EXECUTED'.*executed_at=NOW\(\)/s)
  assert.match(queries[1]!.text, /WHERE id=\$1 AND status='APPROVED'/)
})

test('modification cancels the displayed request and creates one new action identity', async () => {
  const queries: Array<{ text: string; params: readonly unknown[] }> = []
  const replacement = {
    ...pending,
    id: 'approval-new',
    idempotency_key: 'work-1:cell-1-revision-approval-new:0',
    args: { caseId: 'case-1', note: 'revised' },
  }
  const db = queryable((text, params) => {
    queries.push({ text, params })
    return text.includes('RETURNING id,agent_id') ? { rows: [replacement] } : { rows: [], rowCount: 1 }
  })

  const created = await supersedeApproval(db, {
    approval: pending,
    approvalId: 'approval-new',
    authorizationUserId: 'teacher-2',
    args: replacement.args,
    summary: 'Revised proposal',
    requestedBy: 'teacher-2',
    scope: pending.scope,
    preview: { caseVersion: 2 },
    expiresAt: '2026-08-30T00:30:00.000Z',
  })

  assert.equal(created.id, 'approval-new')
  assert.equal(queries.length, 4)
  assert.match(queries[0]!.text, /status='CANCELLED'/)
  assert.match(String(queries[0]!.params[2]), /superseded by modified approval approval-new/)
  assert.match(queries[1]!.text, /agent_host_actions[\s\S]*status='failed'/)
  assert.match(queries[2]!.text, /INSERT INTO agent_host_actions/)
  assert.match(queries[3]!.text, /INSERT INTO approvals/)
  assert.match(queries[3]!.text, /supersedes_approval_id/)
  assert.deepEqual(queries[3]!.params[3], JSON.stringify(replacement.args))
})

test('approved crash recovery re-authorizes the persisted principal behind the action ledger', () => {
  const application = readFileSync(new URL('../agent-os/approval-application.ts', import.meta.url), 'utf8')
  const hostActionApplication = readFileSync(
    new URL('../agent-os/host-action-application.ts', import.meta.url),
    'utf8',
  )
  const hostActionRepository = readFileSync(
    new URL('../agent-os/host-action-repository.ts', import.meta.url),
    'utf8',
  )

  assert.match(application, /recoveringApprovedExecution = input\.approved && approval\.status === 'APPROVED'/)
  assert.match(application, /authorizationUserId: approval\.authorization_user_id/)
  assert.match(application, /assertHostActionPermission\(db,[\s\S]*?approval\.authorization_user_id/)
  assert.match(hostActionRepository, /pg_advisory_lock\(hashtextextended\(\$1, 0\)\)[\s\S]*?idempotencyKey/)
  assert.match(hostActionApplication, /const replay = await actionFromLedger/)
  assert.match(hostActionRepository, /a\.status='APPROVED'/)
})
