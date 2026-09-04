import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ports = readFileSync(new URL('../modules/enterprise/integration-ports.ts', import.meta.url), 'utf8')
const cards = readFileSync(
  new URL('../../../src/features/education/components/EnterpriseIntegrationCapabilities.tsx', import.meta.url),
  'utf8',
)

test('Enterprise providers expose availability only and no runtime adapters', () => {
  for (const port of ['ScimProvisioningPort', 'SiemSinkPort', 'AdvancedSsoPort', 'PrivateDeploymentPort']) {
    assert.match(ports, new RegExp(`interface ${port}[\\s\\S]*availability\\(\\)`))
  }
  for (const capability of ['SCIM_PROVISIONING', 'SIEM_SINK', 'ADVANCED_SSO', 'PRIVATE_DEPLOYMENT']) {
    assert.match(ports, new RegExp(`'${capability}'`))
  }
  assert.doesNotMatch(ports, /class .*Adapter|implements .*Port|fetch\(|process\.env|\b(?:configure|provision|send|deploy)\s*\(/i)
})

test('Enterprise capabilities are disabled Shadcn cards without credential or fake-success paths', () => {
  for (const capability of ['scim-provisioning', 'siem-sink', 'advanced-sso', 'private-deployment']) {
    assert.match(cards, new RegExp(`id: '${capability}'`))
  }
  assert.match(cards, /Card[\s\S]*Badge[\s\S]*暂不支持[\s\S]*Button[\s\S]*disabled/)
  assert.match(cards, /不会收集密钥、发送数据或显示虚假的开通结果/)
  assert.doesNotMatch(cards, /<Input|<Textarea|type="password"|onSubmit|fetch\(/)
})
