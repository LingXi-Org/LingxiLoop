const issuer = process.env.LINGXI_IDENTITY_ISSUER || 'http://127.0.0.1:5192'
const clientId = process.env.LINGXI_IDENTITY_CLIENT_ID || 'lingxiloop-local'
const clientSecret = process.env.LINGXI_IDENTITY_CLIENT_SECRET || 'lingxiloop-local-secret'
const redirectUri = 'http://localhost:5181/api/auth/callback/lingxi'
const state = 'local-smoke-state'

const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`)
if (!discoveryResponse.ok) throw new Error(`discovery returned ${discoveryResponse.status}`)
const discovery = await discoveryResponse.json()
if (discovery.issuer !== issuer) throw new Error('discovery issuer mismatch')

const authorization = new URL(discovery.authorization_endpoint)
authorization.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid profile email',
  state,
}).toString()
const authorizationResponse = await fetch(authorization)
if (!authorizationResponse.ok) throw new Error(`authorization form returned ${authorizationResponse.status}`)

const approvalResponse = await fetch(discovery.authorization_endpoint, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    email: 'smoke@lingxiloop.local',
    name: 'Local Smoke',
  }),
})
const callback = new URL(approvalResponse.headers.get('location') || '')
if (callback.searchParams.get('state') !== state) throw new Error('authorization state mismatch')
const code = callback.searchParams.get('code')
if (!code) throw new Error('authorization code missing')

const tokenResponse = await fetch(discovery.token_endpoint, {
  method: 'POST',
  headers: {
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
})
if (!tokenResponse.ok) throw new Error(`token endpoint returned ${tokenResponse.status}`)
const token = await tokenResponse.json()

const profileResponse = await fetch(discovery.userinfo_endpoint, {
  headers: { authorization: `Bearer ${token.access_token}` },
})
if (!profileResponse.ok) throw new Error(`userinfo returned ${profileResponse.status}`)
const profile = await profileResponse.json()
if (profile.email !== 'smoke@lingxiloop.local' || profile.email_verified !== true) {
  throw new Error('userinfo profile mismatch')
}

console.log(`[local-identity:smoke] passed · ${profile.sub}`)
