import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.LOCAL_IDENTITY_PORT || 5192)
const issuer = `http://${host}:${port}`
const clientId = process.env.LINGXI_IDENTITY_CLIENT_ID || 'lingxiloop-local'
const clientSecret = process.env.LINGXI_IDENTITY_CLIENT_SECRET || 'lingxiloop-local-secret'
const defaultEmail = process.env.LOCAL_IDENTITY_EMAIL || 'developer@lingxiloop.local'
const defaultName = process.env.LOCAL_IDENTITY_NAME || 'Local Developer'
const codes = new Map()
const tokens = new Map()

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value).replace(/[&<>"']/g, (character) => entities[character])
}

async function readForm(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function validateAuthorization(parameters) {
  const redirectUri = parameters.get('redirect_uri') || ''
  if (parameters.get('client_id') !== clientId) return { error: 'unauthorized_client' }
  if (parameters.get('response_type') !== 'code') return { error: 'unsupported_response_type' }
  if (redirectUri !== 'http://localhost:5181/api/auth/callback/lingxi') return { error: 'invalid_request' }
  return { redirectUri }
}

function clientAuthenticated(request, body) {
  const authorization = request.headers.authorization || ''
  if (authorization.startsWith('Basic ')) {
    return Buffer.from(authorization.slice(6), 'base64').toString('utf8') === `${clientId}:${clientSecret}`
  }
  return body.get('client_id') === clientId && body.get('client_secret') === clientSecret
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', issuer)
    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return sendJson(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      })
    }
    if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true })
    if (request.method === 'GET' && url.pathname === '/authorize') {
      const validation = validateAuthorization(url.searchParams)
      if ('error' in validation) return sendJson(response, 400, validation)
      const hidden = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state']
        .map((key) => `<input type="hidden" name="${key}" value="${escapeHtml(url.searchParams.get(key) || '')}">`)
        .join('')
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return response.end(`<!doctype html><html><head><meta charset="utf-8"><title>LingxiIdentity Local</title></head><body><main><h1>LingxiIdentity Local</h1><p>Only this loopback process receives these values.</p><form method="post" action="/authorize">${hidden}<label>Email <input name="email" type="email" required value="${escapeHtml(defaultEmail)}"></label><label>Name <input name="name" required value="${escapeHtml(defaultName)}"></label><button type="submit">Continue to LingxiLoop</button></form></main></body></html>`)
    }
    if (request.method === 'POST' && url.pathname === '/authorize') {
      const body = await readForm(request)
      const validation = validateAuthorization(body)
      if ('error' in validation) return sendJson(response, 400, validation)
      const email = (body.get('email') || '').trim().toLowerCase()
      const name = (body.get('name') || '').trim()
      if (!email || !name) return sendJson(response, 400, { error: 'invalid_request' })
      const code = randomBytes(32).toString('base64url')
      codes.set(code, {
        redirectUri: validation.redirectUri,
        expiresAt: Date.now() + 60_000,
        profile: { sub: `local:${email}`, email, email_verified: true, name },
      })
      const redirect = new URL(validation.redirectUri)
      redirect.searchParams.set('code', code)
      redirect.searchParams.set('state', body.get('state') || '')
      response.writeHead(302, { location: redirect.toString(), 'cache-control': 'no-store' })
      return response.end()
    }
    if (request.method === 'POST' && url.pathname === '/token') {
      const body = await readForm(request)
      if (!clientAuthenticated(request, body)) return sendJson(response, 401, { error: 'invalid_client' })
      const code = body.get('code') || ''
      const entry = codes.get(code)
      codes.delete(code)
      if (!entry || entry.expiresAt < Date.now() || entry.redirectUri !== body.get('redirect_uri')) {
        return sendJson(response, 400, { error: 'invalid_grant' })
      }
      const accessToken = randomBytes(32).toString('base64url')
      tokens.set(accessToken, { expiresAt: Date.now() + 3_600_000, profile: entry.profile })
      return sendJson(response, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 })
    }
    if (request.method === 'GET' && url.pathname === '/userinfo') {
      const authorization = request.headers.authorization || ''
      const entry = authorization.startsWith('Bearer ') ? tokens.get(authorization.slice(7)) : null
      if (!entry || entry.expiresAt < Date.now()) return sendJson(response, 401, { error: 'invalid_token' })
      return sendJson(response, 200, entry.profile)
    }
    sendJson(response, 404, { error: 'not_found' })
  } catch (error) {
    console.error('[local-identity] request failed', error)
    sendJson(response, 500, { error: 'server_error' })
  }
})

const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, value] of codes) if (value.expiresAt < now) codes.delete(key)
  for (const [key, value] of tokens) if (value.expiresAt < now) tokens.delete(key)
}, 60_000)
cleanup.unref()

server.listen(port, host, () => console.log(`[local-identity] listening ${issuer} · client ${clientId}`))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
