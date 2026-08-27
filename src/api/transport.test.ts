import assert from 'node:assert/strict'
import test from 'node:test'
import { lingxiApiFetch, mergeRequestHeaders, putPresignedFile } from './transport'

test('caller headers override matching defaults without dropping auth or tenant context', () => {
  const headers = mergeRequestHeaders({
    authorization: 'Bearer token',
    'content-type': 'application/json',
    'x-company-id': 'co-1',
    'x-project-id': 'project-1',
  }, new Headers([
    ['Content-Type', 'text/plain'],
    ['x-custom-header', 'custom'],
  ]))

  assert.equal(headers.get('authorization'), 'Bearer token')
  assert.equal(headers.get('x-company-id'), 'co-1')
  assert.equal(headers.get('x-project-id'), 'project-1')
  assert.equal(headers.get('content-type'), 'text/plain')
  assert.equal(headers.get('x-custom-header'), 'custom')
})

test('native Lingxi API transport uses explicit CapacitorHttp semantics', async () => {
  let options: unknown
  const response = await lingxiApiFetch('https://loop.example/api/test', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: '{"ok":true}',
  }, {
    native: true,
    nativeRequest: async (value) => {
      options = value
      return { status: 201, data: { accepted: true }, headers: { 'content-type': 'application/json' }, url: value.url }
    },
  })

  assert.deepEqual(options, {
    url: 'https://loop.example/api/test',
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    data: '{"ok":true}',
    responseType: 'text',
  })
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { accepted: true })
})

test('native Lingxi API transport preserves bodyless response statuses', async () => {
  const response = await lingxiApiFetch('https://loop.example/api/empty', {}, {
    native: true,
    nativeRequest: async (value) => ({
      status: 204,
      data: '',
      headers: {},
      url: value.url,
    }),
  })
  assert.equal(response.status, 204)
  assert.equal(await response.text(), '')
})

test('presigned uploads keep the File body on the browser fetch path', async () => {
  const file = new File(['payload'], 'notes.txt', { type: 'text/plain' })
  let input: Parameters<typeof fetch> | null = null
  const response = await putPresignedFile('https://r2.example/signed', file, 'text/plain', async (...args) => {
    input = args
    return new Response(null, { status: 200 })
  })
  assert.equal(response.status, 200)
  assert.ok(input)
  assert.equal(input[0], 'https://r2.example/signed')
  assert.equal((input[1] as RequestInit).body, file)
})
