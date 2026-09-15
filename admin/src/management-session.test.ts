import assert from 'node:assert/strict'
import { test } from 'node:test'

test('management transport isolates company requests and clears cached records after revocation', async () => {
  const redirects: string[] = [], requests: string[] = []
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:5198', pathname: '/', replace: (path: string) => redirects.push(path) } })
  let denied = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    requests.push(String(input))
    return new Response(JSON.stringify(denied ? { error: 'access revoked' } : String(input).endsWith('management-session')
      ? { mode: 'company', companyId: 'school-a', resources: ['users', 'companies', 'projects'], capabilities: {}, user: { id: 'teacher', name: 'Teacher', email: 'teacher@test.local' } }
      : { data: [] }), { status: denied ? 403 : 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const api = await import('./api')
    await api.refreshManagementSession()
    assert.equal(api.canReadResource('users'), true)
    assert.equal(api.canReadResource('audit-events'), false)
    await api.adminFetch('/control/platform/resources/projects?companyId=school-a')
    await api.adminFetch('/companies/school-a/members')
    assert.deepEqual(requests, ['/api/control/management-session', '/api/control/company/resources/projects?companyId=school-a', '/api/control/company/business/companies/school-a/members'])
    api.adminQueryClient.setQueryData(['private-record'], { title: 'Cached private record' })
    denied = true
    await assert.rejects(api.adminFetch('/control/platform/resources/projects'))
    assert.equal(api.adminQueryClient.getQueryData(['private-record']), undefined)
    assert.equal(api.canReadResource('users'), false)
    assert.deepEqual(redirects, ['/forbidden'])
  } finally { globalThis.fetch = originalFetch }
})
