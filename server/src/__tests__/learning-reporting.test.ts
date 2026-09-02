import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { LearningApplication } from '../modules/learning/application.js'
import {
  countViewerPendingLearningReviews,
  listDueLearningStates,
  listLearningEvidenceRecords,
  listLearningProjectProgress,
  listLearningProjectSummaries,
  listPendingLearningEvaluationRecords,
  listViewerLearningStates,
  studyRoomState,
} from '../modules/learning/reporting-repository.js'

function accessFixture(
  text: string,
  params: readonly unknown[] | undefined,
): { rows: unknown[]; rowCount?: number } | null {
  if (/SELECT id,email,email_verified_at,deleted_at,suspended_at FROM users/.test(text)) {
    return { rows: [{
      id: params?.[0], email: `${params?.[0]}@example.com`, email_verified_at: new Date(),
      deleted_at: null, suspended_at: null,
    }] }
  }
  if (/SELECT id,company_id,kind,plan_id,status FROM projects/.test(text)) {
    return { rows: [{
      id: 'personal-project', company_id: 'company-1', kind: 'PERSONAL_LEARNING',
      plan_id: null, status: 'ACTIVE',
    }] }
  }
  if (/NULL::text AS leader_id,status AS resource_status FROM projects WHERE id=\$1/.test(text)) {
    return { rows: [{
      company_id: 'company-1', project_id: 'personal-project', created_by: 'personal-owner',
      conversation_members: null, leader_id: null, resource_status: 'ACTIVE',
    }] }
  }
  if (/SELECT id,type,status,plan_id FROM companies/.test(text)) {
    return { rows: [{ id: 'company-1', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan-1' }] }
  }
  if (/SELECT role,status FROM company_memberships/.test(text)) {
    return { rows: [{ role: 'MEMBER', status: 'ACTIVE' }] }
  }
  if (/SELECT role,status FROM project_memberships/.test(text)) {
    return { rows: [{ role: 'OWNER', status: 'ACTIVE' }] }
  }
  if (/SELECT id,code,status FROM plans/.test(text)) {
    return { rows: [{ id: 'plan-1', code: 'PERSONAL_FREE', status: 'ACTIVE' }] }
  }
  if (/FROM plan_entitlements/.test(text)) {
    return { rows: [
      { code: 'project.core', value: true },
      { code: 'learning.core', value: true },
    ] }
  }
  return null
}

function queryable(
  handler: (
    text: string,
    params: readonly unknown[] | undefined,
  ) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = accessFixture(text, params) ?? handler(text, params)
      return {
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
      } as never
    },
  }
}

test('dashboard includes a Personal Project without inferring kind from Course', async () => {
  const db = queryable((text, params) => {
    if (text.includes('FROM projects project') && text.includes('LEFT JOIN courses course')) {
      assert.match(text, /project\.kind IN \('TEACHING','INSTITUTIONAL_COURSE'\)/)
      assert.match(text, /project\.status<>'DELETED'[\s\S]*LIMIT 100/)
      assert.deepEqual(params, ['company-1', 'personal-owner'])
      return { rows: [{
        project_id: 'personal-project', company_id: 'company-1', project_kind: 'PERSONAL_LEARNING',
        course_id: null, title: 'My learning', description: '', status: 'ACTIVE',
        perspective: 'learner', learner_count: 0,
      }] }
    }
    if (text.includes('FROM learning_states state') && text.includes('next_review_at<=NOW()')) {
      return { rows: [] }
    }
    if (text.includes('FROM learning_states state')) {
      assert.deepEqual(params, ['company-1', 'personal-owner', ['personal-project']])
      return { rows: [{
        projectId: 'personal-project', knowledgeUnitId: 'unit-1', title: 'Unit', level: 2,
        status: 'LEARNING', nextReviewAt: null, reviewIntervalDays: 3,
      }] }
    }
    if (text.includes('COUNT(*)::int AS count') && text.includes('learning_evaluations')) {
      assert.match(text, /evaluation\.project_id=ANY\(\$3::text\[\]\)/)
      assert.match(text, /evaluation\.status='PENDING'/)
      return { rows: [{ count: 0 }] }
    }
    throw new Error(`unexpected query: ${text}`)
  })
  const application = new LearningApplication(db, {} as never)

  assert.deepEqual(await application.dashboard({
    companyId: 'company-1', userId: 'personal-owner',
  }), {
    projects: [{
      projectId: 'personal-project', projectKind: 'PERSONAL_LEARNING', title: 'My learning',
      description: '', status: 'ACTIVE', perspective: 'learner', learnerCount: 0,
    }],
    due: [],
    states: [{
      projectId: 'personal-project', knowledgeUnitId: 'unit-1', title: 'Unit', level: 2,
      status: 'LEARNING', nextReviewAt: null, reviewIntervalDays: 3,
    }],
    pendingReviews: 0,
  })
})

test('LearningState dashboard reads use the allowed company, user and Project set', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return text.includes('COUNT(*)::int AS count') ? { rows: [{ count: 1 }] } : { rows: [] }
  })
  const projectIds = ['project-1']

  await listDueLearningStates(db, 'company-1', 'learner-1', projectIds)
  await listViewerLearningStates(db, 'company-1', 'learner-1', projectIds)
  assert.equal(await countViewerPendingLearningReviews(
    db, 'company-1', 'teacher-1', projectIds,
  ), 1)

  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.deepEqual(call.params, [
      'company-1', call === calls[2] ? 'teacher-1' : 'learner-1', projectIds,
    ])
    assert.match(call.text, /company_id=\$1/)
    assert.match(call.text, /project_id=ANY\(\$3::text\[\]\)/)
    assert.doesNotMatch(call.text, /learning_mastery|learning_objectives|course_id/)
  }
})

test('Course teaching reads accept only a resolved Project fact scope', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return { rows: [] }
  })

  await listLearningEvidenceRecords(db, {
    companyId: 'company-1', projectId: 'project-1', learnerId: 'learner-1',
  })
  await listPendingLearningEvaluationRecords(db, 'company-1', 'project-1')
  await listLearningProjectProgress(db, 'company-1', 'project-1')
  await studyRoomState(db, 'company-1', 'course-1')

  assert.match(calls[0]?.text ?? '', /evaluation\.company_id=attempt\.company_id/)
  assert.match(calls[0]?.text ?? '', /attempt\.company_id=\$1 AND attempt\.project_id=\$2/)
  assert.match(calls[1]?.text ?? '', /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
  assert.match(calls[1]?.text ?? '', /evaluation\.status='PENDING'/)
  assert.match(calls[1]?.text ?? '', /user_account\.display_name AS learner_display_name/)
  assert.doesNotMatch(calls[1]?.text ?? '', /rubric_results|evidence\.data/)
  assert.match(calls[2]?.text ?? '', /state\.project_id=member\.project_id/)
  assert.match(calls[2]?.text ?? '', /attempt\.project_id=member\.project_id/)
  assert.match(calls[3]?.text ?? '', /course\.id=\$1 AND course\.company_id=\$2/)
  assert.deepEqual(calls[3]?.params, ['course-1', 'company-1'])
  for (const call of calls) {
    assert.doesNotMatch(call.text, /learning_mastery|learning_objectives|attempt\.course_id|activity\.course_id/)
  }
})

test('project summaries require tenant membership and never use Course to infer Personal learning', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /FROM projects project/)
    assert.match(text, /member\.company_id=project\.company_id/)
    assert.match(text, /company_member\.status='ACTIVE'/)
    assert.match(text, /project\.kind='PERSONAL_LEARNING' AND member\.role='OWNER'/)
    assert.deepEqual(params, ['company-1', 'user-1'])
    return { rows: [] }
  })
  assert.deepEqual(await listLearningProjectSummaries(db, 'company-1', 'user-1'), [])
})
