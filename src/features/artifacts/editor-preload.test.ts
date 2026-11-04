import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let userId = 'user', companyId = 'company'
const issued: string[] = []
let failNext = false
mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: userId }, activeCompanyId: companyId }) } } })
mock.module('@/features/artifacts/api', { namedExports: { artifactsApi: { editorGrant: async (artifactId: string) => {
  issued.push(artifactId)
  if (failNext) { failNext = false; throw new Error('offline') }
  return { url: `/artifact-editor/slides/${artifactId}-${issued.length}/`, isolatedUrl: `https://${issued.length}-artifact.example.com/artifact-editor/slides/${artifactId}/`, expiresAt: 0, write: true }
} } } })
const requests: { url: string; init?: RequestInit }[] = []
let preloadStatus = 200
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  requests.push({ url, init })
  if (url === '/artifact-editor/preload.json') return new Response(JSON.stringify({ design: ['https://app.example.com/d.js'], slides: ['https://app.example.com/s.js', 'https://app.example.com/s.css'] }), { status: preloadStatus })
  return new Response('bytes')
}) as typeof fetch
const { editorGrant, warmEditor } = await import('./editor-preload')

test('an intent and the open share one grant per person, company and artifact', async () => {
  const first = await editorGrant('deck')
  assert.equal(await editorGrant('deck'), first)
  assert.equal(issued.length, 1)
  companyId = 'other-company'
  assert.notEqual(await editorGrant('deck'), first, 'another company never receives the cached grant')
  userId = 'other-user'
  await editorGrant('deck')
  assert.equal(issued.length, 3)
  assert.notEqual(await editorGrant('deck', true), first, 'a retry always asks for a new grant')
  assert.equal(issued.length, 4)
})

test('a failed grant is not reused', async () => {
  failNext = true
  await assert.rejects(editorGrant('broken'), /offline/)
  await editorGrant('broken')
  assert.deepEqual(issued.slice(-2), ['broken', 'broken'])
})

test('editor assets are fetched once, anonymously, as the editor frame requests them', async () => {
  preloadStatus = 503
  await assert.rejects(warmEditor('slides'), /preload 503/)
  preloadStatus = 200
  await warmEditor('slides')
  await warmEditor('slides', 'low')
  const assets = requests.filter(request => request.url.startsWith('https://'))
  assert.deepEqual(assets.map(request => request.url), ['https://app.example.com/s.js', 'https://app.example.com/s.css'])
  for (const { init } of assets) assert.deepEqual([init?.mode, init?.credentials], ['cors', 'omit'])
  assert.equal(requests.filter(request => request.url === '/artifact-editor/preload.json').length, 2, 'a failed list is fetched again')
})

test('overlapping speculative warm-ups share their pending download', async () => {
  let release!: () => void
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!url.endsWith('/d.js')) return original(url, init)
    requests.push({ url, init })
    return new Promise<Response>(done => { release = () => done(new Response('late')) })
  }) as typeof fetch
  try {
    const warm = warmEditor('design', 'low')
    await new Promise(done => setTimeout(done, 10))
    const second = warmEditor('design')
    release()
    await Promise.all([warm, second])
    assert.equal(requests.filter(request => request.url.endsWith('/d.js')).length, 1, 'nothing is downloaded a second time')
  } finally { globalThis.fetch = original }
})
