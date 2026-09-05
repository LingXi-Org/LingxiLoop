import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { projectKindBelongsToCompanyType } from '../domain/public.js'
import {
  addInstitutionalCourseMemberRequestSchema,
  createCourseRequestSchema,
} from '../modules/learning/contracts.js'
import {
  addInstitutionalCourseMember,
  insertCourse,
} from '../modules/learning/courses-repository.js'

const applicationSource = readFileSync('server/src/modules/learning/application.ts', 'utf8')
const routerSource = readFileSync('server/src/modules/learning/router.ts', 'utf8')

test('Course kind is selected by its dedicated use case, not by request data', () => {
  assert.deepEqual(createCourseRequestSchema.parse({ name: 'Personal class' }), {
    name: 'Personal class',
    description: '',
    color: '#5266d6',
  })
  assert.equal(createCourseRequestSchema.safeParse({
    kind: 'INSTITUTIONAL_COURSE',
    name: 'School class',
  }).success, false)
  assert.equal(projectKindBelongsToCompanyType('INSTITUTIONAL_COURSE', 'PERSONAL'), false)
  assert.equal(projectKindBelongsToCompanyType('INSTITUTIONAL_COURSE', 'EDUCATION'), true)
})

test('Institutional Course persistence inherits the Contract plan and assigns only creator OWNER role', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = {
    async query(text: string, params?: readonly unknown[]) {
      calls.push({ text, params })
      return { rows: text.includes('FROM participants') ? [] : [], rowCount: 1 }
    },
  } as unknown as Queryable
  await insertCourse(db, {
    companyId: 'school-1',
    userId: 'admin-1',
    projectId: 'project-1',
    courseId: 'course-1',
    roomId: 'room-1',
    kind: 'INSTITUTIONAL_COURSE',
    planId: null,
    input: {
      name: 'School class',
      description: '',
      color: '#5266d6',
    },
  })

  assert.deepEqual(calls[0]?.params?.slice(0, 4), [
    'project-1', 'school-1', 'INSTITUTIONAL_COURSE', null,
  ])
  assert.match(calls.map((call) => call.text).join('\n'), /INSERT INTO project_memberships[\s\S]*'OWNER'/)
  assert.doesNotMatch(calls.map((call) => call.text).join('\n'), /INSERT INTO (?:users|organization_seats)/)
})

test('Institutional member assignment accepts four roles for an existing School Membership only', async () => {
  for (const role of ['TEACHER', 'TA', 'STUDENT', 'OBSERVER']) {
    assert.equal(addInstitutionalCourseMemberRequestSchema.safeParse({
      role,
      idempotencyKey: `member-${role.toLowerCase()}`,
    }).success, true)
  }
  assert.equal(addInstitutionalCourseMemberRequestSchema.safeParse({
    role: 'OWNER',
    idempotencyKey: 'member-owner',
  }).success, false)

  let statement = ''
  let values: readonly unknown[] | undefined
  const db = {
    async query(text: string, params?: readonly unknown[]) {
      statement = text
      values = params
      return { rows: [{ project_id: 'project-1' }], rowCount: 1 }
    },
  } as unknown as Queryable
  assert.deepEqual(await addInstitutionalCourseMember(db, {
    companyId: 'school-1',
    courseId: 'course-1',
    userId: 'student-1',
    role: 'OBSERVER',
  }), { projectId: 'project-1', role: 'OBSERVER', added: true })
  assert.deepEqual(values, ['school-1', 'course-1', 'student-1', 'OBSERVER'])
  assert.match(statement, /JOIN company_memberships[\s\S]*membership\.status='ACTIVE'/)
  assert.match(statement, /project\.kind='INSTITUTIONAL_COURSE'/)
  assert.doesNotMatch(statement, /users|organization_seats/)

  let retryQuery = 0
  const retryDb = {
    async query() {
      retryQuery += 1
      return retryQuery === 1
        ? { rows: [], rowCount: 0 }
        : { rows: [{ project_id: 'project-1', role: 'OBSERVER' }], rowCount: 1 }
    },
  } as unknown as Queryable
  assert.deepEqual(await addInstitutionalCourseMember(retryDb, {
    companyId: 'school-1',
    courseId: 'course-1',
    userId: 'student-1',
    role: 'OBSERVER',
  }), { projectId: 'project-1', role: 'OBSERVER', added: false })
})

test('Institutional Course writes publish canonical events and use a dedicated member route', () => {
  assert.match(applicationSource, /PROJECT\.CREATED/)
  assert.match(applicationSource, /PROJECT_MEMBERSHIP\.ASSIGNED/)
  assert.match(applicationSource, /source: 'INSTITUTIONAL_COURSE'/)
  assert.match(routerSource, /\.put\('\/courses\/:id\/members\/:userId'/)
  assert.match(routerSource, /\.post\('\/institutional-courses'/)
})
