import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const controlPlane = readFileSync(new URL('../agent-os/control-plane.ts', import.meta.url), 'utf8')
const hostActionRepository = readFileSync(
  new URL('../agent-os/host-action-repository.ts', import.meta.url),
  'utf8',
)
const agentOsPersistence = `${controlPlane}\n${hostActionRepository}`

test('Agent OS derives learning context and progress from the conversation Project', () => {
  assert.match(controlPlane, /project\.id=c\.project_id AND project\.company_id=c\.company_id/)
  assert.match(controlPlane, /project\.status <> 'DELETED'/)
  assert.doesNotMatch(controlPlane, /project\.lifecycle_state/)
  assert.match(agentOsPersistence, /SELECT project_id FROM conversations WHERE id=\$1 AND company_id=\$3/)
  assert.match(agentOsPersistence, /m\.company_id=\$3 AND m\.project_id=\(SELECT project_id FROM scope\)/)
  assert.match(agentOsPersistence, /attempt\.company_id=\$3 AND attempt\.project_id=\(SELECT project_id FROM scope\)/)
  assert.match(agentOsPersistence, /m\.status IN \('PLANNING','ACTIVE','PAUSED'\)/)
  assert.doesNotMatch(agentOsPersistence, /attempt\.course_id/)
})
