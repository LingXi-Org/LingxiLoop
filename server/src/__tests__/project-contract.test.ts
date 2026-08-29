import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectKindBelongsToCompanyType } from '../domain/public.js'
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
