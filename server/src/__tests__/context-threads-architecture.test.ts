import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const contextRouter = source('../modules/context-threads/router.ts')
const contextApplication = source('../modules/context-threads/application.ts')
const contextContracts = source('../modules/context-threads/contracts.ts')
const contextApi = source('../../../src/features/context-threads/api.ts')

test('M9 exposes only Agent learning and controlled Teacher ContextThread commands', () => {
  assert.match(contextRouter, /\/projects\/:projectId\/context-threads\/learning/)
  assert.match(contextRouter, /\/projects\/:projectId\/context-threads\/teacher/)
  assert.match(contextApplication, /contextType: 'LEARNING'/)
  assert.match(contextContracts, /'TEACHER_TAKEOVER'/)
  assert.match(contextContracts, /'INTERVENTION'/)
  assert.match(contextApplication, /isActiveProjectStudent/)
  assert.match(contextApplication, /learningCaseBelongsToStudent/)
  assert.match(contextApi, /openLearning/)
  assert.match(contextApi, /openTeacher/)
})
