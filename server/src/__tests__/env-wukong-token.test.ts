import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

test('derives a stable WuKong user token secret when OpenShip omits it', async () => {
  process.env.WUKONG_USER_TOKEN_SECRET = ''
  process.env.WUKONG_WEBHOOK_SECRET = 'shared-webhook-secret'
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  process.env.REDIS_URL = 'redis://localhost:6379'
  process.env.OPENAI_API_KEY = 'test'
  process.env.OPENAI_EMBEDDING_MODEL = 'test'
  process.env.LINGXILOOP_INVITE_BASE_URL = 'https://example.test'

  const { env } = await import('../env.js')

  assert.equal(
    env.WUKONG_USER_TOKEN_SECRET,
    createHmac('sha256', 'shared-webhook-secret')
      .update('lingxiloop:wukong-user-token:v1')
      .digest('base64url'),
  )
})
