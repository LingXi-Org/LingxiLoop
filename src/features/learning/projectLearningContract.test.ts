import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Learning Center consumes canonical Project dashboard and fact routes', () => {
  const api = read('./api.ts')
  const hook = read('./hooks/useLearningCenter.ts')
  const center = read('./components/LearningCenter.tsx')

  assert.match(api, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/learning\/knowledge-units/)
  assert.match(api, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/learning\/activities/)
  assert.match(api, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/learning\/missions/)
  assert.match(hook, /next\.projects\[0\]\?\.projectId/)
  assert.match(center, /dashboard\?\.projects\.find/)
  assert.match(center, /dashboard\?\.states/)
  assert.doesNotMatch(center, /dashboard\?\.mastery|dashboard\.courses/)
})

test('Learning UI uses uppercase domain values without compatibility coercion', () => {
  const contracts = read('./contracts.ts')
  const display = read('./components/learningDisplay.tsx')
  const api = read('./api.ts')

  assert.match(contracts, /status: 'PLANNING' \| 'ACTIVE' \| 'PAUSED'/)
  assert.match(contracts, /assistance: 'NONE' \| 'HINT' \| 'GUIDED'/)
  assert.match(contracts, /evaluationMode: 'AGENT_FORMATIVE' \| 'TEACHER_REQUIRED'/)
  assert.match(display, /NEEDS_REVIEW: '待复核'/)
  assert.doesNotMatch(api, /overrideLevel|override_level/)
})
