import test from 'node:test'
import assert from 'node:assert/strict'
import { computeScope } from './ci-scope.mjs'
import { classifyPaths } from './ci-scope-paths.mjs'

test('pure CSS changes check and build only the web', () => {
  const scope = computeScope(classifyPaths(['src/styles.css']))
  assert.equal(scope.web_build, true); assert.equal(scope.server, false); assert.equal(scope.integration, false)
})
test('Design sizing sources retain their editor build and artifact integration owners', () => {
  for (const path of ['shared/design-flow-size.ts', 'scripts/build-design-layout.mjs', 'scripts/design-flow-size.test.mjs']) {
    const scope = computeScope(classifyPaths([path]))
    assert.equal(scope.web, true, path)
    assert.equal(scope.integration, true, path)
    assert.ok(scope.integration_files.includes('artifact-app-boundary.test.ts'), path)
  }
})
test('real server imports and shared transitive helper changes check the server', () => {
  for (const path of ['src/lib/runActivity.ts', 'src/lib/participantDisplayName.ts', 'src/features/cases/cover-vm/program.ts']) {
    assert.equal(computeScope(classifyPaths([path])).server, true, path)
  }
})

test('the public auth contract checks both its browser and control-plane consumers', () => {
  const scope = computeScope(classifyPaths(['src/auth/contracts.ts']))
  assert.equal(scope.web, true)
  assert.equal(scope.control, true)
})
test('runtime patch and deployment changes retain both product60 patch qualifications', () => {
  for (const path of ['server/src/db/runtime-patch.ts', 'deploy/runtime-patch.mjs']) {
    const scope = computeScope(classifyPaths([path]))
    assert.equal(scope.integration_mode, 'selected')
    for (const file of ['runtime-patch60-provenance.test.ts', 'runtime-patch60-20-provenance.test.ts', 'runtime-patch61-21-provenance.test.ts', 'runtime-patch61-22-provenance.test.ts', 'runtime-patch61-23-provenance.test.ts', 'runtime-patch61-23-from21-provenance.test.ts', 'runtime-patch61-24-provenance.test.ts']) assert.ok(scope.integration_files.includes(file), path + ':' + file)
  }
})

test('run diagnostic readers retain their authorized HTTP integration owner', () => {
  for (const path of ['agent-operations', 'agent-run-timing', 'model-stage-timing', 'router', 'company-router']) {
    const scope = computeScope(classifyPaths([`server/src/modules/platform-operations/${path}.ts`]))
    assert.ok(scope.integration_files.includes('runtime-worker-diagnostics.test.ts'), path)
  }
})

test('settled stage producers and readers retain shared-ledger and public publication regressions', () => {
  for (const path of ['server/src/agent-runtime/model-observation-timing.ts', 'server/src/modules/platform-operations/model-stage-timing.ts', 'shared/model-stage-timing.ts']) {
    const scope = computeScope(classifyPaths([path]))
    assert.ok(scope.integration_files.includes('model-stage-ledger.test.ts'), path)
    assert.ok(scope.integration_files.includes('runtime-public-text-suspension.test.ts'), path)
  }
})
