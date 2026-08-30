import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const controlPlane = readFileSync(new URL('../agent-os/control-plane.ts', import.meta.url), 'utf8')

test('Agent OS derives learning context and progress from the conversation Project', () => {
  assert.match(controlPlane, /project\.id=c\.project_id AND project\.company_id=c\.company_id/)
  assert.match(controlPlane, /s\.company_id=c\.company_id AND s\.project_id=c\.project_id/)
  assert.match(controlPlane, /SELECT project_id FROM conversations WHERE id=\$1 AND company_id=\$3/)
  assert.match(controlPlane, /m\.company_id=\$3 AND m\.project_id=\(SELECT project_id FROM scope\)/)
  assert.match(controlPlane, /attempt\.company_id=\$3 AND attempt\.project_id=\(SELECT project_id FROM scope\)/)
  assert.match(controlPlane, /m\.status IN \('PLANNING','ACTIVE','PAUSED'\)/)
  assert.doesNotMatch(controlPlane, /attempt\.course_id/)
})
