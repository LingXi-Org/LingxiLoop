import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import { computeScope } from './ci-scope.mjs'
import { classifyPaths } from './ci-scope-paths.mjs'

test('large PR evidence changes cannot truncate owning checks at the GitHub API file limit',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8'),paths=workflow.split('id: paths')[1]?.split('filters: |')[0]
 assert.match(paths??'',/token:\s*''/,'PR筛选必须使用完整git差异，避免API仅返回前3000项而跳过src/shared')
 const files=[...Array.from({length:3100},(_,i)=>`docs/evidence/issue-707/${i}.json`),'src/features/artifacts/native/NativeEditor.tsx','shared/artifact-document.ts']
 const scope=computeScope(classifyPaths(files));assert.equal(scope.web,true);assert.equal(scope.server,true);assert.equal(scope.integration,true)
})

test('the shared durable-queue fixture retains all four owning files without a broad full run', () => {
  const files = ['runtime-queue-interactive-capacity.test.ts', 'runtime-queue-background-capacity.test.ts',
    'runtime-queue-capacity.test.ts', 'runtime-queue-lifecycle.test.ts']
  const scope = computeScope(classifyPaths(['server/src/__integration__/_queue-capacity-fixture.ts']))
  assert.equal(scope.integration_mode,'selected')
  assert.deepEqual(scope.integration_files.filter(file=>file.startsWith('runtime-queue-')),files)
  const unrelated = computeScope(classifyPaths(['server/src/__integration__/_recording-wukong.ts']))
  assert.ok(!unrelated.integration_files.some(file=>files.includes(file)))
})

test('pure CSS changes check and build only the web', () => {
  const scope = computeScope(classifyPaths(['src/styles.css']))
  assert.equal(scope.web_build, true); assert.equal(scope.server, false); assert.equal(scope.integration, false)
})
test('retired capability compatibility keeps its archive and authorization integration owner', () => {
  for (const path of ['server/src/im/retired-visualize.ts', 'server/src/im/visualize-router.ts', 'server/src/im/interaction-admission.ts',
    'server/src/agent-runtime/retired-capabilities.ts', 'shared/retired-visualize.ts', 'shared/assistant-directive-parser.ts']) {
    const scope = computeScope({ serverSource: true, serverSourceFiles: [path] })
    assert.ok(scope.integration_files.includes('retired-visualize.test.ts'), path)
  }
})
test('explanation routing and publication keep actual native generation and failed-write owners', () => {
  for (const path of ['server/src/agent-runtime/context.ts','server/src/agent-runtime/skill-context.ts','server/src/modules/artifacts/agent-tools.ts',
    'server/src/modules/artifacts/skills.ts','server/src/modules/learning/teacher-preset.ts']) {
    const scope = computeScope(classifyPaths([path]))
    assert.ok(scope.integration_files.includes('runtime-first-action-contracts.test.ts'),path)
    assert.ok(scope.integration_files.includes('runtime-design-failure.test.ts'),path)
    assert.ok(scope.integration_files.includes('runtime-teaching-scaffold.test.ts'),path)
  }
})
test('native artifact sources retain browser and artifact integration owners', () => {
  for (const path of ['shared/artifact-document.ts', 'shared/artifact-operations.ts', 'shared/artifact-legacy.ts']) {
    const scope = computeScope(classifyPaths([path]))
    assert.equal(scope.web, true, path)
    assert.equal(scope.integration, true, path)
    assert.ok(scope.integration_files.includes('artifact-app-boundary.test.ts'), path)
  }
})
test('real server imports and shared transitive helper changes check the server', () => {
  for (const path of ['src/lib/runActivity.ts', 'src/lib/participantDisplayName.ts']) {
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
    for (const file of ['runtime-patch60-provenance.test.ts', 'runtime-patch60-20-provenance.test.ts', 'runtime-patch61-21-provenance.test.ts', 'runtime-patch61-22-provenance.test.ts', 'runtime-patch61-23-provenance.test.ts', 'runtime-patch61-23-from21-provenance.test.ts', 'runtime-patch61-24-provenance.test.ts', 'runtime-patch62-25-provenance.test.ts', 'runtime-patch62-40-provenance.test.ts']) assert.ok(scope.integration_files.includes(file), path + ':' + file)
  }
})
test('harness release and product contract edits retain the real PostgreSQL drain barrier owner', () => {
  for (const path of ['server/src/db/harness-cutover.ts', 'server/src/harness-cutover-bin.ts',
    'server/src/agent-runtime/harness.ts', 'deploy/harness-cutover.mjs', 'deploy/harness-receipt.mjs']) {
    const scope = computeScope(classifyPaths([path]))
    assert.equal(scope.integration_mode, 'selected')
    assert.ok(scope.integration_files.includes('harness-cutover.test.ts'), path)
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


test('integration job timeout follows its selected owner budget while smoke stays short', () => {
  assert.equal(computeScope({ serverSource: true }).integration_timeout_minutes, 12)
  const one = computeScope({ integrationTests: true, integrationFiles: ['server/src/__integration__/slides-workspace-flow.test.ts'] })
  assert.equal(one.integration_timeout_minutes, 13)
  const broad = computeScope({ serverSource: true, serverSourceFiles: [
    'server/src/db/runtime-patch.ts', 'server/src/db/migrate.ts', 'server/src/agent-runtime/runtime.ts',
    'server/src/modules/artifacts/agent-tools.ts', 'server/src/modules/access/public.ts',
    'server/src/modules/conversations/public.ts', 'server/src/modules/memory/public.ts',
    'server/src/modules/projects/public.ts', 'server/src/modules/knowledge/public.ts',
  ] })
  assert.ok(broad.integration_files.length >= 25)
  assert.equal(broad.integration_timeout_minutes, 32)
  assert.equal(computeScope({}, 'deep-integration').integration_timeout_minutes, 32)
  const queue = computeScope({ serverSource: true, serverSourceFiles: ['server/src/__integration__/_queue-capacity-fixture.ts'] })
  assert.equal(queue.integration_timeout_minutes, Math.ceil((queue.integration_files.length * 60_000 + 450_000) / 60_000) + 7)
})
