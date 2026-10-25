import test from 'node:test'
import assert from 'node:assert/strict'
import { computeScope } from './ci-scope.mjs'
import { classifyPaths } from './ci-scope-paths.mjs'
import { cumulativeChanges, componentFields, readAccepted, releaseApiUrl } from './ci-scope-cumulative.mjs'
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40)
test('controller pure CSS builds web only while disabled gate preserves legacy runtime image', () => {
  const changed = classifyPaths(['src/styles.css'])
  const scope = computeScope(changed, '', { releaseController: true })
  assert.equal(scope.web_build, true); assert.equal(scope.server, false); assert.equal(scope.integration, false)
  assert.deepEqual(scope.images, [])
  assert.equal(computeScope(changed).images[0].package, 'lingxiloop-server')
})
test('real server imports and shared transitive helper changes build runtime', () => {
  for (const path of ['src/lib/runActivity.ts', 'src/lib/participantDisplayName.ts', 'src/features/cases/cover-vm/program.ts']) {
    const scope = computeScope(classifyPaths([path]), '', { releaseController: true })
    assert.equal(scope.server, true, path); assert.equal(scope.images[0].target, 'runtime')
  }
})
test('late candidate compares every accepted component, retaining earlier unaccepted CSS and backend changes', () => {
  const accepted = { releaseId: 'accepted', components: Object.fromEntries(Object.keys(componentFields).map(id => [id, { appSha: id === 'main-frontend' ? a : b }])) }
  const calls = []
  const { changed, differences } = cumulativeChanges(accepted, c, args => { calls.push(args); return args[0] === 'diff' ? args.at(-1).startsWith(a) ? 'src/styles.css' : 'server/src/late.ts' : '' })
  assert.equal(changed.web, true); assert.equal(changed.serverSource, true)
  assert.equal(differences['main-frontend'].fromSha, a)
  assert.equal(calls.filter(args => args[0] === 'diff').length, Object.keys(componentFields).length)
})
test('unverified production bootstrap is refused', () => {
  assert.throws(() => cumulativeChanges({ components: {} }, c), /ACCEPTED_BASELINE_REQUIRED/)
})

test('release API rejects unsafe roots and missing token, forbids redirect and bounds reads', async () => {
  for (const url of ['http://api.example.com', 'https://user:pass@api.example.com', 'https://api.example.com/path', 'https://api.example.com/?token=secret']) assert.throws(() => releaseApiUrl(url, '/v1/accepted', 'token'), /HTTPS root/)
  assert.throws(() => releaseApiUrl('https://api.example.com', '/v1/accepted', ''), /TOKEN/)
  const accepted = await readAccepted('https://api.example.com', 'token', async (url, init) => {
    assert.equal(url.pathname, '/v1/accepted'); assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
    return Response.json({ releaseId: 'accepted' })
  })
  assert.equal(accepted.releaseId, 'accepted')
})
