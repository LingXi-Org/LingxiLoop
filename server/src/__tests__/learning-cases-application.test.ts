import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { LearningCaseStatus, ProjectRole } from '../domain/public.js'
import {
  LearningCasesApplication,
  type ApplyLearningCaseActionInput,
  type LearningCasesInfrastructure,
} from '../modules/learning/cases-application.js'
import type { LearningCaseActionRecord } from '../modules/learning/cases-repository.js'
import { LearningApplicationError } from '../modules/learning/errors.js'

function caseRow(input: { id?: string; status?: LearningCaseStatus; version?: number } = {}) {
  return {
    id: input.id ?? 'case-1',
    project_id: 'project-1',
    user_id: 'learner-1',
    knowledge_unit_id: 'unit-1',
    status: input.status ?? 'IN_PROGRESS',
    reason: 'needs support',
    summary: 'case summary',
    version: input.version ?? 2,
    created_at: '2026-08-30T01:00:00.000Z',
    updated_at: '2026-08-30T01:01:00.000Z',
    resolved_at: null,
    closed_at: null,
  }
}

function actionRow(input: Partial<LearningCaseActionRecord> = {}) {
  return {
    id: input.id ?? 'action-1',
    case_id: input.caseId ?? 'case-1',
    user_id: input.learnerId ?? 'learner-1',
    knowledge_unit_id: input.knowledgeUnitId ?? 'unit-1',
    kind: input.kind ?? 'DIAGNOSE',
    result: input.result ?? 'APPLIED',
    from_status: input.fromStatus ?? 'DETECTED',
    to_status: input.toStatus ?? 'IN_PROGRESS',
    case_version: input.caseVersion ?? 2,
    idempotency_key: input.idempotencyKey ?? 'request-0001',
    actor_id: input.actorId ?? 'teacher-1',
    reason: input.reason ?? 'confirmed gap',
    activity_id: input.activityId ?? null,
    mission_id: input.missionId ?? null,
    attempt_id: input.attemptId ?? null,
    evaluation_id: input.evaluationId ?? null,
    created_at: input.createdAt ?? '2026-08-30T01:02:00.000Z',
  }
}

interface FixtureOptions {
  role?: ProjectRole
  caseStatus?: LearningCaseStatus
  caseVersion?: number
  insertOutcome?: 'created' | 'existing' | 'missing'
  priorAction?: Partial<LearningCaseActionRecord>
  linksValid?: boolean
  updateSucceeds?: boolean
  auditThrows?: boolean
}

function fixture(options: FixtureOptions = {}) {
  const role = options.role ?? 'TEACHER'
  const events: string[] = []
  const audits: Array<{ kind: string; userId: string; companyId: string; detail: Record<string, unknown> }> = []
  const listParams: Array<readonly unknown[] | undefined> = []
  const accessSql: string[] = []
  const domainEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = []
  const currentCase = caseRow({ status: options.caseStatus, version: options.caseVersion })
  const db: Queryable = {
    query: async (sql, params) => {
      if (/pg_advisory_xact_lock/.test(sql)) {
        events.push('event_lock')
        return { rows: [], rowCount: 0 } as never
      }
      if (/FROM domain_events WHERE company_id/.test(sql)) {
        events.push('event_idempotency_read')
        return { rows: [], rowCount: 0 } as never
      }
      if (/INSERT INTO domain_events/.test(sql)) {
        events.push('event_append')
        const payload = JSON.parse(String(params?.[10])) as Record<string, unknown>
        domainEvents.push({ eventType: String(params?.[5]), payload })
        return { rows: [{
          id: String(params?.[0]),
          company_id: String(params?.[1]),
          project_id: params?.[2] as string | null,
          aggregate_type: String(params?.[3]),
          aggregate_id: String(params?.[4]),
          aggregate_sequence: 1,
          sequence: domainEvents.length,
          event_type: String(params?.[5]),
          schema_version: Number(params?.[6]),
          idempotency_key: String(params?.[7]),
          actor_type: String(params?.[8]),
          actor_id: params?.[9] as string | null,
          payload,
          occurred_at: '2026-08-30T01:03:00.000Z',
        }], rowCount: 1 } as never
      }
      if (/FROM users WHERE/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ id: String(params?.[0]), deleted_at: null, suspended_at: null }], rowCount: 1 } as never
      }
      if (/FROM companies WHERE/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ id: 'company-1', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan-1' }], rowCount: 1 } as never
      }
      if (/FROM projects WHERE id=\$1/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{
          id: 'project-1', company_id: 'company-1', project_id: 'project-1', kind: 'TEACHING',
          plan_id: 'plan-1', status: 'ACTIVE', created_by: 'teacher-1',
          conversation_members: null, leader_id: null, resource_status: 'ACTIVE',
        }], rowCount: 1 } as never
      }
      if (/FROM company_memberships/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ role: 'OWNER', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM project_memberships/.test(sql) && !/JOIN project_memberships/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ role, status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plans WHERE/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ id: 'plan-1', code: 'PERSONAL_FREE', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plan_entitlements/.test(sql)) {
        accessSql.push(sql)
        return { rows: [{ code: 'learning.core', value: true }], rowCount: 1 } as never
      }
      if (/ORDER BY learning_case\.updated_at/.test(sql)) {
        listParams.push(params)
        return { rows: [], rowCount: 0 } as never
      }
      if (/INSERT INTO learning_cases/.test(sql)) {
        events.push('case_insert')
        if (options.insertOutcome === 'existing' || options.insertOutcome === 'missing') {
          return { rows: [], rowCount: 0 } as never
        }
        return { rows: [caseRow({ id: String(params?.[0]), status: 'DETECTED', version: 1 })], rowCount: 1 } as never
      }
      if (/learning_case\.status<>'CLOSED'/.test(sql)) {
        events.push('case_dedup_read')
        return options.insertOutcome === 'missing'
          ? { rows: [], rowCount: 0 } as never
          : { rows: [caseRow({ id: 'case-existing', status: 'DETECTED', version: 1 })], rowCount: 1 } as never
      }
      if (/FROM learning_cases learning_case/.test(sql) && /FOR UPDATE/.test(sql)) {
        events.push('case_lock')
        return { rows: [currentCase], rowCount: 1 } as never
      }
      if (/FROM learning_case_actions case_action/.test(sql) && /idempotency_key=\$3/.test(sql)) {
        events.push('idempotency_read')
        return options.priorAction
          && params?.[2] === actionRow(options.priorAction).idempotency_key
          ? { rows: [actionRow(options.priorAction)], rowCount: 1 } as never
          : { rows: [], rowCount: 0 } as never
      }
      if (/AS valid/.test(sql)) {
        events.push('links_validate')
        return { rows: [{ valid: options.linksValid !== false }], rowCount: 1 } as never
      }
      if (/UPDATE learning_cases learning_case/.test(sql)) {
        events.push('case_update')
        if (options.updateSucceeds === false) return { rows: [], rowCount: 0 } as never
        return { rows: [caseRow({
          status: params?.[5] as LearningCaseStatus,
          version: Number(params?.[3]) + 1,
        })], rowCount: 1 } as never
      }
      if (/INSERT INTO learning_case_actions/.test(sql)) {
        events.push('action_append')
        return { rows: [actionRow({
          id: String(params?.[0]),
          caseId: String(params?.[3]),
          kind: params?.[4] as LearningCaseActionRecord['kind'],
          result: params?.[5] as LearningCaseActionRecord['result'],
          fromStatus: params?.[6] as LearningCaseStatus,
          toStatus: params?.[7] as LearningCaseStatus,
          caseVersion: Number(params?.[8]),
          idempotencyKey: String(params?.[9]),
          actorId: String(params?.[10]),
          reason: String(params?.[11]),
          activityId: params?.[12] as string | null,
          missionId: params?.[13] as string | null,
          attemptId: params?.[14] as string | null,
          evaluationId: params?.[15] as string | null,
        })], rowCount: 1 } as never
      }
      throw new Error(`unexpected Case application query: ${sql}`)
    },
  }
  const infrastructure: LearningCasesInfrastructure = {
    async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
      events.push('begin')
      try {
        const result = await work(db)
        events.push('commit')
        return result
      } catch (error) {
        events.push('rollback')
        throw error
      }
    },
    async auditInTransaction(_db, event) {
      events.push('audit')
      audits.push(event)
      if (options.auditThrows) throw new Error('audit unavailable')
    },
  }
  return {
    application: new LearningCasesApplication(db, infrastructure),
    accessSql,
    audits,
    domainEvents,
    events,
    listParams,
  }
}

const actionInput = {
  actorUserId: 'teacher-1',
  companyId: 'company-1',
  projectId: 'project-1',
  caseId: 'case-1',
  kind: 'DIAGNOSE',
  reason: 'confirmed gap',
  idempotencyKey: 'request-0001',
  expectedVersion: 1,
  activityId: 'activity-1',
  missionId: 'mission-1',
  attemptId: 'attempt-1',
  evaluationId: 'evaluation-1',
} as const satisfies ApplyLearningCaseActionInput

test('Case reads allow owners and teachers to widen scope while forcing other roles to self', async () => {
  const teacher = fixture({ role: 'TEACHER' })
  await teacher.application.listCases({
    actorUserId: 'teacher-1', companyId: 'company-1', projectId: 'project-1',
  })
  assert.deepEqual(teacher.listParams, [['company-1', 'project-1', null, null, null, 100]])
  assert.equal(teacher.accessSql.some((sql) => /FOR UPDATE/.test(sql)), false)

  const learner = fixture({ role: 'STUDENT' })
  await learner.application.listCases({
    actorUserId: 'learner-1', companyId: 'company-1', projectId: 'project-1', learnerId: 'other',
  })
  assert.deepEqual(learner.listParams, [['company-1', 'project-1', 'learner-1', null, null, 100]])
})

test('Case creation locks permission dependencies and audits only a newly created Case', async () => {
  const created = fixture({ insertOutcome: 'created' })
  const result = await created.application.createCase({
    actorUserId: 'teacher-1', companyId: 'company-1', projectId: 'project-1',
    learnerId: 'learner-1', knowledgeUnitId: 'unit-1', reason: 'needs support', summary: 'case summary',
  })
  assert.equal(result.created, true)
  assert.equal(created.accessSql.some((sql) => /FOR UPDATE/.test(sql)), true)
  assert.deepEqual(created.audits, [{
    kind: 'learning_case_create',
    userId: 'teacher-1',
    companyId: 'company-1',
    detail: {
      projectId: 'project-1', caseId: result.learningCase.id,
      learnerId: 'learner-1', knowledgeUnitId: 'unit-1',
    },
  }])
  assert.deepEqual(created.events, [
    'begin', 'case_insert', 'audit', 'event_lock', 'event_idempotency_read', 'event_append', 'commit',
  ])
  assert.deepEqual(created.domainEvents, [{
    eventType: 'LEARNING_CASE.DETECTED',
    payload: {
      caseId: result.learningCase.id,
      learnerId: 'learner-1',
      knowledgeUnitId: 'unit-1',
      status: 'DETECTED',
      version: 1,
    },
  }])

  const existing = fixture({ insertOutcome: 'existing' })
  const replay = await existing.application.createCase({
    actorUserId: 'teacher-1', companyId: 'company-1', projectId: 'project-1',
    learnerId: 'learner-1', knowledgeUnitId: 'unit-1', reason: 'duplicate detector',
  })
  assert.deepEqual({ id: replay.learningCase.id, created: replay.created }, {
    id: 'case-existing', created: false,
  })
  assert.deepEqual(existing.audits, [])
  assert.deepEqual(existing.domainEvents, [])
})

test('Case action idempotency returns an exact replay and rejects key reuse', async () => {
  const priorAction = {
    ...actionInput,
    actorId: actionInput.actorUserId,
    caseVersion: 2,
    result: 'APPLIED' as const,
    fromStatus: 'DETECTED' as const,
    toStatus: 'IN_PROGRESS' as const,
  }
  const exact = fixture({ caseVersion: 5, priorAction })
  const replay = await exact.application.applyAction({
    ...actionInput,
    reason: '  confirmed gap  ',
    idempotencyKey: '  request-0001  ',
  })
  assert.deepEqual({ id: replay.action.id, replayed: replay.replayed }, {
    id: 'action-1', replayed: true,
  })
  assert.deepEqual(exact.events.filter((event) => [
    'case_lock', 'idempotency_read', 'links_validate', 'case_update', 'action_append', 'audit',
  ].includes(event)), ['case_lock', 'idempotency_read'])
  assert.deepEqual(exact.domainEvents, [])

  const reused = fixture({ caseVersion: 5, priorAction })
  await assert.rejects(
    () => reused.application.applyAction({ ...actionInput, evaluationId: 'evaluation-other' }),
    (error: unknown) => error instanceof LearningApplicationError && error.code === 'conflict',
  )
  assert.equal(reused.events.includes('action_append'), false)
})

test('Case actions reject stale versions, increment APPLIED actions, and preserve ALREADY_APPLIED versions', async () => {
  const stale = fixture({ caseStatus: 'IN_PROGRESS', caseVersion: 3 })
  await assert.rejects(
    () => stale.application.applyAction({
      ...actionInput, kind: 'INTERVENE', expectedVersion: 2,
      activityId: undefined, missionId: undefined, attemptId: undefined, evaluationId: undefined,
    }),
    (error: unknown) => error instanceof LearningApplicationError && error.code === 'conflict',
  )
  assert.deepEqual(stale.events.filter((event) => event.endsWith('update') || event.endsWith('append')), [])

  const applied = fixture({ caseStatus: 'IN_PROGRESS', caseVersion: 3 })
  const interventionResult = await applied.application.applyAction({
    ...actionInput, kind: 'INTERVENE', expectedVersion: 3,
    activityId: undefined, missionId: undefined, attemptId: undefined, evaluationId: undefined,
  })
  const intervention = interventionResult.action
  assert.equal(interventionResult.replayed, false)
  assert.deepEqual({
    result: intervention.result,
    from: intervention.fromStatus,
    to: intervention.toStatus,
    version: intervention.caseVersion,
  }, { result: 'APPLIED', from: 'IN_PROGRESS', to: 'IN_PROGRESS', version: 4 })
  assert.deepEqual(applied.events.slice(-7), [
    'case_update', 'action_append', 'audit', 'event_lock', 'event_idempotency_read', 'event_append', 'commit',
  ])
  assert.deepEqual(applied.domainEvents, [{
    eventType: 'LEARNING_CASE.ACTION_APPLIED',
    payload: {
      caseId: 'case-1',
      actionId: intervention.id,
      kind: 'INTERVENE',
      result: 'APPLIED',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'IN_PROGRESS',
      caseVersion: 4,
      activityId: null,
      missionId: null,
      attemptId: null,
      evaluationId: null,
    },
  }])

  const already = fixture({ caseStatus: 'IN_PROGRESS', caseVersion: 4 })
  const diagnosedResult = await already.application.applyAction({
    ...actionInput, reason: undefined, expectedVersion: 4,
    activityId: undefined, missionId: undefined, attemptId: undefined, evaluationId: undefined,
  })
  const diagnosed = diagnosedResult.action
  assert.deepEqual({ result: diagnosed.result, version: diagnosed.caseVersion }, {
    result: 'ALREADY_APPLIED', version: 4,
  })
  assert.equal(diagnosed.reason, '')
  assert.equal(diagnosedResult.replayed, false)
  assert.equal(already.events.includes('case_update'), false)
  assert.deepEqual(already.events.slice(-6), [
    'action_append', 'audit', 'event_lock', 'event_idempotency_read', 'event_append', 'commit',
  ])
})

test('Case action audit failure occurs after append and rolls the owning transaction back', async () => {
  const failed = fixture({ caseStatus: 'IN_PROGRESS', caseVersion: 3, auditThrows: true })
  await assert.rejects(
    () => failed.application.applyAction({
      ...actionInput, kind: 'INTERVENE', expectedVersion: 3,
      activityId: undefined, missionId: undefined, attemptId: undefined, evaluationId: undefined,
    }),
    /audit unavailable/,
  )
  assert.deepEqual(failed.events.slice(-4), ['case_update', 'action_append', 'audit', 'rollback'])
  assert.equal(failed.events.includes('commit'), false)
})
