import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type ProjectLifecycleCommand,
  type ProjectStatus,
  projectKindBelongsToCompanyType,
  projectStatusBelongsToKind,
  transitionProject,
} from '../domain/public.js'
import {
  createProjectRequestSchema,
  updateProjectRequestSchema,
} from '../modules/knowledge/contracts.js'

test('Project creation kind is selected by the use case rather than client input', () => {
  assert.equal(createProjectRequestSchema.safeParse({ name: 'Math', kind: 'TEACHING' }).success, false)
  assert.equal(updateProjectRequestSchema.safeParse({ kind: 'INSTITUTIONAL_COURSE' }).success, false)
})

test('ProjectKind belongs to exactly one supported CompanyType boundary', () => {
  assert.deepEqual({
    personalLearning: {
      personal: projectKindBelongsToCompanyType('PERSONAL_LEARNING', 'PERSONAL'),
      education: projectKindBelongsToCompanyType('PERSONAL_LEARNING', 'EDUCATION'),
    },
    teaching: {
      personal: projectKindBelongsToCompanyType('TEACHING', 'PERSONAL'),
      education: projectKindBelongsToCompanyType('TEACHING', 'EDUCATION'),
    },
    institutionalCourse: {
      personal: projectKindBelongsToCompanyType('INSTITUTIONAL_COURSE', 'PERSONAL'),
      education: projectKindBelongsToCompanyType('INSTITUTIONAL_COURSE', 'EDUCATION'),
    },
  }, {
    personalLearning: { personal: true, education: false },
    teaching: { personal: true, education: false },
    institutionalCourse: { personal: false, education: true },
  })
})

function runProjectLifecycle(
  kind: 'PERSONAL_LEARNING' | 'TEACHING' | 'INSTITUTIONAL_COURSE',
  initial: ProjectStatus,
  commands: ProjectLifecycleCommand[],
): ProjectStatus[] {
  const statuses = [initial]
  for (const command of commands) {
    const transition = transitionProject(kind, statuses.at(-1)!, command)
    assert.notEqual(transition.outcome, 'INVALID')
    if (transition.to) statuses.push(transition.to)
  }
  return statuses
}

test('each ProjectKind follows its own lifecycle without arbitrary jumps', () => {
  assert.deepEqual(runProjectLifecycle('PERSONAL_LEARNING', 'CREATED', [
    'ACTIVATE', 'ARCHIVE', 'DELETE',
  ]), ['CREATED', 'ACTIVE', 'ARCHIVED', 'DELETED'])
  assert.deepEqual(runProjectLifecycle('TEACHING', 'DRAFT', [
    'ACTIVATE', 'END', 'ENTER_READ_ONLY', 'ARCHIVE',
  ]), ['DRAFT', 'ACTIVE', 'COURSE_ENDED', 'READ_ONLY', 'ARCHIVED'])
  assert.deepEqual(runProjectLifecycle('INSTITUTIONAL_COURSE', 'DRAFT', [
    'ACTIVATE', 'END', 'ENTER_READ_ONLY', 'ENTER_RETENTION', 'DELETE',
  ]), ['DRAFT', 'ACTIVE', 'COURSE_ENDED', 'READ_ONLY', 'RETENTION', 'DELETED'])

  assert.deepEqual(transitionProject('TEACHING', 'ACTIVE', 'ARCHIVE'), {
    outcome: 'INVALID', from: 'ACTIVE', to: null,
  })
  assert.deepEqual(transitionProject('PERSONAL_LEARNING', 'ACTIVE', 'END'), {
    outcome: 'INVALID', from: 'ACTIVE', to: null,
  })
})

test('Project lifecycle commands are idempotent and transfer cancellation restores ACTIVE', () => {
  assert.deepEqual(transitionProject('TEACHING', 'ACTIVE', 'ACTIVATE'), {
    outcome: 'ALREADY_APPLIED', from: 'ACTIVE', to: 'ACTIVE',
  })
  assert.deepEqual(transitionProject('TEACHING', 'ACTIVE', 'REQUEST_TRANSFER'), {
    outcome: 'APPLIED', from: 'ACTIVE', to: 'TRANSFER_PENDING',
  })
  assert.deepEqual(transitionProject('TEACHING', 'TRANSFER_PENDING', 'CANCEL_TRANSFER'), {
    outcome: 'APPLIED', from: 'TRANSFER_PENDING', to: 'ACTIVE',
  })
})

test('Project statuses cannot be assigned to the wrong ProjectKind', () => {
  assert.equal(projectStatusBelongsToKind('PERSONAL_LEARNING', 'DRAFT'), false)
  assert.equal(projectStatusBelongsToKind('TEACHING', 'RETENTION'), false)
  assert.equal(projectStatusBelongsToKind('INSTITUTIONAL_COURSE', 'TRANSFER_PENDING'), false)
})
