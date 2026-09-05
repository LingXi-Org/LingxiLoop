import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const router = readFileSync(new URL('../modules/learning/classroom-router.ts', import.meta.url), 'utf8')
const application = readFileSync(new URL('../modules/learning/application.ts', import.meta.url), 'utf8')

test('Project learning facts expose the minimal read, submit and review surface', () => {
  for (const path of [
    'knowledge-units', 'activities', 'missions', 'evidence', 'reviews', 'progress',
  ]) {
    assert.match(router, new RegExp(`/projects/:projectId/learning/${path}`))
  }
  assert.match(router, /\/projects\/:projectId\/learning\/activities\/:activityId\/submit/)
  assert.match(router, /\/projects\/:projectId\/learning\/reviews\/:evaluationId/)
  assert.match(router, /resource: \{ type: 'project', id: projectId \}/)
})

test('Project learning application methods consume trusted Project facts directly', () => {
  assert.match(application, /listProjectLearningKnowledgeUnits\(this\.db, scope\.companyId, projectId\)/)
  assert.match(application, /listProjectLearningActivities\(this\.db, scope\.companyId, projectId, canManage\.allowed\)/)
  assert.match(application, /submitProjectLearningActivity\(/)
  assert.match(application, /this\.infrastructure\.transaction\(work\)/)
  assert.match(application, /listLearningMissions\(this\.db/)
  assert.match(application, /reviewProjectLearningEvaluation\(/)
})
