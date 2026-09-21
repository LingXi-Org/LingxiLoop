import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('HTTP and WebSocket composition keeps authentication and authorization at the boundary', async () => {
  const [router, ws, auth, registration] = await Promise.all([
    '../api/router.ts', '../ws.ts', '../auth.ts', '../modules/identity/gateway-registration-router.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.match(router, /api\.use\(authMiddleware(?: as never)?\)/)
  assert.match(router, /api\.use\(errorHandler\)/)
  const documentAuthorization = ws.slice(ws.indexOf('async function docCompanyFor'), ws.indexOf('function sendJson'))
  assert.match(documentAuthorization, /permissionService\.can/)
  assert.match(documentAuthorization, /action: writable \? 'document:write' : 'document:read'/)
  assert.match(auth, /timingSafeEqual/)
  assert.doesNotMatch(registration, /req\.body\??\.isAdmin/)
})
