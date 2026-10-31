import test from 'node:test'
import assert from 'node:assert/strict'
import { computeScope } from './ci-scope.mjs'
import { classifyPaths } from './ci-scope-paths.mjs'

test('pure CSS changes check and build only the web', () => {
  const scope = computeScope(classifyPaths(['src/styles.css']))
  assert.equal(scope.web_build, true); assert.equal(scope.server, false); assert.equal(scope.integration, false)
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
    for (const file of ['runtime-patch60-provenance.test.ts', 'runtime-patch60-20-provenance.test.ts', 'runtime-patch61-21-provenance.test.ts']) assert.ok(scope.integration_files.includes(file), path + ':' + file)
  }
})
