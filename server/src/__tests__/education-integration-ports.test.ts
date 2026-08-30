import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ports = readFileSync(new URL('../modules/education/integration-ports.ts', import.meta.url), 'utf8')
const identityRouter = readFileSync(new URL('../modules/identity/router.ts', import.meta.url), 'utf8')
const capabilityCards = readFileSync(
  new URL('../../../src/features/education/components/EducationIntegrationCapabilities.tsx', import.meta.url),
  'utf8',
)

test('LMS is only a capability-probed port that returns the standard Activity Import contract', () => {
  assert.match(ports, /interface LmsConnectorPort/)
  assert.match(ports, /probe\(\).*ExternalIntegrationProbe<LmsConnectorCapability>/)
  assert.match(ports, /readActivityImport[\s\S]*LearningActivityImportInput/)
  assert.deepEqual(ports.match(/'LEARNING_ACTIVITY_IMPORT'/g), ["'LEARNING_ACTIVITY_IMPORT'"])
  assert.doesNotMatch(ports, /class .*Adapter|implements LmsConnectorPort|fetch\(|process\.env/)
})

test('Education SSO broker can only map an opaque subject to an Existing User', () => {
  assert.match(ports, /interface EducationIdentityBrokerPort/)
  assert.match(ports, /mapExistingUser[\s\S]*Promise<\{ userId: string \} \| null>/)
  assert.doesNotMatch(ports, /createUser|INSERT INTO users|email:|password|clientSecret|accessToken/)
  assert.doesNotMatch(identityRouter, /education-sso|saml|domain-verification/)
})

test('LMS, SSO and Domain Verification are disabled Shadcn capability cards without credential inputs', () => {
  for (const capability of ['lms', 'education-sso', 'domain-verification']) {
    assert.match(capabilityCards, new RegExp(`id: '${capability}'`))
  }
  assert.match(capabilityCards, /Card[\s\S]*Badge[\s\S]*暂未开放[\s\S]*Button[\s\S]*disabled/)
  assert.match(capabilityCards, /不会收集密钥或模拟配置成功/)
  assert.doesNotMatch(capabilityCards, /<Input|<Textarea|type="password"|onSubmit|fetch\(/)
})
