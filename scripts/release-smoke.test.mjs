import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { releaseVersions } from '@lyyzka/lingxios'

const sha = 'a'.repeat(40)
const runtime = { name: '@lyyzka/lingxios', ...releaseVersions }
const fixture = `
const scenario = JSON.parse(process.env.SMOKE_SCENARIO)
globalThis.fetch = async (input, init) => {
  const path = new URL(input).pathname
  const authenticated = !['/api/health', '/api/health/dependencies', '/api/meta'].includes(path)
  if (authenticated && (init.headers.cookie !== 'synthetic-secret-cookie' || init.headers['x-company-id'] !== 'smoke-company')) throw new Error('missing fixture authorization')
  if (scenario.httpFailure === path) return new Response('synthetic-secret-response-body', {status: 503})
  const bodies = {
    '/api/health': {ok: true},
    '/api/health/dependencies': {ok: true, dependencies: {postgres: true, redis: true}},
    '/api/meta': scenario.meta,
    '/api/auth/me': {companies: [{id: 'smoke-company'}]},
    '/api/im/channels': [],
    '/api/auth/ws-ticket': {ticket: 'synthetic-secret-ws-ticket'},
  }
  if (!(path in bodies)) throw new Error('unexpected route')
  return Response.json(bodies[path])
}
globalThis.WebSocket = class extends EventTarget {
  constructor(input) {
    super()
    const url = new URL(input)
    if (url.protocol !== 'wss:' || url.pathname !== '/ws' || url.searchParams.get('t') !== 'synthetic-secret-ws-ticket') throw new Error('wrong socket target')
    setImmediate(() => this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({type: 'hello'})})))
  }
  close() {}
}
`

async function smoke(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'lingxiloop-smoke-contract-'))
  try {
    const preload = join(dir, 'fixture.mjs')
    await writeFile(preload, fixture)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/release-smoke.mjs'], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15_000,
      env: {
        PATH: process.env.PATH,
        LINGXILOOP_SMOKE_BASE: 'https://smoke.example.invalid',
        LINGXILOOP_SMOKE_COOKIE: 'synthetic-secret-cookie',
        LINGXILOOP_SMOKE_COMPANY_ID: 'smoke-company',
        LINGXILOOP_SMOKE_EXPECTED_SHA: sha,
        LINGXILOOP_SMOKE_EXPECTED_VERSION: '0.1.0-beta',
        SMOKE_SCENARIO: JSON.stringify({meta: {product: 'LingxiLoop', commitSha: sha, version: '0.1.0-beta', reasoningRuntime: runtime}, ...overrides}),
      },
    })
    assert.ifError(result.error)
    return {status: result.status, output: result.stdout + result.stderr}
  } finally { await rm(dir, {recursive: true, force: true}) }
}

test('production smoke accepts the exact public runtime and reaches authenticated WebSocket', async () => {
  const result = await smoke()
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /authenticated hello/)
})

test('production smoke rejects retired or mismatched runtime before tenant access', async () => {
  for (const value of [null, ...Object.keys(releaseVersions).map(key => ({...runtime, [key]: 'invalid-version'}))]) {
    const result = await smoke({meta: {product: 'LingxiLoop', commitSha: sha, version: '0.1.0-beta', reasoningRuntime: value}})
    assert.equal(result.status, 1, JSON.stringify(value))
    assert.doesNotMatch(result.output, /✓ \/api\/auth\/me/)
  }
})

test('production smoke still enforces the concrete release commit', async () => {
  const result = await smoke({meta: {product: 'LingxiLoop', commitSha: 'b'.repeat(40), version: '0.1.0-beta', reasoningRuntime: runtime}})
  assert.equal(result.status, 1)
  assert.match(result.output, /commit mismatch/)
})

test('production smoke HTTP failure never prints server body or session secrets', async () => {
  const result = await smoke({httpFailure: '/api/health'})
  assert.equal(result.status, 1)
  assert.match(result.output, /503/)
  assert.doesNotMatch(result.output, /synthetic-secret/)
})
