import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { findLearningCourseProjectScope } from '../modules/learning/project-scope-repository.js'
import {
  insertLearningKnowledgeUnit,
  insertLearningKnowledgeUnitDependency,
  listLearningObjectives,
  listProjectLearningKnowledgeUnits,
  updateLearningKnowledgeUnitStatus,
} from '../modules/learning/repository.js'

function queryable(
  handler: (text: string, params: readonly unknown[] | undefined) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = handler(text, params)
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 } as never
    },
  }
}

const unitRow = {
  id: 'unit-1',
  project_id: 'project-1',
  title: 'Explain leases',
  success_criteria: 'Give one invariant',
  target_level: 3,
  position: 0,
  status: 'DRAFT',
  prerequisite_knowledge_unit_ids: ['unit-0'],
}

test('Course resolves to the authoritative Project kind instead of implying one', async () => {
  let statement = ''
  const db = queryable((text, params) => {
    statement = text
    assert.deepEqual(params, ['company-1', 'course-1'])
    return { rows: [{
      course_id: 'course-1',
      company_id: 'company-1',
      project_id: 'project-1',
      project_kind: 'INSTITUTIONAL_COURSE',
      project_status: 'ACTIVE',
    }] }
  })

  const scope = await findLearningCourseProjectScope(db, 'company-1', 'course-1')

  assert.deepEqual(scope, {
    companyId: 'company-1',
    projectId: 'project-1',
    projectKind: 'INSTITUTIONAL_COURSE',
    projectStatus: 'ACTIVE',
    courseId: 'course-1',
  })
  assert.match(statement, /project\.kind AS project_kind/)
  assert.match(statement, /project\.id=course\.project_id AND project\.company_id=course\.company_id/)
  assert.match(statement, /project\.kind IN \('TEACHING','INSTITUTIONAL_COURSE'\)/)
})

test('knowledge-unit writes and status changes use one tenant and project scope', async () => {
  const statements: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    statements.push({ text, params })
    return { rowCount: 1 }
  })

  await insertLearningKnowledgeUnit(db, {
    id: 'unit-1', companyId: 'company-1', projectId: 'project-1', actorId: 'agent-1',
    title: 'Explain leases', successCriteria: 'Give one invariant', targetLevel: 3, position: 0,
  })
  const updated = await updateLearningKnowledgeUnitStatus(db, {
    companyId: 'company-1', projectId: 'project-1', knowledgeUnitId: 'unit-1',
    teacherId: 'teacher-1', status: 'PUBLISHED',
  })

  assert.equal(updated, true)
  assert.deepEqual(statements[0]?.params?.slice(1, 3), ['company-1', 'project-1'])
  assert.match(statements[0]?.text ?? '', /FROM projects project WHERE project\.company_id=\$2 AND project\.id=\$3/)
  assert.match(statements[0]?.text ?? '', /'DRAFT'/)
  assert.deepEqual(statements[1]?.params, ['company-1','project-1','unit-1','PUBLISHED'])
  assert.match(statements[1]?.text ?? '', /unit\.company_id=\$1 AND unit\.project_id=\$2/)
  assert.doesNotMatch(statements[1]?.text ?? '', /project_memberships/)
})

test('knowledge-unit dependencies validate both endpoints inside the same project', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rowCount: 1 }
  })

  await insertLearningKnowledgeUnitDependency(db, {
    companyId: 'company-1', projectId: 'project-1', knowledgeUnitId: 'unit-1',
    prerequisiteKnowledgeUnitId: 'unit-0',
  })

  assert.deepEqual(values, ['company-1','project-1','unit-1','unit-0'])
  assert.match(statement, /prerequisite\.company_id=unit\.company_id/)
  assert.match(statement, /prerequisite\.project_id=unit\.project_id/)
  assert.match(statement, /ON CONFLICT\(company_id,project_id,knowledge_unit_id,prerequisite_knowledge_unit_id\)/)
})

test('project reads return canonical knowledge units and the Course adapter only projects courseId', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('FROM courses course')) return { rows: [{
      course_id: 'course-1', company_id: 'company-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_status: 'ACTIVE',
    }] }
    return { rows: [unitRow] }
  })

  const units = await listProjectLearningKnowledgeUnits(db, 'company-1', 'project-1')
  const objectives = await listLearningObjectives(db, 'company-1', 'course-1')

  assert.deepEqual(units, [{
    id: 'unit-1', projectId: 'project-1', title: 'Explain leases',
    successCriteria: 'Give one invariant', targetLevel: 3, position: 0,
    status: 'DRAFT', prerequisiteKnowledgeUnitIds: ['unit-0'],
  }])
  assert.deepEqual(objectives, [{
    id: 'unit-1', courseId: 'course-1', title: 'Explain leases',
    successCriteria: 'Give one invariant', targetLevel: 3, position: 0,
    status: 'DRAFT', prerequisiteIds: ['unit-0'],
  }])
  assert.deepEqual(calls[0]?.params, ['company-1','project-1'])
  assert.deepEqual(calls[2]?.params, ['company-1','project-1'])
  assert.match(calls[2]?.text ?? '', /dependency\.company_id=unit\.company_id/)
  assert.match(calls[2]?.text ?? '', /dependency\.project_id=unit\.project_id/)
})
