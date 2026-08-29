import 'dotenv/config'

const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_EMBEDDING_MODEL',
  'LINGXI_IDENTITY_ISSUER',
  'LINGXI_IDENTITY_CLIENT_ID',
  'LINGXI_IDENTITY_CLIENT_SECRET',
  'LINGXILOOP_INVITE_BASE_URL',
  'WUKONG_API_URL',
  'WUKONG_WS_URL',
  'WUKONG_USER_TOKEN_SECRET',
  'AGENT_OS_SERVICE_TOKEN',
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE',
  'R2_URL_SIGNING_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'EMAIL_DOMAIN',
]

const missing = required.filter((name) => {
  const value = process.env[name]?.trim() || ''
  return !value || value.startsWith('replace-with-')
})

if (missing.length > 0) {
  console.error('[dev:doctor] Fill these values in .env.local:')
  for (const name of missing) console.error(`  - ${name}`)
  process.exit(1)
}

for (const name of ['OPENAI_BASE_URL', 'LINGXI_IDENTITY_ISSUER', 'R2_ENDPOINT', 'R2_PUBLIC_BASE']) {
  try {
    new URL(process.env[name])
  } catch {
    console.error(`[dev:doctor] ${name} must be an absolute URL`)
    process.exit(1)
  }
}

console.log('[dev:doctor] local preview configuration is complete')
